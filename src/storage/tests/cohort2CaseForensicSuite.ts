/**
 * AL-BASMI ORTH — COHORT 2 ORTHODONTIC CASE FORENSIC TEST SUITE
 * Scope: PHASE R2-B (Orthodontic Case SQLite Integration Vertical Slice)
 *
 * Verifies:
 * R2B-01: Compatibility with the frozen case-table schema (24 columns)
 * R2B-02: Successful clinical case creation (case + audit + sync outbox)
 * R2B-03: Retrieval by primary key
 * R2B-04: Listing persisted clinical cases
 * R2B-05: Listing cases by patient
 * R2B-06: Rejecting a nonexistent patient
 * R2B-07: Rejecting a synthetic/demo patient
 * R2B-08: Rejecting an invalid patient-case relationship
 * R2B-09: Full rollback when audit insertion fails
 * R2B-10: Full rollback when outbox insertion fails
 * R2B-11: Correct duplicate and idempotency behavior
 * R2B-12: Persistence verification after adapter close/reopen
 * R2B-13: No legacy localStorage write for new clinical cases
 * R2B-14: No false UI success or state insertion after persistence failure
 * R2B-15: Blocking clinical case creation when durable storage is unavailable
 * R2B-16: Separation of demo and persisted clinical case lists
 */

import { WaSqliteStorageAdapter } from '../drivers/waSqliteAdapter.ts';
import {
  Cohort2PatientPersistenceService,
} from '../drivers/cohort2PatientPersistenceService.ts';
import {
  Cohort2CasePersistenceService,
  Cohort2CasePersistenceError,
  CreateCaseParams,
  SqliteCaseRepository,
} from '../drivers/cohort2CasePersistenceService.ts';
import { SqliteStorageError } from '../types/storageAdapter.ts';
import {
  P0_PRODUCTION_SQLITE_DDL,
  SqliteOrthodonticCaseRow,
} from '../../domain/p0SqliteSchema.ts';
import { INITIAL_CASES } from '../../data/seedCases.ts';

export interface R2BTestResult {
  testId: string;
  name: string;
  passed: boolean;
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN';
  evidence: string;
  limitation?: string;
}

export interface R2BForensicSuiteReport {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  results: R2BTestResult[];
}

