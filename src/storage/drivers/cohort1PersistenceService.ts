/**
 * ORTHODONTIC CLINICAL PLATFORM
 * COHORT 1 INFRASTRUCTURE PERSISTENCE CONTRACT v1.0
 * 
 * Scope: Strictly Infrastructure Tables:
 * - devices
 * - users
 * - audit_logs
 * - sync_operations
 * - sync_tombstones
 * 
 * Baselines:
 * - SCHEMA_FREEZE_v1.0 (Immutable, src/domain/p0SqliteSchema.ts)
 * - PERSISTENCE_ADAPTER_CONTRACT_v1.0 (src/storage/types/storageAdapter.ts)
 * 
 * Clinical Isolation Guarantee:
 * - Zero clinical writes to SQLite.
 * - All clinical entities (patients, cases, examinations, problems, diagnoses, etc.)
 *   remain 100% on their existing Map-backed atomic paths.
 * - Zero cross-engine distributed transaction or fallback.
 */

import {
  SqliteDeviceRow,
  SqliteUserRow,
  SqliteAuditLogRow,
  SqliteSyncOperationRow,
  SqliteSyncTombstoneRow,
} from '../../domain/p0SqliteSchema.ts';
import {
  ISqliteStorageAdapter,
  ISqliteTransactionContext,
  SqlExecutionResult,
  SqliteParams,
} from '../types/storageAdapter.ts';

// ============================================================================
// 1. COMMON EXECUTOR INTERFACE (Transaction Context Boundary)
// ============================================================================

/**
 * Unified execution boundary that both ISqliteStorageAdapter and ISqliteTransactionContext satisfy.
 * Repositories execute queries against this interface, preventing accidental mutex reacquisition.
 */
export interface ISqliteExecutor {
  execute(sql: string, params?: SqliteParams): Promise<SqlExecutionResult>;
  query<T = Record<string, unknown>>(sql: string, params?: SqliteParams): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: SqliteParams): Promise<T | null>;
  queryScalar<T = unknown>(sql: string, params?: SqliteParams): Promise<T | null>;
}

// ============================================================================
// 2. ERROR CODES & STRUCTURED ERROR CONTRACT
// ============================================================================

export type Cohort1ErrorCode =
  | 'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH'
  | 'ERR_DEVICE_NOT_FOUND'
  | 'ERR_DEVICE_ALREADY_EXISTS'
  | 'ERR_USER_NOT_FOUND'
  | 'ERR_USER_ALREADY_EXISTS'
  | 'ERR_USER_VERSION_CONFLICT'
  | 'ERR_IMMUTABLE_LOG_MUTATION_PROHIBITED'
  | 'ERR_TOMBSTONE_ALREADY_EXISTS'
  | 'ERR_UNCERTAIN_COMMIT_VERIFICATION_FAILED'
  | 'ERR_INVALID_OPERATION_TYPE';

export class Cohort1PersistenceError extends Error {
  constructor(
    public readonly code: Cohort1ErrorCode,
    message: string,
    public readonly entityType?: string,
    public readonly entityId?: string,
    public readonly operationId?: string
  ) {
    super(`[${code}] ${message}`);
    this.name = 'Cohort1PersistenceError';
  }
}

// ============================================================================
// 3. CANONICAL ENVELOPE & IDEMPOTENCY SPECIFICATION
// ============================================================================

export interface ImmutableOperationEnvelope {
  operation_id: string;
  device_id: string;
  entity_type: string;
  entity_id: string;
  operation_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  base_version: number;
  payload: string; // Deterministically canonical JSON string
}

/**
 * Produces deterministic, sorted-key JSON serialization without whitespace.
 */
export function canonicalizeJsonPayload(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeJsonPayload).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalizeJsonPayload((obj as Record<string, unknown>)[k])}`
  );
  return '{' + pairs.join(',') + '}';
}

// ============================================================================
// 4. INFRASTRUCTURE REPOSITORIES
// ============================================================================

/**
 * Device Repository (devices table)
 */
export class SqliteDeviceRepository {
  public async getById(executor: ISqliteExecutor, id: string): Promise<SqliteDeviceRow | null> {
    return executor.queryOne<SqliteDeviceRow>('SELECT * FROM devices WHERE id = ?;', [id]);
  }

  public async insert(executor: ISqliteExecutor, device: SqliteDeviceRow): Promise<void> {
    await executor.execute(
      `INSERT INTO devices (id, device_name, device_type, app_version, schema_version, last_sync_at, created_at, updated_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        device.id,
        device.device_name,
        device.device_type,
        device.app_version ?? null,
        device.schema_version ?? null,
        device.last_sync_at ?? null,
        device.created_at,
        device.updated_at,
        device.status,
      ]
    );
  }

  public async updateLastSync(
    executor: ISqliteExecutor,
    id: string,
    lastSyncAt: string,
    updatedAt: string
  ): Promise<void> {
    await executor.execute(
      `UPDATE devices SET last_sync_at = ?, updated_at = ? WHERE id = ?;`,
      [lastSyncAt, updatedAt, id]
    );
  }
}

