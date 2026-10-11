/**
 * AL-BASMI ORTH — COHORT 2 PATIENT PERSISTENCE SERVICE
 * Scope: PHASE R2-A (Patient SQLite Integration Vertical Slice)
 *
 * Baselines & Frozen Authorities:
 * - SCHEMA_FREEZE_v1.0 (src/domain/p0SqliteSchema.ts)
 * - PERSISTENCE_ADAPTER_CONTRACT_v1.0 (src/storage/types/storageAdapter.ts)
 * - P2A Domain Boundary Contract (src/domain/p2aDomainBoundaryContract.ts)
 * - P2C Domain Validation Engine (src/domain/p2cDomainValidationEngine.ts)
 * - P2D Repository Contract (src/domain/p2dRepositoryContract.ts)
 *
 * Architecture Principles:
 * - Single authoritative storage: Physical SQLite via ISqliteStorageAdapter.
 * - Atomic transaction (IMMEDIATE): patients + audit_logs + sync_operations.
 * - Zero fallback to in-memory/localStorage shadow SSOT.
 * - Strict rollback and error propagation on any stage failure.
 */

import {
  SqlitePatientRow,
  SqliteAuditLogRow,
  SqliteSyncOperationRow,
} from '../../domain/p0SqliteSchema.ts';
import {
  ISqliteStorageAdapter,
  ISqliteTransactionContext,
  SqlExecutionResult,
  SqliteParams,
} from '../types/storageAdapter.ts';
import {
  ISqliteExecutor,
  canonicalizeJsonPayload,
  SqliteAuditLogRepository,
  SqliteSyncOperationRepository,
} from './cohort1PersistenceService.ts';
import {
  DomainValidationEngine,
  AuthoritativeValidationRole,
} from '../../domain/p2cDomainValidationEngine.ts';

// ============================================================================
// 1. ERROR CODES & STRUCTURED ERROR CONTRACT
// ============================================================================

export type Cohort2PatientErrorCode =
  | 'ERR_DUPLICATE_PATIENT_NUMBER'
  | 'ERR_PATIENT_NOT_FOUND'
  | 'ERR_DOMAIN_VALIDATION_FAILED'
  | 'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH'
  | 'ERR_TRANSACTION_FAILED'
  | 'ERR_PATIENT_CONSTRAINT_VIOLATION';

export class Cohort2PersistenceError extends Error {
  constructor(
    public readonly code: Cohort2PatientErrorCode,
    message: string,
    public readonly entityType = 'Patient',
    public readonly entityId?: string,
    public readonly operationId?: string
  ) {
    super(`[${code}] ${message}`);
    this.name = 'Cohort2PersistenceError';
  }
}

// ============================================================================
// 2. INPUT & OUTPUT PARAMETER CONTRACTS
// ============================================================================

export interface CreatePatientParams {
  id?: string;
  patientNumber?: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD
  sex: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  nationality?: string | null;
  phone: string;
  secondaryPhone?: string | null;
  email?: string | null;
  address?: string | null;
  occupation?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  emergencyContact?: string | null;
  medicalAlert?: string | null;
  generalNotes?: string | null;
  userId: string;
  userRole?: AuthoritativeValidationRole;
  deviceId: string;
  timestamp?: string; // ISO 8601 UTC
  operationId?: string; // Idempotency key
}

export interface PatientOperationResult {
  ok: boolean;
  isIdempotentHit: boolean;
  patient: SqlitePatientRow;
  syncOperationId: string;
  auditLogId: string;
}

function generateSafeId(prefix = ''): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return prefix ? `${prefix}-${crypto.randomUUID()}` : crypto.randomUUID();
  }
  const rand = Math.random().toString(36).substring(2, 10);
  const time = Date.now().toString(36);
  return prefix ? `${prefix}-${time}-${rand}` : `${time}-${rand}`;
}

// ============================================================================
// 3. SQLITE PATIENT REPOSITORY (Direct SQLite Data Access)
// ============================================================================

