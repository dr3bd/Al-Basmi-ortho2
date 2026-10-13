/**
 * AL-BASMI ORTH — COHORT 2 CASE PERSISTENCE SERVICE
 * Scope: PHASE R2-B (Orthodontic Case SQLite Integration Vertical Slice)
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
 * - Atomic transaction (IMMEDIATE): orthodontic_cases + audit_logs + sync_operations.
 * - Mandatory patient verification: target patient must exist authoritatively in SQLite.
 * - Rejection of synthetic/demo patients and unpersisted foreign keys.
 * - Zero fallback to in-memory/localStorage shadow SSOT.
 * - Strict rollback and error propagation on any stage failure.
 */

import {
  SqliteOrthodonticCaseRow,
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
import { SqlitePatientRepository } from './cohort2PatientPersistenceService.ts';
import {
  DomainValidationEngine,
  AuthoritativeValidationRole,
} from '../../domain/p2cDomainValidationEngine.ts';

// Known synthetic demo patient IDs (isolated from SQLite clinical cases)
export const SYNTHETIC_DEMO_PATIENT_IDS = new Set([
  'PAT-2025-001',
  'PAT-2025-002',
  'PAT-2025-003',
]);

// ============================================================================
// 1. ERROR CODES & STRUCTURED ERROR CONTRACT
// ============================================================================

export type Cohort2CaseErrorCode =
  | 'ERR_CASE_NOT_FOUND'
  | 'ERR_PATIENT_NOT_FOUND'
  | 'ERR_DEMO_PATIENT_REJECTED'
  | 'ERR_DUPLICATE_CASE_NUMBER'
  | 'ERR_INVALID_PATIENT_CASE_RELATION'
  | 'ERR_DOMAIN_VALIDATION_FAILED'
  | 'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH'
  | 'ERR_TRANSACTION_FAILED'
  | 'ERR_CASE_CONSTRAINT_VIOLATION';

export class Cohort2CasePersistenceError extends Error {
  constructor(
    public readonly code: Cohort2CaseErrorCode,
    message: string,
    public readonly entityType = 'OrthodonticCase',
    public readonly entityId?: string,
    public readonly operationId?: string
  ) {
    super(`[${code}] ${message}`);
    this.name = 'Cohort2CasePersistenceError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ============================================================================
// 2. CREATION PARAMETERS & RESULT INTERFACES
// ============================================================================

export interface CreateCaseParams {
  id?: string;
  caseNumber?: string;
  patientId: string;
  caseType?: SqliteOrthodonticCaseRow['case_type'];
  caseStatus?: SqliteOrthodonticCaseRow['case_status'];
  chiefComplaint: string;
  referralSource?: string | null;
  startDate?: string;
  targetCompletionDate?: string | null;
  actualCompletionDate?: string | null;
  growthStatus?: SqliteOrthodonticCaseRow['growth_status'] | null;
  skeletalMaturityStatus?: string | null;
  primaryProviderId?: string;
  clinicId?: string;
  currentDiagnosisVersionId?: string | null;
  currentTreatmentPlanId?: string | null;
  notes?: string | null;
  userId: string;
  userRole?: AuthoritativeValidationRole;
  deviceId: string;
  timestamp?: string; // ISO 8601 UTC
  operationId?: string; // Idempotency key
}

export interface CaseOperationResult {
  ok: boolean;
  isIdempotentHit: boolean;
  case: SqliteOrthodonticCaseRow;
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
// 3. SQLITE CASE REPOSITORY (Direct SQLite Data Access)
// ============================================================================

export class SqliteCaseRepository {
  /**
   * Inserts a canonical orthodontic case row into SQLite (all 24 columns).
   */
  public async insert(
    executor: ISqliteExecutor,
    caseRow: SqliteOrthodonticCaseRow
  ): Promise<void> {
    await executor.execute(
      `INSERT INTO orthodontic_cases (
        id, case_number, patient_id, case_type, case_status,
        chief_complaint, referral_source, start_date, target_completion_date,
        actual_completion_date, growth_status, skeletal_maturity_status,
        primary_provider_id, clinic_id, current_diagnosis_version_id,
        current_treatment_plan_id, notes, created_at, updated_at,
        created_by, updated_by, version, is_deleted, deleted_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      );`,
      [
        caseRow.id,
        caseRow.case_number,
        caseRow.patient_id,
        caseRow.case_type,
        caseRow.case_status,
        caseRow.chief_complaint,
        caseRow.referral_source ?? null,
        caseRow.start_date,
        caseRow.target_completion_date ?? null,
        caseRow.actual_completion_date ?? null,
        caseRow.growth_status ?? null,
        caseRow.skeletal_maturity_status ?? null,
        caseRow.primary_provider_id,
        caseRow.clinic_id,
        caseRow.current_diagnosis_version_id ?? null,
        caseRow.current_treatment_plan_id ?? null,
        caseRow.notes ?? null,
        caseRow.created_at,
        caseRow.updated_at,
        caseRow.created_by,
        caseRow.updated_by,
        caseRow.version,
        caseRow.is_deleted,
        caseRow.deleted_at ?? null,
      ]
    );
  }

  public async getById(
    executor: ISqliteExecutor,
    id: string,
    includeDeleted = false
  ): Promise<SqliteOrthodonticCaseRow | null> {
    const sql = includeDeleted
      ? 'SELECT * FROM orthodontic_cases WHERE id = ?;'
      : 'SELECT * FROM orthodontic_cases WHERE id = ? AND is_deleted = 0;';
    return executor.queryOne<SqliteOrthodonticCaseRow>(sql, [id]);
  }

  public async getByCaseNumber(
    executor: ISqliteExecutor,
    caseNumber: string,
    includeDeleted = false
  ): Promise<SqliteOrthodonticCaseRow | null> {
    const sql = includeDeleted
      ? 'SELECT * FROM orthodontic_cases WHERE case_number = ?;'
      : 'SELECT * FROM orthodontic_cases WHERE case_number = ? AND is_deleted = 0;';
    return executor.queryOne<SqliteOrthodonticCaseRow>(sql, [caseNumber]);
  }

  public async listActive(executor: ISqliteExecutor): Promise<SqliteOrthodonticCaseRow[]> {
    return executor.query<SqliteOrthodonticCaseRow>(
      'SELECT * FROM orthodontic_cases WHERE is_deleted = 0 ORDER BY created_at DESC;'
    );
  }

  public async listByPatientId(
    executor: ISqliteExecutor,
    patientId: string,
    includeDeleted = false
  ): Promise<SqliteOrthodonticCaseRow[]> {
    const sql = includeDeleted
      ? 'SELECT * FROM orthodontic_cases WHERE patient_id = ? ORDER BY created_at DESC;'
      : 'SELECT * FROM orthodontic_cases WHERE patient_id = ? AND is_deleted = 0 ORDER BY created_at DESC;';
    return executor.query<SqliteOrthodonticCaseRow>(sql, [patientId]);
  }

  public async count(executor: ISqliteExecutor): Promise<number> {
    const res = await executor.queryScalar<number>('SELECT COUNT(*) FROM orthodontic_cases;');
    return Number(res ?? 0);
  }
}

// ============================================================================
// 4. COHORT 2 CASE PERSISTENCE APPLICATION SERVICE
// ============================================================================

export class Cohort2CasePersistenceService {
  private readonly caseRepo: SqliteCaseRepository;
  private readonly patientRepo: SqlitePatientRepository;
  private readonly auditRepo: SqliteAuditLogRepository;
  private readonly syncRepo: SqliteSyncOperationRepository;

  constructor(private readonly adapter: ISqliteStorageAdapter) {
    this.caseRepo = new SqliteCaseRepository();
    this.patientRepo = new SqlitePatientRepository();
    this.auditRepo = new SqliteAuditLogRepository();
    this.syncRepo = new SqliteSyncOperationRepository();
  }

  /**
   * Executes atomic case creation within an IMMEDIATE SQLite transaction.
   * 1. Check patient validity and existence in authoritative SQLite storage.
   * 2. Reject synthetic demo patients and soft-deleted patients.
   * 3. Pre-transaction domain validation via DomainValidationEngine.
   * 4. Idempotency envelope check.
   * 5. Unique case_number constraint check.
   * 6. INSERT into orthodontic_cases.
   * 7. INSERT into audit_logs.
   * 8. INSERT into sync_operations.
   * 9. Full rollback on any stage failure.
   */
  public async createCase(params: CreateCaseParams): Promise<CaseOperationResult> {
    const operationId = params.operationId || generateSafeId('op');
    const caseId = params.id || generateSafeId('case');
    const now = params.timestamp || new Date().toISOString();
    const caseNumber =
      params.caseNumber?.trim() || `ORT-2026-${Date.now().toString().slice(-6)}`;
    const userRole = params.userRole || 'ORTHODONTIST';
    const startDate = params.startDate?.trim() || now.slice(0, 10);
    const chiefComplaint = params.chiefComplaint?.trim();

    // 1. Defense-in-depth: Reject synthetic/demo patient identifiers
    if (SYNTHETIC_DEMO_PATIENT_IDS.has(params.patientId)) {
      throw new Cohort2CasePersistenceError(
        'ERR_DEMO_PATIENT_REJECTED',
        `Cannot create authoritative clinical case for synthetic demo patient '${params.patientId}'. Demo data must remain isolated from SQLite clinical records.`,
        'OrthodonticCase',
        caseId,
        operationId
      );
    }

    // 2. Pre-transaction check: Target patient MUST exist in physical SQLite patients table
    const targetPatient = await this.patientRepo.getById(this.adapter, params.patientId, true);
    if (!targetPatient || targetPatient.is_deleted === 1) {
      throw new Cohort2CasePersistenceError(
        'ERR_PATIENT_NOT_FOUND',
        `Referenced patient '${params.patientId}' does not exist in authoritative SQLite storage or is soft-deleted. Foreign key violation rejected.`,
        'OrthodonticCase',
        caseId,
        operationId
      );
    }

    // 3. Canonical Domain Validation via DomainValidationEngine
    const valResult = DomainValidationEngine.validate({
      context: {
        operation_id: operationId,
        command_id: 'CreateCase',
        user_id: params.userId,
        user_role: userRole,
        device_id: params.deviceId,
        patient_id: params.patientId,
        timestamp: now,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'OrthodonticCase',
        caseId,
        caseNumber,
        chiefComplaint,
        startDate,
        targetCompletionDate: params.targetCompletionDate ?? null,
        patientId: params.patientId,
        patientExists: true,
        p3Mode: true,
      },
    });

    if (!valResult.valid) {
      const errMsgs = valResult.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
      throw new Cohort2CasePersistenceError(
        'ERR_DOMAIN_VALIDATION_FAILED',
        `Domain validation rejected CreateCase: ${errMsgs}`,
        'OrthodonticCase',
        caseId,
        operationId
      );
    }

    // 4. Atomic SQLite Transaction (IMMEDIATE)
    try {
      return await this.adapter.transaction('IMMEDIATE', async (tx: ISqliteTransactionContext) => {
        // A. Check Idempotency via sync_operations
        const existingOp = await this.syncRepo.getByOperationId(tx, operationId);
        if (existingOp) {
          const targetPayload = canonicalizeJsonPayload({
            id: caseId,
            case_number: caseNumber,
            patient_id: params.patientId,
            chief_complaint: chiefComplaint,
            start_date: startDate,
          });

          if (existingOp.payload !== targetPayload) {
            throw new Cohort2CasePersistenceError(
              'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
              `Operation ID '${operationId}' was already committed with a different payload.`,
              'OrthodonticCase',
              existingOp.entity_id,
              operationId
            );
          }

          const existingCase = await this.caseRepo.getById(tx, existingOp.entity_id);
          if (existingCase) {
            return {
              ok: true,
              isIdempotentHit: true,
              case: existingCase,
              syncOperationId: operationId,
              auditLogId: `aud-idemp-${operationId}`,
            };
          }
        }

        // B. Check Unique case_number constraint
        const dup = await this.caseRepo.getByCaseNumber(tx, caseNumber);
        if (dup) {
          throw new Cohort2CasePersistenceError(
            'ERR_DUPLICATE_CASE_NUMBER',
            `Case number '${caseNumber}' already exists in database (Case ID: ${dup.id}).`,
            'OrthodonticCase',
            dup.id,
            operationId
          );
        }

        // C. Double-check Patient in transaction context to prevent race conditions
        const verifiedPatient = await this.patientRepo.getById(tx, params.patientId);
        if (!verifiedPatient || verifiedPatient.is_deleted === 1) {
          throw new Cohort2CasePersistenceError(
            'ERR_PATIENT_NOT_FOUND',
            `Patient '${params.patientId}' was not found in transaction context.`,
            'OrthodonticCase',
            caseId,
            operationId
          );
        }

        // D. Build Canonical Case Row (24 columns matching SCHEMA_FREEZE_v1.0)
        const caseRow: SqliteOrthodonticCaseRow = {
          id: caseId,
          case_number: caseNumber,
          patient_id: params.patientId,
          case_type: params.caseType || 'COMPREHENSIVE',
          case_status: params.caseStatus || 'CONSULTATION',
          chief_complaint: chiefComplaint,
          referral_source: params.referralSource?.trim() || null,
          start_date: startDate,
          target_completion_date: params.targetCompletionDate?.trim() || null,
          actual_completion_date: params.actualCompletionDate?.trim() || null,
          growth_status: params.growthStatus || null,
          skeletal_maturity_status: params.skeletalMaturityStatus?.trim() || null,
          primary_provider_id: params.primaryProviderId || params.userId,
          clinic_id: params.clinicId || 'clinic-main',
          current_diagnosis_version_id: params.currentDiagnosisVersionId || null,
          current_treatment_plan_id: params.currentTreatmentPlanId || null,
          notes: params.notes?.trim() || null,
          created_at: now,
          updated_at: now,
          created_by: params.userId,
          updated_by: params.userId,
          version: 1,
          is_deleted: 0,
          deleted_at: null,
        };

        // E. Insert into orthodontic_cases
        await this.caseRepo.insert(tx, caseRow);

        // F. Insert into audit_logs (append-only)
        const auditId = generateSafeId('aud');
        const auditRow: SqliteAuditLogRow = {
          id: auditId,
          entity_type: 'OrthodonticCase',
          entity_id: caseId,
          operation_type: 'CREATE',
          user_id: params.userId,
          device_id: params.deviceId,
          timestamp: now,
          entity_version_before: null,
          entity_version_after: 1,
          old_payload: null,
          new_payload: canonicalizeJsonPayload({
            id: caseId,
            case_number: caseNumber,
            patient_id: params.patientId,
            case_type: caseRow.case_type,
            case_status: caseRow.case_status,
            chief_complaint: caseRow.chief_complaint,
            start_date: caseRow.start_date,
          }),
          reason_code: 'NEW_ORTHODONTIC_CASE_RECORD',
          metadata_json: JSON.stringify({
            operation_id: operationId,
            case_number: caseNumber,
            patient_id: params.patientId,
          }),
        };
        await this.auditRepo.insert(tx, auditRow);

        // G. Insert into sync_operations (outbox)
        const syncRow: SqliteSyncOperationRow = {
          operation_id: operationId,
          device_id: params.deviceId,
          entity_type: 'OrthodonticCase',
          entity_id: caseId,
          operation_type: 'CREATE',
          base_version: 0,
          result_version: 1,
          payload: canonicalizeJsonPayload({
            id: caseId,
            case_number: caseNumber,
            patient_id: params.patientId,
            chief_complaint: chiefComplaint,
            start_date: startDate,
          }),
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
          case: caseRow,
          syncOperationId: operationId,
          auditLogId: auditId,
        };
      });
    } catch (err: unknown) {
      const anyErr = err as any;
      if (anyErr?.cause instanceof Cohort2CasePersistenceError) {
        throw anyErr.cause;
      }
      if (err instanceof Cohort2CasePersistenceError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('UNIQUE constraint failed: orthodontic_cases.case_number') ||
        msg.includes('ERR_DUPLICATE_CASE_NUMBER')
      ) {
        throw new Cohort2CasePersistenceError(
          'ERR_DUPLICATE_CASE_NUMBER',
          `Case number '${caseNumber}' already exists in database.`,
          'OrthodonticCase',
          caseId,
          operationId
        );
      }
      if (msg.includes('FOREIGN KEY constraint failed')) {
        throw new Cohort2CasePersistenceError(
          'ERR_PATIENT_NOT_FOUND',
          `FOREIGN KEY constraint failed: patient_id '${params.patientId}' does not exist in patients table.`,
          'OrthodonticCase',
          caseId,
          operationId
        );
      }
      if (msg.includes('ERR_IDEMPOTENCY_PAYLOAD_MISMATCH')) {
        throw new Cohort2CasePersistenceError(
          'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
          `Operation ID '${operationId}' was already committed with a different payload.`,
          'OrthodonticCase',
          caseId,
          operationId
        );
      }
      throw err;
    }
  }

  /**
   * Atomically updates mutable case fields (chief_complaint, notes, case_status, current_diagnosis_version_id)
   * with optimistic concurrency version bump, audit_logs, and sync_operations.
   */
  public async updateCaseMetadata(params: {
    caseId: string;
    chiefComplaint?: string;
    notes?: string | null;
    caseStatus?: SqliteOrthodonticCaseRow['case_status'];
    currentDiagnosisVersionId?: string | null;
    userId: string;
    userRole?: AuthoritativeValidationRole;
    deviceId: string;
    timestamp?: string;
    operationId?: string;
  }): Promise<CaseOperationResult> {
    const operationId = params.operationId || generateSafeId('op');
    const now = params.timestamp || new Date().toISOString();

    const existing = await this.caseRepo.getById(this.adapter, params.caseId, true);
    if (!existing || existing.is_deleted === 1) {
      throw new Cohort2CasePersistenceError(
        'ERR_CASE_NOT_FOUND',
        `Orthodontic case '${params.caseId}' does not exist or is soft-deleted.`,
        'OrthodonticCase',
        params.caseId,
        operationId
      );
    }

    const nextChiefComplaint =
      params.chiefComplaint !== undefined ? params.chiefComplaint.trim() : existing.chief_complaint;
    if (!nextChiefComplaint) {
      throw new Cohort2CasePersistenceError(
        'ERR_DOMAIN_VALIDATION_FAILED',
        `Chief complaint cannot be empty for case '${params.caseId}'.`,
        'OrthodonticCase',
        params.caseId,
        operationId
      );
    }

    const nextNotes = params.notes !== undefined ? params.notes : existing.notes;
    const nextStatus = params.caseStatus !== undefined ? params.caseStatus : existing.case_status;
    const nextDiagVerId =
      params.currentDiagnosisVersionId !== undefined
        ? params.currentDiagnosisVersionId
        : existing.current_diagnosis_version_id;
    const nextVersion = existing.version + 1;

    return this.adapter.transaction('IMMEDIATE', async (tx: ISqliteTransactionContext) => {
      await tx.execute(
        `UPDATE orthodontic_cases
         SET chief_complaint = ?,
             notes = ?,
             case_status = ?,
             current_diagnosis_version_id = ?,
             updated_at = ?,
             updated_by = ?,
             version = ?
         WHERE id = ? AND is_deleted = 0;`,
        [
          nextChiefComplaint,
          nextNotes ?? null,
          nextStatus,
          nextDiagVerId ?? null,
          now,
          params.userId,
          nextVersion,
          params.caseId,
        ]
      );

      const updatedRow = await this.caseRepo.getById(tx, params.caseId);
      if (!updatedRow) {
        throw new Cohort2CasePersistenceError(
          'ERR_CASE_NOT_FOUND',
          `Case '${params.caseId}' disappeared during update.`,
          'OrthodonticCase',
          params.caseId,
          operationId
        );
      }

      const auditId = generateSafeId('aud');
      const payloadString = canonicalizeJsonPayload({
        id: updatedRow.id,
        chief_complaint: updatedRow.chief_complaint,
        notes: updatedRow.notes,
        case_status: updatedRow.case_status,
        current_diagnosis_version_id: updatedRow.current_diagnosis_version_id,
        version: updatedRow.version,
      });

      const auditRow: SqliteAuditLogRow = {
        id: auditId,
        entity_type: 'OrthodonticCase',
        entity_id: updatedRow.id,
        operation_type: 'UPDATE',
        user_id: params.userId,
        device_id: params.deviceId,
        timestamp: now,
        entity_version_before: existing.version,
        entity_version_after: nextVersion,
        old_payload: canonicalizeJsonPayload({
          chief_complaint: existing.chief_complaint,
          notes: existing.notes,
          case_status: existing.case_status,
          current_diagnosis_version_id: existing.current_diagnosis_version_id,
        }),
        new_payload: payloadString,
        reason_code: 'UPDATE_ORTHODONTIC_CASE_METADATA',
        metadata_json: JSON.stringify({
          operation_id: operationId,
          case_id: updatedRow.id,
        }),
      };
      await this.auditRepo.insert(tx, auditRow);

      const syncRow: SqliteSyncOperationRow = {
        operation_id: operationId,
        device_id: params.deviceId,
        entity_type: 'OrthodonticCase',
        entity_id: updatedRow.id,
        operation_type: 'UPDATE',
        base_version: existing.version,
        result_version: nextVersion,
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
        case: updatedRow,
        syncOperationId: operationId,
        auditLogId: auditId,
      };
    });
  }

  /**
   * Retrieves a case by primary key ID.
   */
  public async getCaseById(
    id: string,
    includeDeleted = false
  ): Promise<SqliteOrthodonticCaseRow | null> {
    return this.caseRepo.getById(this.adapter, id, includeDeleted);
  }

  /**
   * Retrieves a case by unique case number.
   */
  public async getCaseByNumber(
    caseNumber: string,
    includeDeleted = false
  ): Promise<SqliteOrthodonticCaseRow | null> {
    return this.caseRepo.getByCaseNumber(this.adapter, caseNumber, includeDeleted);
  }

  /**
   * Retrieves all non-deleted cases ordered by creation date descending.
   */
  public async listActiveCases(): Promise<SqliteOrthodonticCaseRow[]> {
    return this.caseRepo.listActive(this.adapter);
  }

  /**
   * Retrieves cases for a specific patient.
   */
  public async listCasesByPatientId(
    patientId: string,
    includeDeleted = false
  ): Promise<SqliteOrthodonticCaseRow[]> {
    return this.caseRepo.listByPatientId(this.adapter, patientId, includeDeleted);
  }

  /**
   * Total count of case rows in SQLite.
   */
  public async getCaseCount(): Promise<number> {
    return this.caseRepo.count(this.adapter);
  }
}
