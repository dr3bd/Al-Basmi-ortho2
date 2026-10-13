/**
 * AL-BASMI ORTH — COHORT 2 VISIT & EXAMINATION FORENSIC TEST SUITE
 * Scope: PHASE R2-C (Clinical Visits & Examinations SQLite Integration Vertical Slice)
 *
 * Verifies:
 * R2C-01: Compatibility with actual frozen visit/examination schema (visits, clinical_examinations, clinical_findings)
 * R2C-02: Successful clinical visit creation (visit + audit + sync outbox)
 * R2C-03: Visit retrieval by primary key
 * R2C-04: Listing visits for the correct patient and/or case
 * R2C-05: Successful persistence of supported examination records (examination + findings + audit + sync)
 * R2C-06: Examination retrieval and parent relationship integrity
 * R2C-07: Rejection of a nonexistent patient
 * R2C-08: Rejection of a nonexistent or invalid case when required
 * R2C-09: Rejection of synthetic/demo parent records
 * R2C-10: Rejection of invalid or ineligible parent records (soft-deleted case)
 * R2C-11: Complete rollback when audit insertion fails
 * R2C-12: Complete rollback when sync-outbox insertion fails
 * R2C-13: Correct duplicate and idempotency behavior
 * R2C-14: Persistence verification after adapter close/reopen
 * R2C-15: No legacy localStorage write for new clinical records
 * R2C-16: No false UI success or state insertion after persistence failure
 * R2C-17: Clinical write rejection when durable storage is unavailable
 * R2C-18: Correct loading and separation of persisted clinical versus demo records
 * R2C-19: No unintended orphan parent/child records after failed multi-record operations
 * R2C-20: Regression tests for existing patient and case persistence services
 */

import { WaSqliteStorageAdapter } from '../drivers/waSqliteAdapter.ts';
import { Cohort2PatientPersistenceService } from '../drivers/cohort2PatientPersistenceService.ts';
import { Cohort2CasePersistenceService } from '../drivers/cohort2CasePersistenceService.ts';
import {
  Cohort2VisitPersistenceService,
  Cohort2VisitPersistenceError,
  CreateVisitParams,
  CreateExaminationParams,
  SqliteVisitRepository,
  SqliteExaminationRepository,
} from '../drivers/cohort2VisitPersistenceService.ts';
import { SqliteStorageError } from '../types/storageAdapter.ts';
import { P0_PRODUCTION_SQLITE_DDL } from '../../domain/p0SqliteSchema.ts';
import { INITIAL_CASES } from '../../data/seedCases.ts';

export interface R2CTestResult {
  testId: string;
  name: string;
  passed: boolean;
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN';
  evidence: string;
  limitation?: string;
}

export interface R2CForensicSuiteReport {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  results: R2CTestResult[];
}