/**
 * User Repository (users table)
 */
export class SqliteUserRepository {
  public async getById(executor: ISqliteExecutor, id: string): Promise<SqliteUserRow | null> {
    return executor.queryOne<SqliteUserRow>('SELECT * FROM users WHERE id = ?;', [id]);
  }

  public async getByUsername(executor: ISqliteExecutor, username: string): Promise<SqliteUserRow | null> {
    return executor.queryOne<SqliteUserRow>('SELECT * FROM users WHERE username = ?;', [username]);
  }

  public async insert(executor: ISqliteExecutor, user: SqliteUserRow): Promise<void> {
    await executor.execute(
      `INSERT INTO users (id, username, display_name, status, created_at, updated_at, version, is_deleted, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        user.id,
        user.username,
        user.display_name,
        user.status,
        user.created_at,
        user.updated_at,
        user.version,
        user.is_deleted,
        user.deleted_at ?? null,
      ]
    );
  }

  public async updateWithOptimisticLock(
    executor: ISqliteExecutor,
    id: string,
    expectedVersion: number,
    changes: {
      display_name?: string;
      status?: 'ACTIVE' | 'INACTIVE';
      updated_at: string;
    }
  ): Promise<number> {
    const nextVersion = expectedVersion + 1;
    let sql = 'UPDATE users SET version = ?, updated_at = ?';
    const params: SqliteParams = [nextVersion, changes.updated_at];

    if (changes.display_name !== undefined) {
      sql += ', display_name = ?';
      (params as unknown[]).push(changes.display_name);
    }
    if (changes.status !== undefined) {
      sql += ', status = ?';
      (params as unknown[]).push(changes.status);
    }

    sql += ' WHERE id = ? AND version = ? AND is_deleted = 0;';
    (params as unknown[]).push(id, expectedVersion);

    const res = await executor.execute(sql, params);
    return res.changes;
  }

  public async softDelete(
    executor: ISqliteExecutor,
    id: string,
    expectedVersion: number,
    deletedAt: string
  ): Promise<number> {
    const nextVersion = expectedVersion + 1;
    const res = await executor.execute(
      `UPDATE users SET is_deleted = 1, deleted_at = ?, version = ?, updated_at = ?
       WHERE id = ? AND version = ? AND is_deleted = 0;`,
      [deletedAt, nextVersion, deletedAt, id, expectedVersion]
    );
    return res.changes;
  }
}

/**
 * Append-Only Audit Log Repository (audit_logs table)
 */
export class SqliteAuditLogRepository {
  public async insert(executor: ISqliteExecutor, log: SqliteAuditLogRow): Promise<void> {
    await executor.execute(
      `INSERT INTO audit_logs (id, entity_type, entity_id, operation_type, user_id, device_id, timestamp, entity_version_before, entity_version_after, old_payload, new_payload, reason_code, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        log.id,
        log.entity_type,
        log.entity_id,
        log.operation_type,
        log.user_id,
        log.device_id,
        log.timestamp,
        log.entity_version_before ?? null,
        log.entity_version_after ?? null,
        log.old_payload ?? null,
        log.new_payload ?? null,
        log.reason_code ?? null,
        log.metadata_json ?? null,
      ]
    );
  }

  public async getById(executor: ISqliteExecutor, id: string): Promise<SqliteAuditLogRow | null> {
    return executor.queryOne<SqliteAuditLogRow>('SELECT * FROM audit_logs WHERE id = ?;', [id]);
  }

  public async listByEntity(
    executor: ISqliteExecutor,
    entityType: string,
    entityId: string
  ): Promise<SqliteAuditLogRow[]> {
    return executor.query<SqliteAuditLogRow>(
      'SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY timestamp ASC;',
      [entityType, entityId]
    );
  }
}

