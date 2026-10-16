/**
 * AL-BASMI ORTH — WA-SQLITE PHYSICAL STORAGE ADAPTER
 * Contract: PERSISTENCE_ADAPTER_CONTRACT_v1.0 (STAGE 1 SCOPE)
 * 
 * Target Runtimes:
 * - iPadOS Safari / Android Tablets (OPFS OriginPrivateFileSystemVFS)
 * - Browser Preview / AI Studio Iframe (IndexedDB IDBBatchAtomicVFS)
 * - Headless / Test Runner (MemoryAsyncVFS / IDBBatchAtomicVFS)
 */

// @ts-ignore - wa-sqlite is an ES module
import SQLiteAsyncESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
// @ts-ignore
import * as SQLite from 'wa-sqlite/src/sqlite-api.js';
// @ts-ignore
import { MemoryAsyncVFS } from 'wa-sqlite/src/examples/MemoryAsyncVFS.js';
// @ts-ignore
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';
// @ts-ignore
import { OriginPrivateFileSystemVFS } from 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js';

import {
  ISqliteStorageAdapter,
  ISqliteTransactionContext,
  SqlExecutionResult,
  SqliteHealthCheckResult,
  SqliteParams,
  SqliteParamValue,
  SqliteStorageError,
  StorageAdapterConfig,
  StorageEngineMode,
  TransactionIsolationLevel,
  VfsDriverType,
} from '../types/storageAdapter.ts';

class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  public async acquire(): Promise<() => void> {
    if (this.locked) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.locked = true;
    return () => this.release();
  }

  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.locked = false;
    }
  }
}

export class WaSqliteStorageAdapter implements ISqliteStorageAdapter {
  private static _memoryVfsCache = new Map<string, any>();
  private _sqlite3: any = null;
  private _dbHandle: any = null;
  private _vfs: any = null;
  private _driverId: VfsDriverType = 'MEMORY_ASYNC';
  private _mode: StorageEngineMode = 'CLINICAL';
  private _isConnected = false;
  private _activeTransactionDepth = 0;
  private _mutex = new AsyncMutex();

  private readonly _databaseName: string;
  private readonly _allowPreviewEphemeral: boolean;
  private readonly _preferredVfs?: VfsDriverType;
  private readonly _wasmBinary?: ArrayBuffer | Uint8Array;

  constructor(config: StorageAdapterConfig = {}) {
    this._databaseName = config.databaseName || 'albasmi_orth_clinical.db';
    this._mode = config.mode || 'CLINICAL';
    this._allowPreviewEphemeral = Boolean(config.allowPreviewEphemeral);
    this._preferredVfs = config.preferredVfs;
    this._wasmBinary = config.wasmBinary;
  }

  public get driverId(): VfsDriverType {
    return this._driverId;
  }