export class SqlitePatientRepository {
  /**
   * Inserts a canonical patient row into SQLite (all 27 columns).
   */
  public async insert(executor: ISqliteExecutor, patient: SqlitePatientRow): Promise<void> {
    await executor.execute(
      `INSERT INTO patients (
        id, patient_number, first_name, middle_name, last_name, full_name_normalized,
        date_of_birth, sex, nationality, phone, secondary_phone, email,
        address, occupation, guardian_name, guardian_phone, emergency_contact,
        medical_alert, general_notes, status, created_at, updated_at,
        created_by, updated_by, version, is_deleted, deleted_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      );`,
      [
        patient.id,
        patient.patient_number,
        patient.first_name,
        patient.middle_name ?? null,
        patient.last_name,
        patient.full_name_normalized,
        patient.date_of_birth,
        patient.sex,
        patient.nationality ?? null,
        patient.phone,
        patient.secondary_phone ?? null,
        patient.email ?? null,
        patient.address ?? null,
        patient.occupation ?? null,
        patient.guardian_name ?? null,
        patient.guardian_phone ?? null,
        patient.emergency_contact ?? null,
        patient.medical_alert ?? null,
        patient.general_notes ?? null,
        patient.status,
        patient.created_at,
        patient.updated_at,
        patient.created_by,
        patient.updated_by,
        patient.version,
        patient.is_deleted,
        patient.deleted_at ?? null,
      ]
    );
  }

  public async getById(
    executor: ISqliteExecutor,
    id: string,
    includeDeleted = false
  ): Promise<SqlitePatientRow | null> {
    const sql = includeDeleted
      ? 'SELECT * FROM patients WHERE id = ?;'
      : 'SELECT * FROM patients WHERE id = ? AND is_deleted = 0;';
    return executor.queryOne<SqlitePatientRow>(sql, [id]);
  }

  public async getByPatientNumber(
    executor: ISqliteExecutor,
    patientNumber: string,
    includeDeleted = false
  ): Promise<SqlitePatientRow | null> {
    const sql = includeDeleted
      ? 'SELECT * FROM patients WHERE patient_number = ?;'
      : 'SELECT * FROM patients WHERE patient_number = ? AND is_deleted = 0;';
    return executor.queryOne<SqlitePatientRow>(sql, [patientNumber]);
  }

  public async listActive(executor: ISqliteExecutor): Promise<SqlitePatientRow[]> {
    return executor.query<SqlitePatientRow>(
      'SELECT * FROM patients WHERE is_deleted = 0 ORDER BY created_at DESC;'
    );
  }

  public async count(executor: ISqliteExecutor): Promise<number> {
    const res = await executor.queryScalar<number>('SELECT COUNT(*) FROM patients;');
    return Number(res ?? 0);
  }
}

// ============================================================================
// 4. COHORT 2 PATIENT PERSISTENCE APPLICATION SERVICE
// ============================================================================

export class Cohort2PatientPersistenceService {
  private readonly patientRepo: SqlitePatientRepository;
  private readonly auditRepo: SqliteAuditLogRepository;
  private readonly syncRepo: SqliteSyncOperationRepository;

  constructor(private readonly adapter: ISqliteStorageAdapter) {
    this.patientRepo = new SqlitePatientRepository();
    this.auditRepo = new SqliteAuditLogRepository();
    this.syncRepo = new SqliteSyncOperationRepository();
  }

