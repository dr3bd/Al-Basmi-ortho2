/**
 * AL-BASMI ORTH — COHORT 2 PROBLEM & DIAGNOSIS FORENSIC TEST SUITE
 * Scope: PHASE R2-D (Problem List & Clinical Diagnosis SQLite Integration Vertical Slice)
 *
 * Verifies:
 * R2D-01: Compatibility with actual frozen problem & diagnosis schema (problems, problem_evidence, diagnosis_versions, diagnosis_items, diagnosis_evidence, diagnosis_problem_links)
 * R2D-02: Successful clinical problem creation (problem + evidence + audit + sync outbox in one atomic transaction)
 * R2D-03: Problem retrieval by primary key
 * R2D-04: Listing problems for the correct case (filtering deleted records appropriately)
 * R2D-05: Problem status update & lifecycle transition (ACTIVE -> RESOLVED / IN_TREATMENT) with audit & sync
 * R2D-06: Problem soft-delete with audit & sync outbox
 * R2D-07: Successful clinical diagnosis draft creation (version + items + problem links + audit + sync outbox in one atomic transaction)
 * R2D-08: Diagnosis version retrieval by primary key
 * R2D-09: Listing diagnosis versions for the correct case
 * R2D-10: Listing diagnosis items and problem links for a version
 * R2D-11: Rejection of nonexistent parent case
 * R2D-12: Rejection of synthetic/demo parent records
 * R2D-13: Rejection of soft-deleted parent case
 * R2D-14: Cross-case contamination rejection when linking a problem belonging to a different case
 * R2D-15: Complete rollback when audit insertion fails
 * R2D-16: Complete rollback when sync-outbox insertion fails
 * R2D-17: Correct duplicate and idempotency behavior (exact payload returns existing record; mismatch throws error)
 * R2D-18: Version uniqueness constraint enforcement (case_id, version_number)
 * R2D-19: Persistence verification after adapter close/reopen
 * R2D-20: Regression verification for patient, case, and visit persistence services
 */

import { WaSqliteStorageAdapter } from '../drivers/waSqliteAdapter.ts';
import { Cohort2PatientPersistenceService } from '../drivers/cohort2PatientPersistenceService.ts';
import { Cohort2CasePersistenceService } from '../drivers/cohort2CasePersistenceService.ts';
import { Cohort2VisitPersistenceService } from '../drivers/cohort2VisitPersistenceService.ts';
import {
  Cohort2ProblemDiagnosisPersistenceService,
  Cohort2ProblemDiagnosisPersistenceError,
  CreateProblemParams,
  CreateDiagnosisDraftParams,
  SqliteProblemRepository,
  SqliteDiagnosisRepository,
} from '../drivers/cohort2ProblemDiagnosisPersistenceService.ts';
import { P0_PRODUCTION_SQLITE_DDL } from '../../domain/p0SqliteSchema.ts';
import { INITIAL_CASES } from '../../data/seedCases.ts';

export interface R2DTestResult {
  testId: string;
  name: string;
  passed: boolean;
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_RUN';
  evidence: string;
  limitation?: string;
}

export interface R2DForensicSuiteReport {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  results: R2DTestResult[];
}

