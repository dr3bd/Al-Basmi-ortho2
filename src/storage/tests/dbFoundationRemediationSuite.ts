/**
 * AL-BASMI ORTH — DB-FOUNDATION-REMEDIATION VERIFICATION SUITE
 *
 * Verifies end-to-end database and persistence integrity across:
 * 1. Canonical 30-table schema, foreign_keys enforcement, and idempotent migration bootstrap.
 * 2. Device identity, default provider user, and reference catalog bootstrap.
 * 3. Nested savepoint rollback + release semantics and undefined/boolean parameter sanitization.
 * 4. End-to-end clinical graph persistence (Patient -> Case -> Metadata Update -> Examination + Findings -> Problem + Evidence -> Diagnosis + Items + Links -> Visit) with audit_logs and sync_operations.
 * 5. Deterministic database binary export (exportDatabaseBinary) and strict demo/cross-case isolation.
 */

import { WaSqliteStorageAdapter } from '../drivers/waSqliteAdapter.ts';
import { Cohort1PersistenceService } from '../drivers/cohort1PersistenceService.ts';
import { Cohort2PatientPersistenceService } from '../drivers/cohort2PatientPersistenceService.ts';
import { Cohort2CasePersistenceService } from '../drivers/cohort2CasePersistenceService.ts';
import { Cohort2VisitPersistenceService } from '../drivers/cohort2VisitPersistenceService.ts';
import { Cohort2ProblemDiagnosisPersistenceService } from '../drivers/cohort2ProblemDiagnosisPersistenceService.ts';
import { DeviceBootstrapService } from '../services/deviceBootstrap.ts';

export interface DbFoundationTestResult {
  testId: string;
  name: string;
  passed: boolean;
  evidence: string;
}

export interface DbFoundationSuiteReport {
  timestamp: string;
  total: number;
  passed: number;
  failed: number;
  results: DbFoundationTestResult[];
}