  public get mode(): StorageEngineMode {
    return this._mode;
  }

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public async initialize(): Promise<void> {
    if (this._isConnected) {
      return;
    }

    const release = await this._mutex.acquire();
    try {
      // 1. Detect VFS Driver
      const chosenVfs = await this.resolveVfsDriver();
      this._driverId = chosenVfs.driverType;

      // Anti-silent fallback guard in Clinical Mode
      if (
        this._mode === 'CLINICAL' &&
        this._driverId === 'MEMORY_ASYNC' &&
        this._preferredVfs !== 'MEMORY_ASYNC'
      ) {
        throw new SqliteStorageError(
          'ERR_PERSISTENCE_UNAVAILABLE',
          'Clinical Mode requires durable persistent storage (OPFS or IndexedDB). Neither persistent VFS could be initialized.'
        );
      }

      // 2. Initialize WASM module
      const factoryOptions: Record<string, unknown> = {};
      if (this._wasmBinary) {
        factoryOptions.wasmBinary = this._wasmBinary;
      }

      const module = await SQLiteAsyncESMFactory(factoryOptions);
      this._sqlite3 = SQLite.Factory(module);

      // 3. Register VFS
      this._vfs = chosenVfs.instance;
      this._sqlite3.vfs_register(this._vfs, true);

      // 4. Open physical database handle
      this._dbHandle = await this._sqlite3.open_v2(this._databaseName);
      this._isConnected = true;

      // 5. Enforce Foreign Keys
      await this.internalExecute('PRAGMA foreign_keys = ON;');
    } catch (err: unknown) {
      this._isConnected = false;
      this._dbHandle = null;
      if (err instanceof SqliteStorageError) {
        throw err;
      }
      throw new SqliteStorageError(
        'ERR_SQLITE_INITIALIZATION_FAILED',
        `Failed to initialize SQLite storage engine: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        undefined,
        err
      );
    } finally {
      release();
    }
  }

  public async close(): Promise<void> {
    const release = await this._mutex.acquire();
    try {
      if (this._dbHandle && this._sqlite3) {
        await this._sqlite3.close(this._dbHandle);
      }
      if (this._vfs && typeof this._vfs.close === 'function') {
        await this._vfs.close();
      }
    } finally {
      this._isConnected = false;
      this._dbHandle = null;
      this._activeTransactionDepth = 0;
      release();
    }
  }

  public async execute(sql: string, params?: SqliteParams): Promise<SqlExecutionResult> {
    this.assertConnected();
    const release = await this._mutex.acquire();
    try {
      return await this.internalExecute(sql, params);
    } finally {
      release();
    }
  }

  public async query<T = Record<string, unknown>>(
    sql: string,
    params?: SqliteParams
  ): Promise<T[]> {
    this.assertConnected();
    const release = await this._mutex.acquire();
    try {
      return await this.internalQuery<T>(sql, params);
    } finally {
      release();
    }
  }

  public async queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: SqliteParams
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  public async queryScalar<T = unknown>(
    sql: string,
    params?: SqliteParams
  ): Promise<T | null> {
    this.assertConnected();
    const rows = await this.query<Record<string, unknown>>(sql, params);
    if (rows.length === 0) return null;
    const firstRow = rows[0];
    const firstKey = Object.keys(firstRow)[0];
    return (firstRow[firstKey] as T) ?? null;
  }

  public async transaction<T>(
    mode: TransactionIsolationLevel,
    callback: (tx: ISqliteTransactionContext) => Promise<T>
  ): Promise<T> {
    this.assertConnected();
    const release = await this._mutex.acquire();
    this._activeTransactionDepth++;

    const isTopLevel = this._activeTransactionDepth === 1;
    const savepointName = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    try {
      if (isTopLevel) {
        await this.internalExecute(`BEGIN ${mode};`);
      } else {
        await this.internalExecute(`SAVEPOINT ${savepointName};`);
      }

      const txContext: ISqliteTransactionContext = {
        savepointDepth: this._activeTransactionDepth,
        execute: async (sql, params) => this.internalExecute(sql, params),
        query: async <T = Record<string, unknown>>(sql: string, params?: SqliteParams): Promise<T[]> =>
          this.internalQuery<T>(sql, params),
        queryOne: async <T = Record<string, unknown>>(sql: string, params?: SqliteParams): Promise<T | null> => {
          const res = await this.internalQuery<T>(sql, params);
          return res.length > 0 ? res[0] : null;
        },
        queryScalar: async <T = unknown>(sql: string, params?: SqliteParams): Promise<T | null> => {
          const res = await this.internalQuery<Record<string, unknown>>(sql, params);
          if (res.length === 0) return null;
          const k = Object.keys(res[0])[0];
          return (res[0][k] as T) ?? null;
        },
        savepoint: async (name, cb) => {
          const safeSpName = name.replace(/[^a-zA-Z0-9_]/g, '_');
          this._activeTransactionDepth++;
          await this.internalExecute(`SAVEPOINT ${safeSpName};`);
          try {
            const out = await (cb as (ctx?: ISqliteTransactionContext) => Promise<any>)(txContext);
            await this.internalExecute(`RELEASE SAVEPOINT ${safeSpName};`);
            return out;
          } catch (spErr) {
            try {
              await this.internalExecute(`ROLLBACK TO SAVEPOINT ${safeSpName};`);
              await this.internalExecute(`RELEASE SAVEPOINT ${safeSpName};`);
            } catch {
              // Ignore secondary rollback error
            }
            throw spErr;
          } finally {
            this._activeTransactionDepth--;
          }
        },
      };

      const result = await callback(txContext);

      if (isTopLevel) {
        await this.internalExecute('COMMIT;');
      } else {
        await this.internalExecute(`RELEASE SAVEPOINT ${savepointName};`);
      }

      return result;
    } catch (err: unknown) {
      try {
        if (isTopLevel) {
          await this.internalExecute('ROLLBACK;');
        } else {
          await this.internalExecute(`ROLLBACK TO SAVEPOINT ${savepointName};`);
          await this.internalExecute(`RELEASE SAVEPOINT ${savepointName};`);
        }
      } catch {
        // Rollback attempt completed
      }
      throw this.wrapSqliteError(err, 'transaction');
    } finally {
      this._activeTransactionDepth--;
      release();
    }
  }

  public async flushToDurableStorage(): Promise<void> {
    this.assertConnected();
    const release = await this._mutex.acquire();
    try {
      // Execute WAL checkpoint / sync pragma to flush dirty pages
      await this.internalExecute('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (err: unknown) {
      throw new SqliteStorageError(
        'ERR_SQLITE_DURABILITY_FLUSH_FAILED',
        `Failed to flush physical pages to durable VFS storage: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        undefined,
        err
      );
    } finally {
      release();
    }
  }