/**
 * Sync Operations Outbox Repository (sync_operations table)
 */
export class SqliteSyncOperationRepository {
  public async getByOperationId(
    executor: ISqliteExecutor,
    operationId: string
  ): Promise<SqliteSyncOperationRow | null> {
    return executor.queryOne<SqliteSyncOperationRow>(
      'SELECT * FROM sync_operations WHERE operation_id = ?;',
      [operationId]
    );
  }

  public async insert(executor: ISqliteExecutor, op: SqliteSyncOperationRow): Promise<void> {
    await executor.execute(
      `INSERT INTO sync_operations (operation_id, device_id, entity_type, entity_id, operation_type, base_version, result_version, payload, created_at, sync_status, retry_count, error_code, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        op.operation_id,
        op.device_id,
        op.entity_type,
        op.entity_id,
        op.operation_type,
        op.base_version,
        op.result_version,
        op.payload,
        op.created_at,
        op.sync_status,
        op.retry_count,
        op.error_code ?? null,
        op.error_message ?? null,
      ]
    );
  }

  public async markSynced(executor: ISqliteExecutor, operationId: string): Promise<void> {
    await executor.execute(
      `UPDATE sync_operations SET sync_status = 'SYNCED' WHERE operation_id = ?;`,
      [operationId]
    );
  }

  public async markFailed(
    executor: ISqliteExecutor,
    operationId: string,
    errorCode: string,
    errorMessage: string
  ): Promise<void> {
    await executor.execute(
      `UPDATE sync_operations SET sync_status = 'FAILED', retry_count = retry_count + 1, error_code = ?, error_message = ? WHERE operation_id = ?;`,
      [errorCode, errorMessage, operationId]
    );
  }
}

/**
 * Sync Tombstone Repository (sync_tombstones table)
 */
export class SqliteSyncTombstoneRepository {
  public async getByEntity(
    executor: ISqliteExecutor,
    entityType: string,
    entityId: string
  ): Promise<SqliteSyncTombstoneRow | null> {
    return executor.queryOne<SqliteSyncTombstoneRow>(
      'SELECT * FROM sync_tombstones WHERE entity_type = ? AND entity_id = ?;',
      [entityType, entityId]
    );
  }

  public async insert(executor: ISqliteExecutor, tombstone: SqliteSyncTombstoneRow): Promise<void> {
    await executor.execute(
      `INSERT INTO sync_tombstones (id, entity_type, entity_id, deleted_version, deleted_at, deleted_by, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        tombstone.id,
        tombstone.entity_type,
        tombstone.entity_id,
        tombstone.deleted_version,
        tombstone.deleted_at,
        tombstone.deleted_by ?? null,
        tombstone.device_id,
      ]
    );
  }
}

// ============================================================================
// 5. UNIFIED ATOMIC INFRASTRUCTURE TRANSACTION ORCHESTRATOR
// ============================================================================

export interface InfrastructureOperationParams {
  envelope: ImmutableOperationEnvelope;
  userId: string;
  auditId: string;
  timestamp: string;
  auditMetadataJson?: string;
  reasonCode?: string;
}

export interface RegisterDeviceParams extends InfrastructureOperationParams {
  deviceData: Omit<SqliteDeviceRow, 'id' | 'created_at' | 'updated_at'>;
}

export interface CreateUserParams extends InfrastructureOperationParams {
  userData: Omit<SqliteUserRow, 'id' | 'created_at' | 'updated_at' | 'version' | 'is_deleted' | 'deleted_at'>;
}

export interface UpdateUserParams extends InfrastructureOperationParams {
  changes: {
    display_name?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  };
}

export interface SoftDeleteUserParams extends InfrastructureOperationParams {
  tombstoneId: string;
}

export interface InfrastructureOperationResult {
  ok: boolean;
  isIdempotentHit: boolean;
  entityId: string;
  resultingVersion: number;
  syncOperationId: string;
  auditLogId: string;
}

/**
 * Atomic Orchestrator for Cohort 1 Infrastructure Persistence.
 * Enforces:
 * 1. Exact immutable envelope idempotency check.
 * 2. Device foreign key existence check.
 * 3. Atomic single-transaction mutation (Entity + Audit Log + Sync Outbox + [Tombstone]).
 * 4. Zero call to root adapter inside active tx callback.
 */
