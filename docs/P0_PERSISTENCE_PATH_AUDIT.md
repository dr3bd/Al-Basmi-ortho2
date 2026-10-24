# P0 — Persistence Path Audit (Read-only)

Status: **AUDIT IN PROGRESS — NOT A REPAIR OR DATA-SAFETY PASS**
Audited ref: `main` at `37da9a20a631e13c543b09ad24dc8e1c845db6dd`
Audit method: repository source inspection only. No live iPad/browser database was accessed, no runtime migration was run, and no clinical data was changed.

## Confirmed findings

### 1. Bootstrap does not verify schema equivalence
File: `src/storage/services/deviceBootstrap.ts`

`ensureCanonicalSchemaAndMigrations()` counts non-internal tables and checks whether migration version 1 exists. It enters DDL initialization when `existingTables.length < 42 || !hasBaselineMigration`. It does not compare actual table columns, indexes, foreign keys, constraints, or DDL against an approved manifest before deciding that initialization is complete. `CREATE ... IF NOT EXISTS` cannot repair an existing object with an incompatible definition. The baseline checksum is inserted as a literal and is not shown being recomputed from the DDL in this path.

**Risk:** a partially or incompatibly initialized database can pass the count/migration guard.

### 2. Schema version/count statements conflict
File: `src/domain/p0SqliteSchema.ts` declares a schema v1.1 / P1-A through P1-I baseline in its header. The bootstrap comments refer to `SCHEMA_FREEZE_v1.0`, 42 tables and 25 indexes. `src/storage/context/ClinicalStorageContext.tsx` describes a different table/index/trigger count. The current DDL and comments must be reconciled by extracting actual SQL objects and reviewing one canonical manifest; comments and counts are not sufficient proof.

### 3. The current foundation test is not a schema-equivalence test
File: `src/storage/tests/dbFoundationRemediationSuite.ts`

DBF-01 asserts `foreign_keys === 1`, table counts >= 30, and that the second bootstrap does not report a migration. This does not assert exact object names or definitions, index expressions, foreign-key targets/actions, checks, or schema checksum equivalence. The suite initializes its own test database with `mode: 'PREVIEW'` and `allowPreviewEphemeral: true`; its results cannot prove the integrity of an existing iPad database.

### 4. UI data paths remain split
File: `src/App.tsx`

Patient display state is loaded from `cohort2PatientService.listActivePatients()` when storage is READY. Cases are initially seeded from `localStorage` (`STORAGE_KEYS.CASES`) and later projected from `cohort2CaseService.listActiveCases()`, with visits, procedures, examinations/findings, problems and diagnosis loaded through separate SQLite services. This establishes multiple read paths. A complete write-path inventory is still required before deciding which legacy writes can be removed or migrated.

### 5. Durable-storage capability exists, but is not proof of a verified backup
File: `src/storage/types/storageAdapter.ts`

The adapter contract exposes `healthCheck()`, `flushToDurableStorage()`, and optional `exportDatabaseBinary()`. These are useful primitives, but this audit has not established a complete, user-accessible export/read-back/recovery workflow covering SQLite, legacy localStorage, IndexedDB media, and pending sync payloads on the user's actual device.

### 6. Server sync is process-memory-only in this implementation
File: `server.ts`

The `/api/sync/push` and `/api/sync/pull` routes use a process-local `cloudStore` object and return success without writing to durable storage. This must not be represented as a cloud backup or durable source of truth.

## Safe next actions

1. Keep P0 open. Do not reset browser storage, drop/recreate tables, or run data migrations.
2. Complete a read-only inventory of all clinical `localStorage` keys and write sites, IndexedDB media stores, and sync outbox operations.
3. Derive a schema manifest from the DDL and compare it with the intended contract; review all discrepancies before changing any frozen schema/adapter contract.
4. Add tests against a fresh isolated test database for exact schema objects and migration behavior, plus read-only diagnostic checks. Do not run those destructive/fresh-database tests against user data.
5. Design and test an explicit device-side export/read-back/recovery workflow. A GitHub repository cannot access the user's live Safari OPFS/IndexedDB/localStorage.
6. Only after the above evidence exists should a separate implementation PR introduce fail-closed schema verification and any approved migration.

## Not claimed

- No device backup has been taken.
- No iPad database integrity check has been run.
- No runtime repair, migration, build, or test run was performed as part of this source audit.
- No schema or persistence contract has been re-frozen.