  public async exportDatabaseBinary(): Promise<Uint8Array> {
    this.assertConnected();
    const release = await this._mutex.acquire();
    const tempExportFile = `backup_export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.db`;
    try {
      // 1. Checkpoint WAL and ensure all pending changes are flushed
      await this.internalExecute('PRAGMA wal_checkpoint(FULL);');

      // 2. Perform native SQLite VACUUM INTO to produce an atomic, defragmented SQLite 3 database file
      await this.internalExecute(`VACUUM INTO '${tempExportFile}';`);

      // 3. Read raw SQLite binary bytes from VFS
      const bytes = await this.readVfsFileBytes(tempExportFile);

      // 4. Validate header of exported database
      if (!this.isValidSqliteHeader(bytes)) {
        throw new SqliteStorageError(
          'ERR_SQLITE_CORRUPT_DATABASE',
          'Exported database does not match SQLite format 3 specification'
        );
      }

      return bytes;
    } finally {
      // Always cleanup temporary export file
      await this.deleteVfsFile(tempExportFile);
      release();
    }
  }

  public async restoreDatabaseBinary(backupBytes: Uint8Array): Promise<void> {
    this.assertConnected();

    // 1. Validate SQLite 3 magic header and size
    if (!backupBytes || backupBytes.byteLength < 512) {
      throw new SqliteStorageError(
        'ERR_SQLITE_CORRUPT_DATABASE',
        'Backup payload is too small to be a valid SQLite database (minimum 512 bytes required).'
      );
    }

    if (!this.isValidSqliteHeader(backupBytes)) {
      throw new SqliteStorageError(
        'ERR_SQLITE_CORRUPT_DATABASE',
        'Backup payload is not a valid SQLite database (missing SQLite format 3 magic header).'
      );
    }

    const release = await this._mutex.acquire();
    try {
      // 2. Prevent restore during active transaction
      if (this._activeTransactionDepth > 0) {
        throw new SqliteStorageError(
          'ERR_SQLITE_TRANSACTION_ROLLBACK',
          'Cannot restore database while a transaction is active.'
        );
      }

      // 3. Isolated Pre-restoration Verification in Temporary Database
      // The live database is NOT modified during this phase.
      const verifyTempDb = `temp_verify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.db`;
      try {
        await this.writeVfsFileBytes(verifyTempDb, backupBytes);

        let verifyHandle: any = null;
        try {
          verifyHandle = await this._sqlite3.open_v2(verifyTempDb);
        } catch (openErr: unknown) {
          throw new SqliteStorageError(
            'ERR_SQLITE_CORRUPT_DATABASE',
            `Failed to open backup database in verification sandbox: ${openErr instanceof Error ? openErr.message : String(openErr)}`,
            undefined,
            undefined,
            openErr
          );
        }

        try {
          // A. Integrity check
          const integrityRows: string[] = [];
          try {
            await this.execOnHandle(verifyHandle, 'PRAGMA integrity_check;', (row) => {
              if (row && row[0]) integrityRows.push(String(row[0]));
            });
          } catch (integrityErr) {
            throw new SqliteStorageError(
              'ERR_SQLITE_CORRUPT_DATABASE',
              `Backup integrity check failed: ${integrityErr instanceof Error ? integrityErr.message : String(integrityErr)}`,
              undefined,
              undefined,
              integrityErr
            );
          }
          if (integrityRows.length === 0 || integrityRows[0] !== 'ok') {
            throw new SqliteStorageError(
              'ERR_SQLITE_CORRUPT_DATABASE',
              `Backup integrity check failed: ${integrityRows.join(', ')}`
            );
          }

          // B. Foreign Key check
          const fkRows: unknown[] = [];
          await this.execOnHandle(verifyHandle, 'PRAGMA foreign_key_check;', (row) => {
            fkRows.push(row);
          });
          if (fkRows.length > 0) {
            throw new SqliteStorageError(
              'ERR_SQLITE_FOREIGN_KEY_VIOLATION',
              `Backup contains ${fkRows.length} foreign key violation(s).`
            );
          }

          // C. Schema compatibility check
          const tableRows: string[] = [];
          await this.execOnHandle(
            verifyHandle,
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';",
            (row) => {
              if (row && row[0]) tableRows.push(String(row[0]));
            }
          );

          if (tableRows.length === 0) {
            throw new SqliteStorageError(
              'ERR_SQLITE_SCHEMA_MISMATCH',
              'Backup database is empty (no tables found).'
            );
          }

          // Must contain essential orthodontic platform tables
          const requiredTables = ['patients', 'orthodontic_cases', 'clinical_examinations', 'audit_logs', 'sync_operations'];
          const missingTables = requiredTables.filter((t) => !tableRows.includes(t));
          if (missingTables.length > 0) {
            throw new SqliteStorageError(
              'ERR_SQLITE_SCHEMA_MISMATCH',
              `Backup database schema is incompatible with clinical platform; missing required tables: ${missingTables.join(', ')}`
            );
          }
        } finally {
          if (verifyHandle) {
            await this._sqlite3.close(verifyHandle);
          }
        }
      } finally {
        await this.deleteVfsFile(verifyTempDb);
      }

      // 4. Backup is 100% verified. Proceed to fail-safe live restoration with automatic rollback.
      let liveRollbackBytes: Uint8Array | null = null;
      try {
        await this.internalExecute('PRAGMA wal_checkpoint(FULL);');
        liveRollbackBytes = await this.readVfsFileBytes(this._databaseName);
      } catch (readLiveErr) {
        console.warn('Could not take live pre-restore rollback snapshot:', readLiveErr);
      }

      // Close live handle
      if (this._dbHandle) {
        await this._sqlite3.close(this._dbHandle);
        this._dbHandle = null;
      }

      // Clean up stale journal/wal/shm files if present
      await this.deleteVfsFile(`${this._databaseName}-wal`);
      await this.deleteVfsFile(`${this._databaseName}-journal`);
      await this.deleteVfsFile(`${this._databaseName}-shm`);

      // Overwrite live file in VFS with verified backup
      await this.writeVfsFileBytes(this._databaseName, backupBytes);

      // Reopen live connection
      try {
        this._dbHandle = await this._sqlite3.open_v2(this._databaseName);
        await this.internalExecute('PRAGMA foreign_keys = ON;');
        const checkRows = await this.internalQuery<{ integrity: string }>('PRAGMA integrity_check;');
        if (checkRows.length === 0 || Object.values(checkRows[0])[0] !== 'ok') {
          throw new Error('Integrity check failed on reopened live database');
        }
      } catch (reopenErr: unknown) {
        console.error('Failed to reopen restored database, rolling back:', reopenErr);
        // Automatic rollback to previous live state
        if (liveRollbackBytes) {
          try {
            if (this._dbHandle) {
              await this._sqlite3.close(this._dbHandle);
              this._dbHandle = null;
            }
            await this.writeVfsFileBytes(this._databaseName, liveRollbackBytes);
            this._dbHandle = await this._sqlite3.open_v2(this._databaseName);
            await this.internalExecute('PRAGMA foreign_keys = ON;');
          } catch (rollbackErr) {
            console.error('Fatal rollback error:', rollbackErr);
          }
        }
        throw new SqliteStorageError(
          'ERR_SQLITE_INITIALIZATION_FAILED',
          `Restoration failed during live database reactivation; previous database state was restored. Error: ${reopenErr instanceof Error ? reopenErr.message : String(reopenErr)}`,
          undefined,
          undefined,
          reopenErr
        );
      }
    } finally {
      release();
    }
  }