export class Cohort1PersistenceService {
  private deviceRepo = new SqliteDeviceRepository();
  private userRepo = new SqliteUserRepository();
  private auditRepo = new SqliteAuditLogRepository();
  private syncRepo = new SqliteSyncOperationRepository();
  private tombstoneRepo = new SqliteSyncTombstoneRepository();

  constructor(private adapter: ISqliteStorageAdapter) {}

  /**
   * Idempotency Guard: Checks if operation_id exists.
   * If exists, compares every immutable field:
   * (device_id, entity_type, entity_id, operation_type, base_version, canonical payload).
   * Rejects immediately if ANY field differs.
   */
  private async checkIdempotency(
    executor: ISqliteExecutor,
    env: ImmutableOperationEnvelope
  ): Promise<{ isHit: boolean; existingOp: SqliteSyncOperationRow | null }> {
    const existing = await this.syncRepo.getByOperationId(executor, env.operation_id);
    if (!existing) {
      return { isHit: false, existingOp: null };
    }

    const payloadMatches =
      existing.payload === env.payload ||
      canonicalizeJsonPayload(JSON.parse(existing.payload)) === canonicalizeJsonPayload(JSON.parse(env.payload));

    const matches =
      existing.device_id === env.device_id &&
      existing.entity_type === env.entity_type &&
      existing.entity_id === env.entity_id &&
      existing.operation_type === env.operation_type &&
      existing.base_version === env.base_version &&
      payloadMatches;

    if (!matches) {
      throw new Cohort1PersistenceError(
        'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
        `Operation ID ${env.operation_id} was previously executed with a different immutable envelope. Resubmission rejected.`,
        env.entity_type,
        env.entity_id,
        env.operation_id
      );
    }

    return { isHit: true, existingOp: existing };
  }

  /**
   * Registers a new device record atomically with its audit and outbox entry.
   */
  public async registerDevice(params: RegisterDeviceParams): Promise<InfrastructureOperationResult> {
    return this.adapter.transaction('IMMEDIATE', async (tx: ISqliteTransactionContext) => {
      // 1. Idempotency Check
      const idemp = await this.checkIdempotency(tx, params.envelope);
      if (idemp.isHit && idemp.existingOp) {
        return {
          ok: true,
          isIdempotentHit: true,
          entityId: params.envelope.entity_id,
          resultingVersion: idemp.existingOp.result_version,
          syncOperationId: params.envelope.operation_id,
          auditLogId: params.auditId,
        };
      }

      // 2. Validate device does not exist
      const existingDevice = await this.deviceRepo.getById(tx, params.envelope.entity_id);
      if (existingDevice) {
        throw new Cohort1PersistenceError(
          'ERR_DEVICE_ALREADY_EXISTS',
          `Device ${params.envelope.entity_id} is already registered.`,
          'devices',
          params.envelope.entity_id,
          params.envelope.operation_id
        );
      }

      const deviceRow: SqliteDeviceRow = {
        id: params.envelope.entity_id,
        device_name: params.deviceData.device_name,
        device_type: params.deviceData.device_type,
        app_version: params.deviceData.app_version ?? null,
        schema_version: params.deviceData.schema_version ?? null,
        last_sync_at: params.deviceData.last_sync_at ?? null,
        created_at: params.timestamp,
        updated_at: params.timestamp,
        status: params.deviceData.status,
      };

      // 3. Insert device
      await this.deviceRepo.insert(tx, deviceRow);

      // 4. Insert audit log
      const auditRow: SqliteAuditLogRow = {
        id: params.auditId,
        entity_type: 'devices',
        entity_id: deviceRow.id,
        operation_type: 'CREATE',
        user_id: params.userId,
        device_id: params.envelope.device_id,
        timestamp: params.timestamp,
        entity_version_before: null,
        entity_version_after: 1,
        old_payload: null,
        new_payload: params.envelope.payload,
        reason_code: params.reasonCode ?? 'DEVICE_REGISTRATION',
        metadata_json: params.auditMetadataJson ?? null,
      };
      await this.auditRepo.insert(tx, auditRow);

      // 5. Insert sync outbox operation
      const syncRow: SqliteSyncOperationRow = {
        operation_id: params.envelope.operation_id,
        device_id: params.envelope.device_id,
        entity_type: 'devices',
        entity_id: deviceRow.id,
        operation_type: 'CREATE',
        base_version: 0,
        result_version: 1,
        payload: params.envelope.payload,
        created_at: params.timestamp,
        sync_status: 'PENDING',
        retry_count: 0,
        error_code: null,
        error_message: null,
      };
      await this.syncRepo.insert(tx, syncRow);

      return {
        ok: true,
        isIdempotentHit: false,
        entityId: deviceRow.id,
        resultingVersion: 1,
        syncOperationId: params.envelope.operation_id,
        auditLogId: params.auditId,
      };
    });
  }

