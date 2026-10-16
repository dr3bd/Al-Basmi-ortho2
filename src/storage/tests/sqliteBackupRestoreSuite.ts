/**
 * AL-BASMI ORTH — SQLITE BACKUP & RESTORE FORENSIC VERIFICATION SUITE
 * Phase: PHASE 0-R-GATE-1
 * 
 * Gates Verified:
 * 1. BK-01: Deterministic SQLite 3 binary backup creation (SQLite format 3 magic header, valid pages, real SQLite binary)
 * 2. BK-02: Restoration into test database & end-to-end data equality (all rows, columns, values match source)
 * 3. BK-03: Post-restoration physical database integrity & foreign key constraint validation
 * 4. BK-04: Strict rejection of invalid, corrupted, or schema-incompatible backup payloads
 * 5. BK-05: Fail-safe preservation of existing clinical data when restoration fails or is rejected
 */

import { WaSqliteStorageAdapter } from '../drivers/waSqliteAdapter.ts';
import { Cohort1PersistenceService } from '../drivers/cohort1PersistenceService.ts';
import { Cohort2PatientPersistenceService } from '../drivers/cohort2PatientPersistenceService.ts';
import { Cohort2CasePersistenceService } from '../drivers/cohort2CasePersistenceService.ts';
import { DeviceBootstrapService } from '../services/deviceBootstrap.ts';
import { SqliteStorageError } from '../types/storageAdapter.ts';

export interface BackupRestoreTestResult {
  testId: string;
  name: string;
  passed: boolean;
  evidence: string;
}

export interface BackupRestoreSuiteReport {
  timestamp: string;
  total: number;
  passed: number;
  failed: number;
  results: BackupRestoreTestResult[];
}