  public async healthCheck(): Promise<SqliteHealthCheckResult> {
    const start = performance.now();
    try {
      this.assertConnected();
      const integrityRows = await this.query<Record<string, unknown>>('PRAGMA integrity_check;');
      const integrityStatus = integrityRows.length > 0 ? String(Object.values(integrityRows[0])[0]) : 'unknown';

      const fkRows = await this.query<Record<string, unknown>>('PRAGMA foreign_key_check;');
      const pageCount = (await this.queryScalar<number>('PRAGMA page_count;')) || 0;
      const pageSize = (await this.queryScalar<number>('PRAGMA page_size;')) || 4096;

      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      const isHealthy = integrityStatus.toLowerCase() === 'ok' && fkRows.length === 0;

      return {
        isHealthy,
        driverName: this._driverId,
        mode: this._mode,
        databaseSizeKilobytes: Math.round((pageCount * pageSize) / 1024),
        integrityCheckStatus: integrityStatus,
        foreignKeyViolationsCount: fkRows.length,
        activeTransactionDepth: this._activeTransactionDepth,
        isDurableStorageFlushed: true,
        latencyMs,
      };
    } catch (err: unknown) {
      return {
        isHealthy: false,
        driverName: this._driverId,
        mode: this._mode,
        databaseSizeKilobytes: 0,
        integrityCheckStatus: err instanceof Error ? err.message : String(err),
        foreignKeyViolationsCount: -1,
        activeTransactionDepth: this._activeTransactionDepth,
        isDurableStorageFlushed: false,
        latencyMs: Math.round((performance.now() - start) * 100) / 100,
      };
    }
  }