  /**
   * Creates a user record atomically with its audit and outbox entry.
   */
  public async createUser(params: CreateUserParams): Promise<InfrastructureOperationResult> {
    return this.adapter.transaction('IMMEDIATE', async (tx: ISqliteTransactionContext) => {
      // 1. Idempotency Check
      const idemp = await this.checkIdempotency(tx, params.envelope);
      if (idemp.isHit && idemp.existingOp) {
        return {
          ok: true,
          isIdempotentHit: true,
          entityId: params.envelope.entity_id,
          resultingVersion: idemp.existingOp.result_version,
          syncOperationId: params.envelope.operation_id,
          auditLogId: params.auditId,
        };
      }

      // 2. Validate device exists (Foreign Key)
      const dev = await this.deviceRepo.getById(tx, params.envelope.device_id);
      if (!dev) {
        throw new Cohort1PersistenceError(
          'ERR_DEVICE_NOT_FOUND',
          `Device ${params.envelope.device_id} not registered. Cannot record user operation without registered device.`,
          'devices',
          params.envelope.device_id,
          params.envelope.operation_id
        );
      }

      // 3. Validate user does not exist
      const existingUser = await this.userRepo.getById(tx, params.envelope.entity_id);
      if (existingUser) {
        throw new Cohort1PersistenceError(
          'ERR_USER_ALREADY_EXISTS',
          `User ${params.envelope.entity_id} already exists.`,
          'users',
          params.envelope.entity_id,
          params.envelope.operation_id
        );
      }

      const dupUsername = await this.userRepo.getByUsername(tx, params.userData.username);
      if (dupUsername) {
        throw new Cohort1PersistenceError(
          'ERR_USER_ALREADY_EXISTS',
          `Username '${params.userData.username}' already in use.`,
          'users',
          dupUsername.id,
          params.envelope.operation_id
        );
      }

      const userRow: SqliteUserRow = {
        id: params.envelope.entity_id,
        username: params.userData.username,
        display_name: params.userData.display_name,
        status: params.userData.status,
        created_at: params.timestamp,
        updated_at: params.timestamp,
        version: 1,
        is_deleted: 0,
        deleted_at: null,
      };

      // 4. Insert user
      await this.userRepo.insert(tx, userRow);

      // 5. Insert audit log
      const auditRow: SqliteAuditLogRow = {
        id: params.auditId,
        entity_type: 'users',
        entity_id: userRow.id,
        operation_type: 'CREATE',
        user_id: params.userId,
        device_id: params.envelope.device_id,
        timestamp: params.timestamp,
        entity_version_before: null,
        entity_version_after: 1,
        old_payload: null,
        new_payload: params.envelope.payload,
        reason_code: params.reasonCode ?? 'USER_CREATION',
        metadata_json: params.auditMetadataJson ?? null,
      };
      await this.auditRepo.insert(tx, auditRow);

      // 6. Insert sync outbox
      const syncRow: SqliteSyncOperationRow = {
        operation_id: params.envelope.operation_id,
        device_id: params.envelope.device_id,
        entity_type: 'users',
        entity_id: userRow.id,
        operation_type: 'CREATE',
        base_version: 0,
        result_version: 1,
        payload: params.envelope.payload,
        created_at: params.timestamp,
        sync_status: 'PENDING',
        retry_count: 0,
        error_code: null,
        error_message: null,
      };
      await this.syncRepo.insert(tx, syncRow);

      return {
        ok: true,
        isIdempotentHit: false,
        entityId: userRow.id,
        resultingVersion: 1,
        syncOperationId: params.envelope.operation_id,
        auditLogId: params.auditId,
      };
    });
  }

