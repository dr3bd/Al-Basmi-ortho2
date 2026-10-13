/**
 * AL-BASMI ORTH — COHORT 2 VISIT & EXAMINATION PERSISTENCE SERVICE
 * Scope: PHASE R2-C (Clinical Visits & Examinations SQLite Integration Vertical Slice)
 *
 * Baselines & Frozen Authorities:
 * - SCHEMA_FREEZE_v1.0 (src/domain/p0SqliteSchema.ts):
 *     - visits (14 columns)
 *     - visit_procedures (14 columns)
 *     - clinical_examinations (14 columns)
 *     - clinical_findings (12 columns)
 *     - tooth_findings (15 columns)
 *     - arch_measurements (10 columns)
 * - PERSISTENCE_ADAPTER_CONTRACT_v1.0 (src/storage/types/storageAdapter.ts)
 * - P2A Domain Boundary Contract (src/domain/p2aDomainBoundaryContract.ts)
 * - P2C Domain Validation Engine (src/domain/p2cDomainValidationEngine.ts)
 * - P2D Repository Contract (src/domain/p2dRepositoryContract.ts)
 *
 * Architecture Principles:
 * - Single authoritative storage: Physical SQLite via ISqliteStorageAdapter.
 * - Atomic transaction (IMMEDIATE): visits/examinations + audit_logs + sync_operations.
 * - Parent reference integrity: target case and patient MUST exist authoritatively in SQLite.
 * - Cross-case contamination protection: visit/exam MUST match the case's patient.
 * - Rejection of synthetic/demo patients/cases.
 * - Zero fallback to in-memory/localStorage shadow SSOT.
 * - Strict rollback and error propagation on any stage failure.
 */

import {
  SqliteVisitRow,
  SqliteClinicalExaminationRow,
  SqliteClinicalFindingRow,
  SqliteToothFindingRow,
  SqliteArchMeasurementRow,
  SqliteAuditLogRow,
  SqliteSyncOperationRow,
} from '../../domain/p0SqliteSchema.ts';
import {
  ISqliteStorageAdapter,
  ISqliteTransactionContext,
  SqliteParams,
} from '../types/storageAdapter.ts';
import {
  ISqliteExecutor,
  canonicalizeJsonPayload,
  SqliteAuditLogRepository,
  SqliteSyncOperationRepository,
} from './cohort1PersistenceService.ts';
import { SqlitePatientRepository } from './cohort2PatientPersistenceService.ts';
import { SqliteCaseRepository, SYNTHETIC_DEMO_PATIENT_IDS } from './cohort2CasePersistenceService.ts';
import {
  DomainValidationEngine,
  AuthoritativeValidationRole,
} from '../../domain/p2cDomainValidationEngine.ts';

// Known synthetic demo case IDs (isolated from SQLite clinical visits)
export const SYNTHETIC_DEMO_CASE_IDS = new Set([
  'ORT-2025-00101',
  'ORT-2025-00102',
  'ORT-2026-00129',
]);

// ============================================================================
// 1. ERROR CODES & STRUCTURED ERROR CONTRACT
// ============================================================================

export type Cohort2VisitErrorCode =
  | 'ERR_VISIT_NOT_FOUND'
  | 'ERR_EXAMINATION_NOT_FOUND'
  | 'ERR_CASE_NOT_FOUND'
  | 'ERR_PATIENT_NOT_FOUND'
  | 'ERR_DEMO_RECORD_REJECTED'
  | 'ERR_CROSS_CASE_CONTAMINATION'
  | 'ERR_PATIENT_CASE_MISMATCH'
  | 'ERR_DOMAIN_VALIDATION_FAILED'
  | 'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH'
  | 'ERR_TRANSACTION_FAILED'
  | 'ERR_CONSTRAINT_VIOLATION'
  | 'ERR_DUPLICATE_ID';