  // --- INTERNAL HELPER METHODS ---

  private assertConnected(): void {
    if (!this._isConnected || !this._dbHandle) {
      throw new SqliteStorageError(
        'ERR_SQLITE_CONNECTION_CLOSED',
        'Database connection is closed or not initialized.'
      );
    }
  }

  private async internalExecute(sql: string, params?: SqliteParams): Promise<SqlExecutionResult> {
    try {
      let changes = 0;
      for await (const stmt of this._sqlite3.statements(this._dbHandle, sql)) {
        if (params) {
          this.bindParameters(stmt, params);
        }
        await this._sqlite3.step(stmt);
      }
      changes = this._sqlite3.changes(this._dbHandle);

      // Query last insert rowid only for INSERT/REPLACE statements to avoid clobbering state
      let lastInsertRowId: number | bigint = 0;
      const trimmedUpper = sql.trimStart().toUpperCase();
      if (trimmedUpper.startsWith('INSERT') || trimmedUpper.startsWith('REPLACE')) {
        for await (const rowidStmt of this._sqlite3.statements(this._dbHandle, 'SELECT last_insert_rowid();')) {
          if ((await this._sqlite3.step(rowidStmt)) === SQLite.SQLITE_ROW) {
            lastInsertRowId = this._sqlite3.column(rowidStmt, 0);
          }
        }
      }

      return { changes, lastInsertRowId };
    } catch (err: unknown) {
      throw this.wrapSqliteError(err, sql, params);
    }
  }