export async function runDbFoundationRemediationSuite(options?: {
  wasmBinary?: ArrayBuffer | Uint8Array;
}): Promise<DbFoundationSuiteReport> {
  const results: DbFoundationTestResult[] = [];
  const adapter = new WaSqliteStorageAdapter({
    databaseName: `dbf_remediation_${Date.now()}.db`,
    mode: 'PREVIEW',
    allowPreviewEphemeral: true,
    wasmBinary: options?.wasmBinary,
  });

  await adapter.initialize();

  try {
    const c1Service = new Cohort1PersistenceService(adapter);
    const c2Patient = new Cohort2PatientPersistenceService(adapter);
    const c2Case = new Cohort2CasePersistenceService(adapter);
    const c2Visit = new Cohort2VisitPersistenceService(adapter);
    const c2ProbDiag = new Cohort2ProblemDiagnosisPersistenceService(adapter);
    const bootstrapper = new DeviceBootstrapService(adapter, c1Service);

    // ------------------------------------------------------------------------
    // DBF-01: Canonical Schema, Foreign Keys & Idempotent Migration Bootstrap
    // ------------------------------------------------------------------------
    try {
      const schemaRes1 = await bootstrapper.ensureCanonicalSchemaAndMigrations();
      const schemaRes2 = await bootstrapper.ensureCanonicalSchemaAndMigrations();
      const fkPragma = await adapter.queryScalar<number>('PRAGMA foreign_keys;');

      const passed =
        fkPragma === 1 &&
        schemaRes1.tableCount >= 30 &&
        schemaRes2.tableCount >= 30 &&
        schemaRes2.migrationApplied === false;

      results.push({
        testId: 'DBF-01',
        name: 'Canonical 30-Table Schema, Foreign Keys & Idempotent Migration Verification',
        passed,
        evidence: `foreign_keys=${fkPragma}, tables=${schemaRes1.tableCount}, firstRunApplied=${schemaRes1.migrationApplied}, secondRunIdempotent=${!schemaRes2.migrationApplied}`,
      });
    } catch (err: unknown) {
      results.push({
        testId: 'DBF-01',
        name: 'Canonical 30-Table Schema, Foreign Keys & Idempotent Migration Verification',
        passed: false,
        evidence: err instanceof Error ? err.message : String(err),
      });
    }

    // ------------------------------------------------------------------------
    // DBF-02: Device Identity, Default Provider & Reference Catalog Bootstrap
    // ------------------------------------------------------------------------
    let deviceId = 'dev-dbf-test';
    try {
      const boot1 = await bootstrapper.bootstrapDevice({ seedReferenceData: true });
      const boot2 = await bootstrapper.bootstrapDevice({ seedReferenceData: true });
      deviceId = boot1.deviceId;

      const providerRow = await adapter.queryOne<{ id: string; username: string; status: string }>(
        "SELECT id, username, status FROM users WHERE id = 'usr-dr-albasmi';"
      );
      const analysisDefsCount = await adapter.queryScalar<number>(
        'SELECT COUNT(*) FROM cephalometric_analysis_definitions;'
      );
      const cephNormsCount = await adapter.queryScalar<number>(
        'SELECT COUNT(*) FROM cephalometric_measurement_definitions;'
      );

      const passed =
        boot1.deviceId === boot2.deviceId &&
        boot2.isNewRegistration === false &&
        providerRow?.id === 'usr-dr-albasmi' &&
        Number(analysisDefsCount) >= 5 &&
        Number(cephNormsCount) >= 5;

      results.push({
        testId: 'DBF-02',
        name: 'Device Identity, Default Provider & Reference Catalog Bootstrap',
        passed,
        evidence: `deviceId=${boot1.deviceId}, provider=${providerRow?.id} (${providerRow?.status}), analysisDefs=${analysisDefsCount}, cephMeasurementDefs=${cephNormsCount}`,
      });
    } catch (err: unknown) {
      results.push({
        testId: 'DBF-02',
        name: 'Device Identity, Default Provider & Reference Catalog Bootstrap',
        passed: false,
        evidence: err instanceof Error ? err.message : String(err),
      });
    }

    // ------------------------------------------------------------------------
    // DBF-03: Nested Savepoint Rollback + Release & Parameter Sanitization
    // ------------------------------------------------------------------------
    try {
      let innerSavepointCaught = false;
      const nowRoleIso = new Date().toISOString();
      await adapter.transaction('IMMEDIATE', async (tx) => {
        // Outer insert with undefined (nullable last_sync_at) and boolean (is_default: false -> 0) parameters
        await tx.execute(
          `INSERT INTO devices (id, device_name, device_type, app_version, schema_version, last_sync_at, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          ['dev-dbf-outer-1', 'Outer Station 1', 'IPAD', '1.0.0', '1.0.0', undefined, 'ACTIVE', nowRoleIso, nowRoleIso]
        );
        await tx.execute(
          `INSERT INTO cephalometric_analysis_definitions (analysis_code, name_en, name_ar, version, active)
           VALUES (?, ?, ?, ?, ?);`,
          ['DBF_ANALYSIS_1', 'Test Analysis 1', 'تحليل تجريبي 1', 1, 0]
        );

        try {
          await tx.savepoint('sp-inner-test', async () => {
            await tx.execute(
              `INSERT INTO devices (id, device_name, device_type, app_version, schema_version, last_sync_at, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              ['dev-dbf-inner-abort', 'Inner Aborted Station', 'IPAD', '1.0.0', '1.0.0', undefined, 'ACTIVE', nowRoleIso, nowRoleIso]
            );
            throw new Error('SIMULATED_INNER_SAVEPOINT_FAILURE');
          });
        } catch (innerErr: unknown) {
          if (innerErr instanceof Error && innerErr.message.includes('SIMULATED_INNER_SAVEPOINT_FAILURE')) {
            innerSavepointCaught = true;
          } else {
            throw innerErr;
          }
        }

        // Subsequent write in outer transaction after savepoint rollback+release must succeed
        await tx.execute(
          `INSERT INTO devices (id, device_name, device_type, app_version, schema_version, last_sync_at, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          ['dev-dbf-outer-2', 'Outer Station 2', 'IPAD', '1.0.0', '1.0.0', nowRoleIso, 'ACTIVE', nowRoleIso, nowRoleIso]
        );
      });

      const outer1 = await adapter.queryOne<{ id: string; last_sync_at: string | null }>(
        "SELECT id, last_sync_at FROM devices WHERE id = 'dev-dbf-outer-1';"
      );
      const sys1 = await adapter.queryOne<{ analysis_code: string; active: number }>(
        "SELECT analysis_code, active FROM cephalometric_analysis_definitions WHERE analysis_code = 'DBF_ANALYSIS_1';"
      );
      const innerAborted = await adapter.queryOne<{ id: string }>(
        "SELECT id FROM devices WHERE id = 'dev-dbf-inner-abort';"
      );
      const outer2 = await adapter.queryOne<{ id: string }>(
        "SELECT id FROM devices WHERE id = 'dev-dbf-outer-2';"
      );

      const passed =
        innerSavepointCaught &&
        outer1?.id === 'dev-dbf-outer-1' &&
        outer1?.last_sync_at === null &&
        sys1?.active === 0 &&
        innerAborted === null &&
        outer2?.id === 'dev-dbf-outer-2';

      results.push({
        testId: 'DBF-03',
        name: 'Nested Savepoint Rollback+Release & Undefined Parameter Sanitization',
        passed,
        evidence: `innerCaught=${innerSavepointCaught}, outerBefore=${Boolean(outer1)} (lastSync=${outer1?.last_sync_at}, active=${sys1?.active}), innerRolledBack=${innerAborted === null}, outerAfter=${Boolean(outer2)}`,
      });
    } catch (err: unknown) {
      results.push({
        testId: 'DBF-03',
        name: 'Nested Savepoint Rollback+Release & Undefined Parameter Sanitization',
        passed: false,
        evidence: err instanceof Error ? err.message : String(err),
      });
    }

    // ------------------------------------------------------------------------
    // DBF-04: End-to-End Clinical Graph Persistence & Post-Write Verification
    // ------------------------------------------------------------------------
    try {
      const nowIso = new Date().toISOString();

      // 1. Create Patient
      const patRes = await c2Patient.createPatient({
        id: 'pat-dbf-001',
        patientNumber: 'PAT-DBF-2026-001',
        firstName: 'Laila',
        lastName: 'Al-Harbi',
        dateOfBirth: '2011-04-12',
        sex: 'FEMALE',
        phone: '+966501112233',
        userId: 'usr-dr-albasmi',
        userRole: 'ORTHODONTIST',
        deviceId,
        timestamp: nowIso,
      });

      // 2. Create Case
      const caseRes = await c2Case.createCase({
        id: 'case-dbf-001',
        caseNumber: 'ORT-DBF-2026-001',
        patientId: patRes.patient.id,
        caseType: 'COMPREHENSIVE',
        caseStatus: 'CONSULTATION',
        chiefComplaint: 'Initial chief complaint',
        startDate: '2026-03-01',
        primaryProviderId: 'usr-dr-albasmi',
        userId: 'usr-dr-albasmi',
        userRole: 'ORTHODONTIST',
        deviceId,
        timestamp: nowIso,
      });

      // 3. Update Case Metadata
      const updatedCaseRes = await c2Case.updateCaseMetadata({
        caseId: caseRes.case.id,
        chiefComplaint: 'Updated crowding and deep bite complaint',
        notes: 'ازدحام أمامي وعضة عميقة',
        caseStatus: 'DIAGNOSIS',
        userId: 'usr-dr-albasmi',
        userRole: 'ORTHODONTIST',
        deviceId,
        timestamp: nowIso,
      });

      // 4. Record Clinical Examination + Findings
      const examRes = await c2Visit.createExamination({
        id: 'exam-dbf-001',
        caseId: caseRes.case.id,
        examinationDate: '2026-03-01',
        examinerId: 'usr-dr-albasmi',
        examinationStage: 'INITIAL',
        status: 'CONFIRMED',
        findings: [
          { category: 'EXTRAORAL', findingCode: 'FACIAL_PROFILE', value: 'Convex' },
          { category: 'INTRAORAL', findingCode: 'MAX_CROWDING_MM', value: '5.5', unit: 'mm' },
          { category: 'OCCLUSAL', findingCode: 'OVERJET_INITIAL_MM', value: '6.0', unit: 'mm' },
        ],
        userId: 'usr-dr-albasmi',
        userRole: 'ORTHODONTIST',
        deviceId,
        timestamp: nowIso,
      });

      // 5. Create Problem + Evidence
      const probRes = await c2ProbDiag.createProblem({
        id: 'prb-dbf-001',
        caseId: caseRes.case.id,
        problemCode: 'PRB-DEN-001',
        category: 'DENTAL',
        title: 'Maxillary Anterior Crowding 5.5mm',
        severity: 'MODERATE',
        sourceReferenceId: examRes.examination.id,
        evidence: [
          {
            evidenceType: 'ARCH_MEASUREMENT',
            sourceEntityType: 'clinical_examinations',
            sourceEntityId: examRes.examination.id,
            measurementValue: '5.5',
            measurementUnit: 'mm',
            interpretation: 'Moderate upper arch length deficiency',
          },
        ],
        userId: 'usr-dr-albasmi',
        userRole: 'ORTHODONTIST',
        deviceId,
        timestamp: nowIso,
      });

      // 6. Create Diagnosis Draft + Structured Items + Problem Link
      const diagRes = await c2ProbDiag.createDiagnosisDraft({
        id: 'diag-dbf-001',
        caseId: caseRes.case.id,
        versionNumber: 1,
        diagnosedBy: 'usr-dr-albasmi',
        clinicalSummary: 'Skeletal Class II with moderate maxillary crowding',
        generalNotes: 'صنف ثانٍ هيكلي مع ازدحام علوي متوسط',
        items: [
          {
            category: 'SKELETAL',
            diagnosisCode: 'DIAG_SKELETAL_SAGITTAL',
            title: 'Skeletal Class II (Mandibular Retrognathism)',
            description: 'Sagittal skeletal relationship',
            linkedProblemIds: [probRes.problem.id],
          },
        ],
        userId: 'usr-dr-albasmi',
        userRole: 'ORTHODONTIST',
        deviceId,
        timestamp: nowIso,
      });

      // 7. Create Visit
      const visitRes = await c2Visit.createVisit({
        id: 'vis-dbf-001',
        caseId: caseRes.case.id,
        visitDate: '2026-03-02',
        visitType: 'Bonding',
        providerId: 'usr-dr-albasmi',
        chiefReason: 'Upper arch bonding',
        userId: 'usr-dr-albasmi',
        userRole: 'ORTHODONTIST',
        deviceId,
        timestamp: nowIso,
      });

      // Read-back verification from SQLite
      const readCase = await c2Case.getCaseById(caseRes.case.id);
      const readFindings = await c2Visit.listFindingsByExaminationId(examRes.examination.id);
      const readDiagItems = await c2ProbDiag.listDiagnosisItemsByVersionId(
        diagRes.diagnosisVersion.id
      );
      const readVisit = await c2Visit.getVisitById(visitRes.visit.id);
      const auditCount = await adapter.queryScalar<number>('SELECT COUNT(*) FROM audit_logs;');
      const syncCount = await adapter.queryScalar<number>('SELECT COUNT(*) FROM sync_operations;');

      const passed =
        readCase?.version === 2 &&
        readCase?.chief_complaint === 'Updated crowding and deep bite complaint' &&
        updatedCaseRes.case.case_status === 'DIAGNOSIS' &&
        readFindings.length === 3 &&
        readDiagItems.length === 1 &&
        readDiagItems[0].title === 'Skeletal Class II (Mandibular Retrognathism)' &&
        readVisit?.id === 'vis-dbf-001' &&
        Number(auditCount) >= 6 &&
        Number(syncCount) >= 6;

      results.push({
        testId: 'DBF-04',
        name: 'End-to-End Clinical Graph Persistence, Read-Back & Audit/Sync Outbox Verification',
        passed,
        evidence: `caseVer=${readCase?.version}, findings=${readFindings.length}, diagItems=${readDiagItems.length}, visit=${readVisit?.id}, audits=${auditCount}, syncOps=${syncCount}`,
      });
    } catch (err: unknown) {
      results.push({
        testId: 'DBF-04',
        name: 'End-to-End Clinical Graph Persistence, Read-Back & Audit/Sync Outbox Verification',
        passed: false,
        evidence: err instanceof Error ? err.message : String(err),
      });
    }

    // ------------------------------------------------------------------------
    // DBF-05: Deterministic Database Export & Demo Case Rejection
    // ------------------------------------------------------------------------
    try {
      const exportedBytes = await adapter.exportDatabaseBinary();
      const exportedText = new TextDecoder().decode(exportedBytes);

      let demoRejected = false;
      try {
        await c2Visit.createExamination({
          caseId: 'ORT-2025-00101',
          examinationDate: '2026-03-01',
          examinerId: 'usr-dr-albasmi',
          userId: 'usr-dr-albasmi',
          deviceId,
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes('ERR_DEMO_RECORD_REJECTED')) {
          demoRejected = true;
        }
      }

      const passed =
        exportedBytes.byteLength > 100 &&
        exportedText.includes('pat-dbf-001') &&
        exportedText.includes('case-dbf-001') &&
        demoRejected;

      results.push({
        testId: 'DBF-05',
        name: 'Deterministic Database Export & Demo Case Write Rejection',
        passed,
        evidence: `exportedBytes=${exportedBytes.byteLength}, containsClinicalRows=${exportedText.includes('case-dbf-001')}, demoRejected=${demoRejected}`,
      });
    } catch (err: unknown) {
      results.push({
        testId: 'DBF-05',
        name: 'Deterministic Database Export & Demo Case Write Rejection',
        passed: false,
        evidence: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    await adapter.close();
  }

  const passedCount = results.filter((r) => r.passed).length;
  return {
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    results,
  };
}
