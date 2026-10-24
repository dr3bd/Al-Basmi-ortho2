/**
 * Read-only SQLite schema diagnostics.
 *
 * This module deliberately performs no DDL, migration, writes, or repair.
 * It reports discrepancies for review; callers must not infer that the database
 * is safe to migrate merely because object names/counts match.
 */
import { P0_PRODUCTION_SQLITE_DDL } from '../../domain/p0SqliteSchema.ts';
import { ISqliteStorageAdapter } from '../types/storageAdapter.ts';

export interface SqliteSchemaDiagnosticsReport {
  checkedAt: string;
  expectedTables: string[];
  actualTables: string[];
  missingTables: string[];
  unexpectedTables: string[];
  expectedIndexes: string[];
  actualIndexes: string[];
  missingIndexes: string[];
  unexpectedIndexes: string[];
  integrityCheck: string[];
  foreignKeyViolations: Array<Record<string, unknown>>;
  migrationRows: Array<Record<string, unknown>> | null;
  errors: string[];
  passed: boolean;
  limitations: string[];
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function extractExpectedObjects(ddl: string): { tables: string[]; indexes: string[] } {
  const tables: string[] = [];
  const indexes: string[] = [];
  const tablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?([a-zA-Z_][\w]*)["'`]?/gi;
  const indexPattern = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?([a-zA-Z_][\w]*)["'`]?/gi;
  for (const match of ddl.matchAll(tablePattern)) tables.push(match[1]);
  for (const match of ddl.matchAll(indexPattern)) indexes.push(match[1]);
  return { tables: sortedUnique(tables), indexes: sortedUnique(indexes) };
}

/**
 * Runs read-only checks against the currently connected database.
 * The result is diagnostic evidence, not a migration authorization.
 */
export async function inspectSqliteSchemaReadOnly(
  adapter: ISqliteStorageAdapter
): Promise<SqliteSchemaDiagnosticsReport> {
  const errors: string[] = [];
  const expected = extractExpectedObjects(P0_PRODUCTION_SQLITE_DDL);
  let actualTables: string[] = [];
  let actualIndexes: string[] = [];
  let integrityCheck: string[] = [];
  let foreignKeyViolations: Array<Record<string, unknown>> = [];
  let migrationRows: Array<Record<string, unknown>> | null = null;

  try {
    const tables = await adapter.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
    );
    actualTables = sortedUnique(tables.map((row) => row.name));
  } catch (error) {
    errors.push(`Unable to enumerate SQLite tables: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const indexes = await adapter.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
    );
    actualIndexes = sortedUnique(indexes.map((row) => row.name));
  } catch (error) {
    errors.push(`Unable to enumerate SQLite indexes: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const rows = await adapter.query<{ integrity_check: string }>('PRAGMA integrity_check;');
    integrityCheck = rows.map((row) => String(row.integrity_check ?? Object.values(row)[0] ?? 'unknown'));
    if (integrityCheck.length === 0) errors.push('PRAGMA integrity_check returned no rows.');
  } catch (error) {
    errors.push(`PRAGMA integrity_check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    foreignKeyViolations = await adapter.query<Record<string, unknown>>('PRAGMA foreign_key_check;');
  } catch (error) {
    errors.push(`PRAGMA foreign_key_check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    if (actualTables.includes('schema_migrations')) {
      migrationRows = await adapter.query<Record<string, unknown>>(
        'SELECT version, migration_name, applied_at, checksum FROM schema_migrations ORDER BY version;'
      );
    } else {
      errors.push('schema_migrations table is missing; migration provenance cannot be verified.');
    }
  } catch (error) {
    errors.push(`Unable to read schema migration history: ${error instanceof Error ? error.message : String(error)}`);
  }

  const missingTables = expected.tables.filter((name) => !actualTables.includes(name));
  const unexpectedTables = actualTables.filter((name) => !expected.tables.includes(name));
  const missingIndexes = expected.indexes.filter((name) => !actualIndexes.includes(name));
  const unexpectedIndexes = actualIndexes.filter((name) => !expected.indexes.includes(name));
  const integrityOk = integrityCheck.length > 0 && integrityCheck.every((result) => result.toLowerCase() === 'ok');
  const passed =
    errors.length === 0 &&
    missingTables.length === 0 &&
    unexpectedTables.length === 0 &&
    missingIndexes.length === 0 &&
    unexpectedIndexes.length === 0 &&
    integrityOk &&
    foreignKeyViolations.length === 0;

  return {
    checkedAt: new Date().toISOString(),
    expectedTables: expected.tables,
    actualTables,
    missingTables,
    unexpectedTables,
    expectedIndexes: expected.indexes,
    actualIndexes,
    missingIndexes,
    unexpectedIndexes,
    integrityCheck,
    foreignKeyViolations,
    migrationRows,
    errors,
    passed,
    limitations: [
      'This check compares table/index names, not full column definitions, constraints, index expressions, or foreign-key actions.',
      'A passing result is not authorization to migrate; review the complete schema and backup evidence first.',
      'This function does not export or back up data and does not modify the database.',
    ],
  };
}