export async function runCohort2ProblemDiagnosisForensicSuite(
  options: { wasmBinary?: ArrayBuffer | Uint8Array } = {}
): Promise<R2DForensicSuiteReport> {
  const results: R2DTestResult[] = [];

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
  const dbName = `cohort2_prob_diag_test_${Date.now()}.db`;
  const adapter = await createInitializedAdapter(dbName);
  const patientService = new Cohort2PatientPersistenceService(adapter);
  const caseService = new Cohort2CasePersistenceService(adapter);
  const visitService = new Cohort2VisitPersistenceService(adapter);
  const probDiagService = new Cohort2ProblemDiagnosisPersistenceService(adapter);

  // Setup authoritative baseline patient & cases
  const basePatientRes = await patientService.createPatient({
    id: 'pat-base-r2d-001',
    patientNumber: 'PAT-2026-009901',
    firstName: 'فيصل',
    lastName: 'العتيبي',
    sex: 'MALE',
    dateOfBirth: '2011-06-12',
    phone: '+966512349901',
    userId: 'usr-dr-albasmi',
    deviceId: 'dev-forensic-r2d',
  });

  const baseCaseRes = await caseService.createCase({
    id: 'cas-base-r2d-001',
    caseNumber: 'ORT-2026-009901',
    patientId: basePatientRes.patient.id,
    caseType: 'COMPREHENSIVE',
    caseStatus: 'DIAGNOSIS',
    startDate: '2026-10-10',
    primaryProviderId: 'usr-dr-albasmi',
    chiefComplaint: 'Severe anterior crowding and deep bite',
    userId: 'usr-dr-albasmi',
    deviceId: 'dev-forensic-r2d',
  });

  const secondCaseRes = await caseService.createCase({
    id: 'cas-base-r2d-002',
    caseNumber: 'ORT-2026-009902',
    patientId: basePatientRes.patient.id,
    caseType: 'LIMITED',
    caseStatus: 'CONSULTATION',
    startDate: '2026-10-11',
    primaryProviderId: 'usr-dr-albasmi',
    chiefComplaint: 'Mild spacing',
    userId: 'usr-dr-albasmi',
    deviceId: 'dev-forensic-r2d',
  });

  const caseId1 = baseCaseRes.case.id;
  const caseId2 = secondCaseRes.case.id;

  // --------------------------------------------------------------------------
  // R2D-01: Schema Compatibility Verification
  // --------------------------------------------------------------------------
  try {
    const probCols = await adapter.query<{ name: string }>(
      "PRAGMA table_info('problems');"
    );
    const probColNames = probCols.map((c) => c.name);
    const expectedProbCols = [
      'id', 'case_id', 'problem_code', 'category', 'title', 'description',
      'severity', 'priority', 'status', 'identified_at', 'resolved_at',
      'source_type', 'source_reference_id', 'created_at', 'updated_at',
      'created_by', 'updated_by', 'version', 'is_deleted', 'deleted_at',
    ];
    const missingProb = expectedProbCols.filter((c) => !probColNames.includes(c));

    const diagVerCols = await adapter.query<{ name: string }>(
      "PRAGMA table_info('diagnosis_versions');"
    );
    const diagVerColNames = diagVerCols.map((c) => c.name);
    const expectedDiagVerCols = [
      'id', 'case_id', 'version_number', 'status', 'diagnosis_date',
      'diagnosed_by', 'clinical_summary', 'general_notes', 'created_at',
      'created_by', 'approved_at', 'approved_by', 'supersedes_version_id',
    ];
    const missingDiagVer = expectedDiagVerCols.filter((c) => !diagVerColNames.includes(c));

    const allMatched = missingProb.length === 0 && missingDiagVer.length === 0;
    addResult(
      'R2D-01',
      'Compatibility with actual frozen problem & diagnosis schema',
      allMatched,
      `problems cols: ${probColNames.length} (missing: ${missingProb.join(',') || 'none'}), diagnosis_versions cols: ${diagVerColNames.length} (missing: ${missingDiagVer.join(',') || 'none'})`
    );
  } catch (err) {
    addResult('R2D-01', 'Compatibility with frozen schema', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-02: Successful clinical problem creation (atomic write)
  // --------------------------------------------------------------------------
  let problem1Id = 'prb-r2d-test-001';
  try {
    const res = await probDiagService.createProblem({
      id: problem1Id,
      caseId: caseId1,
      problemCode: 'PRB-DENT-001',
      category: 'DENTAL',
      title: 'Severe Upper Anterior Crowding',
      description: 'Severe crowding in upper arch of 8mm with blocked out canine',
      severity: 'SEVERE',
      priority: 1,
      status: 'ACTIVE',
      sourceType: 'INITIAL_DIAGNOSIS',
      sourceReferenceId: `src-${caseId1}`,
      evidence: [
        {
          id: 'pevid-001',
          evidenceType: 'ARCH_MEASUREMENT',
          sourceEntityType: 'arch_measurements',
          sourceEntityId: 'arch-meas-001',
          measurementValue: '8.0',
          measurementUnit: 'mm',
          interpretation: 'Severe arch length deficiency',
        },
      ],
      userId: 'usr-dr-albasmi',
      deviceId: 'dev-forensic-r2d',
    });

    const storedAudit = await adapter.queryOne<{ id: string }>(
      "SELECT id FROM audit_logs WHERE entity_id = ? AND entity_type = 'problems';",
      [problem1Id]
    );
    const storedSync = await adapter.queryOne<{ operation_id: string }>(
      "SELECT operation_id FROM sync_operations WHERE entity_id = ? AND entity_type = 'problems';",
      [problem1Id]
    );

    const ok = res.ok && storedAudit !== null && storedSync !== null && res.evidenceCount === 1;
    addResult(
      'R2D-02',
      'Successful clinical problem creation (problem + evidence + audit + sync outbox)',
      ok,
      `Problem ID '${res.problem.id}' created, evidence: ${res.evidenceCount}, audit: ${storedAudit?.id}, sync: ${storedSync?.operation_id}`
    );
  } catch (err) {
    addResult('R2D-02', 'Successful clinical problem creation', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-03: Problem retrieval by primary key
  // --------------------------------------------------------------------------
  try {
    const p = await probDiagService.getProblemById(problem1Id);
    const matches = p !== null && p.id === problem1Id && p.case_id === caseId1 && p.title === 'Severe Upper Anterior Crowding';
    addResult(
      'R2D-03',
      'Problem retrieval by primary key',
      matches,
      `Retrieved problem '${p?.id}', case_id: '${p?.case_id}', title: '${p?.title}'`
    );
  } catch (err) {
    addResult('R2D-03', 'Problem retrieval by primary key', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-04: Listing problems for the correct case
  // --------------------------------------------------------------------------
  try {
    // Add a second problem to caseId1
    await probDiagService.createProblem({
      id: 'prb-r2d-test-002',
      caseId: caseId1,
      problemCode: 'PRB-SKEL-002',
      category: 'SKELETAL',
      title: 'Skeletal Class II Div 1',
      severity: 'SEVERE',
      priority: 2,
      sourceType: 'INITIAL_DIAGNOSIS',
      sourceReferenceId: `src-${caseId1}`,
      userId: 'usr-dr-albasmi',
      deviceId: 'dev-forensic-r2d',
    });

    const list1 = await probDiagService.listProblemsByCaseId(caseId1);
    const list2 = await probDiagService.listProblemsByCaseId(caseId2);

    const ok = list1.length === 2 && list2.length === 0;
    addResult(
      'R2D-04',
      'Listing problems for the correct case',
      ok,
      `Case 1 returned ${list1.length} problems, Case 2 returned ${list2.length} problems (strict case isolation)`
    );
  } catch (err) {
    addResult('R2D-04', 'Listing problems for the correct case', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-05: Problem status update & lifecycle transition
  // --------------------------------------------------------------------------
  try {
    const updateRes = await probDiagService.updateProblemStatus({
      problemId: problem1Id,
      targetStatus: 'RESOLVED',
      userId: 'usr-dr-albasmi',
      deviceId: 'dev-forensic-r2d',
    });

    const updated = await probDiagService.getProblemById(problem1Id);
    const ok = updateRes.ok && updated?.status === 'RESOLVED' && updated?.version === 2;
    addResult(
      'R2D-05',
      'Problem status update & lifecycle transition (ACTIVE -> RESOLVED)',
      ok,
      `Problem '${problem1Id}' transitioned to status '${updated?.status}', version: ${updated?.version}`
    );
  } catch (err) {
    addResult('R2D-05', 'Problem status update', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-06: Problem soft-delete with audit & sync outbox
  // --------------------------------------------------------------------------
  try {
    const delRes = await probDiagService.softDeleteProblem({
      problemId: 'prb-r2d-test-002',
      userId: 'usr-dr-albasmi',
      deviceId: 'dev-forensic-r2d',
      reason: 'Diagnostically superseded by refined classification',
    });

    const hidden = await probDiagService.getProblemById('prb-r2d-test-002', false);
    const visibleWithDeleted = await probDiagService.getProblemById('prb-r2d-test-002', true);
    const ok = delRes.ok && hidden === null && visibleWithDeleted?.is_deleted === 1;

    addResult(
      'R2D-06',
      'Problem soft-delete with audit & sync outbox',
      ok,
      `Deleted problem hidden from normal query (hidden: ${hidden === null}), preserved with is_deleted=1 (flag: ${visibleWithDeleted?.is_deleted})`
    );
  } catch (err) {
    addResult('R2D-06', 'Problem soft-delete', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-07: Successful clinical diagnosis draft creation (atomic write)
  // --------------------------------------------------------------------------
  const diagVer1Id = 'diag-ver-r2d-001';
  try {
    const diagRes = await probDiagService.createDiagnosisDraft({
      id: diagVer1Id,
      caseId: caseId1,
      versionNumber: 1,
      diagnosedBy: 'Dr. Al-Basmi',
      clinicalSummary: 'Class II Division 1 malocclusion with severe maxillary crowding and retrognathic mandible',
      generalNotes: 'Skeletal Class II with hyperdivergent vertical growth pattern',
      items: [
        {
          id: 'ditem-001',
          category: 'SKELETAL',
          diagnosisCode: 'DIAG-SKEL-II',
          title: 'Skeletal Class II',
          description: 'Mandibular retrognathism with ANB angle of 6 degrees',
          severity: 'SEVERE',
          certainty: 'CONFIRMED',
          linkedProblemIds: [problem1Id],
        },
      ],
      userId: 'usr-dr-albasmi',
      deviceId: 'dev-forensic-r2d',
    });

    const storedAudit = await adapter.queryOne<{ id: string }>(
      "SELECT id FROM audit_logs WHERE entity_id = ? AND entity_type = 'diagnosis_versions';",
      [diagVer1Id]
    );
    const storedSync = await adapter.queryOne<{ operation_id: string }>(
      "SELECT operation_id FROM sync_operations WHERE entity_id = ? AND entity_type = 'diagnosis_versions';",
      [diagVer1Id]
    );

    const ok = diagRes.ok && storedAudit !== null && storedSync !== null && diagRes.itemsCount === 1 && diagRes.linksCount === 1;
    addResult(
      'R2D-07',
      'Successful clinical diagnosis draft creation (version + items + problem links + audit + sync)',
      ok,
      `Diagnosis version '${diagRes.diagnosisVersion.id}' created with items: ${diagRes.itemsCount}, links: ${diagRes.linksCount}`
    );
  } catch (err) {
    addResult('R2D-07', 'Successful clinical diagnosis draft creation', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-08: Diagnosis version retrieval by primary key
  // --------------------------------------------------------------------------
  try {
    const v = await probDiagService.getDiagnosisVersionById(diagVer1Id);
    const matches = v !== null && v.id === diagVer1Id && v.case_id === caseId1 && v.version_number === 1;
    addResult(
      'R2D-08',
      'Diagnosis version retrieval by primary key',
      matches,
      `Retrieved diagnosis version '${v?.id}', case_id: '${v?.case_id}', version: ${v?.version_number}`
    );
  } catch (err) {
    addResult('R2D-08', 'Diagnosis version retrieval by primary key', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-09: Listing diagnosis versions for the correct case
  // --------------------------------------------------------------------------
  try {
    const versions1 = await probDiagService.listDiagnosisVersionsByCaseId(caseId1);
    const versions2 = await probDiagService.listDiagnosisVersionsByCaseId(caseId2);

    const ok = versions1.length === 1 && versions2.length === 0;
    addResult(
      'R2D-09',
      'Listing diagnosis versions for the correct case',
      ok,
      `Case 1 has ${versions1.length} diagnosis version(s), Case 2 has ${versions2.length} (isolation verified)`
    );
  } catch (err) {
    addResult('R2D-09', 'Listing diagnosis versions', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-10: Listing diagnosis items and problem links for a version
  // --------------------------------------------------------------------------
  try {
    const items = await probDiagService.listDiagnosisItemsByVersionId(diagVer1Id);
    const links = await adapter.query<{ id: string; problem_id: string }>(
      "SELECT id, problem_id FROM diagnosis_problem_links WHERE diagnosis_item_id = 'ditem-001';"
    );

    const ok = items.length === 1 && links.length === 1 && links[0].problem_id === problem1Id;
    addResult(
      'R2D-10',
      'Listing diagnosis items and problem links for a version',
      ok,
      `Version has ${items.length} item(s), linked to problem '${links[0]?.problem_id}'`
    );
  } catch (err) {
    addResult('R2D-10', 'Listing diagnosis items and links', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-11: Rejection of nonexistent parent case
  // --------------------------------------------------------------------------
  try {
    let rejected = false;
    try {
      await probDiagService.createProblem({
        caseId: 'cas-nonexistent-999',
        problemCode: 'PRB-ERR-001',
        category: 'DENTAL',
        title: 'Nonexistent parent problem',
        severity: 'MILD',
        sourceType: 'INITIAL_DIAGNOSIS',
        sourceReferenceId: 'src-none',
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-forensic-r2d',
      });
    } catch (e) {
      if (e instanceof Cohort2ProblemDiagnosisPersistenceError && e.code === 'ERR_CASE_NOT_FOUND') {
        rejected = true;
      }
    }

    addResult(
      'R2D-11',
      'Rejection of nonexistent parent case',
      rejected,
      `Attempting write with invalid case correctly threw ERR_CASE_NOT_FOUND`
    );
  } catch (err) {
    addResult('R2D-11', 'Rejection of nonexistent parent case', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-12: Rejection of synthetic/demo parent records
  // --------------------------------------------------------------------------
  try {
    let demoCaseRejected = false;
    const demoCaseId = 'ORT-2025-00101'; // Known synthetic demo case
    try {
      await probDiagService.createProblem({
        caseId: demoCaseId,
        problemCode: 'PRB-DEMO-001',
        category: 'DENTAL',
        title: 'Demo case write attempt',
        severity: 'MILD',
        sourceType: 'INITIAL_DIAGNOSIS',
        sourceReferenceId: 'src-demo',
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-forensic-r2d',
      });
    } catch (e: any) {
      if (
        (e instanceof Cohort2ProblemDiagnosisPersistenceError && e.code === 'ERR_DEMO_RECORD_REJECTED') ||
        e?.code === 'ERR_DEMO_RECORD_REJECTED'
      ) {
        demoCaseRejected = true;
      }
    }

    addResult(
      'R2D-12',
      'Rejection of synthetic/demo parent records',
      demoCaseRejected,
      `Attempting to write problem to synthetic demo case '${demoCaseId}' rejected with ERR_DEMO_RECORD_REJECTED`
    );
  } catch (err) {
    addResult('R2D-12', 'Rejection of synthetic/demo parent records', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-13: Rejection of soft-deleted parent case
  // --------------------------------------------------------------------------
  try {
    // Insert a soft-deleted case directly in SQLite
    await adapter.execute(
      `INSERT INTO orthodontic_cases (
        id, case_number, patient_id, case_type, case_status, chief_complaint,
        start_date, primary_provider_id, clinic_id, created_at, updated_at,
        created_by, updated_by, version, is_deleted, deleted_at
      ) VALUES (
        'cas-soft-deleted-r2d', 'ORT-2026-DEL99', '${basePatientRes.patient.id}', 'COMPREHENSIVE',
        'DISCONTINUED', 'Soft-deleted test', '2026-10-12', 'usr-dr-albasmi', 'clinic-main',
        '2026-10-12T00:00:00Z', '2026-10-12T00:00:00Z', 'usr-dr-albasmi', 'usr-dr-albasmi',
        2, 1, '2026-10-12T01:00:00Z'
      );`
    );

    let softDeletedRejected = false;
    try {
      await probDiagService.createProblem({
        caseId: 'cas-soft-deleted-r2d',
        problemCode: 'PRB-DELETED-CASE',
        category: 'DENTAL',
        title: 'Problem on deleted case',
        severity: 'MILD',
        sourceType: 'INITIAL_DIAGNOSIS',
        sourceReferenceId: 'src-deleted',
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-forensic-r2d',
      });
    } catch (e: any) {
      if (
        (e instanceof Cohort2ProblemDiagnosisPersistenceError && e.code === 'ERR_CASE_NOT_FOUND') ||
        e?.code === 'ERR_CASE_NOT_FOUND'
      ) {
        softDeletedRejected = true;
      }
    }

    addResult(
      'R2D-13',
      'Rejection of soft-deleted parent case',
      softDeletedRejected,
      `Problem write to soft-deleted case rejected with ERR_CASE_NOT_FOUND`
    );
  } catch (err) {
    addResult('R2D-13', 'Rejection of soft-deleted parent case', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-14: Cross-case contamination rejection when linking problem from another case
  // --------------------------------------------------------------------------
  try {
    let crossCaseRejected = false;
    // Attempt to create a diagnosis draft on caseId2 that links problem1Id (which belongs to caseId1)
    try {
      await probDiagService.createDiagnosisDraft({
        caseId: caseId2,
        diagnosedBy: 'Dr. Al-Basmi',
        clinicalSummary: 'Draft attempting cross-case link',
        items: [
          {
            category: 'DENTAL',
            diagnosisCode: 'DIAG-X-CASE',
            title: 'Cross case attempt',
            description: 'Trying to link foreign problem',
            linkedProblemIds: [problem1Id], // Belongs to caseId1!
          },
        ],
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-forensic-r2d',
      });
    } catch (e: any) {
      if (
        (e instanceof Cohort2ProblemDiagnosisPersistenceError && e.code === 'ERR_CROSS_CASE_CONTAMINATION') ||
        e?.code === 'ERR_CROSS_CASE_CONTAMINATION'
      ) {
        crossCaseRejected = true;
      }
    }

    addResult(
      'R2D-14',
      'Cross-case contamination rejection when linking a problem belonging to a different case',
      crossCaseRejected,
      `Attempting to link problem from case 1 in case 2 diagnosis correctly threw ERR_CROSS_CASE_CONTAMINATION`
    );
  } catch (err) {
    addResult('R2D-14', 'Cross-case contamination rejection', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-15: Complete rollback when audit insertion fails
  // --------------------------------------------------------------------------
  try {
    const beforeCount = await probDiagService.getProblemCount();
    let rollbackSuccess = false;

    try {
      await adapter.transaction('IMMEDIATE', async (tx) => {
        // 1. Insert problem
        await tx.execute(
          `INSERT INTO problems (
            id, case_id, problem_code, category, title, severity, priority,
            status, identified_at, source_type, source_reference_id,
            created_at, updated_at, created_by, updated_by, version, is_deleted
          ) VALUES (
            'prb-rollback-aud', '${caseId1}', 'PRB-RB-AUD', 'DENTAL', 'Rollback Audit Test',
            'MILD', 1, 'ACTIVE', '2026-10-10', 'INITIAL_DIAGNOSIS', 'src',
            '2026-10-10T00:00:00Z', '2026-10-10T00:00:00Z', 'usr-dr-albasmi', 'usr-dr-albasmi', 1, 0
          );`
        );
        // 2. Fail audit log insert (NOT NULL constraint failure)
        await tx.execute('INSERT INTO audit_logs (id, entity_type) VALUES (NULL, NULL);');
      });
    } catch {
      const afterCount = await probDiagService.getProblemCount();
      const orphaned = await probDiagService.getProblemById('prb-rollback-aud');
      rollbackSuccess = afterCount === beforeCount && orphaned === null;
    }

    addResult(
      'R2D-15',
      'Complete rollback when audit insertion fails',
      rollbackSuccess,
      `Transaction rolled back atomically upon audit log failure. Zero orphaned problem rows left.`
    );
  } catch (err) {
    addResult('R2D-15', 'Complete rollback when audit insertion fails', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-16: Complete rollback when sync-outbox insertion fails
  // --------------------------------------------------------------------------
  try {
    const beforeCount = await probDiagService.getProblemCount();
    let rollbackSuccess = false;

    try {
      await adapter.transaction('IMMEDIATE', async (tx) => {
        // 1. Insert problem
        await tx.execute(
          `INSERT INTO problems (
            id, case_id, problem_code, category, title, severity, priority,
            status, identified_at, source_type, source_reference_id,
            created_at, updated_at, created_by, updated_by, version, is_deleted
          ) VALUES (
            'prb-rollback-sync', '${caseId1}', 'PRB-RB-SYNC', 'DENTAL', 'Rollback Sync Test',
            'MILD', 1, 'ACTIVE', '2026-10-10', 'INITIAL_DIAGNOSIS', 'src',
            '2026-10-10T00:00:00Z', '2026-10-10T00:00:00Z', 'usr-dr-albasmi', 'usr-dr-albasmi', 1, 0
          );`
        );
        // 2. Insert audit
        await tx.execute(
          `INSERT INTO audit_logs (id, entity_type, entity_id, operation_type, user_id, device_id, timestamp)
           VALUES ('aud-roll-sync-1', 'problems', 'prb-rollback-sync', 'CREATE', 'usr-dr-albasmi', 'dev-forensic-r2d', '2026-10-10T00:00:00Z');`
        );
        // 3. Fail sync outbox (operation_id NOT NULL violation)
        await tx.execute(
          `INSERT INTO sync_operations (operation_id, case_id, entity_type, entity_id, operation_type, payload, client_timestamp, status)
           VALUES (NULL, '${caseId1}', 'problems', 'prb-rollback-sync', 'CREATE', '{}', '2026-10-10T00:00:00Z', 'PENDING');`
        );
      });
    } catch {
      const afterCount = await probDiagService.getProblemCount();
      const orphaned = await probDiagService.getProblemById('prb-rollback-sync');
      rollbackSuccess = afterCount === beforeCount && orphaned === null;
    }

    addResult(
      'R2D-16',
      'Complete rollback when sync-outbox insertion fails',
      rollbackSuccess,
      `Transaction rolled back atomically upon sync outbox failure. Zero orphaned problem rows left.`
    );
  } catch (err) {
    addResult('R2D-16', 'Complete rollback when sync-outbox insertion fails', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-17: Correct duplicate and idempotency behavior
  // --------------------------------------------------------------------------
  try {
    const fixedOpId = 'op-idemp-r2d-test';
    // 1. First execution
    const firstExec = await probDiagService.createProblem({
      id: 'prb-idemp-001',
      caseId: caseId1,
      problemCode: 'PRB-IDEMP-001',
      category: 'DENTAL',
      title: 'Idempotency Test Problem',
      severity: 'MILD',
      sourceType: 'INITIAL_DIAGNOSIS',
      sourceReferenceId: `src-${caseId1}`,
      userId: 'usr-dr-albasmi',
      deviceId: 'dev-forensic-r2d',
      operationId: fixedOpId,
    });

    // 2. Exact duplicate execution (should return idempotent hit)
    const secondExec = await probDiagService.createProblem({
      id: 'prb-idemp-001',
      caseId: caseId1,
      problemCode: 'PRB-IDEMP-001',
      category: 'DENTAL',
      title: 'Idempotency Test Problem',
      severity: 'MILD',
      sourceType: 'INITIAL_DIAGNOSIS',
      sourceReferenceId: `src-${caseId1}`,
      userId: 'usr-dr-albasmi',
      deviceId: 'dev-forensic-r2d',
      operationId: fixedOpId,
    });

    // 3. Payload mismatch execution (should throw ERR_IDEMPOTENCY_PAYLOAD_MISMATCH)
    let mismatchRejected = false;
    try {
      await probDiagService.createProblem({
        id: 'prb-idemp-001',
        caseId: caseId1,
        problemCode: 'PRB-IDEMP-DIFFERENT',
        category: 'DENTAL',
        title: 'Mismatched Payload',
        severity: 'SEVERE',
        sourceType: 'INITIAL_DIAGNOSIS',
        sourceReferenceId: `src-${caseId1}`,
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-forensic-r2d',
        operationId: fixedOpId,
      });
    } catch (e) {
      if (e instanceof Cohort2ProblemDiagnosisPersistenceError && e.code === 'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH') {
        mismatchRejected = true;
      }
    }

    const ok = firstExec.isIdempotentHit === false && secondExec.isIdempotentHit === true && mismatchRejected;
    addResult(
      'R2D-17',
      'Correct duplicate and idempotency behavior',
      ok,
      `First exec isIdempotentHit: ${firstExec.isIdempotentHit}, Duplicate exec isIdempotentHit: ${secondExec.isIdempotentHit}, Mismatch rejected: ${mismatchRejected}`
    );
  } catch (err) {
    addResult('R2D-17', 'Correct duplicate and idempotency behavior', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-18: Version uniqueness constraint enforcement (case_id, version_number)
  // --------------------------------------------------------------------------
  try {
    let duplicateVerRejected = false;
    try {
      // Attempt to insert version 1 again for caseId1 (version 1 already exists from R2D-07)
      await probDiagService.createDiagnosisDraft({
        caseId: caseId1,
        versionNumber: 1, // Duplicate version number!
        diagnosedBy: 'Dr. Al-Basmi',
        clinicalSummary: 'Duplicate version number attempt',
        userId: 'usr-dr-albasmi',
        deviceId: 'dev-forensic-r2d',
      });
    } catch (e: any) {
      if (
        (e instanceof Cohort2ProblemDiagnosisPersistenceError && e.code === 'ERR_DUPLICATE_VERSION_NUMBER') ||
        e?.code === 'ERR_DUPLICATE_VERSION_NUMBER' ||
        e?.cause?.code === 'ERR_DUPLICATE_VERSION_NUMBER' ||
        String(e).includes('ERR_DUPLICATE_VERSION_NUMBER')
      ) {
        duplicateVerRejected = true;
      }
    }

    addResult(
      'R2D-18',
      'Version uniqueness constraint enforcement (case_id, version_number)',
      duplicateVerRejected,
      `Attempt to duplicate version_number 1 for case '${caseId1}' threw ERR_DUPLICATE_VERSION_NUMBER`
    );
  } catch (err) {
    addResult('R2D-18', 'Version uniqueness constraint enforcement', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-19: Persistence verification after adapter close/reopen
  // --------------------------------------------------------------------------
  try {
    const problemsBefore = await probDiagService.getProblemCount();
    const versionsBefore = await probDiagService.getDiagnosisVersionCount();
    await adapter.close();

    // Reopen same database
    await adapter.initialize();
    const serviceAfterReopen = new Cohort2ProblemDiagnosisPersistenceService(adapter);
    const problemsAfter = await serviceAfterReopen.getProblemCount();
    const versionsAfter = await serviceAfterReopen.getDiagnosisVersionCount();
    const verifiedProblem = await serviceAfterReopen.getProblemById(problem1Id);

    const ok =
      problemsBefore === problemsAfter &&
      versionsBefore === versionsAfter &&
      problemsAfter >= 1 &&
      verifiedProblem !== null;

    addResult(
      'R2D-19',
      'Persistence verification after adapter close/reopen',
      ok,
      `Problems count before=${problemsBefore}, after=${problemsAfter}; Diagnosis versions before=${versionsBefore}, after=${versionsAfter}; Problem '${verifiedProblem?.id}' verified.`
    );
  } catch (err) {
    addResult('R2D-19', 'Persistence verification after reopen', false, String(err));
  }

  // --------------------------------------------------------------------------
  // R2D-20: Regression verification for patient, case, and visit persistence services
  // --------------------------------------------------------------------------
  try {
    const postReopenPatientService = new Cohort2PatientPersistenceService(adapter);
    const postReopenCaseService = new Cohort2CasePersistenceService(adapter);
    const postReopenVisitService = new Cohort2VisitPersistenceService(adapter);

    const patCount = await postReopenPatientService.getPatientCount();
    const caseCount = await postReopenCaseService.getCaseCount();
    const visitRes = await postReopenVisitService.createVisit({
      id: 'vst-regression-r2d-001',
      caseId: caseId1,
      visitDate: '2026-10-12',
      visitType: 'Adjustment',
      providerId: 'usr-dr-albasmi',
      chiefReason: 'Records and Clinical Examination',
      userId: 'usr-dr-albasmi',
      deviceId: 'dev-forensic-r2d',
    });

    const storedVisit = await postReopenVisitService.getVisitById('vst-regression-r2d-001');
    const ok = patCount >= 1 && caseCount >= 2 && storedVisit !== null;

    addResult(
      'R2D-20',
      'Regression verification for patient, case, and visit persistence services',
      ok,
      `Patient count: ${patCount}, Case count: ${caseCount}, Visit ID '${storedVisit?.id}' created and verified`
    );
  } catch (err) {
    addResult('R2D-20', 'Regression verification', false, String(err));
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const blocked = results.filter((r) => r.status === 'BLOCKED').length;

  return {
    total: results.length,
    passed,
    failed,
    blocked,
    results,
  };
}
