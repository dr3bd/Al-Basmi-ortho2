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
import { Cohort2PatientPersistenceService } from '../drivers/cohort2PatientPersistenceService.ts';
import { Cohort2CasePersistenceService } from '../drivers/cohort2CasePersistenceService.ts';
import { Cohort2VisitPersistenceService } from '../drivers/cohort2VisitPersistenceService.ts';
import { Cohort2ProblemDiagnosisPersistenceService } from '../drivers/cohort2ProblemDiagnosisPersistenceService.ts';
import { DeviceBootstrapResult, DeviceBootstrapService } from '../services/deviceBootstrap.ts';
import { ISqliteStorageAdapter, StorageEngineMode, VfsDriverType } from '../types/storageAdapter.ts';

export type StorageLifecycleStatus =
  | 'UNINITIALIZED'
  | 'INITIALIZING'
  | 'READY'
  | 'UNAVAILABLE'
  | 'ERROR';

export interface ClinicalStorageContextValue {
  status: StorageLifecycleStatus;
  mode: StorageEngineMode;
  adapter: ISqliteStorageAdapter | null;
  cohort1Service: Cohort1PersistenceService | null;
  cohort2PatientService: Cohort2PatientPersistenceService | null;
  cohort2CaseService: Cohort2CasePersistenceService | null;
  cohort2VisitService: Cohort2VisitPersistenceService | null;
  cohort2ProblemDiagnosisService: Cohort2ProblemDiagnosisPersistenceService | null;
  deviceInfo: DeviceBootstrapResult | null;
  vfsDriver: VfsDriverType | null;
  errorMessage: string | null;
  isDurable: boolean;
  retryInitialization: () => Promise<void>;
  switchStorageMode: (mode: StorageEngineMode) => Promise<void>;
}

const ClinicalStorageContext = createContext<ClinicalStorageContextValue>({
  status: 'UNINITIALIZED',
  mode: 'CLINICAL',
  adapter: null,
  cohort1Service: null,
  cohort2PatientService: null,
  cohort2CaseService: null,
  cohort2VisitService: null,
  cohort2ProblemDiagnosisService: null,
  deviceInfo: null,
  vfsDriver: null,
  errorMessage: null,
  isDurable: false,
  retryInitialization: async () => {},
  switchStorageMode: async () => {},
});

export interface ClinicalStorageProviderProps {
  children: React.ReactNode;
  databaseName?: string;
  initialMode?: StorageEngineMode;
  allowPreviewEphemeral?: boolean;
}

export const ClinicalStorageProvider: React.FC<ClinicalStorageProviderProps> = ({
  children,
  databaseName = 'albasmi_orth_clinical.db',
  initialMode = 'CLINICAL',
  allowPreviewEphemeral = false,
}) => {
  const [status, setStatus] = useState<StorageLifecycleStatus>('UNINITIALIZED');
  const [storageMode, setStorageMode] = useState<StorageEngineMode>(initialMode);
  const [adapter, setAdapter] = useState<ISqliteStorageAdapter | null>(null);
  const [cohort1Service, setCohort1Service] = useState<Cohort1PersistenceService | null>(null);
  const [cohort2PatientService, setCohort2PatientService] = useState<Cohort2PatientPersistenceService | null>(null);
  const [cohort2CaseService, setCohort2CaseService] = useState<Cohort2CasePersistenceService | null>(null);
  const [cohort2VisitService, setCohort2VisitService] = useState<Cohort2VisitPersistenceService | null>(null);
  const [cohort2ProblemDiagnosisService, setCohort2ProblemDiagnosisService] = useState<Cohort2ProblemDiagnosisPersistenceService | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceBootstrapResult | null>(null);
  const [vfsDriver, setVfsDriver] = useState<VfsDriverType | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDurable, setIsDurable] = useState<boolean>(false);

  const initStorage = async (overrideMode?: StorageEngineMode) => {
    const effectiveMode = overrideMode || storageMode;
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
      // When in CLINICAL mode, allowPreviewEphemeral is strictly false to forbid in-memory fallback.
      const isClinical = effectiveMode === 'CLINICAL';
      const effectiveAllowEphemeral = isClinical ? false : allowPreviewEphemeral;

      const newAdapter = new WaSqliteStorageAdapter({
        databaseName,
        mode: effectiveMode,
        allowPreviewEphemeral: effectiveAllowEphemeral,
        wasmBinary,
      });

      await newAdapter.initialize();

      // Anti-silent fallback: Check VFS driver
      const driver = newAdapter.driverId;
      setVfsDriver(driver);
      const isDurableDriver = driver === 'OPFS' || driver === 'INDEXEDDB';
      setIsDurable(isDurableDriver);

      // Enforce strict anti-silent fallback in Clinical Mode
      if (isClinical && !isDurableDriver) {
        try {
          await newAdapter.close();
        } catch {
          // Ignore close error on abort
        }
        throw new Error(
          'Clinical Mode requires durable persistent storage (OPFS or IndexedDB). Ephemeral in-memory fallback is rejected to prevent silent data loss.'
        );
      }

      // 3. Initialize Cohort 1 & Cohort 2 Services & Bootstrap Schema, Device, Provider, and Reference Data
      const c1Service = new Cohort1PersistenceService(newAdapter);
      const c2PatientService = new Cohort2PatientPersistenceService(newAdapter);
      const c2CaseService = new Cohort2CasePersistenceService(newAdapter);
      const c2VisitService = new Cohort2VisitPersistenceService(newAdapter);
      const c2ProbDiagService = new Cohort2ProblemDiagnosisPersistenceService(newAdapter);
      const bootstrapper = new DeviceBootstrapService(newAdapter, c1Service);

      // Idempotently ensure all 30 canonical tables, indexes, triggers, and baseline schema_migrations exist
      await bootstrapper.ensureCanonicalSchemaAndMigrations();

      // Bootstrap stable device identity, default provider user, and canonical reference catalogs
      const bootResult = await bootstrapper.bootstrapDevice({ seedReferenceData: true });

      setAdapter(newAdapter);
      setCohort1Service(c1Service);
      setCohort2PatientService(c2PatientService);
      setCohort2CaseService(c2CaseService);
      setCohort2VisitService(c2VisitService);
      setCohort2ProblemDiagnosisService(c2ProbDiagService);
      setDeviceInfo(bootResult);
      setStatus('READY');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setStatus('UNAVAILABLE');
      setAdapter(null);
      setCohort1Service(null);
      setCohort2PatientService(null);
      setCohort2CaseService(null);
      setCohort2VisitService(null);
      setCohort2ProblemDiagnosisService(null);
      setIsDurable(false);
    }
  };

  const switchStorageMode = async (newMode: StorageEngineMode) => {
    if (adapter) {
      try {
        await adapter.close();
      } catch {
        // Ignore close error during teardown
      }
    }
    setStorageMode(newMode);
    await initStorage(newMode);
  };

  useEffect(() => {
    initStorage(storageMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseName]);

  return (
    <ClinicalStorageContext.Provider
      value={{
        status,
        mode: storageMode,
        adapter,
        cohort1Service,
        cohort2PatientService,
        cohort2CaseService,
        cohort2VisitService,
        cohort2ProblemDiagnosisService,
        deviceInfo,
        vfsDriver,
        errorMessage,
        isDurable,
        retryInitialization: () => initStorage(storageMode),
        switchStorageMode,
      }}
    >
      {children}
    </ClinicalStorageContext.Provider>
  );
};

export function useClinicalStorage(): ClinicalStorageContextValue {
  return useContext(ClinicalStorageContext);
}