  /**
   * Updates user record with optimistic concurrency lock atomically.
   */
  public async updateUser(params: UpdateUserParams): Promise<InfrastructureOperationResult> {
    return this.adapter.transaction('IMMEDIATE', async (tx: ISqliteTransactionContext) => {
      // 1. Idempotency Check
      const idemp = await this.checkIdempotency(tx, params.envelope);
      if (idemp.isHit && idemp.existingOp) {
        return {
          ok: true,
          isIdempotentHit: true,
          entityId: params.envelope.entity_id,
          resultingVersion: idemp.existingOp.result_version,
          syncOperationId: params.envelope.operation_id,
          auditLogId: params.auditId,
        };
      }

      // 2. Fetch current state
      const currentUser = await this.userRepo.getById(tx, params.envelope.entity_id);
      if (!currentUser) {
        throw new Cohort1PersistenceError(
          'ERR_USER_NOT_FOUND',
          `User ${params.envelope.entity_id} does not exist.`,
          'users',
          params.envelope.entity_id,
          params.envelope.operation_id
        );
      }

      if (currentUser.version !== params.envelope.base_version) {
        throw new Cohort1PersistenceError(
          'ERR_USER_VERSION_CONFLICT',
          `Optimistic lock failure: expected version ${params.envelope.base_version}, found ${currentUser.version}.`,
          'users',
          params.envelope.entity_id,
          params.envelope.operation_id
        );
      }

      const nextVersion = currentUser.version + 1;

      // 3. Perform update
      const affected = await this.userRepo.updateWithOptimisticLock(
        tx,
        currentUser.id,
        currentUser.version,
        {
          ...params.changes,
          updated_at: params.timestamp,
        }
      );

      if (affected === 0) {
        throw new Cohort1PersistenceError(
          'ERR_USER_VERSION_CONFLICT',
          `Concurrent update conflict on user ${currentUser.id}.`,
          'users',
          currentUser.id,
          params.envelope.operation_id
        );
      }

      // 4. Insert audit log
      const auditRow: SqliteAuditLogRow = {
        id: params.auditId,
        entity_type: 'users',
        entity_id: currentUser.id,
        operation_type: 'UPDATE',
        user_id: params.userId,
        device_id: params.envelope.device_id,
        timestamp: params.timestamp,
        entity_version_before: currentUser.version,
        entity_version_after: nextVersion,
        old_payload: canonicalizeJsonPayload({
          display_name: currentUser.display_name,
          status: currentUser.status,
        }),
        new_payload: params.envelope.payload,
        reason_code: params.reasonCode ?? 'USER_UPDATE',
        metadata_json: params.auditMetadataJson ?? null,
      };
      await this.auditRepo.insert(tx, auditRow);

      // 5. Insert sync outbox
      const syncRow: SqliteSyncOperationRow = {
        operation_id: params.envelope.operation_id,
        device_id: params.envelope.device_id,
        entity_type: 'users',
        entity_id: currentUser.id,
        operation_type: 'UPDATE',
        base_version: currentUser.version,
        result_version: nextVersion,
        payload: params.envelope.payload,
        created_at: params.timestamp,
        sync_status: 'PENDING',
        retry_count: 0,
        error_code: null,
        error_message: null,
      };
      await this.syncRepo.insert(tx, syncRow);

      return {
        ok: true,
        isIdempotentHit: false,
        entityId: currentUser.id,
        resultingVersion: nextVersion,
        syncOperationId: params.envelope.operation_id,
        auditLogId: params.auditId,
      };
    });
  }