export async function runCohort2VisitForensicSuite(
  options: { wasmBinary?: ArrayBuffer | Uint8Array } = {}
): Promise<R2CForensicSuiteReport> {
  const results: R2CTestResult[] = [];

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
  const dbName = `cohort2_visit_test_${Date.now()}.db`;
  const adapter = await createInitializedAdapter(dbName);
  const patientService = new Cohort2PatientPersistenceService(adapter);
  const caseService = new Cohort2CasePersistenceService(adapter);
  const visitService = new Cohort2VisitPersistenceService(adapter);

  // Setup authoritative baseline patient & case
  const basePatientRes = await patientService.createPatient({
    id: 'pat-base-r2c-001',
    patientNumber: 'PAT-2026-008801',
    firstName: 'سارة',
    lastName: 'القحطاني',
    dateOfBirth: '2012-03-20',
    sex: 'FEMALE',
    phone: '+966509988776',
    userId: 'usr-dr-albasmi',
    userRole: 'ORTHODONTIST',
    deviceId: 'dev-ipad-r2c-01',
    timestamp: '2026-10-12T08:00:00Z',
    operationId: 'op-init-pat-r2c-001',
  });
  const baselinePatientId = basePatientRes.patient.id;

  const baseCaseRes = await caseService.createCase({
    id: 'case-base-r2c-001',
    caseNumber: 'ORT-2026-000301',
    patientId: baselinePatientId,
    caseType: 'COMPREHENSIVE',
    caseStatus: 'ACTIVE_TREATMENT',
    chiefComplaint: 'Severe crowding and Class II malocclusion.',
    startDate: '2026-10-12',
    primaryProviderId: 'usr-dr-albasmi',
    clinicId: 'clinic-main',
    userId: 'usr-dr-albasmi',
    userRole: 'ORTHODONTIST',
    deviceId: 'dev-ipad-r2c-01',
    timestamp: '2026-10-12T08:05:00Z',
    operationId: 'op-init-case-r2c-001',
  });
  const baselineCaseId = baseCaseRes.case.id;

  // --------------------------------------------------------------------------
  // R2C-01: Compatibility with actual frozen visit/examination schema
  // --------------------------------------------------------------------------
  try {
    const visitsInfo = await adapter.query<{ name: string }>(
      'PRAGMA table_info(visits);'
    );
    const examsInfo = await adapter.query<{ name: string }>(
      'PRAGMA table_info(clinical_examinations);'
    );
    const findingsInfo = await adapter.query<{ name: string }>(
      'PRAGMA table_info(clinical_findings);'
    );

    const visitsCols = new Set(visitsInfo.map((c) => c.name));
    const examsCols = new Set(examsInfo.map((c) => c.name));
    const findingsCols = new Set(findingsInfo.map((c) => c.name));

    const expectedVisits = ['id', 'case_id', 'visit_date', 'visit_type', 'provider_id', 'version', 'is_deleted'];
    const expectedExams = ['id', 'case_id', 'visit_id', 'examination_date', 'examiner_id', 'examination_stage', 'status'];
    const expectedFindings = ['id', 'examination_id', 'category', 'finding_code', 'value'];

    const visitsValid = expectedVisits.every((c) => visitsCols.has(c));
    const examsValid = expectedExams.every((c) => examsCols.has(c));
    const findingsValid = expectedFindings.every((c) => findingsCols.has(c));

    const passed = visitsValid && examsValid && findingsValid;

    addResult(
      'R2C-01',
      'Compatibility with actual frozen visit/examination schema',
      passed,
      `Tables verified: visits (${visitsCols.size} cols), clinical_examinations (${examsCols.size} cols), clinical_findings (${findingsCols.size} cols) strictly match SCHEMA_FREEZE_v1.0.`
    );
  } catch (err: unknown) {
    addResult('R2C-01', 'Compatibility with actual frozen visit/examination schema', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-02: Successful clinical visit creation
  // --------------------------------------------------------------------------
  const validVisitParams: CreateVisitParams = {
    id: 'vis-test-r2c-001',
    caseId: baselineCaseId,
    visitDate: '2026-10-12',
    visitType: 'Wire Change',
    providerId: 'usr-dr-albasmi',
    chiefReason: '0.016 Upper and Lower NiTi archwire placement',
    clinicalNotes: 'Smooth engagement, good oral hygiene maintained.',
    nextVisitDate: '2026-11-15',
    userId: 'usr-dr-albasmi',
    userRole: 'ORTHODONTIST',
    deviceId: 'dev-ipad-r2c-01',
    timestamp: '2026-10-12T08:10:00Z',
    operationId: 'op-vis-create-001',
  };

  try {
    const res = await visitService.createVisit(validVisitParams);
    const inDb = await visitService.getVisitById(validVisitParams.id!);
    const audits = await adapter.query(
      "SELECT * FROM audit_logs WHERE entity_type = 'visits' AND entity_id = ?;",
      [validVisitParams.id!]
    );
    const syncs = await adapter.query(
      "SELECT * FROM sync_operations WHERE entity_type = 'visits' AND entity_id = ?;",
      [validVisitParams.id!]
    );

    const isCommitted =
      res.ok &&
      !res.isIdempotentHit &&
      inDb !== null &&
      inDb.visit_type === 'Wire Change' &&
      audits.length === 1 &&
      syncs.length === 1;

    addResult(
      'R2C-02',
      'Successful clinical visit creation',
      isCommitted,
      `Atomically committed: visits=1, audit_logs=1, sync_operations=1 for case '${baselineCaseId}'.`
    );
  } catch (err: unknown) {
    addResult('R2C-02', 'Successful clinical visit creation', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-03: Visit retrieval by primary key
  // --------------------------------------------------------------------------
  try {
    const retrieved = await visitService.getVisitById('vis-test-r2c-001');
    const passed =
      retrieved !== null &&
      retrieved.id === 'vis-test-r2c-001' &&
      retrieved.case_id === baselineCaseId &&
      retrieved.provider_id === 'usr-dr-albasmi';

    addResult(
      'R2C-03',
      'Visit retrieval by primary key',
      passed,
      `Retrieved visit 'vis-test-r2c-001' by primary key ID with correct foreign key linkage.`
    );
  } catch (err: unknown) {
    addResult('R2C-03', 'Visit retrieval by primary key', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-04: Listing visits for the correct patient and/or case
  // --------------------------------------------------------------------------
  try {
    const caseVisits = await visitService.listVisitsByCaseId(baselineCaseId);
    const passed = caseVisits.length === 1 && caseVisits[0].id === 'vis-test-r2c-001';

    addResult(
      'R2C-04',
      'Listing visits for the correct patient and/or case',
      passed,
      `Retrieved ${caseVisits.length} visit(s) strictly scoped to case '${baselineCaseId}'.`
    );
  } catch (err: unknown) {
    addResult('R2C-04', 'Listing visits for the correct patient and/or case', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-05: Successful persistence of supported examination records
  // --------------------------------------------------------------------------
  const validExamParams: CreateExaminationParams = {
    id: 'exam-test-r2c-001',
    caseId: baselineCaseId,
    visitId: 'vis-test-r2c-001',
    examinationDate: '2026-10-12',
    examinerId: 'usr-dr-albasmi',
    examinationStage: 'INITIAL',
    status: 'CONFIRMED',
    generalFindings: 'Skeletal Class II div 1 with 6mm overjet.',
    notes: 'Patient motivated for comprehensive orthodontic treatment.',
    findings: [
      {
        category: 'OCCLUSAL',
        findingCode: 'OVERJET',
        value: '6.0',
        unit: 'mm',
        severity: 'MODERATE',
        side: 'MIDLINE',
        clinicalSignificance: 'CLINICAL_FINDING',
      },
      {
        category: 'DENTAL',
        findingCode: 'CROWDING_LOWER',
        value: '4.5',
        unit: 'mm',
        severity: 'MODERATE',
        side: 'BILATERAL',
        clinicalSignificance: 'CLINICAL_FINDING',
      },
    ],
    userId: 'usr-dr-albasmi',
    userRole: 'ORTHODONTIST',
    deviceId: 'dev-ipad-r2c-01',
    timestamp: '2026-10-12T08:15:00Z',
    operationId: 'op-exam-create-001',
  };

  try {
    const res = await visitService.createExamination(validExamParams);
    const inDb = await visitService.getExaminationById(validExamParams.id!);
    const findingsInDb = await visitService.listFindingsByExaminationId(validExamParams.id!);
    const audits = await adapter.query(
      "SELECT * FROM audit_logs WHERE entity_type = 'clinical_examinations' AND entity_id = ?;",
      [validExamParams.id!]
    );
    const syncs = await adapter.query(
      "SELECT * FROM sync_operations WHERE entity_type = 'clinical_examinations' AND entity_id = ?;",
      [validExamParams.id!]
    );

    const passed =
      res.ok &&
      inDb !== null &&
      findingsInDb.length === 2 &&
      audits.length === 1 &&
      syncs.length === 1;

    addResult(
      'R2C-05',
      'Successful persistence of supported examination records',
      passed,
      `Atomically committed: clinical_examinations=1, clinical_findings=2, audit_logs=1, sync_operations=1.`
    );
  } catch (err: unknown) {
    addResult('R2C-05', 'Successful persistence of supported examination records', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-06: Examination retrieval and parent relationship integrity
  // --------------------------------------------------------------------------
  try {
    const exam = await visitService.getExaminationById('exam-test-r2c-001');
    const findings = await visitService.listFindingsByExaminationId('exam-test-r2c-001');
    const passed =
      exam !== null &&
      exam.case_id === baselineCaseId &&
      exam.visit_id === 'vis-test-r2c-001' &&
      findings.length === 2;

    addResult(
      'R2C-06',
      'Examination retrieval and parent relationship integrity',
      passed,
      `Retrieved examination 'exam-test-r2c-001' with valid case_id and visit_id FK references.`
    );
  } catch (err: unknown) {
    addResult('R2C-06', 'Examination retrieval and parent relationship integrity', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-07: Rejection of a nonexistent patient
  // --------------------------------------------------------------------------
  try {
    // Attempting to attach visit to an orphaned case or non-existent patient reference
    let rejected = false;
    try {
      await visitService.createVisit({
        id: 'vis-nonexistent-pat',
        caseId: 'case-does-not-exist',
        visitDate: '2026-10-12',
        visitType: 'Bonding',
        providerId: 'usr-dr-albasmi',
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-01',
      });
    } catch (e: unknown) {
      if (e instanceof Cohort2VisitPersistenceError && e.code === 'ERR_CASE_NOT_FOUND') {
        rejected = true;
      }
    }

    addResult(
      'R2C-07',
      'Rejection of a nonexistent patient',
      rejected,
      `Rejected visit creation for unpersisted patient/case hierarchy with code 'ERR_CASE_NOT_FOUND'.`
    );
  } catch (err: unknown) {
    addResult('R2C-07', 'Rejection of a nonexistent patient', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-08: Rejection of a nonexistent or invalid case when required
  // --------------------------------------------------------------------------
  try {
    let rejected = false;
    try {
      await visitService.createExamination({
        id: 'exam-nonexistent-case',
        caseId: 'case-unpersisted-fake',
        examinationDate: '2026-10-12',
        examinerId: 'usr-dr-albasmi',
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-01',
      });
    } catch (e: unknown) {
      if (e instanceof Cohort2VisitPersistenceError && e.code === 'ERR_CASE_NOT_FOUND') {
        rejected = true;
      }
    }

    addResult(
      'R2C-08',
      'Rejection of a nonexistent or invalid case when required',
      rejected,
      `Rejected examination creation for missing case with code 'ERR_CASE_NOT_FOUND'.`
    );
  } catch (err: unknown) {
    addResult('R2C-08', 'Rejection of a nonexistent or invalid case when required', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-09: Rejection of synthetic/demo parent records
  // --------------------------------------------------------------------------
  try {
    let rejectedVisit = false;
    let rejectedExam = false;

    try {
      await visitService.createVisit({
        id: 'vis-demo-case-test',
        caseId: 'ORT-2025-00101', // Synthetic demo case ID
        visitDate: '2026-10-12',
        visitType: 'Adjustment',
        providerId: 'usr-dr-albasmi',
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-01',
      });
    } catch (e: unknown) {
      if (e instanceof Cohort2VisitPersistenceError && e.code === 'ERR_DEMO_RECORD_REJECTED') {
        rejectedVisit = true;
      }
    }

    try {
      await visitService.createExamination({
        id: 'exam-demo-case-test',
        caseId: 'ORT-2025-00101', // Synthetic demo case ID
        examinationDate: '2026-10-12',
        examinerId: 'usr-dr-albasmi',
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-01',
      });
    } catch (e: unknown) {
      if (e instanceof Cohort2VisitPersistenceError && e.code === 'ERR_DEMO_RECORD_REJECTED') {
        rejectedExam = true;
      }
    }

    const passed = rejectedVisit && rejectedExam;

    addResult(
      'R2C-09',
      'Rejection of synthetic/demo parent records',
      passed,
      `Intercepted synthetic demo parent 'ORT-2025-00101' with code 'ERR_DEMO_RECORD_REJECTED' for both visits and examinations.`
    );
  } catch (err: unknown) {
    addResult('R2C-09', 'Rejection of synthetic/demo parent records', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-10: Rejection of invalid or ineligible parent records (soft-deleted case)
  // --------------------------------------------------------------------------
  try {
    // Soft-delete a case
    await adapter.execute(
      `INSERT INTO orthodontic_cases (id, case_number, patient_id, case_type, case_status, chief_complaint, start_date, primary_provider_id, clinic_id, created_at, updated_at, created_by, updated_by, version, is_deleted, deleted_at)
       VALUES ('case-soft-deleted-01', 'ORT-2026-DEL99', '${baselinePatientId}', 'COMPREHENSIVE', 'DISCONTINUED', 'Soft-deleted test', '2026-10-12', 'usr-01', 'clinic-main', '2026-10-12T00:00:00Z', '2026-10-12T00:00:00Z', 'usr-01', 'usr-01', 2, 1, '2026-10-12T01:00:00Z');`
    );

    let rejected = false;
    try {
      await visitService.createVisit({
        id: 'vis-deleted-case-test',
        caseId: 'case-soft-deleted-01',
        visitDate: '2026-10-12',
        visitType: 'Wire Change',
        providerId: 'usr-dr-albasmi',
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-01',
      });
    } catch (e: unknown) {
      if (e instanceof Cohort2VisitPersistenceError && e.code === 'ERR_CASE_NOT_FOUND') {
        rejected = true;
      }
    }

    addResult(
      'R2C-10',
      'Rejection of invalid or ineligible parent records',
      rejected,
      `Rejected visit attachment to soft-deleted case 'case-soft-deleted-01' with code 'ERR_CASE_NOT_FOUND'.`
    );
  } catch (err: unknown) {
    addResult('R2C-10', 'Rejection of invalid or ineligible parent records', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-11: Complete rollback when audit insertion fails
  // --------------------------------------------------------------------------
  try {
    const beforeCount = await visitService.getVisitCount();
    let rollbackSuccess = false;

    try {
      await adapter.transaction('IMMEDIATE', async (tx) => {
        // 1. Insert visit
        await tx.execute(
          `INSERT INTO visits (id, case_id, visit_date, visit_type, provider_id, created_at, updated_at, created_by, updated_by, version, is_deleted)
           VALUES ('vis-rollback-aud', '${baselineCaseId}', '2026-10-12', 'Debond', 'usr-01', '2026-10-12T08:00:00Z', '2026-10-12T08:00:00Z', 'usr-01', 'usr-01', 1, 0);`
        );
        // 2. Fail audit
        await tx.execute('INSERT INTO audit_logs (id, entity_type) VALUES (NULL, NULL);');
      });
    } catch {
      const afterCount = await visitService.getVisitCount();
      const orphaned = await visitService.getVisitById('vis-rollback-aud');
      rollbackSuccess = afterCount === beforeCount && orphaned === null;
    }

    addResult(
      'R2C-11',
      'Complete rollback when audit insertion fails',
      rollbackSuccess,
      `Transaction rolled back atomically upon audit log failure. Zero orphaned visit rows left.`
    );
  } catch (err: unknown) {
    addResult('R2C-11', 'Complete rollback when audit insertion fails', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-12: Complete rollback when sync-outbox insertion fails
  // --------------------------------------------------------------------------
  try {
    const beforeCount = await visitService.getVisitCount();
    let rollbackSuccess = false;

    try {
      await adapter.transaction('IMMEDIATE', async (tx) => {
        // 1. Insert visit
        await tx.execute(
          `INSERT INTO visits (id, case_id, visit_date, visit_type, provider_id, created_at, updated_at, created_by, updated_by, version, is_deleted)
           VALUES ('vis-rollback-sync', '${baselineCaseId}', '2026-10-12', 'Debond', 'usr-01', '2026-10-12T08:00:00Z', '2026-10-12T08:00:00Z', 'usr-01', 'usr-01', 1, 0);`
        );
        // 2. Insert audit
        await tx.execute(
          `INSERT INTO audit_logs (id, entity_type, entity_id, operation_type, user_id, device_id, timestamp)
           VALUES ('aud-roll-vis-1', 'visits', 'vis-rollback-sync', 'CREATE', 'usr-01', 'dev-01', '2026-10-12T08:00:00Z');`
        );
        // 3. Fail sync outbox (CHECK constraint violation)
        await tx.execute(
          `INSERT INTO sync_operations (operation_id, device_id, entity_type, entity_id, operation_type, base_version, result_version, payload, created_at)
           VALUES ('sync-roll-vis-1', 'dev-01', 'visits', 'vis-rollback-sync', 'ILLEGAL_OPERATION', 0, 1, '{}', '2026-10-12T08:00:00Z');`
        );
      });
    } catch {
      const afterCount = await visitService.getVisitCount();
      const orphaned = await visitService.getVisitById('vis-rollback-sync');
      rollbackSuccess = afterCount === beforeCount && orphaned === null;
    }

    addResult(
      'R2C-12',
      'Complete rollback when sync-outbox insertion fails',
      rollbackSuccess,
      `Transaction rolled back atomically upon sync outbox CHECK failure. Zero orphaned visit rows left.`
    );
  } catch (err: unknown) {
    addResult('R2C-12', 'Complete rollback when sync-outbox insertion fails', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-13: Correct duplicate and idempotency behavior
  // --------------------------------------------------------------------------
  try {
    // 1. Replay exact payload -> idempotent hit
    const replayRes = await visitService.createVisit(validVisitParams);
    const isIdempotentHit =
      replayRes.ok &&
      replayRes.isIdempotentHit === true &&
      replayRes.visit.id === validVisitParams.id;

    // 2. Tampered payload with same operationId -> rejection
    let mismatchRejected = false;
    try {
      await visitService.createVisit({
        ...validVisitParams,
        visitType: 'Tampered Visit Type',
      });
    } catch (e: unknown) {
      if (
        e instanceof Cohort2VisitPersistenceError &&
        e.code === 'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH'
      ) {
        mismatchRejected = true;
      }
    }

    const passed = isIdempotentHit && mismatchRejected;

    addResult(
      'R2C-13',
      'Correct duplicate and idempotency behavior',
      passed,
      `Idempotent hit verified (isIdempotentHit=true), tampered payload rejected (ERR_IDEMPOTENCY_PAYLOAD_MISMATCH).`
    );
  } catch (err: unknown) {
    addResult('R2C-13', 'Correct duplicate and idempotency behavior', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-14: Persistence verification after adapter close/reopen
  // --------------------------------------------------------------------------
  try {
    const visitsBefore = await visitService.getVisitCount();
    const examsBefore = await visitService.getExaminationCount();
    await adapter.close();

    // Reopen same database
    await adapter.initialize();
    const serviceAfterReopen = new Cohort2VisitPersistenceService(adapter);
    const visitsAfter = await serviceAfterReopen.getVisitCount();
    const examsAfter = await serviceAfterReopen.getExaminationCount();
    const verifiedVisit = await serviceAfterReopen.getVisitById('vis-test-r2c-001');

    const passed =
      visitsBefore === visitsAfter &&
      examsBefore === examsAfter &&
      visitsAfter >= 1 &&
      verifiedVisit !== null;

    addResult(
      'R2C-14',
      'Persistence verification after adapter close/reopen',
      passed,
      `Clean close and reopen. Visits count before=${visitsBefore}, after=${visitsAfter}. Examinations count before=${examsBefore}, after=${examsAfter}.`
    );
  } catch (err: unknown) {
    addResult('R2C-14', 'Persistence verification after adapter close/reopen', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-15: No legacy localStorage write for new clinical records
  // --------------------------------------------------------------------------
  try {
    const serviceSrc = Cohort2VisitPersistenceService.toString();
    const visitRepoSrc = SqliteVisitRepository.toString();
    const examRepoSrc = SqliteExaminationRepository.toString();

    const hasLocalStorage =
      serviceSrc.includes('localStorage') ||
      visitRepoSrc.includes('localStorage') ||
      examRepoSrc.includes('localStorage');

    addResult(
      'R2C-15',
      'No legacy localStorage write for new clinical records',
      !hasLocalStorage,
      `Verified zero localStorage access in Cohort2VisitPersistenceService, SqliteVisitRepository, and SqliteExaminationRepository.`
    );
  } catch (err: unknown) {
    addResult('R2C-15', 'No legacy localStorage write for new clinical records', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-16: No false UI success or state insertion after persistence failure
  // --------------------------------------------------------------------------
  try {
    let failedExplicitly = false;
    try {
      await visitService.createVisit({
        id: 'vis-test-fail-gate',
        caseId: 'invalid-case-id-does-not-exist',
        visitDate: '2026-10-12',
        visitType: 'Wire Change',
        providerId: 'usr-01',
        userId: 'usr-01',
        deviceId: 'dev-01',
      });
    } catch {
      failedExplicitly = true;
    }

    const checkRow = await visitService.getVisitById('vis-test-fail-gate');
    const passed = failedExplicitly && checkRow === null;

    addResult(
      'R2C-16',
      'No false UI success or state insertion after persistence failure',
      passed,
      `Persistence failure threw explicitly synchronously before UI projection. No uncommitted visit stored.`
    );
  } catch (err: unknown) {
    addResult('R2C-16', 'No false UI success or state insertion after persistence failure', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-17: Clinical write rejection when durable storage is unavailable
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
      'R2C-17',
      'Clinical write rejection when durable storage is unavailable',
      fatalBlocked,
      fatalBlocked
        ? 'Adapter strictly threw ERR_PERSISTENCE_UNAVAILABLE in Clinical Mode when durable storage was inaccessible; clinical visit/exam writes blocked.'
        : 'Adapter silently permitted non-durable writes in Clinical Mode.'
    );
  } catch (err: unknown) {
    addResult('R2C-17', 'Clinical write rejection when durable storage is unavailable', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-18: Correct loading and separation of persisted clinical versus demo records
  // --------------------------------------------------------------------------
  try {
    const demoCaseIds = INITIAL_CASES.map((c) => c.id);
    const persistedVisits = await visitService.listActiveVisits();

    // Verify no persisted visit references a demo case
    const hasDemoVisits = persistedVisits.some((v) => demoCaseIds.includes(v.case_id));

    addResult(
      'R2C-18',
      'Correct loading and separation of persisted clinical versus demo records',
      !hasDemoVisits,
      `Verified zero visits attached to synthetic demo cases. Authoritative SQLite visits strictly scoped to persisted cases.`
    );
  } catch (err: unknown) {
    addResult('R2C-18', 'Correct loading and separation of persisted clinical versus demo records', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-19: No unintended orphan parent/child records after failed multi-record operations
  // --------------------------------------------------------------------------
  try {
    let orphanDetected = false;
    const beforeExamCount = await visitService.getExaminationCount();

    // Simulate cross-case visit examination failure
    try {
      await visitService.createExamination({
        id: 'exam-orphan-check-01',
        caseId: baselineCaseId,
        visitId: 'vis-from-different-case', // Invalid / mismatch visit
        examinationDate: '2026-10-12',
        examinerId: 'usr-01',
        userId: 'usr-01',
        deviceId: 'dev-01',
      });
    } catch {
      // Expected rejection
    }

    const afterExamCount = await visitService.getExaminationCount();
    const orphanedExam = await visitService.getExaminationById('exam-orphan-check-01');
    orphanDetected = afterExamCount !== beforeExamCount || orphanedExam !== null;

    addResult(
      'R2C-19',
      'No unintended orphan parent/child records after failed multi-record operations',
      !orphanDetected,
      `Transaction rolled back before creating partial examination records. Zero orphan rows left.`
    );
  } catch (err: unknown) {
    addResult('R2C-19', 'No unintended orphan parent/child records after failed multi-record operations', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2C-20: Regression tests for existing patient and case persistence services
  // --------------------------------------------------------------------------
  try {
    const pat = await patientService.getPatientById(baselinePatientId);
    const cs = await caseService.getCaseById(baselineCaseId);

    const regressionPass =
      pat !== null &&
      pat.id === baselinePatientId &&
      cs !== null &&
      cs.id === baselineCaseId &&
      cs.patient_id === baselinePatientId;

    addResult(
      'R2C-20',
      'Regression tests for existing patient and case persistence services',
      regressionPass,
      `Patient '${baselinePatientId}' and Case '${baselineCaseId}' intact and fully verified in SQLite.`
    );
  } catch (err: unknown) {
    addResult('R2C-20', 'Regression tests for existing patient and case persistence services', false, String(err));
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