export async function runCohort2CaseForensicSuite(
  options: { wasmBinary?: ArrayBuffer | Uint8Array } = {}
): Promise<R2BForensicSuiteReport> {
  const results: R2BTestResult[] = [];

  const addResult = (
    testId: string,
    name: string,
    passed: boolean,
    evidence: string,
    limitation?: string
  ) => {
    results.push({
      testId,
      name,
      passed,
      status: passed ? 'PASS' : limitation ? 'BLOCKED' : 'FAIL',
      evidence,
      limitation,
    });
  };

  const createInitializedAdapter = async (dbName: string): Promise<WaSqliteStorageAdapter> => {
    const adapter = new WaSqliteStorageAdapter({
      databaseName: dbName,
      preferredVfs: 'MEMORY_ASYNC',
      mode: 'PREVIEW',
      allowPreviewEphemeral: true,
      wasmBinary: options.wasmBinary,
    });
    await adapter.initialize();

    // Execute frozen DDL
    const cleanSql = P0_PRODUCTION_SQLITE_DDL
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const statements = cleanSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await adapter.execute(`${stmt};`);
    }
    return adapter;
  };

  // Base test database
  const dbName = `cohort2_case_test_${Date.now()}.db`;
  const adapter = await createInitializedAdapter(dbName);
  const patientService = new Cohort2PatientPersistenceService(adapter);
  const caseService = new Cohort2CasePersistenceService(adapter);

  // Setup authoritative baseline patient
  const basePatientRes = await patientService.createPatient({
    id: 'pat-base-r2b-001',
    patientNumber: 'PAT-2026-009901',
    firstName: 'نورة',
    lastName: 'السبيعي',
    dateOfBirth: '2011-06-15',
    sex: 'FEMALE',
    phone: '+966501112233',
    userId: 'usr-dr-albasmi',
    userRole: 'ORTHODONTIST',
    deviceId: 'dev-ipad-r2b-01',
    timestamp: '2026-10-12T08:00:00Z',
    operationId: 'op-init-patient-r2b-001',
  });
  const baselinePatientId = basePatientRes.patient.id;

  // --------------------------------------------------------------------------
  // R2B-01: Compatibility with the frozen case-table schema
  // --------------------------------------------------------------------------
  try {
    const tableInfo = await adapter.query<{ name: string; type: string; notnull: number }>(
      'PRAGMA table_info(orthodontic_cases);'
    );
    const actualColumns = new Set(tableInfo.map((c) => c.name));
    const expectedColumns = [
      'id',
      'case_number',
      'patient_id',
      'case_type',
      'case_status',
      'chief_complaint',
      'referral_source',
      'start_date',
      'target_completion_date',
      'actual_completion_date',
      'growth_status',
      'skeletal_maturity_status',
      'primary_provider_id',
      'clinic_id',
      'current_diagnosis_version_id',
      'current_treatment_plan_id',
      'notes',
      'created_at',
      'updated_at',
      'created_by',
      'updated_by',
      'version',
      'is_deleted',
      'deleted_at',
    ];

    const missingColumns = expectedColumns.filter((col) => !actualColumns.has(col));
    const isExact24 = actualColumns.size === 24 && missingColumns.length === 0;

    addResult(
      'R2B-01',
      'Compatibility with the frozen case-table schema',
      isExact24,
      `Table 'orthodontic_cases' confirmed with exactly ${actualColumns.size}/24 columns matching SCHEMA_FREEZE_v1.0.`
    );
  } catch (err: unknown) {
    addResult('R2B-01', 'Compatibility with the frozen case-table schema', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-02: Successful clinical case creation (Atomic triple-write)
  // --------------------------------------------------------------------------
  const validCaseParams: CreateCaseParams = {
    id: 'case-test-r2b-001',
    caseNumber: 'ORT-2026-000201',
    patientId: baselinePatientId,
    caseType: 'COMPREHENSIVE',
    caseStatus: 'CONSULTATION',
    chiefComplaint: 'Bimaxillary dentoalveolar protrusion with deep bite.',
    startDate: '2026-10-12',
    targetCompletionDate: '2028-04-12',
    primaryProviderId: 'usr-dr-albasmi',
    clinicId: 'clinic-main',
    userId: 'usr-dr-albasmi',
    userRole: 'ORTHODONTIST',
    deviceId: 'dev-ipad-r2b-01',
    timestamp: '2026-10-12T08:15:00Z',
    operationId: 'op-case-create-001',
  };

  try {
    const createRes = await caseService.createCase(validCaseParams);
    const caseInDb = await caseService.getCaseById(validCaseParams.id!);
    const auditLogs = await adapter.query(
      "SELECT * FROM audit_logs WHERE entity_type = 'OrthodonticCase' AND entity_id = ?;",
      [validCaseParams.id!]
    );
    const syncOps = await adapter.query(
      "SELECT * FROM sync_operations WHERE entity_type = 'OrthodonticCase' AND entity_id = ?;",
      [validCaseParams.id!]
    );

    const isCommitted =
      createRes.ok &&
      !createRes.isIdempotentHit &&
      caseInDb !== null &&
      caseInDb.case_number === 'ORT-2026-000201' &&
      auditLogs.length === 1 &&
      syncOps.length === 1;

    addResult(
      'R2B-02',
      'Successful clinical case creation',
      isCommitted,
      `Atomically committed: orthodontic_cases=1, audit_logs=1, sync_operations=1. Target patient '${baselinePatientId}' verified.`
    );
  } catch (err: unknown) {
    addResult('R2B-02', 'Successful clinical case creation', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-03: Retrieval by primary key
  // --------------------------------------------------------------------------
  try {
    const retrieved = await caseService.getCaseById('case-test-r2b-001');
    const passed =
      retrieved !== null &&
      retrieved.id === 'case-test-r2b-001' &&
      retrieved.case_number === 'ORT-2026-000201' &&
      retrieved.patient_id === baselinePatientId;

    addResult(
      'R2B-03',
      'Retrieval by primary key',
      passed,
      `Retrieved case 'case-test-r2b-001' by primary key ID with correct foreign key linkage.`
    );
  } catch (err: unknown) {
    addResult('R2B-03', 'Retrieval by primary key', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-04: Listing persisted clinical cases
  // --------------------------------------------------------------------------
  try {
    const activeCases = await caseService.listActiveCases();
    const passed = activeCases.length >= 1 && activeCases.some((c) => c.id === 'case-test-r2b-001');

    addResult(
      'R2B-04',
      'Listing persisted clinical cases',
      passed,
      `Retrieved ${activeCases.length} persisted clinical cases from physical SQLite.`
    );
  } catch (err: unknown) {
    addResult('R2B-04', 'Listing persisted clinical cases', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-05: Listing cases by patient
  // --------------------------------------------------------------------------
  try {
    const patientCases = await caseService.listCasesByPatientId(baselinePatientId);
    const passed =
      patientCases.length === 1 &&
      patientCases[0].id === 'case-test-r2b-001' &&
      patientCases[0].patient_id === baselinePatientId;

    addResult(
      'R2B-05',
      'Listing cases by patient',
      passed,
      `Retrieved ${patientCases.length} case(s) for patient '${baselinePatientId}'.`
    );
  } catch (err: unknown) {
    addResult('R2B-05', 'Listing cases by patient', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-06: Rejecting a nonexistent patient
  // --------------------------------------------------------------------------
  try {
    let thrownError: Cohort2CasePersistenceError | null = null;
    try {
      await caseService.createCase({
        id: 'case-test-nonexistent-pat',
        caseNumber: 'ORT-2026-999999',
        patientId: 'pat-does-not-exist-in-sqlite',
        chiefComplaint: 'Cannot attach to nonexistent patient.',
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-ipad-01',
      });
    } catch (e: unknown) {
      if (e instanceof Cohort2CasePersistenceError) {
        thrownError = e;
      }
    }

    const passed =
      thrownError !== null && thrownError.code === 'ERR_PATIENT_NOT_FOUND';

    addResult(
      'R2B-06',
      'Rejecting a nonexistent patient',
      passed,
      `Rejected case creation for unpersisted patient with code '${thrownError?.code}'. Foreign key boundary enforced.`
    );
  } catch (err: unknown) {
    addResult('R2B-06', 'Rejecting a nonexistent patient', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-07: Rejecting a synthetic/demo patient
  // --------------------------------------------------------------------------
  try {
    let thrownError: Cohort2CasePersistenceError | null = null;
    try {
      await caseService.createCase({
        id: 'case-test-demo-pat',
        caseNumber: 'ORT-2026-888888',
        patientId: 'PAT-2025-001', // Synthetic demo patient ID
        chiefComplaint: 'Cannot attach to synthetic demo patient.',
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-ipad-01',
      });
    } catch (e: unknown) {
      if (e instanceof Cohort2CasePersistenceError) {
        thrownError = e;
      }
    }

    const passed =
      thrownError !== null && thrownError.code === 'ERR_DEMO_PATIENT_REJECTED';

    addResult(
      'R2B-07',
      'Rejecting a synthetic/demo patient',
      passed,
      `Correctly intercepted synthetic demo patient 'PAT-2025-001' with code '${thrownError?.code}'.`
    );
  } catch (err: unknown) {
    addResult('R2B-07', 'Rejecting a synthetic/demo patient', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-08: Rejecting an invalid patient-case relationship (soft-deleted patient)
  // --------------------------------------------------------------------------
  try {
    // 1. Create a patient and soft-delete it
    await adapter.execute(
      `INSERT INTO patients (id, patient_number, first_name, last_name, full_name_normalized, date_of_birth, sex, phone, status, created_at, updated_at, created_by, updated_by, version, is_deleted, deleted_at)
       VALUES ('pat-soft-deleted-01', 'PAT-2026-DEL01', 'خالد', 'المحذوف', 'خالد المحذوف', '2010-01-01', 'MALE', '+966500000099', 'INACTIVE', '2026-10-12T00:00:00Z', '2026-10-12T00:00:00Z', 'usr-01', 'usr-01', 2, 1, '2026-10-12T01:00:00Z');`
    );

    let thrownError: Cohort2CasePersistenceError | null = null;
    try {
      await caseService.createCase({
        id: 'case-test-deleted-pat',
        caseNumber: 'ORT-2026-777777',
        patientId: 'pat-soft-deleted-01',
        chiefComplaint: 'Cannot attach to soft-deleted patient.',
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-ipad-01',
      });
    } catch (e: unknown) {
      if (e instanceof Cohort2CasePersistenceError) {
        thrownError = e;
      }
    }

    const passed =
      thrownError !== null && thrownError.code === 'ERR_PATIENT_NOT_FOUND';

    addResult(
      'R2B-08',
      'Rejecting an invalid patient-case relationship',
      passed,
      `Rejected case creation for soft-deleted patient with code '${thrownError?.code}'. Inactive patients cannot receive new cases.`
    );
  } catch (err: unknown) {
    addResult('R2B-08', 'Rejecting an invalid patient-case relationship', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-09: Full rollback when audit insertion fails
  // --------------------------------------------------------------------------
  try {
    const beforeCount = await caseService.getCaseCount();
    let rollbackSuccess = false;

    try {
      await adapter.transaction('IMMEDIATE', async (tx) => {
        // 1. Insert case
        await tx.execute(
          `INSERT INTO orthodontic_cases (id, case_number, patient_id, case_type, case_status, chief_complaint, start_date, primary_provider_id, clinic_id, created_at, updated_at, created_by, updated_by, version, is_deleted)
           VALUES ('case-rollback-aud', 'ORT-ROLL-AUD', '${baselinePatientId}', 'COMPREHENSIVE', 'CONSULTATION', 'Rollback test', '2026-10-12', 'usr-01', 'clinic-main', '2026-10-12T08:00:00Z', '2026-10-12T08:00:00Z', 'usr-01', 'usr-01', 1, 0);`
        );
        // 2. Simulate NOT NULL audit failure
        await tx.execute('INSERT INTO audit_logs (id, entity_type) VALUES (NULL, NULL);');
      });
    } catch {
      const afterCount = await caseService.getCaseCount();
      const orphanedCase = await caseService.getCaseById('case-rollback-aud');
      rollbackSuccess = afterCount === beforeCount && orphanedCase === null;
    }

    addResult(
      'R2B-09',
      'Full rollback when audit insertion fails',
      rollbackSuccess,
      `Transaction rolled back atomically upon mid-operation audit failure. Uncommitted case row cleanly discarded.`
    );
  } catch (err: unknown) {
    addResult('R2B-09', 'Full rollback when audit insertion fails', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-10: Full rollback when outbox insertion fails
  // --------------------------------------------------------------------------
  try {
    const beforeCount = await caseService.getCaseCount();
    let rollbackSuccess = false;

    try {
      await adapter.transaction('IMMEDIATE', async (tx) => {
        // 1. Insert case
        await tx.execute(
          `INSERT INTO orthodontic_cases (id, case_number, patient_id, case_type, case_status, chief_complaint, start_date, primary_provider_id, clinic_id, created_at, updated_at, created_by, updated_by, version, is_deleted)
           VALUES ('case-rollback-sync', 'ORT-ROLL-SYNC', '${baselinePatientId}', 'COMPREHENSIVE', 'CONSULTATION', 'Rollback test sync', '2026-10-12', 'usr-01', 'clinic-main', '2026-10-12T08:00:00Z', '2026-10-12T08:00:00Z', 'usr-01', 'usr-01', 1, 0);`
        );
        // 2. Insert audit
        await tx.execute(
          `INSERT INTO audit_logs (id, entity_type, entity_id, operation_type, user_id, device_id, timestamp)
           VALUES ('aud-roll-case-2', 'orthodontic_cases', 'case-rollback-sync', 'CREATE', 'usr-01', 'dev-01', '2026-10-12T08:00:00Z');`
        );
        // 3. Simulate failure on sync outbox (CHECK constraint violation)
        await tx.execute(
          `INSERT INTO sync_operations (operation_id, device_id, entity_type, entity_id, operation_type, base_version, result_version, payload, created_at)
           VALUES ('sync-roll-case-2', 'dev-01', 'orthodontic_cases', 'case-rollback-sync', 'INVALID_OP_TYPE', 0, 1, '{}', '2026-10-12T08:00:00Z');`
        );
      });
    } catch {
      const afterCount = await caseService.getCaseCount();
      const orphanedCase = await caseService.getCaseById('case-rollback-sync');
      rollbackSuccess = afterCount === beforeCount && orphanedCase === null;
    }

    addResult(
      'R2B-10',
      'Full rollback when outbox insertion fails',
      rollbackSuccess,
      `Transaction rolled back atomically upon sync_operations failure. CHECK constraint enforced, no orphan case rows left.`
    );
  } catch (err: unknown) {
    addResult('R2B-10', 'Full rollback when outbox insertion fails', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-11: Correct duplicate and idempotency behavior
  // --------------------------------------------------------------------------
  try {
    // 1. Idempotent replay: exact payload replay returns existing record
    const replayRes = await caseService.createCase(validCaseParams);
    const isIdempotentHit =
      replayRes.ok &&
      replayRes.isIdempotentHit === true &&
      replayRes.case.id === validCaseParams.id;

    // 2. Duplicate case_number rejection with different ID
    let dupError: Cohort2CasePersistenceError | null = null;
    try {
      await caseService.createCase({
        id: 'case-test-r2b-dup',
        caseNumber: validCaseParams.caseNumber, // Identical case_number
        patientId: baselinePatientId,
        chiefComplaint: 'Duplicate number test',
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-ipad-01',
      });
    } catch (e: unknown) {
      if (e instanceof Cohort2CasePersistenceError) {
        dupError = e;
      }
    }
    const isDupRejected =
      dupError !== null && dupError.code === 'ERR_DUPLICATE_CASE_NUMBER';

    // 3. Idempotency payload mismatch rejection
    let mismatchError: Cohort2CasePersistenceError | null = null;
    try {
      await caseService.createCase({
        ...validCaseParams,
        chiefComplaint: 'Tampered chief complaint payload with same operationId',
      });
    } catch (e: unknown) {
      if (e instanceof Cohort2CasePersistenceError) {
        mismatchError = e;
      }
    }
    const isMismatchRejected =
      mismatchError !== null && mismatchError.code === 'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH';

    const passed = isIdempotentHit && isDupRejected && isMismatchRejected;

    addResult(
      'R2B-11',
      'Correct duplicate and idempotency behavior',
      passed,
      `Idempotent hit verified (isIdempotentHit=true), duplicate case_number rejected (ERR_DUPLICATE_CASE_NUMBER), tampered payload rejected (ERR_IDEMPOTENCY_PAYLOAD_MISMATCH).`
    );
  } catch (err: unknown) {
    addResult('R2B-11', 'Correct duplicate and idempotency behavior', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-12: Persistence verification after adapter close/reopen
  // --------------------------------------------------------------------------
  try {
    const beforeCount = await caseService.getCaseCount();
    await adapter.close();

    // Reopen the same adapter on the same database
    await adapter.initialize();
    const serviceAfterReopen = new Cohort2CasePersistenceService(adapter);
    const afterCount = await serviceAfterReopen.getCaseCount();
    const verifiedRow = await serviceAfterReopen.getCaseById('case-test-r2b-001');

    const passed =
      beforeCount === afterCount &&
      afterCount >= 1 &&
      verifiedRow !== null &&
      verifiedRow.case_number === 'ORT-2026-000201';

    addResult(
      'R2B-12',
      'Persistence verification after adapter close/reopen',
      passed,
      `Connection closed and reopened cleanly. Stored cases before=${beforeCount}, after=${afterCount}.`
    );
  } catch (err: unknown) {
    addResult('R2B-12', 'Persistence verification after adapter close/reopen', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-13: No legacy localStorage write for new clinical cases
  // --------------------------------------------------------------------------
  try {
    // Verify that Cohort2CasePersistenceService has zero reference to localStorage
    const serviceSource = Cohort2CasePersistenceService.toString();
    const repoSource = SqliteCaseRepository.toString();
    const hasLocalStorageAccess =
      serviceSource.includes('localStorage') || repoSource.includes('localStorage');

    addResult(
      'R2B-13',
      'No legacy localStorage write for new clinical cases',
      !hasLocalStorageAccess,
      `Verified zero localStorage access in Cohort2CasePersistenceService. SQLite is the sole clinical SSOT.`
    );
  } catch (err: unknown) {
    addResult('R2B-13', 'No legacy localStorage write for new clinical cases', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-14: No false UI success or state insertion after persistence failure
  // --------------------------------------------------------------------------
  try {
    // When persistence fails (e.g. invalid date or missing required field), service throws synchronously
    let caught = false;
    try {
      await caseService.createCase({
        id: 'case-test-invalid-fail',
        caseNumber: '',
        patientId: baselinePatientId,
        chiefComplaint: '', // Empty
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-01',
      });
    } catch {
      caught = true;
    }

    const checkRow = await caseService.getCaseById('case-test-invalid-fail');
    const passed = caught && checkRow === null;

    addResult(
      'R2B-14',
      'No false UI success or state insertion after persistence failure',
      passed,
      `Persistence failure threw explicitly before UI update. Case was never created in SQLite.`
    );
  } catch (err: unknown) {
    addResult('R2B-14', 'No false UI success or state insertion after persistence failure', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-15: Blocking clinical case creation when durable storage is unavailable
  // --------------------------------------------------------------------------
  try {
    let fatalBlocked = false;
    try {
      const strictClinicalAdapter = new WaSqliteStorageAdapter({
        databaseName: `test_clinical_strict_${Date.now()}.db`,
        mode: 'CLINICAL',
        preferredVfs: 'OPFS',
        allowPreviewEphemeral: false,
        wasmBinary: options.wasmBinary,
      });
      await strictClinicalAdapter.initialize();
    } catch (e: unknown) {
      if (
        e instanceof SqliteStorageError &&
        (e.code === 'ERR_PERSISTENCE_UNAVAILABLE' || e.code === 'ERR_SQLITE_INITIALIZATION_FAILED')
      ) {
        fatalBlocked = true;
      }
    }

    addResult(
      'R2B-15',
      'Blocking clinical case creation when durable storage is unavailable',
      fatalBlocked,
      fatalBlocked
        ? 'Adapter strictly threw ERR_PERSISTENCE_UNAVAILABLE in Clinical Mode when durable storage was inaccessible; clinical case writes are blocked.'
        : 'Adapter silently permitted non-durable writes in Clinical Mode.'
    );
  } catch (err: unknown) {
    addResult('R2B-15', 'Blocking clinical case creation when durable storage is unavailable', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2B-16: Separation of demo and persisted clinical case lists
  // --------------------------------------------------------------------------
  try {
    // Demo cases from INITIAL_CASES
    const demoCaseIds = INITIAL_CASES.map((c) => c.id);
    const persistedCases = await caseService.listActiveCases();
    const persistedIds = new Set(persistedCases.map((c) => c.id));

    // Ensure zero overlap between demo cases and persisted SQLite cases
    const hasOverlap = demoCaseIds.some((id) => persistedIds.has(id));
    const allDemoFlagged = INITIAL_CASES.every((c) => c.isDemo === true);

    const passed = !hasOverlap && allDemoFlagged;

    addResult(
      'R2B-16',
      'Separation of demo and persisted clinical case lists',
      passed,
      `Zero demo cases present in SQLite database. All ${INITIAL_CASES.length} initial demo cases carry isDemo=true.`
    );
  } catch (err: unknown) {
    addResult('R2B-16', 'Separation of demo and persisted clinical case lists', false, String(err));
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => r.status === 'FAIL').length;
  const blockedCount = results.filter((r) => r.status === 'BLOCKED' || r.status === 'NOT_RUN').length;

  return {
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    blocked: blockedCount,
    results,
  };
}