  /**
   * Executes atomic patient creation within an IMMEDIATE SQLite transaction.
   * 1. Pre-transaction domain validation via DomainValidationEngine.
   * 2. Idempotency envelope check.
   * 3. Unique patient_number constraint check.
   * 4. INSERT into patients.
   * 5. INSERT into audit_logs.
   * 6. INSERT into sync_operations.
   * 7. Full rollback on any stage failure.
   */
  public async createPatient(params: CreatePatientParams): Promise<PatientOperationResult> {
    const operationId = params.operationId || generateSafeId('op');
    const patientId = params.id || generateSafeId('pat');
    const now = params.timestamp || new Date().toISOString();
    const patientNumber =
      params.patientNumber?.trim() || `PAT-${Date.now().toString().slice(-6)}`;
    const userRole = params.userRole || 'ORTHODONTIST';

    // 1. Canonical Domain Validation
    const valResult = DomainValidationEngine.validate({
      context: {
        operation_id: operationId,
        command_id: 'CreatePatient',
        user_id: params.userId,
        user_role: userRole,
        device_id: params.deviceId,
        patient_id: patientId,
        timestamp: now,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'Patient',
        entityId: patientId,
        p3Mode: true,
        patientNumber,
        patientFirstName: params.firstName,
        patientLastName: params.lastName,
        patientPhone: params.phone,
        patientDob: params.dateOfBirth,
      },
    });

    if (!valResult.valid) {
      const errMsgs = valResult.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
      throw new Cohort2PersistenceError(
        'ERR_DOMAIN_VALIDATION_FAILED',
        `Domain validation rejected CreatePatient: ${errMsgs}`,
        'Patient',
        patientId,
        operationId
      );
    }

    // 2. Atomic SQLite Transaction
    try {
      return await this.adapter.transaction('IMMEDIATE', async (tx: ISqliteTransactionContext) => {
        // A. Check Idempotency
        const existingOp = await this.syncRepo.getByOperationId(tx, operationId);
        if (existingOp) {
          const targetPayload = canonicalizeJsonPayload({
            id: patientId,
            patient_number: patientNumber,
            first_name: params.firstName.trim(),
            last_name: params.lastName.trim(),
            phone: params.phone.trim(),
            date_of_birth: params.dateOfBirth,
            sex: params.sex,
          });

          if (existingOp.payload !== targetPayload) {
            throw new Cohort2PersistenceError(
              'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
              `Operation ID '${operationId}' was already committed with a different payload.`,
              'Patient',
              existingOp.entity_id,
              operationId
            );
          }

          const existingPatient = await this.patientRepo.getById(tx, existingOp.entity_id);
          if (existingPatient) {
            return {
              ok: true,
              isIdempotentHit: true,
              patient: existingPatient,
              syncOperationId: operationId,
              auditLogId: `aud-idemp-${operationId}`,
            };
          }
        }

        // B. Check Unique patient_number constraint
        const dup = await this.patientRepo.getByPatientNumber(tx, patientNumber);
        if (dup) {
          throw new Cohort2PersistenceError(
            'ERR_DUPLICATE_PATIENT_NUMBER',
            `Patient number '${patientNumber}' already exists in database (Patient ID: ${dup.id}).`,
            'Patient',
            dup.id,
            operationId
          );
        }

        // C. Build Canonical Patient Row (27 columns)
        const firstNameTrimmed = params.firstName.trim();
        const lastNameTrimmed = params.lastName.trim();
        const middleNameTrimmed = params.middleName?.trim() || null;
        const fullName = middleNameTrimmed
          ? `${firstNameTrimmed} ${middleNameTrimmed} ${lastNameTrimmed}`
          : `${firstNameTrimmed} ${lastNameTrimmed}`;

        const patientRow: SqlitePatientRow = {
          id: patientId,
          patient_number: patientNumber,
          first_name: firstNameTrimmed,
          middle_name: middleNameTrimmed,
          last_name: lastNameTrimmed,
          full_name_normalized: fullName,
          date_of_birth: params.dateOfBirth,
          sex: params.sex,
          nationality: params.nationality?.trim() || null,
          phone: params.phone.trim(),
          secondary_phone: params.secondaryPhone?.trim() || null,
          email: params.email?.trim() || null,
          address: params.address?.trim() || null,
          occupation: params.occupation?.trim() || null,
          guardian_name: params.guardianName?.trim() || null,
          guardian_phone: params.guardianPhone?.trim() || null,
          emergency_contact: params.emergencyContact?.trim() || null,
          medical_alert: params.medicalAlert?.trim() || null,
          general_notes: params.generalNotes?.trim() || null,
          status: 'ACTIVE',
          created_at: now,
          updated_at: now,
          created_by: params.userId,
          updated_by: params.userId,
          version: 1,
          is_deleted: 0,
          deleted_at: null,
        };

        // D. Insert into patients
        await this.patientRepo.insert(tx, patientRow);

        // E. Insert Audit Log
        const auditId = generateSafeId('aud');
        const payloadString = canonicalizeJsonPayload({
          id: patientRow.id,
          patient_number: patientRow.patient_number,
          first_name: patientRow.first_name,
          last_name: patientRow.last_name,
          phone: patientRow.phone,
          date_of_birth: patientRow.date_of_birth,
          sex: patientRow.sex,
        });

        const auditRow: SqliteAuditLogRow = {
          id: auditId,
          entity_type: 'patients',
          entity_id: patientRow.id,
          operation_type: 'CREATE',
          user_id: params.userId,
          device_id: params.deviceId,
          timestamp: now,
          entity_version_before: null,
          entity_version_after: 1,
          old_payload: null,
          new_payload: payloadString,
          reason_code: 'PATIENT_CREATE',
          metadata_json: null,
        };
        await this.auditRepo.insert(tx, auditRow);

        // F. Insert Sync Operations Outbox
        const syncRow: SqliteSyncOperationRow = {
          operation_id: operationId,
          device_id: params.deviceId,
          entity_type: 'patients',
          entity_id: patientRow.id,
          operation_type: 'CREATE',
          base_version: 0,
          result_version: 1,
          payload: payloadString,
          created_at: now,
          sync_status: 'PENDING',
          retry_count: 0,
          error_code: null,
          error_message: null,
        };
        await this.syncRepo.insert(tx, syncRow);

        return {
          ok: true,
          isIdempotentHit: false,
          patient: patientRow,
          syncOperationId: operationId,
          auditLogId: auditId,
        };
      });
    } catch (err: unknown) {
      const anyErr = err as any;
      if (anyErr?.cause instanceof Cohort2PersistenceError) {
        throw anyErr.cause;
      }
      if (err instanceof Cohort2PersistenceError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('UNIQUE constraint failed: patients.patient_number') ||
        msg.includes('ERR_DUPLICATE_PATIENT_NUMBER')
      ) {
        throw new Cohort2PersistenceError(
          'ERR_DUPLICATE_PATIENT_NUMBER',
          `Patient number '${patientNumber}' already exists in database.`,
          'Patient',
          patientId,
          operationId
        );
      }
      if (msg.includes('ERR_IDEMPOTENCY_PAYLOAD_MISMATCH')) {
        throw new Cohort2PersistenceError(
          'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
          `Operation ID '${operationId}' was already committed with a different payload.`,
          'Patient',
          patientId,
          operationId
        );
      }
      throw err;
    }
  }

  /**
   * Retrieves a patient by primary key ID.
   */
  public async getPatientById(
    id: string,
    includeDeleted = false
  ): Promise<SqlitePatientRow | null> {
    return this.patientRepo.getById(this.adapter, id, includeDeleted);
  }

  /**
   * Retrieves a patient by unique patient number.
   */
  public async getPatientByNumber(
    patientNumber: string,
    includeDeleted = false
  ): Promise<SqlitePatientRow | null> {
    return this.patientRepo.getByPatientNumber(this.adapter, patientNumber, includeDeleted);
  }

  /**
   * Retrieves all non-deleted patients ordered by creation date descending.
   */
  public async listActivePatients(): Promise<SqlitePatientRow[]> {
    return this.patientRepo.listActive(this.adapter);
  }

  /**
   * Total count of patient rows in SQLite.
   */
  public async getPatientCount(): Promise<number> {
    return this.patientRepo.count(this.adapter);
  }
}