export class Cohort2VisitPersistenceError extends Error {
  constructor(
    public readonly code: Cohort2VisitErrorCode,
    message: string,
    public readonly entityType = 'Visit',
    public readonly entityId?: string,
    public readonly operationId?: string
  ) {
    super(`[${code}] ${message}`);
    this.name = 'Cohort2VisitPersistenceError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ============================================================================
// 2. CREATION PARAMETERS & RESULT INTERFACES
// ============================================================================

export interface CreateVisitParams {
  id?: string;
  caseId: string;
  appointmentId?: string | null;
  visitDate: string; // YYYY-MM-DD
  visitType: string;
  providerId: string;
  chiefReason?: string | null;
  clinicalNotes?: string | null;
  nextVisitDate?: string | null;
  userId: string;
  userRole?: AuthoritativeValidationRole;
  deviceId: string;
  timestamp?: string; // ISO 8601 UTC
  operationId?: string; // Idempotency key
}

export interface VisitOperationResult {
  ok: boolean;
  isIdempotentHit: boolean;
  visit: SqliteVisitRow;
  syncOperationId: string;
  auditLogId: string;
}

export interface CreateExaminationParams {
  id?: string;
  caseId: string;
  visitId?: string | null;
  examinationDate: string; // YYYY-MM-DD
  examinerId: string;
  examinationStage?: SqliteClinicalExaminationRow['examination_stage'];
  status?: SqliteClinicalExaminationRow['status'];
  generalFindings?: string | null;
  notes?: string | null;
  findings?: Array<{
    id?: string;
    category: SqliteClinicalFindingRow['category'];
    findingCode: string;
    value: string;
    unit?: string | null;
    severity?: SqliteClinicalFindingRow['severity'];
    side?: SqliteClinicalFindingRow['side'];
    location?: string | null;
    clinicalSignificance?: SqliteClinicalFindingRow['clinical_significance'];
    notes?: string | null;
  }>;
  userId: string;
  userRole?: AuthoritativeValidationRole;
  deviceId: string;
  timestamp?: string;
  operationId?: string;
}

export interface ExaminationOperationResult {
  ok: boolean;
  isIdempotentHit: boolean;
  examination: SqliteClinicalExaminationRow;
  findingsCount: number;
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
// 3. SQLITE VISIT REPOSITORY
// ============================================================================

export class SqliteVisitRepository {
  public async insert(executor: ISqliteExecutor, row: SqliteVisitRow): Promise<void> {
    await executor.execute(
      `INSERT INTO visits (
        id, case_id, appointment_id, visit_date, visit_type,
        provider_id, chief_reason, clinical_notes, next_visit_date,
        created_at, updated_at, created_by, updated_by, version,
        is_deleted, deleted_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?
      );`,
      [
        row.id,
        row.case_id,
        row.appointment_id ?? null,
        row.visit_date,
        row.visit_type,
        row.provider_id,
        row.chief_reason ?? null,
        row.clinical_notes ?? null,
        row.next_visit_date ?? null,
        row.created_at,
        row.updated_at,
        row.created_by,
        row.updated_by,
        row.version,
        row.is_deleted,
        row.deleted_at ?? null,
      ]
    );
  }

  public async getById(
    executor: ISqliteExecutor,
    id: string,
    includeDeleted = false
  ): Promise<SqliteVisitRow | null> {
    const sql = includeDeleted
      ? 'SELECT * FROM visits WHERE id = ?;'
      : 'SELECT * FROM visits WHERE id = ? AND is_deleted = 0;';
    return executor.queryOne<SqliteVisitRow>(sql, [id]);
  }

  public async listByCaseId(
    executor: ISqliteExecutor,
    caseId: string,
    includeDeleted = false
  ): Promise<SqliteVisitRow[]> {
    const sql = includeDeleted
      ? 'SELECT * FROM visits WHERE case_id = ? ORDER BY visit_date DESC, created_at DESC;'
      : 'SELECT * FROM visits WHERE case_id = ? AND is_deleted = 0 ORDER BY visit_date DESC, created_at DESC;';
    return executor.query<SqliteVisitRow>(sql, [caseId]);
  }

  public async listActive(executor: ISqliteExecutor): Promise<SqliteVisitRow[]> {
    return executor.query<SqliteVisitRow>(
      'SELECT * FROM visits WHERE is_deleted = 0 ORDER BY visit_date DESC, created_at DESC;'
    );
  }

  public async count(executor: ISqliteExecutor): Promise<number> {
    const res = await executor.queryScalar<number>('SELECT COUNT(*) FROM visits;');
    return Number(res ?? 0);
  }
}

// ============================================================================
// 4. SQLITE CLINICAL EXAMINATION REPOSITORY
// ============================================================================

export class SqliteExaminationRepository {
  public async insert(
    executor: ISqliteExecutor,
    row: SqliteClinicalExaminationRow
  ): Promise<void> {
    await executor.execute(
      `INSERT INTO clinical_examinations (
        id, case_id, visit_id, examination_date, examiner_id,
        examination_stage, status, general_findings, notes,
        created_at, updated_at, created_by, updated_by, version,
        is_deleted, deleted_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?
      );`,
      [
        row.id,
        row.case_id,
        row.visit_id ?? null,
        row.examination_date,
        row.examiner_id,
        row.examination_stage,
        row.status,
        row.general_findings ?? null,
        row.notes ?? null,
        row.created_at,
        row.updated_at,
        row.created_by,
        row.updated_by,
        row.version,
        row.is_deleted,
        row.deleted_at ?? null,
      ]
    );
  }

  public async insertFinding(
    executor: ISqliteExecutor,
    finding: SqliteClinicalFindingRow
  ): Promise<void> {
    await executor.execute(
      `INSERT INTO clinical_findings (
        id, examination_id, category, finding_code, value, unit,
        severity, side, location, clinical_significance, notes,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?
      );`,
      [
        finding.id,
        finding.examination_id,
        finding.category,
        finding.finding_code,
        finding.value,
        finding.unit ?? null,
        finding.severity ?? null,
        finding.side ?? null,
        finding.location ?? null,
        finding.clinical_significance,
        finding.notes ?? null,
        finding.created_at,
        finding.updated_at,
      ]
    );
  }

  public async getById(
    executor: ISqliteExecutor,
    id: string,
    includeDeleted = false
  ): Promise<SqliteClinicalExaminationRow | null> {
    const sql = includeDeleted
      ? 'SELECT * FROM clinical_examinations WHERE id = ?;'
      : 'SELECT * FROM clinical_examinations WHERE id = ? AND is_deleted = 0;';
    return executor.queryOne<SqliteClinicalExaminationRow>(sql, [id]);
  }

  public async listByCaseId(
    executor: ISqliteExecutor,
    caseId: string,
    includeDeleted = false
  ): Promise<SqliteClinicalExaminationRow[]> {
    const sql = includeDeleted
      ? 'SELECT * FROM clinical_examinations WHERE case_id = ? ORDER BY examination_date DESC, created_at DESC;'
      : 'SELECT * FROM clinical_examinations WHERE case_id = ? AND is_deleted = 0 ORDER BY examination_date DESC, created_at DESC;';
    return executor.query<SqliteClinicalExaminationRow>(sql, [caseId]);
  }

  public async listFindingsByExaminationId(
    executor: ISqliteExecutor,
    examinationId: string
  ): Promise<SqliteClinicalFindingRow[]> {
    return executor.query<SqliteClinicalFindingRow>(
      'SELECT * FROM clinical_findings WHERE examination_id = ? ORDER BY created_at ASC;',
      [examinationId]
    );
  }

  public async count(executor: ISqliteExecutor): Promise<number> {
    const res = await executor.queryScalar<number>('SELECT COUNT(*) FROM clinical_examinations;');
    return Number(res ?? 0);
  }
}

// ============================================================================
// 5. COHORT 2 VISIT & EXAMINATION APPLICATION SERVICE
// ============================================================================

export class Cohort2VisitPersistenceService {
  private readonly visitRepo: SqliteVisitRepository;
  private readonly examRepo: SqliteExaminationRepository;
  private readonly caseRepo: SqliteCaseRepository;
  private readonly patientRepo: SqlitePatientRepository;
  private readonly auditRepo: SqliteAuditLogRepository;
  private readonly syncRepo: SqliteSyncOperationRepository;

  constructor(private readonly adapter: ISqliteStorageAdapter) {
    this.visitRepo = new SqliteVisitRepository();
    this.examRepo = new SqliteExaminationRepository();
    this.caseRepo = new SqliteCaseRepository();
    this.patientRepo = new SqlitePatientRepository();
    this.auditRepo = new SqliteAuditLogRepository();
    this.syncRepo = new SqliteSyncOperationRepository();
  }

  /**
   * Creates a clinical visit atomically (visits + audit_logs + sync_operations).
   * Validates:
   * 1. Case existence in SQLite and not soft-deleted.
   * 2. Rejection of demo cases and unpersisted foreign keys.
   * 3. Patient of case exists in SQLite.
   * 4. Domain validation via DomainValidationEngine ('RecordVisit').
   * 5. Immediate SQLite transaction with rollback on failure.
   */
  public async createVisit(params: CreateVisitParams): Promise<VisitOperationResult> {
    const operationId = params.operationId || generateSafeId('op');
    const visitId = params.id || generateSafeId('vis');
    const now = params.timestamp || new Date().toISOString();
    const userRole = params.userRole || 'ORTHODONTIST';

    // 1. Defense-in-depth: Reject demo cases
    if (SYNTHETIC_DEMO_CASE_IDS.has(params.caseId)) {
      throw new Cohort2VisitPersistenceError(
        'ERR_DEMO_RECORD_REJECTED',
        `Cannot create authoritative clinical visit for synthetic demo case '${params.caseId}'.`,
        'Visit',
        visitId,
        operationId
      );
    }

    // 2. Pre-transaction check: Target case must exist in SQLite
    const parentCase = await this.caseRepo.getById(this.adapter, params.caseId, true);
    if (!parentCase || parentCase.is_deleted === 1) {
      throw new Cohort2VisitPersistenceError(
        'ERR_CASE_NOT_FOUND',
        `Referenced orthodontic case '${params.caseId}' does not exist or is soft-deleted.`,
        'Visit',
        visitId,
        operationId
      );
    }

    // 3. Target case's patient must exist in SQLite and not be a demo patient
    if (SYNTHETIC_DEMO_PATIENT_IDS.has(parentCase.patient_id)) {
      throw new Cohort2VisitPersistenceError(
        'ERR_DEMO_RECORD_REJECTED',
        `Cannot attach clinical visit to a case linked to synthetic demo patient '${parentCase.patient_id}'.`,
        'Visit',
        visitId,
        operationId
      );
    }

    const parentPatient = await this.patientRepo.getById(this.adapter, parentCase.patient_id, true);
    if (!parentPatient || parentPatient.is_deleted === 1) {
      throw new Cohort2VisitPersistenceError(
        'ERR_PATIENT_NOT_FOUND',
        `Parent patient '${parentCase.patient_id}' does not exist in SQLite or is soft-deleted.`,
        'Visit',
        visitId,
        operationId
      );
    }

    // 4. Domain validation via DomainValidationEngine
    const valResult = DomainValidationEngine.validate({
      context: {
        operation_id: operationId,
        command_id: 'RecordVisit',
        user_id: params.userId,
        user_role: userRole,
        device_id: params.deviceId,
        patient_id: parentCase.patient_id,
        timestamp: now,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'Visit',
        entityId: visitId,
        caseId: params.caseId,
        patientId: parentCase.patient_id,
        casePatientId: parentCase.patient_id,
      },
    });

    if (!valResult.valid) {
      const errMsgs = valResult.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
      throw new Cohort2VisitPersistenceError(
        'ERR_DOMAIN_VALIDATION_FAILED',
        `Domain validation rejected RecordVisit: ${errMsgs}`,
        'Visit',
        visitId,
        operationId
      );
    }

    // 5. Atomic SQLite Transaction
    try {
      return await this.adapter.transaction('IMMEDIATE', async (tx: ISqliteTransactionContext) => {
        // A. Idempotency envelope check
        const existingOp = await this.syncRepo.getByOperationId(tx, operationId);
        if (existingOp) {
          const targetPayload = canonicalizeJsonPayload({
            id: visitId,
            case_id: params.caseId,
            visit_date: params.visitDate,
            visit_type: params.visitType,
            provider_id: params.providerId,
          });

          if (existingOp.payload !== targetPayload) {
            throw new Cohort2VisitPersistenceError(
              'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
              `Operation ID '${operationId}' was already committed with a different payload.`,
              'Visit',
              existingOp.entity_id,
              operationId
            );
          }

          const existingVisit = await this.visitRepo.getById(tx, existingOp.entity_id);
          if (existingVisit) {
            return {
              ok: true,
              isIdempotentHit: true,
              visit: existingVisit,
              syncOperationId: operationId,
              auditLogId: `aud-idemp-${operationId}`,
            };
          }
        }

        // B. Re-verify parent case in tx
        const txCase = await this.caseRepo.getById(tx, params.caseId);
        if (!txCase || txCase.is_deleted === 1) {
          throw new Cohort2VisitPersistenceError(
            'ERR_CASE_NOT_FOUND',
            `Case '${params.caseId}' not found in transaction context.`,
            'Visit',
            visitId,
            operationId
          );
        }

        // C. Build Canonical Visit Row (16 columns)
        const visitRow: SqliteVisitRow = {
          id: visitId,
          case_id: params.caseId,
          appointment_id: params.appointmentId ?? null,
          visit_date: params.visitDate,
          visit_type: params.visitType,
          provider_id: params.providerId,
          chief_reason: params.chiefReason ?? null,
          clinical_notes: params.clinicalNotes ?? null,
          next_visit_date: params.nextVisitDate ?? null,
          created_at: now,
          updated_at: now,
          created_by: params.userId,
          updated_by: params.userId,
          version: 1,
          is_deleted: 0,
          deleted_at: null,
        };

        // D. Insert into visits
        await this.visitRepo.insert(tx, visitRow);

        // E. Insert Audit Log
        const auditId = generateSafeId('aud');
        const payloadString = canonicalizeJsonPayload({
          id: visitRow.id,
          case_id: visitRow.case_id,
          visit_date: visitRow.visit_date,
          visit_type: visitRow.visit_type,
          provider_id: visitRow.provider_id,
        });

        const auditRow: SqliteAuditLogRow = {
          id: auditId,
          entity_type: 'visits',
          entity_id: visitRow.id,
          operation_type: 'CREATE',
          user_id: params.userId,
          device_id: params.deviceId,
          timestamp: now,
          entity_version_before: null,
          entity_version_after: 1,
          old_payload: null,
          new_payload: payloadString,
          reason_code: 'RECORD_CLINICAL_VISIT',
          metadata_json: JSON.stringify({
            operation_id: operationId,
            case_id: params.caseId,
          }),
        };
        await this.auditRepo.insert(tx, auditRow);

        // F. Insert Sync Operations Outbox
        const syncRow: SqliteSyncOperationRow = {
          operation_id: operationId,
          device_id: params.deviceId,
          entity_type: 'visits',
          entity_id: visitRow.id,
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
          visit: visitRow,
          syncOperationId: operationId,
          auditLogId: auditId,
        };
      });
    } catch (err: unknown) {
      const anyErr = err as any;
      if (anyErr?.cause instanceof Cohort2VisitPersistenceError) {
        throw anyErr.cause;
      }
      if (err instanceof Cohort2VisitPersistenceError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ERR_IDEMPOTENCY_PAYLOAD_MISMATCH')) {
        throw new Cohort2VisitPersistenceError(
          'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
          `Operation ID '${operationId}' was already committed with a different payload.`,
          'Visit',
          visitId,
          operationId
        );
      }
      if (msg.includes('UNIQUE constraint failed: visits.id')) {
        throw new Cohort2VisitPersistenceError(
          'ERR_DUPLICATE_ID',
          `Visit ID '${visitId}' already exists in database.`,
          'Visit',
          visitId,
          operationId
        );
      }
      if (msg.includes('FOREIGN KEY constraint failed')) {
        throw new Cohort2VisitPersistenceError(
          'ERR_CASE_NOT_FOUND',
          `FOREIGN KEY constraint failed for case_id '${params.caseId}'.`,
          'Visit',
          visitId,
          operationId
        );
      }
      throw err;
    }
  }

  /**
   * Creates a clinical examination atomically (clinical_examinations + clinical_findings + audit + sync).
   */
  public async createExamination(
    params: CreateExaminationParams
  ): Promise<ExaminationOperationResult> {
    const operationId = params.operationId || generateSafeId('op');
    const examId = params.id || generateSafeId('exam');
    const now = params.timestamp || new Date().toISOString();
    const userRole = params.userRole || 'ORTHODONTIST';

    // 1. Reject demo cases
    if (SYNTHETIC_DEMO_CASE_IDS.has(params.caseId)) {
      throw new Cohort2VisitPersistenceError(
        'ERR_DEMO_RECORD_REJECTED',
        `Cannot create authoritative clinical examination for synthetic demo case '${params.caseId}'.`,
        'ClinicalExamination',
        examId,
        operationId
      );
    }

    // 2. Verify Case exists
    const parentCase = await this.caseRepo.getById(this.adapter, params.caseId, true);
    if (!parentCase || parentCase.is_deleted === 1) {
      throw new Cohort2VisitPersistenceError(
        'ERR_CASE_NOT_FOUND',
        `Referenced orthodontic case '${params.caseId}' does not exist or is soft-deleted.`,
        'ClinicalExamination',
        examId,
        operationId
      );
    }

    // 3. If visitId provided, verify visit exists and belongs to the same case
    if (params.visitId) {
      const parentVisit = await this.visitRepo.getById(this.adapter, params.visitId, true);
      if (!parentVisit || parentVisit.is_deleted === 1) {
        throw new Cohort2VisitPersistenceError(
          'ERR_VISIT_NOT_FOUND',
          `Referenced visit '${params.visitId}' does not exist or is soft-deleted.`,
          'ClinicalExamination',
          examId,
          operationId
        );
      }
      if (parentVisit.case_id !== params.caseId) {
        throw new Cohort2VisitPersistenceError(
          'ERR_CROSS_CASE_CONTAMINATION',
          `Cross-case contamination rejected: visit '${params.visitId}' belongs to case '${parentVisit.case_id}', not '${params.caseId}'.`,
          'ClinicalExamination',
          examId,
          operationId
        );
      }
    }

    // 4. Domain Validation via DomainValidationEngine
    const valResult = DomainValidationEngine.validate({
      context: {
        operation_id: operationId,
        command_id: 'RecordClinicalExamination',
        user_id: params.userId,
        user_role: userRole,
        device_id: params.deviceId,
        patient_id: parentCase.patient_id,
        timestamp: now,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'ClinicalExamination',
        entityId: examId,
        caseId: params.caseId,
        patientId: parentCase.patient_id,
        examinationDate: params.examinationDate,
        examinerId: params.examinerId,
      },
    });

    if (!valResult.valid) {
      const errMsgs = valResult.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
      throw new Cohort2VisitPersistenceError(
        'ERR_DOMAIN_VALIDATION_FAILED',
        `Domain validation rejected RecordClinicalExamination: ${errMsgs}`,
        'ClinicalExamination',
        examId,
        operationId
      );
    }

    // 5. Atomic SQLite Transaction
    try {
      return await this.adapter.transaction('IMMEDIATE', async (tx: ISqliteTransactionContext) => {
        // A. Idempotency envelope check
        const existingOp = await this.syncRepo.getByOperationId(tx, operationId);
        if (existingOp) {
          const targetPayload = canonicalizeJsonPayload({
            id: examId,
            case_id: params.caseId,
            examination_date: params.examinationDate,
            examiner_id: params.examinerId,
          });

          if (existingOp.payload !== targetPayload) {
            throw new Cohort2VisitPersistenceError(
              'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
              `Operation ID '${operationId}' was already committed with a different payload.`,
              'ClinicalExamination',
              existingOp.entity_id,
              operationId
            );
          }

          const existingExam = await this.examRepo.getById(tx, existingOp.entity_id);
          if (existingExam) {
            return {
              ok: true,
              isIdempotentHit: true,
              examination: existingExam,
              findingsCount: 0,
              syncOperationId: operationId,
              auditLogId: `aud-idemp-${operationId}`,
            };
          }
        }

        // B. Build Canonical Examination Row
        const examRow: SqliteClinicalExaminationRow = {
          id: examId,
          case_id: params.caseId,
          visit_id: params.visitId ?? null,
          examination_date: params.examinationDate,
          examiner_id: params.examinerId,
          examination_stage: params.examinationStage || 'INITIAL',
          status: params.status || 'DRAFT',
          general_findings: params.generalFindings ?? null,
          notes: params.notes ?? null,
          created_at: now,
          updated_at: now,
          created_by: params.userId,
          updated_by: params.userId,
          version: 1,
          is_deleted: 0,
          deleted_at: null,
        };

        // C. Insert into clinical_examinations
        await this.examRepo.insert(tx, examRow);

        // D. Insert clinical findings if provided
        let findingsInserted = 0;
        if (params.findings && params.findings.length > 0) {
          for (const f of params.findings) {
            const findingId = f.id || generateSafeId('fnd');
            const findingRow: SqliteClinicalFindingRow = {
              id: findingId,
              examination_id: examId,
              category: f.category,
              finding_code: f.findingCode,
              value: f.value,
              unit: f.unit ?? null,
              severity: f.severity ?? null,
              side: f.side ?? null,
              location: f.location ?? null,
              clinical_significance: f.clinicalSignificance || 'NORMAL_OBSERVATION',
              notes: f.notes ?? null,
              created_at: now,
              updated_at: now,
            };
            await this.examRepo.insertFinding(tx, findingRow);
            findingsInserted++;
          }
        }

        // E. Insert Audit Log
        const auditId = generateSafeId('aud');
        const payloadString = canonicalizeJsonPayload({
          id: examRow.id,
          case_id: examRow.case_id,
          examination_date: examRow.examination_date,
          examiner_id: examRow.examiner_id,
          findings_count: findingsInserted,
        });

        const auditRow: SqliteAuditLogRow = {
          id: auditId,
          entity_type: 'clinical_examinations',
          entity_id: examRow.id,
          operation_type: 'CREATE',
          user_id: params.userId,
          device_id: params.deviceId,
          timestamp: now,
          entity_version_before: null,
          entity_version_after: 1,
          old_payload: null,
          new_payload: payloadString,
          reason_code: 'RECORD_CLINICAL_EXAMINATION',
          metadata_json: JSON.stringify({
            operation_id: operationId,
            case_id: params.caseId,
            findings_count: findingsInserted,
          }),
        };
        await this.auditRepo.insert(tx, auditRow);

        // F. Insert Sync Operations Outbox
        const syncRow: SqliteSyncOperationRow = {
          operation_id: operationId,
          device_id: params.deviceId,
          entity_type: 'clinical_examinations',
          entity_id: examRow.id,
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
          examination: examRow,
          findingsCount: findingsInserted,
          syncOperationId: operationId,
          auditLogId: auditId,
        };
      });
    } catch (err: unknown) {
      const anyErr = err as any;
      if (anyErr?.cause instanceof Cohort2VisitPersistenceError) {
        throw anyErr.cause;
      }
      if (err instanceof Cohort2VisitPersistenceError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ERR_IDEMPOTENCY_PAYLOAD_MISMATCH')) {
        throw new Cohort2VisitPersistenceError(
          'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
          `Operation ID '${operationId}' was already committed with a different payload.`,
          'ClinicalExamination',
          examId,
          operationId
        );
      }
      if (msg.includes('UNIQUE constraint failed: clinical_examinations.id')) {
        throw new Cohort2VisitPersistenceError(
          'ERR_DUPLICATE_ID',
          `Examination ID '${examId}' already exists in database.`,
          'ClinicalExamination',
          examId,
          operationId
        );
      }
      throw err;
    }
  }

  // --- Read Methods ---

  public async getVisitById(id: string, includeDeleted = false): Promise<SqliteVisitRow | null> {
    return this.visitRepo.getById(this.adapter, id, includeDeleted);
  }

  public async listVisitsByCaseId(
    caseId: string,
    includeDeleted = false
  ): Promise<SqliteVisitRow[]> {
    return this.visitRepo.listByCaseId(this.adapter, caseId, includeDeleted);
  }

  public async listActiveVisits(): Promise<SqliteVisitRow[]> {
    return this.visitRepo.listActive(this.adapter);
  }

  public async getVisitCount(): Promise<number> {
    return this.visitRepo.count(this.adapter);
  }

  public async getExaminationById(
    id: string,
    includeDeleted = false
  ): Promise<SqliteClinicalExaminationRow | null> {
    return this.examRepo.getById(this.adapter, id, includeDeleted);
  }

  public async listExaminationsByCaseId(
    caseId: string,
    includeDeleted = false
  ): Promise<SqliteClinicalExaminationRow[]> {
    return this.examRepo.listByCaseId(this.adapter, caseId, includeDeleted);
  }

  public async listFindingsByExaminationId(
    examinationId: string
  ): Promise<SqliteClinicalFindingRow[]> {
    return this.examRepo.listFindingsByExaminationId(this.adapter, examinationId);
  }

  public async getExaminationCount(): Promise<number> {
    return this.examRepo.count(this.adapter);
  }
}
