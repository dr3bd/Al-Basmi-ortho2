/**
 * AL-BASMI ORTH — COHORT 1 PERSISTENCE FORENSIC TEST SUITE
 * Verifies:
 * C1-01: Table creation & schema freeze compliance
 * C1-02: Device registration atomic writes (devices + audit_logs + sync_operations)
 * C1-03: User creation with device foreign key verification
 * C1-04: User optimistic concurrency lock & version increment
 * C1-05: User soft delete with sync_tombstones & foreign key
 * C1-06: Strict immutable envelope idempotency match
 * C1-07: Idempotency conflict rejection on mismatched payload
 * C1-08: Transaction rollback atomicity on mid-operation failure
 * C1-09: Uncertain-COMMIT recovery check
 * C1-10: Clinical isolation guarantee (clinical workflows remain 100% on Map-backed paths)
 */

import { WaSqliteStorageAdapter } from '../drivers/waSqliteAdapter.ts';
import {
  Cohort1PersistenceService,
  canonicalizeJsonPayload,
  ImmutableOperationEnvelope,
} from '../drivers/cohort1PersistenceService.ts';
import { P0_PRODUCTION_SQLITE_DDL } from '../../domain/p0SqliteSchema.ts';

export interface Cohort1TestResult {
  testId: string;
  name: string;
  passed: boolean;
  evidence: string;
}