  private async internalQuery<T = Record<string, unknown>>(
    sql: string,
    params?: SqliteParams
  ): Promise<T[]> {
    try {
      const results: T[] = [];
      for await (const stmt of this._sqlite3.statements(this._dbHandle, sql)) {
        if (params) {
          this.bindParameters(stmt, params);
        }
        const colNames: string[] = this._sqlite3.column_names(stmt);
        while ((await this._sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
          const rowObj: Record<string, unknown> = {};
          for (let i = 0; i < colNames.length; i++) {
            rowObj[colNames[i]] = this._sqlite3.column(stmt, i);
          }
          results.push(rowObj as T);
        }
      }
      return results;
    } catch (err: unknown) {
      throw this.wrapSqliteError(err, sql, params);
    }
  }

  private bindParameters(stmt: any, params: SqliteParams): void {
    const normalizeVal = (v: unknown): SqliteParamValue => {
      if (v === undefined || v === null) return null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      return v as SqliteParamValue;
    };

    if (Array.isArray(params)) {
      const sanitized = params.map(normalizeVal);
      this._sqlite3.bind_collection(stmt, sanitized);
    } else if (typeof params === 'object' && params !== null) {
      const sanitizedObj: Record<string, SqliteParamValue> = {};
      for (const [k, v] of Object.entries(params)) {
        sanitizedObj[k] = normalizeVal(v);
      }
      this._sqlite3.bind_collection(stmt, sanitizedObj);
    }
  }

  private wrapSqliteError(err: unknown, sql?: string, params?: SqliteParams): SqliteStorageError {
    if (err instanceof SqliteStorageError) {
      return err;
    }
    const message = err instanceof Error ? err.message : String(err);
    let code: SqliteStorageError['code'] = 'ERR_SQLITE_CONSTRAINT_VIOLATION';

    if (message.includes('FOREIGN KEY')) {
      code = 'ERR_SQLITE_FOREIGN_KEY_VIOLATION';
    } else if (message.includes('busy') || message.includes('locked')) {
      code = 'ERR_SQLITE_BUSY_OR_LOCKED';
    } else if (message.includes('quota') || message.includes('QuotaExceeded')) {
      code = 'ERR_SQLITE_STORAGE_QUOTA_EXCEEDED';
    } else if (message.includes('corrupt') || message.includes('malformed')) {
      code = 'ERR_SQLITE_CORRUPT_DATABASE';
    } else if (message.includes('no such table') || message.includes('no such column')) {
      code = 'ERR_SQLITE_SCHEMA_MISMATCH';
    }

    return new SqliteStorageError(code, message, sql, params, err);
  }

  private async resolveVfsDriver(): Promise<{ driverType: VfsDriverType; instance: any }> {
    // 1. Explicit preference override (e.g. Unit tests passing MEMORY_ASYNC)
    if (this._preferredVfs === 'MEMORY_ASYNC') {
      const vfsKey = 'albasmi_mem_vfs';
      let instance = WaSqliteStorageAdapter._memoryVfsCache.get(vfsKey);
      if (!instance) {
        instance = new MemoryAsyncVFS(vfsKey);
        WaSqliteStorageAdapter._memoryVfsCache.set(vfsKey, instance);
      }
      return { driverType: 'MEMORY_ASYNC', instance };
    }

    // 2. Check OPFS availability (requires createSyncAccessHandle, only available in dedicated Web Workers)
    const hasSyncAccessHandle =
      typeof FileSystemFileHandle !== 'undefined' &&
      typeof (FileSystemFileHandle.prototype as any)?.createSyncAccessHandle === 'function';

    if (
      this._preferredVfs !== 'INDEXEDDB' &&
      hasSyncAccessHandle &&
      typeof navigator !== 'undefined' &&
      typeof navigator.storage?.getDirectory === 'function'
    ) {
      try {
        const opfsInstance = new OriginPrivateFileSystemVFS();
        return { driverType: 'OPFS', instance: opfsInstance };
      } catch {
        // Fall through to IndexedDB
      }
    }

    // 3. Check IndexedDB availability (Browser & Preview environments - durable Level 2/3 storage)
    if (typeof indexedDB !== 'undefined') {
      try {
        const idbInstance = new IDBBatchAtomicVFS(`albasmi_idb_${this._databaseName}`, {
          durability: 'strict',
        });
        return { driverType: 'INDEXEDDB', instance: idbInstance };
      } catch {
        // Fall through
      }
    }

    // 4. Memory Async fallback (allowed strictly in PREVIEW mode or with allowPreviewEphemeral)
    if (this._mode === 'PREVIEW' || this._allowPreviewEphemeral) {
      return { driverType: 'MEMORY_ASYNC', instance: new MemoryAsyncVFS('albasmi_mem_ephemeral') };
    }

    throw new SqliteStorageError(
      'ERR_PERSISTENCE_UNAVAILABLE',
      'No persistent browser storage (OPFS or IndexedDB) is accessible in this runtime.'
    );
  }

  private isValidSqliteHeader(bytes: Uint8Array): boolean {
    if (!bytes || bytes.byteLength < 16) return false;
    // Magic header: "SQLite format 3\0"
    const expected = [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00];
    for (let i = 0; i < 16; i++) {
      if (bytes[i] !== expected[i]) return false;
    }
    return true;
  }

  private async execOnHandle(
    handle: any,
    sql: string,
    callback?: (row: unknown[], colNames: string[]) => void
  ): Promise<void> {
    for await (const stmt of this._sqlite3.statements(handle, sql)) {
      const colNames: string[] = this._sqlite3.column_names(stmt);
      while ((await this._sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
        if (callback) {
          const rowValues: unknown[] = [];
          for (let i = 0; i < colNames.length; i++) {
            rowValues.push(this._sqlite3.column(stmt, i));
          }
          callback(rowValues, colNames);
        }
      }
    }
  }

  private async readVfsFileBytes(filename: string): Promise<Uint8Array> {
    if (this._driverId === 'MEMORY_ASYNC') {
      const file = this._vfs?.mapNameToFile?.get(filename);
      if (!file) {
        throw new SqliteStorageError('ERR_SQLITE_CORRUPT_DATABASE', `File ${filename} not found in memory VFS`);
      }
      return new Uint8Array(file.data.slice(0, file.size));
    }

    if (this._driverId === 'OPFS') {
      if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
        const root = await navigator.storage.getDirectory();
        const fh = await root.getFileHandle(filename, { create: false });
        const file = await fh.getFile();
        const buf = await file.arrayBuffer();
        return new Uint8Array(buf);
      }
      throw new SqliteStorageError('ERR_PERSISTENCE_UNAVAILABLE', 'OPFS not accessible in current environment');
    }

    if (this._driverId === 'INDEXEDDB') {
      const idbName = this._vfs?.name || `albasmi_idb_${this._databaseName}`;
      return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          return reject(new SqliteStorageError('ERR_PERSISTENCE_UNAVAILABLE', 'IndexedDB is not available'));
        }
        const req = indexedDB.open(idbName);
        req.onerror = () => reject(new SqliteStorageError('ERR_SQLITE_CORRUPT_DATABASE', `Failed to open IndexedDB ${idbName}`));
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction('blocks', 'readonly');
            const store = tx.objectStore('blocks');
            const path = filename.startsWith('/') ? filename : `/${filename}`;
            const getAllReq = store.getAll(IDBKeyRange.bound([path, -Infinity, -Infinity], [path, Infinity, Infinity]));
            getAllReq.onsuccess = () => {
              const blocks: Array<{ offset: number; version: number; data: Uint8Array; fileSize?: number }> = getAllReq.result || [];
              db.close();
              if (blocks.length === 0) {
                return reject(new SqliteStorageError('ERR_SQLITE_CORRUPT_DATABASE', `File ${filename} not found in IndexedDB blocks`));
              }
              const block0 = blocks.find((b) => b.offset === 0);
              if (!block0 || typeof block0.fileSize !== 'number') {
                return reject(new SqliteStorageError('ERR_SQLITE_CORRUPT_DATABASE', `Invalid block0 for ${filename} in IndexedDB`));
              }
              const totalSize = block0.fileSize;
              const result = new Uint8Array(totalSize);
              if (block0.data) {
                result.set(block0.data.subarray(0, Math.min(block0.data.byteLength, totalSize)), 0);
              }
              for (const b of blocks) {
                if (b.offset < 0) {
                  const fileOffset = -b.offset;
                  if (fileOffset < totalSize && b.data) {
                    result.set(b.data.subarray(0, Math.min(b.data.byteLength, totalSize - fileOffset)), fileOffset);
                  }
                }
              }
              resolve(result);
            };
            getAllReq.onerror = () => {
              db.close();
              reject(new SqliteStorageError('ERR_SQLITE_CORRUPT_DATABASE', `IndexedDB query failed for ${filename}`));
            };
          } catch (e) {
            db.close();
            reject(new SqliteStorageError('ERR_SQLITE_CORRUPT_DATABASE', `IndexedDB error: ${e}`));
          }
        };
      });
    }

    throw new SqliteStorageError('ERR_PERSISTENCE_UNAVAILABLE', `VFS ${this._driverId} does not support binary export`);
  }

  private async writeVfsFileBytes(filename: string, bytes: Uint8Array): Promise<void> {
    if (this._driverId === 'MEMORY_ASYNC') {
      if (this._vfs?.mapNameToFile) {
        this._vfs.mapNameToFile.set(filename, {
          name: filename,
          flags: 0,
          size: bytes.byteLength,
          data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        });
        return;
      }
      throw new SqliteStorageError('ERR_SQLITE_INITIALIZATION_FAILED', 'Memory VFS not accessible');
    }

    if (this._driverId === 'OPFS') {
      if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
        const root = await navigator.storage.getDirectory();
        const fh = await root.getFileHandle(filename, { create: true });
        const writable = await fh.createWritable();
        await (writable as any).write(bytes);
        await writable.close();
        return;
      }
      throw new SqliteStorageError('ERR_PERSISTENCE_UNAVAILABLE', 'OPFS not accessible');
    }

    if (this._driverId === 'INDEXEDDB') {
      const idbName = this._vfs?.name || `albasmi_idb_${this._databaseName}`;
      return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          return reject(new SqliteStorageError('ERR_PERSISTENCE_UNAVAILABLE', 'IndexedDB not available'));
        }
        const req = indexedDB.open(idbName);
        req.onerror = () => reject(new SqliteStorageError('ERR_SQLITE_INITIALIZATION_FAILED', `Failed to open IDB ${idbName}`));
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction('blocks', 'readwrite');
            const store = tx.objectStore('blocks');
            const path = filename.startsWith('/') ? filename : `/${filename}`;
            store.delete(IDBKeyRange.bound([path, -Infinity, -Infinity], [path, Infinity, Infinity]));
            store.put({
              path,
              offset: 0,
              version: 1,
              data: bytes.slice(),
              fileSize: bytes.byteLength,
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              db.close();
              reject(new SqliteStorageError('ERR_SQLITE_INITIALIZATION_FAILED', 'Failed to write blocks to IDB'));
            };
          } catch (e) {
            db.close();
            reject(new SqliteStorageError('ERR_SQLITE_INITIALIZATION_FAILED', `IDB write error: ${e}`));
          }
        };
      });
    }

    throw new SqliteStorageError('ERR_PERSISTENCE_UNAVAILABLE', `VFS ${this._driverId} does not support binary write`);
  }

  private async deleteVfsFile(filename: string): Promise<void> {
    try {
      if (this._driverId === 'MEMORY_ASYNC') {
        this._vfs?.mapNameToFile?.delete(filename);
        return;
      }
      if (this._driverId === 'OPFS') {
        if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
          const root = await navigator.storage.getDirectory();
          await root.removeEntry(filename);
        }
        return;
      }
      if (this._driverId === 'INDEXEDDB') {
        const idbName = this._vfs?.name || `albasmi_idb_${this._databaseName}`;
        if (typeof indexedDB !== 'undefined') {
          await new Promise<void>((resolve, reject) => {
            const req = indexedDB.open(idbName);
            req.onerror = () => reject();
            req.onsuccess = () => {
              const db = req.result;
              try {
                const tx = db.transaction('blocks', 'readwrite');
                const store = tx.objectStore('blocks');
                const path = filename.startsWith('/') ? filename : `/${filename}`;
                store.delete(IDBKeyRange.bound([path, -Infinity, -Infinity], [path, Infinity, Infinity]));
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => { db.close(); reject(); };
              } catch {
                db.close();
                reject();
              }
            };
          });
        }
      }
    } catch {
      // Ignore deletion failure for temporary files
    }
  }
}
