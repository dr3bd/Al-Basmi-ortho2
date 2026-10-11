/**
 * AL-BASMI ORTH — CLINICAL STORAGE ADAPTER CONTRACT v1.0
 * Status: FROZEN INTERFACE (STAGE 1 SCOPE)
 * Purpose: Defines low-level SQLite physical database operations, durability levels, and typed errors.
 */

export type SqliteParamValue = string | number | bigint | null | Uint8Array;
export type SqliteParams = SqliteParamValue[] | Record<string, SqliteParamValue>;

export interface SqlExecutionResult {
  changes: number;
  lastInsertRowId: number | bigint;
}

export type StorageEngineMode = 'CLINICAL' | 'PREVIEW';
export type VfsDriverType = 'OPFS' | 'INDEXEDDB' | 'MEMORY_ASYNC';
export type TransactionIsolationLevel = 'DEFERRED' | 'IMMEDIATE' | 'EXCLUSIVE';

export interface SqliteHealthCheckResult {
  isHealthy: boolean;
  driverName: VfsDriverType;
  mode: StorageEngineMode;
  databaseSizeKilobytes: number;
  integrityCheckStatus: 'ok' | string;
  foreignKeyViolationsCount: number;
  activeTransactionDepth: number;
  isDurableStorageFlushed: boolean;
  latencyMs: number;
}

export type SqliteStorageErrorCode =
  | 'ERR_SQLITE_INITIALIZATION_FAILED'
  | 'ERR_PERSISTENCE_UNAVAILABLE'
  | 'ERR_SQLITE_CONSTRAINT_VIOLATION'
  | 'ERR_SQLITE_FOREIGN_KEY_VIOLATION'
  | 'ERR_SQLITE_BUSY_OR_LOCKED'
  | 'ERR_SQLITE_TRANSACTION_ROLLBACK'
  | 'ERR_SQLITE_STORAGE_QUOTA_EXCEEDED'
  | 'ERR_SQLITE_DURABILITY_FLUSH_FAILED'
  | 'ERR_SQLITE_CORRUPT_DATABASE'
  | 'ERR_SQLITE_SCHEMA_MISMATCH'
  | 'ERR_SQLITE_CONNECTION_CLOSED';

export class SqliteStorageError extends Error {
  constructor(
    public readonly code: SqliteStorageErrorCode,
    message: string,
    public readonly sql?: string,
    public readonly params?: SqliteParams,
    public readonly cause?: unknown
  ) {
    super(`[${code}] ${message}`);
    this.name = 'SqliteStorageError';
  }
}

export interface ISqliteTransactionContext {
  readonly savepointDepth: number;
  execute(sql: string, params?: SqliteParams): Promise<SqlExecutionResult>;
  query<T = Record<string, unknown>>(sql: string, params?: SqliteParams): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: SqliteParams): Promise<T | null>;
  queryScalar<T = unknown>(sql: string, params?: SqliteParams): Promise<T | null>;
  savepoint<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export interface StorageAdapterConfig {
  databaseName?: string;
  mode?: StorageEngineMode;
  preferredVfs?: VfsDriverType;
  allowPreviewEphemeral?: boolean;
  wasmBinary?: ArrayBuffer | Uint8Array;
}

export interface ISqliteStorageAdapter {
  readonly driverId: VfsDriverType;
  readonly mode: StorageEngineMode;
  readonly isConnected: boolean;

  /** Lifecycle & Connection */
  initialize(): Promise<void>;
  close(): Promise<void>;
  healthCheck(): Promise<SqliteHealthCheckResult>;

  /** Low-Level Parameterized Execution */
  execute(sql: string, params?: SqliteParams): Promise<SqlExecutionResult>;
  query<T = Record<string, unknown>>(sql: string, params?: SqliteParams): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: SqliteParams): Promise<T | null>;
  queryScalar<T = unknown>(sql: string, params?: SqliteParams): Promise<T | null>;

  /** Transaction Boundaries */
  transaction<T>(
    mode: TransactionIsolationLevel,
    callback: (tx: ISqliteTransactionContext) => Promise<T>
  ): Promise<T>;

  /** Physical Storage Flush (Guarantees Level 3 Durability) */
  flushToDurableStorage(): Promise<void>;

  /** Raw Export for Backup */
  exportDatabaseBinary?(): Promise<Uint8Array>;
}