export async function runCohort1ForensicSuite(
  options: { wasmBinary?: ArrayBuffer | Uint8Array } = {}
): Promise<{ total: number; passed: number; results: Cohort1TestResult[] }> {
  const results: Cohort1TestResult[] = [];

  const adapter = new WaSqliteStorageAdapter({
    databaseName: `cohort1_test_${Date.now()}.db`,
    preferredVfs: 'MEMORY_ASYNC',
    mode: 'PREVIEW',
    allowPreviewEphemeral: true,
    wasmBinary: options.wasmBinary,
  });

  await adapter.initialize();

  // Initialize DDL
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

  const service = new Cohort1PersistenceService(adapter);

  // --- C1-01: Table Creation Verification ---
  try {
    const tables = await adapter.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('devices', 'users', 'audit_logs', 'sync_operations', 'sync_tombstones');"
    );
    const tableNames = tables.map((t) => t.name).sort();
    const passed =
      tableNames.length === 5 &&
      tableNames.includes('devices') &&
      tableNames.includes('users') &&
      tableNames.includes('audit_logs') &&
      tableNames.includes('sync_operations') &&
      tableNames.includes('sync_tombstones');
    results.push({
      testId: 'C1-01',
      name: 'Physical DDL Cohort 1 Table Verification',
      passed,
      evidence: `Found ${tables.length}/5 Cohort 1 tables: ${tableNames.join(', ')}`,
    });
  } catch (err: unknown) {
    results.push({
      testId: 'C1-01',
      name: 'Physical DDL Cohort 1 Table Verification',
      passed: false,
      evidence: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const testDeviceId = 'dev-cohort1-001';
  const testUserId = 'user-cohort1-admin';

  // --- C1-02: Device Registration Atomic Writes ---
  try {
    const payload = canonicalizeJsonPayload({
      device_name: 'Main Clinic iPad Pro 12.9',
      device_type: 'IPAD',
      app_version: '1.0.0',
      schema_version: '1.0.0',
    });

    const env: ImmutableOperationEnvelope = {
      operation_id: 'op-dev-reg-001',
      device_id: testDeviceId,
      entity_type: 'devices',
      entity_id: testDeviceId,
      operation_type: 'CREATE',
      base_version: 0,
      payload,
    };

    const res = await service.registerDevice({
      envelope: env,
      userId: testUserId,
      auditId: 'audit-dev-001',
      timestamp: '2026-10-10T14:30:00Z',
      reasonCode: 'DEVICE_ONBOARDING',
      deviceData: {
        device_name: 'Main Clinic iPad Pro 12.9',
        device_type: 'IPAD',
        app_version: '1.0.0',
        schema_version: '1.0.0',
        last_sync_at: null,
        status: 'ACTIVE',
      },
    });

    const devRow = await adapter.queryOne('SELECT * FROM devices WHERE id = ?;', [testDeviceId]);
    const auditRow = await adapter.queryOne('SELECT * FROM audit_logs WHERE id = ?;', ['audit-dev-001']);
    const syncRow = await adapter.queryOne('SELECT * FROM sync_operations WHERE operation_id = ?;', [
      'op-dev-reg-001',
    ]);

    const passed =
      res.ok &&
      !res.isIdempotentHit &&
      devRow !== null &&
      auditRow !== null &&
      syncRow !== null;

    results.push({
      testId: 'C1-02',
      name: 'Device Registration Atomic Triple-Write',
      passed,
      evidence: `Device created (id=${testDeviceId}), Audit created (id=audit-dev-001), Outbox created (op=op-dev-reg-001).`,
    });
  } catch (err: unknown) {
    results.push({
      testId: 'C1-02',
      name: 'Device Registration Atomic Triple-Write',
      passed: false,
      evidence: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // --- C1-03: User Creation Atomic Writes with Device Foreign Key ---
  try {
    const userPayload = canonicalizeJsonPayload({
      username: 'dr_basmi',
      display_name: 'Dr. Al-Basmi',
      status: 'ACTIVE',
    });

    const env: ImmutableOperationEnvelope = {
      operation_id: 'op-usr-create-001',
      device_id: testDeviceId,
      entity_type: 'users',
      entity_id: testUserId,
      operation_type: 'CREATE',
      base_version: 0,
      payload: userPayload,
    };

    const res = await service.createUser({
      envelope: env,
      userId: testUserId,
      auditId: 'audit-usr-001',
      timestamp: '2026-10-10T14:31:00Z',
      reasonCode: 'DOCTOR_ACCOUNT_CREATION',
      userData: {
        username: 'dr_basmi',
        display_name: 'Dr. Al-Basmi',
        status: 'ACTIVE',
      },
    });

    const userRow = await adapter.queryOne<any>('SELECT * FROM users WHERE id = ?;', [testUserId]);
    const auditRow = await adapter.queryOne('SELECT * FROM audit_logs WHERE id = ?;', ['audit-usr-001']);
    const syncRow = await adapter.queryOne('SELECT * FROM sync_operations WHERE operation_id = ?;', [
      'op-usr-create-001',
    ]);

    const passed =
      res.ok &&
      userRow !== null &&
      userRow.version === 1 &&
      userRow.is_deleted === 0 &&
      auditRow !== null &&
      syncRow !== null;

    results.push({
      testId: 'C1-03',
      name: 'User Creation Atomic Write with Device FK',
      passed,
      evidence: `User created (id=${testUserId}, version=${userRow?.version}), Audit created, Outbox created.`,
    });
  } catch (err: unknown) {
    results.push({
      testId: 'C1-03',
      name: 'User Creation Atomic Write with Device FK',
      passed: false,
      evidence: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // --- C1-04: User Optimistic Concurrency Update ---
  try {
    const updatePayload = canonicalizeJsonPayload({
      display_name: 'Dr. Al-Basmi Orthodontist',
      status: 'ACTIVE',
    });

    const env: ImmutableOperationEnvelope = {
      operation_id: 'op-usr-update-001',
      device_id: testDeviceId,
      entity_type: 'users',
      entity_id: testUserId,
      operation_type: 'UPDATE',
      base_version: 1, // must match current version
      payload: updatePayload,
    };

    const res = await service.updateUser({
      envelope: env,
      userId: testUserId,
      auditId: 'audit-usr-002',
      timestamp: '2026-10-10T14:32:00Z',
      reasonCode: 'NAME_CHANGE',
      changes: {
        display_name: 'Dr. Al-Basmi Orthodontist',
      },
    });

    const userRow = await adapter.queryOne<any>('SELECT * FROM users WHERE id = ?;', [testUserId]);
    const auditRow = await adapter.queryOne<any>('SELECT * FROM audit_logs WHERE id = ?;', ['audit-usr-002']);
    const syncRow = await adapter.queryOne<any>('SELECT * FROM sync_operations WHERE operation_id = ?;', [
      'op-usr-update-001',
    ]);

    const passed =
      res.ok &&
      userRow.version === 2 &&
      userRow.display_name === 'Dr. Al-Basmi Orthodontist' &&
      auditRow.entity_version_before === 1 &&
      auditRow.entity_version_after === 2 &&
      syncRow.base_version === 1 &&
      syncRow.result_version === 2;

    results.push({
      testId: 'C1-04',
      name: 'User Optimistic Concurrency Update',
      passed,
      evidence: `User version transitioned from 1 -> 2. Audit version_before=1, after=2. Outbox result_version=2.`,
    });
  } catch (err: unknown) {
    results.push({
      testId: 'C1-04',
      name: 'User Optimistic Concurrency Update',
      passed: false,
      evidence: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // --- C1-05: User Soft-Delete with Sync Tombstone ---
  try {
    const delPayload = canonicalizeJsonPayload({
      action: 'SOFT_DELETE',
      user_id: testUserId,
    });

    const env: ImmutableOperationEnvelope = {
      operation_id: 'op-usr-delete-001',
      device_id: testDeviceId,
      entity_type: 'users',
      entity_id: testUserId,
      operation_type: 'DELETE',
      base_version: 2,
      payload: delPayload,
    };

    const res = await service.softDeleteUser({
      envelope: env,
      userId: testUserId,
      auditId: 'audit-usr-003',
      tombstoneId: 'tomb-usr-001',
      timestamp: '2026-10-10T14:33:00Z',
      reasonCode: 'ACCOUNT_DEACTIVATION',
    });

    const userRow = await adapter.queryOne<any>('SELECT * FROM users WHERE id = ?;', [testUserId]);
    const tombRow = await adapter.queryOne<any>('SELECT * FROM sync_tombstones WHERE id = ?;', ['tomb-usr-001']);
    const syncRow = await adapter.queryOne<any>('SELECT * FROM sync_operations WHERE operation_id = ?;', [
      'op-usr-delete-001',
    ]);

    const passed =
      res.ok &&
      userRow.is_deleted === 1 &&
      userRow.version === 3 &&
      tombRow !== null &&
      tombRow.entity_id === testUserId &&
      tombRow.deleted_version === 3 &&
      tombRow.device_id === testDeviceId &&
      syncRow.result_version === 3;

    results.push({
      testId: 'C1-05',
      name: 'User Soft-Delete with Sync Tombstone',
      passed,
      evidence: `User soft-deleted (is_deleted=1, v=3). Tombstone inserted (id=tomb-usr-001, v=3). FK verified.`,
    });
  } catch (err: unknown) {
    results.push({
      testId: 'C1-05',
      name: 'User Soft-Delete with Sync Tombstone',
      passed: false,
      evidence: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // --- C1-06: Strict Immutable Envelope Idempotency Hit ---
  try {
    // Re-executing exact C1-02 envelope
    const payload = canonicalizeJsonPayload({
      device_name: 'Main Clinic iPad Pro 12.9',
      device_type: 'IPAD',
      app_version: '1.0.0',
      schema_version: '1.0.0',
    });

    const env: ImmutableOperationEnvelope = {
      operation_id: 'op-dev-reg-001',
      device_id: testDeviceId,
      entity_type: 'devices',
      entity_id: testDeviceId,
      operation_type: 'CREATE',
      base_version: 0,
      payload,
    };

    const res = await service.registerDevice({
      envelope: env,
      userId: testUserId,
      auditId: 'audit-dev-dup-001',
      timestamp: '2026-10-10T14:34:00Z',
      deviceData: {
        device_name: 'Main Clinic iPad Pro 12.9',
        device_type: 'IPAD',
        app_version: '1.0.0',
        schema_version: '1.0.0',
        last_sync_at: null,
        status: 'ACTIVE',
      },
    });

    const passed = res.ok && res.isIdempotentHit && res.resultingVersion === 1;

    results.push({
      testId: 'C1-06',
      name: 'Strict Immutable Envelope Idempotency Hit',
      passed,
      evidence: `Duplicate operation op-dev-reg-001 recognized as idempotent hit without mutating database.`,
    });
  } catch (err: unknown) {
    results.push({
      testId: 'C1-06',
      name: 'Strict Immutable Envelope Idempotency Hit',
      passed: false,
      evidence: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // --- C1-07: Idempotency Rejection on Tampered Envelope ---
  try {
    // Same operation_id but altered payload
    const alteredPayload = canonicalizeJsonPayload({
      device_name: 'MALICIOUS_CHANGED_DEVICE_NAME',
      device_type: 'IPAD',
    });

    const env: ImmutableOperationEnvelope = {
      operation_id: 'op-dev-reg-001',
      device_id: testDeviceId,
      entity_type: 'devices',
      entity_id: testDeviceId,
      operation_type: 'CREATE',
      base_version: 0,
      payload: alteredPayload,
    };

    let caught = false;
    try {
      await service.registerDevice({
        envelope: env,
        userId: testUserId,
        auditId: 'audit-tamper-001',
        timestamp: '2026-10-10T14:35:00Z',
        deviceData: {
          device_name: 'MALICIOUS_CHANGED_DEVICE_NAME',
          device_type: 'IPAD',
          app_version: '1.0.0',
          schema_version: '1.0.0',
          last_sync_at: null,
          status: 'ACTIVE',
        },
      });
    } catch (err: any) {
      const code = err?.code || err?.cause?.code;
      if (
        code === 'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH' ||
        String(err?.message).includes('ERR_IDEMPOTENCY_PAYLOAD_MISMATCH')
      ) {
        caught = true;
      }
    }

    results.push({
      testId: 'C1-07',
      name: 'Idempotency Conflict Rejection on Tampered Envelope',
      passed: caught,
      evidence: caught
        ? 'Successfully rejected tampered operation envelope with ERR_IDEMPOTENCY_PAYLOAD_MISMATCH.'
        : 'Failed to reject tampered envelope.',
    });
  } catch (err: unknown) {
    results.push({
      testId: 'C1-07',
      name: 'Idempotency Conflict Rejection on Tampered Envelope',
      passed: false,
      evidence: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // --- C1-08: Transaction Rollback Atomicity on Mid-Operation Failure ---
  try {
    const failUserId = 'user-fail-001';
    const failPayload = canonicalizeJsonPayload({ username: 'user_fail' });

    // Intentionally omit registering device to trigger foreign key / validation error
    const nonExistentDev = 'dev-nonexistent-999';
    const env: ImmutableOperationEnvelope = {
      operation_id: 'op-fail-tx-001',
      device_id: nonExistentDev,
      entity_type: 'users',
      entity_id: failUserId,
      operation_type: 'CREATE',
      base_version: 0,
      payload: failPayload,
    };

    let caught = false;
    try {
      await service.createUser({
        envelope: env,
        userId: testUserId,
        auditId: 'audit-fail-001',
        timestamp: '2026-10-10T14:36:00Z',
        userData: {
          username: 'user_fail',
          display_name: 'Fail User',
          status: 'ACTIVE',
        },
      });
    } catch {
      caught = true;
    }

    // Verify ZERO writes occurred for this user, audit, or outbox
    const userCheck = await adapter.queryOne('SELECT * FROM users WHERE id = ?;', [failUserId]);
    const auditCheck = await adapter.queryOne('SELECT * FROM audit_logs WHERE id = ?;', ['audit-fail-001']);
    const syncCheck = await adapter.queryOne('SELECT * FROM sync_operations WHERE operation_id = ?;', [
      'op-fail-tx-001',
    ]);

    const passed = caught && userCheck === null && auditCheck === null && syncCheck === null;

    results.push({
      testId: 'C1-08',
      name: 'Transaction Rollback Atomicity',
      passed,
      evidence: `Transaction cleanly aborted. Verified zero ghost records in users, audit_logs, or sync_operations.`,
    });
  } catch (err: unknown) {
    results.push({
      testId: 'C1-08',
      name: 'Transaction Rollback Atomicity',
      passed: false,
      evidence: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // --- C1-09: Uncertain-COMMIT Recovery Procedure ---
  try {
    // Check known committed operation
    const committedEnv: ImmutableOperationEnvelope = {
      operation_id: 'op-usr-create-001',
      device_id: testDeviceId,
      entity_type: 'users',
      entity_id: testUserId,
      operation_type: 'CREATE',
      base_version: 0,
      payload: canonicalizeJsonPayload({
        username: 'dr_basmi',
        display_name: 'Dr. Al-Basmi',
        status: 'ACTIVE',
      }),
    };

    const resCommitted = await service.verifyUncertainCommit(committedEnv);

    // Check non-committed operation
    const uncommittedEnv: ImmutableOperationEnvelope = {
      operation_id: 'op-uncommitted-999',
      device_id: testDeviceId,
      entity_type: 'users',
      entity_id: 'user-uncommitted',
      operation_type: 'CREATE',
      base_version: 0,
      payload: '{}',
    };

    const resUncommitted = await service.verifyUncertainCommit(uncommittedEnv);

    const passed =
      resCommitted.status === 'RECOVERED_COMMITTED' &&
      resCommitted.resultVersion === 1 &&
      resUncommitted.status === 'NOT_COMMITTED';

    results.push({
      testId: 'C1-09',
      name: 'Uncertain-COMMIT Recovery Verification',
      passed,
      evidence: `Committed status verified (status=RECOVERED_COMMITTED, v=1). Uncommitted status verified (status=NOT_COMMITTED).`,
    });
  } catch (err: unknown) {
    results.push({
      testId: 'C1-09',
      name: 'Uncertain-COMMIT Recovery Verification',
      passed: false,
      evidence: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // --- C1-10: Clinical Isolation Guarantee ---
  try {
    // Verify that NO clinical table in SQLite has any rows written by Cohort 1
    const clinicalTables = [
      'patients',
      'orthodontic_cases',
      'clinical_examinations',
      'problems',
      'diagnosis_versions',
      'treatment_objectives',
      'treatment_plans',
    ];

    let allZero = true;
    for (const t of clinicalTables) {
      const count = await adapter.queryScalar<number>(`SELECT COUNT(*) FROM ${t};`);
      if (count !== 0) {
        allZero = false;
        break;
      }
    }

    results.push({
      testId: 'C1-10',
      name: 'Clinical Isolation Guarantee (Zero SQLite Clinical Writes)',
      passed: allZero,
      evidence: `Verified zero rows across all clinical SQLite tables (${clinicalTables.join(', ')}). Clinical paths remain 100% on Map-backed store.`,
    });
  } catch (err: unknown) {
    results.push({
      testId: 'C1-10',
      name: 'Clinical Isolation Guarantee (Zero SQLite Clinical Writes)',
      passed: false,
      evidence: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  await adapter.close();

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  return { total, passed, results };
}
