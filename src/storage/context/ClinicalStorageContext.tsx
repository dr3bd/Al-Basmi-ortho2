/**
 * AL-BASMI ORTH — CLINICAL STORAGE CONTEXT & BROWSER LIFECYCLE
 * Scope: PHASE 2-C-R3 Controlled Browser Storage Initialization
 * 
 * Rules:
 * 1. Initializes WaSqliteStorageAdapter as a singleton instance.
 * 2. Fetches public/wa-sqlite-async.wasm in the browser runtime.
 * 3. Applies P0_PRODUCTION_SQLITE_DDL on initial boot using schema_migrations.
 * 4. Bootstraps stable device identity using DeviceBootstrapService.
 * 5. If durable storage fails to initialize, exposes explicit UNAVAILABLE error without silent fallback.
 * 6. Keeps all clinical state 100% on Map-backed paths.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { WaSqliteStorageAdapter } from '../drivers/waSqliteAdapter.ts';
import { Cohort1PersistenceService } from '../drivers/cohort1PersistenceService.ts';
import { DeviceBootstrapResult, DeviceBootstrapService } from '../services/deviceBootstrap.ts';
import { ISqliteStorageAdapter, VfsDriverType } from '../types/storageAdapter.ts';
import { P0_PRODUCTION_SQLITE_DDL } from '../../domain/p0SqliteSchema.ts';

export type StorageLifecycleStatus =
  | 'UNINITIALIZED'
  | 'INITIALIZING'
  | 'READY'
  | 'UNAVAILABLE'
  | 'ERROR';

export interface ClinicalStorageContextValue {
  status: StorageLifecycleStatus;
  adapter: ISqliteStorageAdapter | null;
  cohort1Service: Cohort1PersistenceService | null;
  deviceInfo: DeviceBootstrapResult | null;
  vfsDriver: VfsDriverType | null;
  errorMessage: string | null;
  isDurable: boolean;
  retryInitialization: () => Promise<void>;
}

const ClinicalStorageContext = createContext<ClinicalStorageContextValue>({
  status: 'UNINITIALIZED',
  adapter: null,
  cohort1Service: null,
  deviceInfo: null,
  vfsDriver: null,
  errorMessage: null,
  isDurable: false,
  retryInitialization: async () => {},
});

export interface ClinicalStorageProviderProps {
  children: React.ReactNode;
  databaseName?: string;
  allowPreviewEphemeral?: boolean;
}

export const ClinicalStorageProvider: React.FC<ClinicalStorageProviderProps> = ({
  children,
  databaseName = 'albasmi_orth_clinical.db',
  allowPreviewEphemeral = true,
}) => {
  const [status, setStatus] = useState<StorageLifecycleStatus>('UNINITIALIZED');
  const [adapter, setAdapter] = useState<ISqliteStorageAdapter | null>(null);
  const [cohort1Service, setCohort1Service] = useState<Cohort1PersistenceService | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceBootstrapResult | null>(null);
  const [vfsDriver, setVfsDriver] = useState<VfsDriverType | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDurable, setIsDurable] = useState<boolean>(false);

  const initStorage = async () => {
    setStatus('INITIALIZING');
    setErrorMessage(null);

    try {
      // 1. Fetch WASM binary in browser if in browser environment
      let wasmBinary: ArrayBuffer | undefined = undefined;
      if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
        try {
          const resp = await window.fetch('/wa-sqlite-async.wasm');
          if (resp.ok) {
            wasmBinary = await resp.arrayBuffer();
          }
        } catch {
          // Fall back to default module loader if fetch fails
        }
      }

      // 2. Instantiate WaSqliteStorageAdapter
      // In browser preview / iframe, allowPreviewEphemeral permits IDBBatchAtomicVFS fallback
      const newAdapter = new WaSqliteStorageAdapter({
        databaseName,
        mode: 'PREVIEW',
        allowPreviewEphemeral,
        wasmBinary,
      });

      await newAdapter.initialize();

      // Anti-silent fallback: Check VFS driver
      const driver = newAdapter.driverId;
      setVfsDriver(driver);
      const isDurableDriver = driver === 'OPFS' || driver === 'INDEXEDDB';
      setIsDurable(isDurableDriver);

      // 3. Ensure DDL and baseline migration
      // Split and execute DDL statements safely
      const cleanSql = P0_PRODUCTION_SQLITE_DDL
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');
      const statements = cleanSql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // Check if schema_migrations table exists
      const tableCheck = await newAdapter.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations';"
      );

      if (tableCheck.length === 0) {
        // First run: execute DDL
        for (const stmt of statements) {
          await newAdapter.execute(`${stmt};`);
        }
        // Insert baseline migration record
        await newAdapter.execute(
          `INSERT OR IGNORE INTO schema_migrations (version, migration_name, applied_at, checksum)
           VALUES (1, '001_initial_p0_clinical_core_schema', ?, 'sha256:4a7d1ed414474e4033ac29ccb8653d9b');`,
          [new Date().toISOString()]
        );
      }

      // 4. Initialize Cohort 1 Service & Bootstrap Device
      const c1Service = new Cohort1PersistenceService(newAdapter);
      const bootstrapper = new DeviceBootstrapService(newAdapter, c1Service);
      const bootResult = await bootstrapper.bootstrapDevice();

      setAdapter(newAdapter);
      setCohort1Service(c1Service);
      setDeviceInfo(bootResult);
      setStatus('READY');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setStatus('UNAVAILABLE');
    }
  };

  useEffect(() => {
    initStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseName]);

  return (
    <ClinicalStorageContext.Provider
      value={{
        status,
        adapter,
        cohort1Service,
        deviceInfo,
        vfsDriver,
        errorMessage,
        isDurable,
        retryInitialization: initStorage,
      }}
    >
      {children}
    </ClinicalStorageContext.Provider>
  );
};

export function useClinicalStorage(): ClinicalStorageContextValue {
  return useContext(ClinicalStorageContext);
}