  /**
   * Soft-deletes a user and atomically writes a sync tombstone, audit log, and sync operation.
   */
  public async softDeleteUser(params: SoftDeleteUserParams): Promise<InfrastructureOperationResult> {
    return this.adapter.transaction('IMMEDIATE', async (tx: ISqliteTransactionContext) => {
      // 1. Idempotency Check
      const idemp = await this.checkIdempotency(tx, params.envelope);
      if (idemp.isHit && idemp.existingOp) {
        return {
          ok: true,
          isIdempotentHit: true,
          entityId: params.envelope.entity_id,
          resultingVersion: idemp.existingOp.result_version,
          syncOperationId: params.envelope.operation_id,
          auditLogId: params.auditId,
        };
      }

      // 2. Fetch current state
      const currentUser = await this.userRepo.getById(tx, params.envelope.entity_id);
      if (!currentUser) {
        throw new Cohort1PersistenceError(
          'ERR_USER_NOT_FOUND',
          `User ${params.envelope.entity_id} does not exist.`,
          'users',
          params.envelope.entity_id,
          params.envelope.operation_id
        );
      }

      if (currentUser.version !== params.envelope.base_version) {
        throw new Cohort1PersistenceError(
          'ERR_USER_VERSION_CONFLICT',
          `Optimistic lock failure: expected version ${params.envelope.base_version}, found ${currentUser.version}.`,
          'users',
          params.envelope.entity_id,
          params.envelope.operation_id
        );
      }

      const nextVersion = currentUser.version + 1;

      // 3. Soft-delete user row
      const affected = await this.userRepo.softDelete(
        tx,
        currentUser.id,
        currentUser.version,
        params.timestamp
      );

      if (affected === 0) {
        throw new Cohort1PersistenceError(
          'ERR_USER_VERSION_CONFLICT',
          `Concurrent delete conflict on user ${currentUser.id}.`,
          'users',
          currentUser.id,
          params.envelope.operation_id
        );
      }

      // 4. Insert sync tombstone (devices foreign key enforced)
      const tombstoneRow: SqliteSyncTombstoneRow = {
        id: params.tombstoneId,
        entity_type: 'users',
        entity_id: currentUser.id,
        deleted_version: nextVersion,
        deleted_at: params.timestamp,
        deleted_by: params.userId,
        device_id: params.envelope.device_id,
      };
      await this.tombstoneRepo.insert(tx, tombstoneRow);

      // 5. Insert audit log
      const auditRow: SqliteAuditLogRow = {
        id: params.auditId,
        entity_type: 'users',
        entity_id: currentUser.id,
        operation_type: 'DELETE',
        user_id: params.userId,
        device_id: params.envelope.device_id,
        timestamp: params.timestamp,
        entity_version_before: currentUser.version,
        entity_version_after: nextVersion,
        old_payload: canonicalizeJsonPayload({
          status: currentUser.status,
          version: currentUser.version,
        }),
        new_payload: params.envelope.payload,
        reason_code: params.reasonCode ?? 'USER_DELETION',
        metadata_json: params.auditMetadataJson ?? null,
      };
      await this.auditRepo.insert(tx, auditRow);

      // 6. Insert sync outbox
      const syncRow: SqliteSyncOperationRow = {
        operation_id: params.envelope.operation_id,
        device_id: params.envelope.device_id,
        entity_type: 'users',
        entity_id: currentUser.id,
        operation_type: 'DELETE',
        base_version: currentUser.version,
        result_version: nextVersion,
        payload: params.envelope.payload,
        created_at: params.timestamp,
        sync_status: 'PENDING',
        retry_count: 0,
        error_code: null,
        error_message: null,
      };
      await this.syncRepo.insert(tx, syncRow);

      return {
        ok: true,
        isIdempotentHit: false,
        entityId: currentUser.id,
        resultingVersion: nextVersion,
        syncOperationId: params.envelope.operation_id,
        auditLogId: params.auditId,
      };
    });
  }

  /**
   * Deterministic Uncertain-COMMIT Recovery Procedure:
   * Called when a network/storage failure occurs during or immediately after COMMIT.
   * Checks whether the sync_operations table contains the operation_id.
   * If found and envelope matches, returns RECOVERED_COMMITTED without re-executing.
   * If not found, returns NOT_COMMITTED, indicating it is safe to retry.
   */
  public async verifyUncertainCommit(
    env: ImmutableOperationEnvelope
  ): Promise<{ status: 'RECOVERED_COMMITTED' | 'NOT_COMMITTED'; resultVersion?: number }> {
    const existing = await this.syncRepo.getByOperationId(this.adapter, env.operation_id);
    if (!existing) {
      return { status: 'NOT_COMMITTED' };
    }

    const payloadMatches =
      existing.payload === env.payload ||
      canonicalizeJsonPayload(JSON.parse(existing.payload)) === canonicalizeJsonPayload(JSON.parse(env.payload));

    const matches =
      existing.device_id === env.device_id &&
      existing.entity_type === env.entity_type &&
      existing.entity_id === env.entity_id &&
      existing.operation_type === env.operation_type &&
      existing.base_version === env.base_version &&
      payloadMatches;

    if (!matches) {
      throw new Cohort1PersistenceError(
        'ERR_UNCERTAIN_COMMIT_VERIFICATION_FAILED',
        `Uncertain commit verification found conflicting envelope for operation ${env.operation_id}.`,
        env.entity_type,
        env.entity_id,
        env.operation_id
      );
    }

    return {
      status: 'RECOVERED_COMMITTED',
      resultVersion: existing.result_version,
    };
  }
}
