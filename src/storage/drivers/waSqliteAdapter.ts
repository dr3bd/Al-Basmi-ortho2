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
          await this.internalExecute(`SAVEPOINT ${name};`);
          try {
            const out = await cb();
            await this.internalExecute(`RELEASE ${name};`);
            return out;
          } catch (spErr) {
            await this.internalExecute(`ROLLBACK TO ${name};`);
            throw spErr;
          }
        },
      };

      const result = await callback(txContext);

      if (isTopLevel) {
        await this.internalExecute('COMMIT;');
      } else {
        await this.internalExecute(`RELEASE ${savepointName};`);
      }

      return result;
    } catch (err: unknown) {
      try {
        if (isTopLevel) {
          await this.internalExecute('ROLLBACK;');
        } else {
          await this.internalExecute(`ROLLBACK TO ${savepointName};`);
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

      // Query last insert rowid
      let lastInsertRowId: number | bigint = 0;
      for await (const rowidStmt of this._sqlite3.statements(this._dbHandle, 'SELECT last_insert_rowid();')) {
        if ((await this._sqlite3.step(rowidStmt)) === SQLite.SQLITE_ROW) {
          lastInsertRowId = this._sqlite3.column(rowidStmt, 0);
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
    if (Array.isArray(params)) {
      this._sqlite3.bind_collection(stmt, params);
    } else if (typeof params === 'object' && params !== null) {
      this._sqlite3.bind_collection(stmt, params);
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
}