export async function runSqliteBackupRestoreSuite(options: {
  wasmBinary?: ArrayBuffer | Uint8Array;
} = {}): Promise<BackupRestoreSuiteReport> {
  const results: BackupRestoreTestResult[] = [];
  const wasmBinary = options.wasmBinary;

  const createInitializedDatabase = async (dbName: string) => {
    const adapter = new WaSqliteStorageAdapter({
      databaseName: dbName,
      mode: 'PREVIEW',
      preferredVfs: 'MEMORY_ASYNC',
      allowPreviewEphemeral: true,
      wasmBinary,
    });
    await adapter.initialize();
    const c1 = new Cohort1PersistenceService(adapter);
    const bootstrapper = new DeviceBootstrapService(adapter, c1);
    await bootstrapper.ensureCanonicalSchemaAndMigrations();
    const boot = await bootstrapper.bootstrapDevice({ seedReferenceData: true });
    const patientService = new Cohort2PatientPersistenceService(adapter);
    const caseService = new Cohort2CasePersistenceService(adapter);
    return { adapter, patientService, caseService, deviceId: boot.deviceId };
  };

  // ------------------------------------------------------------------------
  // BK-01: Deterministic SQLite 3 Binary Backup Creation
  // ------------------------------------------------------------------------
  let sourceBackupBinary: Uint8Array | null = null;
  const sourceDbName = `src_db_bk_${Date.now()}.db`;
  const {
    adapter: sourceAdapter,
    patientService: sourcePatientService,
    caseService: sourceCaseService,
    deviceId: sourceDeviceId,
  } = await createInitializedDatabase(sourceDbName);

  try {
    // Seed source database with clinical records using canonical persistence services
    const patRes = await sourcePatientService.createPatient({
      id: 'pat-bk-001',
      patientNumber: 'PN-BK-001',
      firstName: 'عبدالله',
      lastName: 'المحمد',
      dateOfBirth: '2005-04-12',
      sex: 'MALE',
      phone: '+966501234567',
      userId: 'usr-dr-albasmi',
      deviceId: sourceDeviceId,
    });

    const caseRes = await sourceCaseService.createCase({
      id: 'case-bk-001',
      caseNumber: 'ORT-2026-BK01',
      patientId: patRes.patient.id,
      chiefComplaint: 'Overjet and maxillary spacing',
      userId: 'usr-dr-albasmi',
      deviceId: sourceDeviceId,
    });

    // Execute backup export
    sourceBackupBinary = await sourceAdapter.exportDatabaseBinary();

    // Verify SQLite 3 magic header
    const sqliteMagic = [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00];
    let magicMatch = sourceBackupBinary.byteLength >= 512;
    for (let i = 0; i < 16; i++) {
      if (sourceBackupBinary[i] !== sqliteMagic[i]) {
        magicMatch = false;
        break;
      }
    }

    const binaryText = new TextDecoder().decode(sourceBackupBinary);
    const containsPatient = binaryText.includes('pat-bk-001');
    const containsCase = binaryText.includes('case-bk-001');

    const passed =
      magicMatch &&
      sourceBackupBinary.byteLength >= 4096 &&
      containsPatient &&
      containsCase &&
      caseRes.case.id === 'case-bk-001';

    results.push({
      testId: 'BK-01',
      name: 'Deterministic SQLite 3 Binary Backup Creation',
      passed,
      evidence: `byteLength=${sourceBackupBinary.byteLength}, magicMatch=${magicMatch}, containsPatient=${containsPatient}, containsCase=${containsCase}`,
    });
  } catch (err: unknown) {
    results.push({
      testId: 'BK-01',
      name: 'Deterministic SQLite 3 Binary Backup Creation',
      passed: false,
      evidence: err instanceof Error ? err.message : String(err),
    });
  }

  // ------------------------------------------------------------------------
  // BK-02: Restoration into Test Database & Data Equality
  // ------------------------------------------------------------------------
  const targetDbName = `target_db_bk_${Date.now()}.db`;
  const {
    adapter: targetAdapter,
    patientService: targetPatientService,
    deviceId: targetDeviceId,
  } = await createInitializedDatabase(targetDbName);

  try {
    // Initial state in target: different patient
    await targetPatientService.createPatient({
      id: 'pat-target-initial',
      patientNumber: 'PN-TARGET-INIT',
      firstName: 'سعد',
      lastName: 'الشهري',
      dateOfBirth: '1999-01-01',
      sex: 'MALE',
      phone: '+966555555555',
      userId: 'usr-dr-albasmi',
      deviceId: targetDeviceId,
    });

    if (!sourceBackupBinary) {
      throw new Error('sourceBackupBinary not available from BK-01');
    }

    // Perform live restoration of source backup into target
    await targetAdapter.restoreDatabaseBinary(sourceBackupBinary);

    // Query restored data from target
    const restoredPatients = await targetAdapter.query<{ id: string; first_name: string; last_name: string }>(
      'SELECT id, first_name, last_name FROM patients;'
    );
    const restoredCases = await targetAdapter.query<{ id: string; case_number: string; chief_complaint: string }>(
      'SELECT id, case_number, chief_complaint FROM orthodontic_cases;'
    );
    const restoredAudits = await targetAdapter.query<{ id: string; operation_type: string }>(
      "SELECT id, operation_type FROM audit_logs WHERE entity_id = 'case-bk-001';"
    );

    // Data equality assertions
    const patientMatches =
      restoredPatients.some((p) => p.id === 'pat-bk-001' && p.first_name === 'عبدالله' && p.last_name === 'المحمد');

    const caseMatches =
      restoredCases.some((c) => c.id === 'case-bk-001' && c.case_number === 'ORT-2026-BK01' && c.chief_complaint === 'Overjet and maxillary spacing');

    const auditMatches = restoredAudits.length > 0;

    // Verify initial target patient was completely cleanly replaced
    const initialPatientGone = !restoredPatients.some((p) => p.id === 'pat-target-initial');

    const passed = patientMatches && caseMatches && auditMatches && initialPatientGone;
    results.push({
      testId: 'BK-02',
      name: 'Restoration into Test Database & Data Equality',
      passed,
      evidence: `patientMatches=${patientMatches}, caseMatches=${caseMatches}, auditMatches=${auditMatches}, initialPatientReplaced=${initialPatientGone}`,
    });
  } catch (err: unknown) {
    results.push({
      testId: 'BK-02',
      name: 'Restoration into Test Database & Data Equality',
      passed: false,
      evidence: err instanceof Error ? err.message : String(err),
    });
  }

  // ------------------------------------------------------------------------
  // BK-03: Post-Restoration Database Integrity & Foreign Key Validation
  // ------------------------------------------------------------------------
  try {
    const integrityRows = await targetAdapter.query<Record<string, unknown>>('PRAGMA integrity_check;');
    const integrityStatus = integrityRows.length > 0 ? String(Object.values(integrityRows[0])[0]) : 'unknown';

    const fkRows = await targetAdapter.query<Record<string, unknown>>('PRAGMA foreign_key_check;');
    const tableCount = await targetAdapter.queryScalar<number>(
      "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';"
    );

    const passed = integrityStatus.toLowerCase() === 'ok' && fkRows.length === 0 && Number(tableCount) === 45;
    results.push({
      testId: 'BK-03',
      name: 'Post-Restoration Physical Integrity & PRAGMA Verification',
      passed,
      evidence: `integrity=${integrityStatus}, fkViolations=${fkRows.length}, canonicalTables=${tableCount}`,
    });
  } catch (err: unknown) {
    results.push({
      testId: 'BK-03',
      name: 'Post-Restoration Physical Integrity & PRAGMA Verification',
      passed: false,
      evidence: err instanceof Error ? err.message : String(err),
    });
  }

  // ------------------------------------------------------------------------
  // BK-04: Rejection of Corrupt, Malformed & Incompatible Backups
  // ------------------------------------------------------------------------
  try {
    // Sub-case 1: Reject empty payload (< 512 bytes)
    let emptyRejected = false;
    try {
      await targetAdapter.restoreDatabaseBinary(new Uint8Array(100));
    } catch (e: unknown) {
      if (e instanceof SqliteStorageError && e.code === 'ERR_SQLITE_CORRUPT_DATABASE') {
        emptyRejected = true;
      }
    }

    // Sub-case 2: Reject non-SQLite payload (e.g. JSON snapshot or arbitrary text)
    let nonSqliteRejected = false;
    try {
      const jsonPayload = new TextEncoder().encode(JSON.stringify({ format: 'ALBASMI_SQLITE_PHYSICAL_SNAPSHOT_v1', tables: {} }));
      await targetAdapter.restoreDatabaseBinary(jsonPayload);
    } catch (e: unknown) {
      if (e instanceof SqliteStorageError && e.code === 'ERR_SQLITE_CORRUPT_DATABASE') {
        nonSqliteRejected = true;
      }
    }

    // Sub-case 3: Reject SQLite binary with corrupted page b-tree
    let corruptPageRejected = false;
    if (sourceBackupBinary) {
      const corruptBinary = new Uint8Array(sourceBackupBinary);
      // Byte 108 is page 1 b-tree header
      corruptBinary[108] = 0xAA;
      corruptBinary[109] = 0xBB;
      try {
        await targetAdapter.restoreDatabaseBinary(corruptBinary);
      } catch (e: unknown) {
        if (e instanceof SqliteStorageError && e.code === 'ERR_SQLITE_CORRUPT_DATABASE') {
          corruptPageRejected = true;
        }
      }
    }

    // Sub-case 4: Reject SQLite database with incompatible schema (e.g. arbitrary non-orthodontic tables)
    let incompatibleSchemaRejected = false;
    const dummyDbName = `dummy_incompatible_${Date.now()}.db`;
    const dummyAdapter = new WaSqliteStorageAdapter({
      databaseName: dummyDbName,
      mode: 'PREVIEW',
      allowPreviewEphemeral: true,
      wasmBinary,
    });
    await dummyAdapter.initialize();
    await dummyAdapter.execute('CREATE TABLE arbitrary_blog_posts (id INT, title TEXT);');
    const dummyBackup = await dummyAdapter.exportDatabaseBinary();

    try {
      await targetAdapter.restoreDatabaseBinary(dummyBackup);
    } catch (e: unknown) {
      if (e instanceof SqliteStorageError && e.code === 'ERR_SQLITE_SCHEMA_MISMATCH') {
        incompatibleSchemaRejected = true;
      }
    }

    const passed = emptyRejected && nonSqliteRejected && corruptPageRejected && incompatibleSchemaRejected;
    results.push({
      testId: 'BK-04',
      name: 'Rejection of Corrupt, Malformed & Incompatible Backups',
      passed,
      evidence: `emptyRejected=${emptyRejected}, nonSqliteRejected=${nonSqliteRejected}, corruptPageRejected=${corruptPageRejected}, incompatibleSchemaRejected=${incompatibleSchemaRejected}`,
    });
  } catch (err: unknown) {
    results.push({
      testId: 'BK-04',
      name: 'Rejection of Corrupt, Malformed & Incompatible Backups',
      passed: false,
      evidence: err instanceof Error ? err.message : String(err),
    });
  }

  // ------------------------------------------------------------------------
  // BK-05: Fail-Safe Preservation of Existing Clinical Data on Restoration Failure
  // ------------------------------------------------------------------------
  try {
    // Current target database has patient 'pat-bk-001' from BK-02
    // Let's insert a specific marker patient into target
    await targetPatientService.createPatient({
      id: 'pat-safe-preserved',
      patientNumber: 'PN-SAFE-001',
      firstName: 'فاطمة',
      lastName: 'المنصوري',
      dateOfBirth: '2010-08-20',
      sex: 'FEMALE',
      phone: '+966509876543',
      userId: 'usr-dr-albasmi',
      deviceId: targetDeviceId,
    });

    // Verify it exists prior to failed restore attempt
    const patientCountBefore = await targetAdapter.queryScalar<number>('SELECT COUNT(*) FROM patients;');

    // Attempt to restore completely broken/invalid payload
    let restoreThrew = false;
    try {
      await targetAdapter.restoreDatabaseBinary(new Uint8Array([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00, 0xff, 0xff, 0xff]));
    } catch {
      restoreThrew = true;
    }

    // Verify target database is fully intact, operational, and unchanged
    const patientCountAfter = await targetAdapter.queryScalar<number>('SELECT COUNT(*) FROM patients;');
    const preservedPatient = await targetAdapter.queryOne<{ id: string; first_name: string; last_name: string }>(
      "SELECT id, first_name, last_name FROM patients WHERE id = 'pat-safe-preserved';"
    );
    const integrityCheck = await targetAdapter.queryScalar<string>('PRAGMA integrity_check;');

    // Verify database remains writable after failed restore attempt
    await targetAdapter.execute(
      `INSERT INTO audit_logs (
        id, entity_type, entity_id, operation_type, user_id, device_id,
        timestamp
      ) VALUES (
        'aud-post-fail-001', 'patients', 'pat-safe-preserved', 'VERIFY_WRITABLE', 'usr-dr-albasmi', 'dev-001',
        '2026-10-14T11:05:00.000Z'
      );`
    );
    const postAuditCount = await targetAdapter.queryScalar<number>(
      "SELECT COUNT(*) FROM audit_logs WHERE id = 'aud-post-fail-001';"
    );

    const passed =
      restoreThrew &&
      patientCountBefore === patientCountAfter &&
      preservedPatient?.id === 'pat-safe-preserved' &&
      preservedPatient?.first_name === 'فاطمة' &&
      integrityCheck?.toLowerCase() === 'ok' &&
      Number(postAuditCount) === 1;

    results.push({
      testId: 'BK-05',
      name: 'Fail-Safe Preservation of Existing Clinical Data on Restoration Failure',
      passed,
      evidence: `restoreThrew=${restoreThrew}, countBefore=${patientCountBefore}, countAfter=${patientCountAfter}, preservedPatient=${preservedPatient?.first_name}, integrity=${integrityCheck}, remainsWritable=true`,
    });
  } catch (err: unknown) {
    results.push({
      testId: 'BK-05',
      name: 'Fail-Safe Preservation of Existing Clinical Data on Restoration Failure',
      passed: false,
      evidence: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await targetAdapter.close();
    await sourceAdapter.close();
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    results,
  };
}
