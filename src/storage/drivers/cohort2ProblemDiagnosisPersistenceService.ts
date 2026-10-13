/**
 * AL-BASMI ORTH — COHORT 2 PROBLEM & DIAGNOSIS PERSISTENCE SERVICE
 * Scope: PHASE R2-D (Problem List & Clinical Diagnosis SQLite Integration Vertical Slice)
 *
 * Baselines & Frozen Authorities:
 * - SCHEMA_FREEZE_v1.0 (src/domain/p0SqliteSchema.ts):
 *     - problems (19 columns)
 *     - problem_evidence (10 columns)
 *     - diagnosis_versions (12 columns)
 *     - diagnosis_items (8 columns)
 *     - diagnosis_evidence (10 columns)
 *     - diagnosis_problem_links (5 columns)
 * - PERSISTENCE_ADAPTER_CONTRACT_v1.0 (src/storage/types/storageAdapter.ts)
 * - P2A Domain Boundary Contract (src/domain/p2aDomainBoundaryContract.ts)
 * - P2C Domain Validation Engine (src/domain/p2cDomainValidationEngine.ts)
 * - P2D Repository Contract (src/domain/p2dRepositoryContract.ts)
 *
 * Architecture Principles:
 * - Single authoritative storage: Physical SQLite via ISqliteStorageAdapter.
 * - Atomic transaction (IMMEDIATE): problems/diagnoses + children + audit_logs + sync_operations.
 * - Parent reference integrity: target case and patient MUST exist authoritatively in SQLite.
 * - Cross-case contamination protection: problems/evidence/diagnoses MUST match the parent case.
 * - Rejection of synthetic/demo patients/cases.
 * - Zero fallback to in-memory/localStorage shadow SSOT.
 * - Strict rollback and error propagation on any stage failure.
 */

import {
  SqliteProblemRow,
  SqliteProblemEvidenceRow,
  SqliteDiagnosisVersionRow,
  SqliteDiagnosisItemRow,
  SqliteDiagnosisEvidenceRow,
  SqliteDiagnosisProblemLinkRow,
  SqliteAuditLogRow,
  SqliteSyncOperationRow,
} from '../../domain/p0SqliteSchema.ts';
import {
  ISqliteStorageAdapter,
  ISqliteTransactionContext,
} from '../types/storageAdapter.ts';
import {
  ISqliteExecutor,
  canonicalizeJsonPayload,
  SqliteAuditLogRepository,
  SqliteSyncOperationRepository,
} from './cohort1PersistenceService.ts';
import { SqlitePatientRepository } from './cohort2PatientPersistenceService.ts';
import { SqliteCaseRepository, SYNTHETIC_DEMO_PATIENT_IDS } from './cohort2CasePersistenceService.ts';
import { SYNTHETIC_DEMO_CASE_IDS as VISIT_DEMO_CASE_IDS } from './cohort2VisitPersistenceService.ts';
export const SYNTHETIC_DEMO_CASE_IDS = new Set([
  ...VISIT_DEMO_CASE_IDS,
  'ORT-2026-00104',
  'ORT-2026-00105',
]);
import {
  DomainValidationEngine,
  AuthoritativeValidationRole,
} from '../../domain/p2cDomainValidationEngine.ts';

// ============================================================================
// 1. ERROR CODES & STRUCTURED ERROR CONTRACT
// ============================================================================

export type Cohort2ProblemDiagnosisErrorCode =
  | 'ERR_PROBLEM_NOT_FOUND'
  | 'ERR_DIAGNOSIS_NOT_FOUND'
  | 'ERR_CASE_NOT_FOUND'
  | 'ERR_PATIENT_NOT_FOUND'
  | 'ERR_DEMO_RECORD_REJECTED'
  | 'ERR_CROSS_CASE_CONTAMINATION'
  | 'ERR_PATIENT_CASE_MISMATCH'
  | 'ERR_DOMAIN_VALIDATION_FAILED'
  | 'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH'
  | 'ERR_TRANSACTION_FAILED'
  | 'ERR_CONSTRAINT_VIOLATION'
  | 'ERR_DUPLICATE_ID'
  | 'ERR_DUPLICATE_VERSION_NUMBER';

export class Cohort2ProblemDiagnosisPersistenceError extends Error {
  constructor(
    public readonly code: Cohort2ProblemDiagnosisErrorCode,
    message: string,
    public readonly entityType = 'Problem',
    public readonly entityId?: string,
    public readonly operationId?: string
  ) {
    super(`[${code}] ${message}`);
    this.name = 'Cohort2ProblemDiagnosisPersistenceError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ============================================================================
// 2. CREATION PARAMETERS & RESULT INTERFACES
// ============================================================================

export interface CreateProblemParams {
  id?: string;
  caseId: string;
  problemCode: string;
  category: SqliteProblemRow['category'];
  title: string;
  description?: string | null;
  severity: SqliteProblemRow['severity'];
  priority?: number;
  status?: SqliteProblemRow['status'];
  identifiedAt?: string; // YYYY-MM-DD
  resolvedAt?: string | null;
  sourceType?: SqliteProblemRow['source_type'];
  sourceReferenceId: string;
  evidence?: Array<{
    id?: string;
    evidenceType: SqliteProblemEvidenceRow['evidence_type'];
    sourceEntityType: string;
    sourceEntityId: string;
    measurementValue: string;
    measurementUnit: string;
    interpretation: string;
  }>;
  userId: string;
  userRole?: AuthoritativeValidationRole;
  deviceId: string;
  timestamp?: string; // ISO 8601 UTC
  operationId?: string; // Idempotency key
}

export interface ProblemOperationResult {
  ok: boolean;
  isIdempotentHit: boolean;
  problem: SqliteProblemRow;
  evidenceCount: number;
  syncOperationId: string;
  auditLogId: string;
}

export interface UpdateProblemStatusParams {
  problemId: string;
  targetStatus: SqliteProblemRow['status'];
  resolvedAt?: string | null;
  userId: string;
  userRole?: AuthoritativeValidationRole;
  deviceId: string;
  timestamp?: string;
  operationId?: string;
}

export interface SoftDeleteProblemParams {
  problemId: string;
  reason?: string;
  userId: string;
  userRole?: AuthoritativeValidationRole;
  deviceId: string;
  timestamp?: string;
  operationId?: string;
}

export interface CreateDiagnosisDraftParams {
  id?: string;
  caseId: string;
  versionNumber?: number;
  diagnosisDate?: string; // YYYY-MM-DD
  diagnosedBy: string;
  clinicalSummary: string;
  generalNotes?: string | null;
  supersedesVersionId?: string | null;
  items?: Array<{
    id?: string;
    category: SqliteDiagnosisItemRow['category'];
    diagnosisCode: string;
    title: string;
    description: string;
    severity?: SqliteDiagnosisItemRow['severity'];
    certainty?: SqliteDiagnosisItemRow['certainty'];
    linkedProblemIds?: string[];
  }>;
  userId: string;
  userRole?: AuthoritativeValidationRole;
  deviceId: string;
  timestamp?: string;
  operationId?: string;
}

export interface DiagnosisOperationResult {
  ok: boolean;
  isIdempotentHit: boolean;
  diagnosisVersion: SqliteDiagnosisVersionRow;
  itemsCount: number;
  linksCount: number;
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
// 3. SQLITE PROBLEM REPOSITORY
// ============================================================================

export class SqliteProblemRepository {
  public async insert(executor: ISqliteExecutor, row: SqliteProblemRow): Promise<void> {
    await executor.execute(
      `INSERT INTO problems (
        id, case_id, problem_code, category, title, description,
        severity, priority, status, identified_at, resolved_at,
        source_type, source_reference_id, created_at, updated_at,
        created_by, updated_by, version, is_deleted, deleted_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      );`,
      [
        row.id,
        row.case_id,
        row.problem_code,
        row.category,
        row.title,
        row.description ?? null,
        row.severity,
        row.priority,
        row.status,
        row.identified_at,
        row.resolved_at ?? null,
        row.source_type,
        row.source_reference_id,
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

  public async insertEvidence(
    executor: ISqliteExecutor,
    evidence: SqliteProblemEvidenceRow
  ): Promise<void> {
    await executor.execute(
      `INSERT INTO problem_evidence (
        id, problem_id, evidence_type, source_entity_type,
        source_entity_id, measurement_value, measurement_unit,
        interpretation, created_at, created_by
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?
      );`,
      [
        evidence.id,
        evidence.problem_id,
        evidence.evidence_type,
        evidence.source_entity_type,
        evidence.source_entity_id,
        evidence.measurement_value,
        evidence.measurement_unit,
        evidence.interpretation,
        evidence.created_at,
        evidence.created_by,
      ]
    );
  }

  public async getById(
    executor: ISqliteExecutor,
    id: string,
    includeDeleted = false
  ): Promise<SqliteProblemRow | null> {
    const sql = includeDeleted
      ? 'SELECT * FROM problems WHERE id = ?;'
      : 'SELECT * FROM problems WHERE id = ? AND is_deleted = 0;';
    return executor.queryOne<SqliteProblemRow>(sql, [id]);
  }

  public async listByCaseId(
    executor: ISqliteExecutor,
    caseId: string,
    includeDeleted = false
  ): Promise<SqliteProblemRow[]> {
    const sql = includeDeleted
      ? 'SELECT * FROM problems WHERE case_id = ? ORDER BY priority ASC, created_at DESC;'
      : 'SELECT * FROM problems WHERE case_id = ? AND is_deleted = 0 ORDER BY priority ASC, created_at DESC;';
    return executor.query<SqliteProblemRow>(sql, [caseId]);
  }

  public async listEvidenceByProblemId(
    executor: ISqliteExecutor,
    problemId: string
  ): Promise<SqliteProblemEvidenceRow[]> {
    return executor.query<SqliteProblemEvidenceRow>(
      'SELECT * FROM problem_evidence WHERE problem_id = ? ORDER BY created_at ASC;',
      [problemId]
    );
  }

  public async updateStatus(
    executor: ISqliteExecutor,
    id: string,
    status: SqliteProblemRow['status'],
    resolvedAt: string | null,
    updatedBy: string,
    updatedAt: string,
    version: number
  ): Promise<void> {
    await executor.execute(
      `UPDATE problems
       SET status = ?, resolved_at = ?, updated_by = ?, updated_at = ?, version = ?
       WHERE id = ?;`,
      [status, resolvedAt, updatedBy, updatedAt, version, id]
    );
  }

  public async softDelete(
    executor: ISqliteExecutor,
    id: string,
    updatedBy: string,
    deletedAt: string,
    version: number
  ): Promise<void> {
    await executor.execute(
      `UPDATE problems
       SET is_deleted = 1, deleted_at = ?, updated_by = ?, updated_at = ?, version = ?
       WHERE id = ?;`,
      [deletedAt, updatedBy, deletedAt, version, id]
    );
  }

  public async count(executor: ISqliteExecutor): Promise<number> {
    const res = await executor.queryScalar<number>('SELECT COUNT(*) FROM problems;');
    return Number(res ?? 0);
  }
}

// ============================================================================
// 4. SQLITE DIAGNOSIS REPOSITORY
// ============================================================================

export class SqliteDiagnosisRepository {
  public async insertVersion(
    executor: ISqliteExecutor,
    versionRow: SqliteDiagnosisVersionRow
  ): Promise<void> {
    await executor.execute(
      `INSERT INTO diagnosis_versions (
        id, case_id, version_number, status, diagnosis_date,
        diagnosed_by, clinical_summary, general_notes,
        created_at, created_by, approved_at, approved_by,
        supersedes_version_id
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?
      );`,
      [
        versionRow.id,
        versionRow.case_id,
        versionRow.version_number,
        versionRow.status,
        versionRow.diagnosis_date,
        versionRow.diagnosed_by,
        versionRow.clinical_summary,
        versionRow.general_notes ?? null,
        versionRow.created_at,
        versionRow.created_by,
        versionRow.approved_at ?? null,
        versionRow.approved_by ?? null,
        versionRow.supersedes_version_id ?? null,
      ]
    );
  }

  public async insertItem(
    executor: ISqliteExecutor,
    itemRow: SqliteDiagnosisItemRow
  ): Promise<void> {
    await executor.execute(
      `INSERT INTO diagnosis_items (
        id, diagnosis_version_id, category, diagnosis_code,
        title, description, severity, certainty, created_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      );`,
      [
        itemRow.id,
        itemRow.diagnosis_version_id,
        itemRow.category,
        itemRow.diagnosis_code,
        itemRow.title,
        itemRow.description ?? null,
        itemRow.severity,
        itemRow.certainty,
        itemRow.created_at,
      ]
    );
  }

  public async insertProblemLink(
    executor: ISqliteExecutor,
    linkRow: SqliteDiagnosisProblemLinkRow
  ): Promise<void> {
    await executor.execute(
      `INSERT INTO diagnosis_problem_links (
        id, diagnosis_item_id, problem_id, relationship_type, created_at
      ) VALUES (
        ?, ?, ?, ?, ?
      );`,
      [
        linkRow.id,
        linkRow.diagnosis_item_id,
        linkRow.problem_id,
        linkRow.relationship_type,
        linkRow.created_at,
      ]
    );
  }

  public async getVersionById(
    executor: ISqliteExecutor,
    id: string
  ): Promise<SqliteDiagnosisVersionRow | null> {
    return executor.queryOne<SqliteDiagnosisVersionRow>(
      'SELECT * FROM diagnosis_versions WHERE id = ?;',
      [id]
    );
  }

  public async listVersionsByCaseId(
    executor: ISqliteExecutor,
    caseId: string
  ): Promise<SqliteDiagnosisVersionRow[]> {
    return executor.query<SqliteDiagnosisVersionRow>(
      'SELECT * FROM diagnosis_versions WHERE case_id = ? ORDER BY version_number DESC;',
      [caseId]
    );
  }

  public async listItemsByVersionId(
    executor: ISqliteExecutor,
    versionId: string
  ): Promise<SqliteDiagnosisItemRow[]> {
    return executor.query<SqliteDiagnosisItemRow>(
      'SELECT * FROM diagnosis_items WHERE diagnosis_version_id = ? ORDER BY created_at ASC;',
      [versionId]
    );
  }

  public async listLinksByItemId(
    executor: ISqliteExecutor,
    itemId: string
  ): Promise<SqliteDiagnosisProblemLinkRow[]> {
    return executor.query<SqliteDiagnosisProblemLinkRow>(
      'SELECT * FROM diagnosis_problem_links WHERE diagnosis_item_id = ?;',
      [itemId]
    );
  }

  public async countVersions(executor: ISqliteExecutor): Promise<number> {
    const res = await executor.queryScalar<number>('SELECT COUNT(*) FROM diagnosis_versions;');
    return Number(res ?? 0);
  }
}

// ============================================================================
// 5. COHORT 2 PROBLEM & DIAGNOSIS APPLICATION SERVICE
// ============================================================================

export class Cohort2ProblemDiagnosisPersistenceService {
  private readonly problemRepo: SqliteProblemRepository;
  private readonly diagnosisRepo: SqliteDiagnosisRepository;
  private readonly caseRepo: SqliteCaseRepository;
  private readonly patientRepo: SqlitePatientRepository;
  private readonly auditRepo: SqliteAuditLogRepository;
  private readonly syncRepo: SqliteSyncOperationRepository;

  constructor(private readonly adapter: ISqliteStorageAdapter) {
    this.problemRepo = new SqliteProblemRepository();
    this.diagnosisRepo = new SqliteDiagnosisRepository();
    this.caseRepo = new SqliteCaseRepository();
    this.patientRepo = new SqlitePatientRepository();
    this.auditRepo = new SqliteAuditLogRepository();
    this.syncRepo = new SqliteSyncOperationRepository();
  }

  /**
   * Creates a problem entry atomically (problems + problem_evidence + audit_logs + sync_operations).
   */
  public async createProblem(params: CreateProblemParams): Promise<ProblemOperationResult> {
    const operationId = params.operationId || generateSafeId('op');
    const problemId = params.id || generateSafeId('prob');
    const now = params.timestamp || new Date().toISOString();
    const userRole = params.userRole || 'ORTHODONTIST';

    // 1. Reject demo cases
    if (SYNTHETIC_DEMO_CASE_IDS.has(params.caseId)) {
      throw new Cohort2ProblemDiagnosisPersistenceError(
        'ERR_DEMO_RECORD_REJECTED',
        `Cannot create authoritative clinical problem for synthetic demo case '${params.caseId}'.`,
        'Problem',
        problemId,
        operationId
      );
    }

    // 2. Parent case check
    const parentCase = await this.caseRepo.getById(this.adapter, params.caseId, true);
    if (!parentCase || parentCase.is_deleted === 1) {
      throw new Cohort2ProblemDiagnosisPersistenceError(
        'ERR_CASE_NOT_FOUND',
        `Referenced orthodontic case '${params.caseId}' does not exist or is soft-deleted.`,
        'Problem',
        problemId,
        operationId
      );
    }

    // 3. Parent patient check
    if (SYNTHETIC_DEMO_PATIENT_IDS.has(parentCase.patient_id)) {
      throw new Cohort2ProblemDiagnosisPersistenceError(
        'ERR_DEMO_RECORD_REJECTED',
        `Cannot attach problem to a case linked to synthetic demo patient '${parentCase.patient_id}'.`,
        'Problem',
        problemId,
        operationId
      );
    }

    const parentPatient = await this.patientRepo.getById(this.adapter, parentCase.patient_id, true);
    if (!parentPatient || parentPatient.is_deleted === 1) {
      throw new Cohort2ProblemDiagnosisPersistenceError(
        'ERR_PATIENT_NOT_FOUND',
        `Parent patient '${parentCase.patient_id}' does not exist or is soft-deleted.`,
        'Problem',
        problemId,
        operationId
      );
    }

    // 4. Domain Validation via DomainValidationEngine
    const valResult = DomainValidationEngine.validate({
      context: {
        operation_id: operationId,
        command_id: 'CreateProblem',
        user_id: params.userId,
        user_role: userRole,
        device_id: params.deviceId,
        patient_id: parentCase.patient_id,
        timestamp: now,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'Problem',
        entityId: problemId,
        caseId: params.caseId,
        patientId: parentCase.patient_id,
        casePatientId: parentCase.patient_id,
        problemCode: params.problemCode,
        problemCategory: params.category,
        problemTitle: params.title,
        problemSeverity: params.severity,
        problemSourceType: params.sourceType || 'INITIAL_DIAGNOSIS',
        problemSourceReferenceId: params.sourceReferenceId,
      },
    });

    if (!valResult.valid) {
      const errMsgs = valResult.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
      throw new Cohort2ProblemDiagnosisPersistenceError(
        'ERR_DOMAIN_VALIDATION_FAILED',
        `Domain validation rejected CreateProblem: ${errMsgs}`,
        'Problem',
        problemId,
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
            id: problemId,
            case_id: params.caseId,
            problem_code: params.problemCode,
            title: params.title,
          });

          if (existingOp.payload !== targetPayload) {
            throw new Cohort2ProblemDiagnosisPersistenceError(
              'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
              `Operation ID '${operationId}' was already committed with a different payload.`,
              'Problem',
              existingOp.entity_id,
              operationId
            );
          }

          const existingProb = await this.problemRepo.getById(tx, existingOp.entity_id);
          if (existingProb) {
            return {
              ok: true,
              isIdempotentHit: true,
              problem: existingProb,
              evidenceCount: 0,
              syncOperationId: operationId,
              auditLogId: `aud-idemp-${operationId}`,
            };
          }
        }

        // B. Re-verify parent case in tx
        const txCase = await this.caseRepo.getById(tx, params.caseId);
        if (!txCase || txCase.is_deleted === 1) {
          throw new Cohort2ProblemDiagnosisPersistenceError(
            'ERR_CASE_NOT_FOUND',
            `Case '${params.caseId}' not found in transaction context.`,
            'Problem',
            problemId,
            operationId
          );
        }

        // C. Build Canonical Problem Row (19 columns)
        const problemRow: SqliteProblemRow = {
          id: problemId,
          case_id: params.caseId,
          problem_code: params.problemCode,
          category: params.category,
          title: params.title,
          description: params.description ?? null,
          severity: params.severity,
          priority: params.priority ?? 1,
          status: params.status || 'ACTIVE',
          identified_at: params.identifiedAt || now.slice(0, 10),
          resolved_at: params.resolvedAt ?? null,
          source_type: params.sourceType || 'INITIAL_DIAGNOSIS',
          source_reference_id: params.sourceReferenceId,
          created_at: now,
          updated_at: now,
          created_by: params.userId,
          updated_by: params.userId,
          version: 1,
          is_deleted: 0,
          deleted_at: null,
        };

        // D. Insert into problems
        await this.problemRepo.insert(tx, problemRow);

        // E. Insert evidence items if provided
        let evidenceInserted = 0;
        if (params.evidence && params.evidence.length > 0) {
          for (const ev of params.evidence) {
            const evId = ev.id || generateSafeId('pevid');
            const evRow: SqliteProblemEvidenceRow = {
              id: evId,
              problem_id: problemId,
              evidence_type: ev.evidenceType,
              source_entity_type: ev.sourceEntityType,
              source_entity_id: ev.sourceEntityId,
              measurement_value: ev.measurementValue,
              measurement_unit: ev.measurementUnit,
              interpretation: ev.interpretation,
              created_at: now,
              created_by: params.userId,
            };
            await this.problemRepo.insertEvidence(tx, evRow);
            evidenceInserted++;
          }
        }

        // F. Insert Audit Log
        const auditId = generateSafeId('aud');
        const payloadString = canonicalizeJsonPayload({
          id: problemRow.id,
          case_id: problemRow.case_id,
          problem_code: problemRow.problem_code,
          title: problemRow.title,
        });

        const auditRow: SqliteAuditLogRow = {
          id: auditId,
          entity_type: 'problems',
          entity_id: problemRow.id,
          operation_type: 'CREATE',
          user_id: params.userId,
          device_id: params.deviceId,
          timestamp: now,
          entity_version_before: null,
          entity_version_after: 1,
          old_payload: null,
          new_payload: payloadString,
          reason_code: 'CREATE_CLINICAL_PROBLEM',
          metadata_json: JSON.stringify({
            operation_id: operationId,
            case_id: params.caseId,
            evidence_count: evidenceInserted,
          }),
        };
        await this.auditRepo.insert(tx, auditRow);

        // G. Insert Sync Outbox
        const syncRow: SqliteSyncOperationRow = {
          operation_id: operationId,
          device_id: params.deviceId,
          entity_type: 'problems',
          entity_id: problemRow.id,
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
          problem: problemRow,
          evidenceCount: evidenceInserted,
          syncOperationId: operationId,
          auditLogId: auditId,
        };
      });
    } catch (err: unknown) {
      const anyErr = err as any;
      if (anyErr?.cause instanceof Cohort2ProblemDiagnosisPersistenceError) {
        throw anyErr.cause;
      }
      if (err instanceof Cohort2ProblemDiagnosisPersistenceError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ERR_IDEMPOTENCY_PAYLOAD_MISMATCH')) {
        throw new Cohort2ProblemDiagnosisPersistenceError(
          'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
          `Operation ID '${operationId}' was already committed with a different payload.`,
          'Problem',
          problemId,
          operationId
        );
      }
      if (msg.includes('UNIQUE constraint failed: problems.id')) {
        throw new Cohort2ProblemDiagnosisPersistenceError(
          'ERR_DUPLICATE_ID',
          `Problem ID '${problemId}' already exists in database.`,
          'Problem',
          problemId,
          operationId
        );
      }
      throw err;
    }
  }

  /**
   * Updates problem status atomically (problems + audit_logs + sync_operations).
   */
  public async updateProblemStatus(
    params: UpdateProblemStatusParams
  ): Promise<ProblemOperationResult> {
    const operationId = params.operationId || generateSafeId('op');
    const now = params.timestamp || new Date().toISOString();

    const existing = await this.problemRepo.getById(this.adapter, params.problemId);
    if (!existing || existing.is_deleted === 1) {
      throw new Cohort2ProblemDiagnosisPersistenceError(
        'ERR_PROBLEM_NOT_FOUND',
        `Problem '${params.problemId}' does not exist or is soft-deleted.`,
        'Problem',
        params.problemId,
        operationId
      );
    }

    const nextVersion = existing.version + 1;
    const resolvedAt =
      params.targetStatus === 'RESOLVED'
        ? params.resolvedAt || now.slice(0, 10)
        : existing.resolved_at;

    try {
      return await this.adapter.transaction('IMMEDIATE', async (tx: ISqliteTransactionContext) => {
        // Idempotency check
        const existingOp = await this.syncRepo.getByOperationId(tx, operationId);
        if (existingOp) {
          const targetPayload = canonicalizeJsonPayload({
            id: params.problemId,
            status: params.targetStatus,
          });
          if (existingOp.payload !== targetPayload) {
            throw new Cohort2ProblemDiagnosisPersistenceError(
              'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
              `Operation ID '${operationId}' was already committed with a different payload.`,
              'Problem',
              params.problemId,
              operationId
            );
          }
          const p = await this.problemRepo.getById(tx, params.problemId);
          if (p) {
            return {
              ok: true,
              isIdempotentHit: true,
              problem: p,
              evidenceCount: 0,
              syncOperationId: operationId,
              auditLogId: `aud-idemp-${operationId}`,
            };
          }
        }

        await this.problemRepo.updateStatus(
          tx,
          params.problemId,
          params.targetStatus,
          resolvedAt,
          params.userId,
          now,
          nextVersion
        );

        const updated = await this.problemRepo.getById(tx, params.problemId);
        if (!updated) {
          throw new Cohort2ProblemDiagnosisPersistenceError(
            'ERR_PROBLEM_NOT_FOUND',
            `Problem '${params.problemId}' disappeared during update.`,
            'Problem',
            params.problemId,
            operationId
          );
        }

        const auditId = generateSafeId('aud');
        const auditRow: SqliteAuditLogRow = {
          id: auditId,
          entity_type: 'problems',
          entity_id: params.problemId,
          operation_type: 'UPDATE',
          user_id: params.userId,
          device_id: params.deviceId,
          timestamp: now,
          entity_version_before: existing.version,
          entity_version_after: nextVersion,
          old_payload: canonicalizeJsonPayload({ status: existing.status }),
          new_payload: canonicalizeJsonPayload({ status: params.targetStatus }),
          reason_code: 'UPDATE_PROBLEM_STATUS',
          metadata_json: JSON.stringify({ operation_id: operationId, case_id: existing.case_id }),
        };
        await this.auditRepo.insert(tx, auditRow);

        const syncRow: SqliteSyncOperationRow = {
          operation_id: operationId,
          device_id: params.deviceId,
          entity_type: 'problems',
          entity_id: params.problemId,
          operation_type: 'UPDATE',
          base_version: existing.version,
          result_version: nextVersion,
          payload: canonicalizeJsonPayload({
            id: params.problemId,
            status: params.targetStatus,
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
          problem: updated,
          evidenceCount: 0,
          syncOperationId: operationId,
          auditLogId: auditId,
        };
      });
    } catch (err: unknown) {
      if (err instanceof Cohort2ProblemDiagnosisPersistenceError) throw err;
      const anyErr = err as any;
      if (anyErr?.cause instanceof Cohort2ProblemDiagnosisPersistenceError) throw anyErr.cause;
      throw err;
    }
  }

  /**
   * Soft-deletes a problem atomically (problems + audit_logs + sync_operations).
   */
  public async softDeleteProblem(
    params: SoftDeleteProblemParams
  ): Promise<ProblemOperationResult> {
    const operationId = params.operationId || generateSafeId('op');
    const now = params.timestamp || new Date().toISOString();

    const existing = await this.problemRepo.getById(this.adapter, params.problemId);
    if (!existing || existing.is_deleted === 1) {
      throw new Cohort2ProblemDiagnosisPersistenceError(
        'ERR_PROBLEM_NOT_FOUND',
        `Problem '${params.problemId}' does not exist or is already soft-deleted.`,
        'Problem',
        params.problemId,
        operationId
      );
    }

    const nextVersion = existing.version + 1;

    try {
      return await this.adapter.transaction('IMMEDIATE', async (tx: ISqliteTransactionContext) => {
        // Idempotency check
        const existingOp = await this.syncRepo.getByOperationId(tx, operationId);
        if (existingOp) {
          const targetPayload = canonicalizeJsonPayload({
            id: params.problemId,
            is_deleted: 1,
          });
          if (existingOp.payload !== targetPayload) {
            throw new Cohort2ProblemDiagnosisPersistenceError(
              'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
              `Operation ID '${operationId}' was already committed with a different payload.`,
              'Problem',
              params.problemId,
              operationId
            );
          }
          const p = await this.problemRepo.getById(tx, params.problemId, true);
          if (p) {
            return {
              ok: true,
              isIdempotentHit: true,
              problem: p,
              evidenceCount: 0,
              syncOperationId: operationId,
              auditLogId: `aud-idemp-${operationId}`,
            };
          }
        }

        await this.problemRepo.softDelete(
          tx,
          params.problemId,
          params.userId,
          now,
          nextVersion
        );

        const deleted = await this.problemRepo.getById(tx, params.problemId, true);
        if (!deleted) {
          throw new Cohort2ProblemDiagnosisPersistenceError(
            'ERR_PROBLEM_NOT_FOUND',
            `Problem '${params.problemId}' disappeared during soft delete.`,
            'Problem',
            params.problemId,
            operationId
          );
        }

        const auditId = generateSafeId('aud');
        const auditRow: SqliteAuditLogRow = {
          id: auditId,
          entity_type: 'problems',
          entity_id: params.problemId,
          operation_type: 'SOFT_DELETE',
          user_id: params.userId,
          device_id: params.deviceId,
          timestamp: now,
          entity_version_before: existing.version,
          entity_version_after: nextVersion,
          old_payload: canonicalizeJsonPayload({ is_deleted: 0 }),
          new_payload: canonicalizeJsonPayload({ is_deleted: 1, reason: params.reason }),
          reason_code: 'SOFT_DELETE_PROBLEM',
          metadata_json: JSON.stringify({
            operation_id: operationId,
            case_id: existing.case_id,
            reason: params.reason || null,
          }),
        };
        await this.auditRepo.insert(tx, auditRow);

        const syncRow: SqliteSyncOperationRow = {
          operation_id: operationId,
          device_id: params.deviceId,
          entity_type: 'problems',
          entity_id: params.problemId,
          operation_type: 'DELETE',
          base_version: existing.version,
          result_version: nextVersion,
          payload: canonicalizeJsonPayload({
            id: params.problemId,
            is_deleted: 1,
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
          problem: deleted,
          evidenceCount: 0,
          syncOperationId: operationId,
          auditLogId: auditId,
        };
      });
    } catch (err: unknown) {
      if (err instanceof Cohort2ProblemDiagnosisPersistenceError) throw err;
      const anyErr = err as any;
      if (anyErr?.cause instanceof Cohort2ProblemDiagnosisPersistenceError) throw anyErr.cause;
      throw err;
    }
  }

  /**
   * Creates a diagnosis draft version atomically (diagnosis_versions + items + problem_links + audit + sync).
   */
  public async createDiagnosisDraft(
    params: CreateDiagnosisDraftParams
  ): Promise<DiagnosisOperationResult> {
    const operationId = params.operationId || generateSafeId('op');
    const versionId = params.id || generateSafeId('diag');
    const now = params.timestamp || new Date().toISOString();
    const userRole = params.userRole || 'ORTHODONTIST';

    // 1. Reject demo cases
    if (SYNTHETIC_DEMO_CASE_IDS.has(params.caseId)) {
      throw new Cohort2ProblemDiagnosisPersistenceError(
        'ERR_DEMO_RECORD_REJECTED',
        `Cannot create authoritative clinical diagnosis for synthetic demo case '${params.caseId}'.`,
        'DiagnosisVersion',
        versionId,
        operationId
      );
    }

    // 2. Parent case check
    const parentCase = await this.caseRepo.getById(this.adapter, params.caseId, true);
    if (!parentCase || parentCase.is_deleted === 1) {
      throw new Cohort2ProblemDiagnosisPersistenceError(
        'ERR_CASE_NOT_FOUND',
        `Referenced orthodontic case '${params.caseId}' does not exist or is soft-deleted.`,
        'DiagnosisVersion',
        versionId,
        operationId
      );
    }

    // 3. Parent patient check
    const parentPatient = await this.patientRepo.getById(this.adapter, parentCase.patient_id, true);
    if (!parentPatient || parentPatient.is_deleted === 1) {
      throw new Cohort2ProblemDiagnosisPersistenceError(
        'ERR_PATIENT_NOT_FOUND',
        `Parent patient '${parentCase.patient_id}' does not exist or is soft-deleted.`,
        'DiagnosisVersion',
        versionId,
        operationId
      );
    }

    // 4. Domain Validation via DomainValidationEngine
    const valResult = DomainValidationEngine.validate({
      context: {
        operation_id: operationId,
        command_id: 'CreateDiagnosisDraft',
        user_id: params.userId,
        user_role: userRole,
        device_id: params.deviceId,
        patient_id: parentCase.patient_id,
        timestamp: now,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'DiagnosisVersion',
        entityId: versionId,
        caseId: params.caseId,
        patientId: parentCase.patient_id,
        clinicalSummary: params.clinicalSummary,
        diagnosisDate: params.diagnosisDate || now.slice(0, 10),
      },
    });

    if (!valResult.valid) {
      const errMsgs = valResult.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
      throw new Cohort2ProblemDiagnosisPersistenceError(
        'ERR_DOMAIN_VALIDATION_FAILED',
        `Domain validation rejected CreateDiagnosisDraft: ${errMsgs}`,
        'DiagnosisVersion',
        versionId,
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
            id: versionId,
            case_id: params.caseId,
            clinical_summary: params.clinicalSummary,
          });

          if (existingOp.payload !== targetPayload) {
            throw new Cohort2ProblemDiagnosisPersistenceError(
              'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
              `Operation ID '${operationId}' was already committed with a different payload.`,
              'DiagnosisVersion',
              existingOp.entity_id,
              operationId
            );
          }

          const existingVersion = await this.diagnosisRepo.getVersionById(tx, existingOp.entity_id);
          if (existingVersion) {
            return {
              ok: true,
              isIdempotentHit: true,
              diagnosisVersion: existingVersion,
              itemsCount: 0,
              linksCount: 0,
              syncOperationId: operationId,
              auditLogId: `aud-idemp-${operationId}`,
            };
          }
        }

        // B. Determine version number
        const existingVersions = await this.diagnosisRepo.listVersionsByCaseId(tx, params.caseId);
        const nextVersionNum = params.versionNumber || existingVersions.length + 1;

        // Check unique constraint (case_id, version_number)
        if (existingVersions.some((v) => v.version_number === nextVersionNum)) {
          throw new Cohort2ProblemDiagnosisPersistenceError(
            'ERR_DUPLICATE_VERSION_NUMBER',
            `Diagnosis version number ${nextVersionNum} already exists for case '${params.caseId}'.`,
            'DiagnosisVersion',
            versionId,
            operationId
          );
        }

        // C. Build Canonical Diagnosis Version Row (12 columns)
        const versionRow: SqliteDiagnosisVersionRow = {
          id: versionId,
          case_id: params.caseId,
          version_number: nextVersionNum,
          status: 'DRAFT',
          diagnosis_date: params.diagnosisDate || now.slice(0, 10),
          diagnosed_by: params.diagnosedBy,
          clinical_summary: params.clinicalSummary,
          general_notes: params.generalNotes ?? null,
          created_at: now,
          created_by: params.userId,
          approved_at: null,
          approved_by: null,
          supersedes_version_id: params.supersedesVersionId ?? null,
        };

        // D. Insert diagnosis_versions
        await this.diagnosisRepo.insertVersion(tx, versionRow);

        // E. Insert diagnosis_items & diagnosis_problem_links
        let itemsCount = 0;
        let linksCount = 0;

        if (params.items && params.items.length > 0) {
          for (const item of params.items) {
            const itemId = item.id || generateSafeId('ditem');
            const itemRow: SqliteDiagnosisItemRow = {
              id: itemId,
              diagnosis_version_id: versionId,
              category: item.category,
              diagnosis_code: item.diagnosisCode,
              title: item.title,
              description: item.description,
              severity: item.severity || 'MODERATE',
              certainty: item.certainty || 'CONFIRMED',
              created_at: now,
            };
            await this.diagnosisRepo.insertItem(tx, itemRow);
            itemsCount++;

            // Link problems if specified
            if (item.linkedProblemIds && item.linkedProblemIds.length > 0) {
              for (const probId of item.linkedProblemIds) {
                // Verify problem exists and belongs to the same case
                const linkedProb = await this.problemRepo.getById(tx, probId);
                if (!linkedProb) {
                  throw new Cohort2ProblemDiagnosisPersistenceError(
                    'ERR_PROBLEM_NOT_FOUND',
                    `Linked problem '${probId}' does not exist in SQLite.`,
                    'DiagnosisProblemLink',
                    itemId,
                    operationId
                  );
                }
                if (linkedProb.case_id !== params.caseId) {
                  throw new Cohort2ProblemDiagnosisPersistenceError(
                    'ERR_CROSS_CASE_CONTAMINATION',
                    `Cross-case contamination rejected: problem '${probId}' belongs to case '${linkedProb.case_id}', not '${params.caseId}'.`,
                    'DiagnosisProblemLink',
                    itemId,
                    operationId
                  );
                }

                const linkRow: SqliteDiagnosisProblemLinkRow = {
                  id: generateSafeId('dlink'),
                  diagnosis_item_id: itemId,
                  problem_id: probId,
                  relationship_type: 'EXPLAINS',
                  created_at: now,
                };
                await this.diagnosisRepo.insertProblemLink(tx, linkRow);
                linksCount++;
              }
            }
          }
        }

        // F. Insert Audit Log
        const auditId = generateSafeId('aud');
        const payloadString = canonicalizeJsonPayload({
          id: versionRow.id,
          case_id: versionRow.case_id,
          version_number: versionRow.version_number,
          clinical_summary: versionRow.clinical_summary,
        });

        const auditRow: SqliteAuditLogRow = {
          id: auditId,
          entity_type: 'diagnosis_versions',
          entity_id: versionRow.id,
          operation_type: 'CREATE',
          user_id: params.userId,
          device_id: params.deviceId,
          timestamp: now,
          entity_version_before: null,
          entity_version_after: 1,
          old_payload: null,
          new_payload: payloadString,
          reason_code: 'CREATE_DIAGNOSIS_DRAFT',
          metadata_json: JSON.stringify({
            operation_id: operationId,
            case_id: params.caseId,
            items_count: itemsCount,
            links_count: linksCount,
          }),
        };
        await this.auditRepo.insert(tx, auditRow);

        // G. Insert Sync Outbox
        const syncRow: SqliteSyncOperationRow = {
          operation_id: operationId,
          device_id: params.deviceId,
          entity_type: 'diagnosis_versions',
          entity_id: versionRow.id,
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
          diagnosisVersion: versionRow,
          itemsCount,
          linksCount,
          syncOperationId: operationId,
          auditLogId: auditId,
        };
      });
    } catch (err: unknown) {
      const anyErr = err as any;
      if (anyErr?.cause instanceof Cohort2ProblemDiagnosisPersistenceError) {
        throw anyErr.cause;
      }
      if (err instanceof Cohort2ProblemDiagnosisPersistenceError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ERR_IDEMPOTENCY_PAYLOAD_MISMATCH')) {
        throw new Cohort2ProblemDiagnosisPersistenceError(
          'ERR_IDEMPOTENCY_PAYLOAD_MISMATCH',
          `Operation ID '${operationId}' was already committed with a different payload.`,
          'DiagnosisVersion',
          versionId,
          operationId
        );
      }
      if (msg.includes('UNIQUE constraint failed: diagnosis_versions.case_id, diagnosis_versions.version_number')) {
        throw new Cohort2ProblemDiagnosisPersistenceError(
          'ERR_DUPLICATE_VERSION_NUMBER',
          `Diagnosis version already exists for case '${params.caseId}'.`,
          'DiagnosisVersion',
          versionId,
          operationId
        );
      }
      throw err;
    }
  }

  // --- Read Methods ---

  public async getProblemById(id: string, includeDeleted = false): Promise<SqliteProblemRow | null> {
    return this.problemRepo.getById(this.adapter, id, includeDeleted);
  }

  public async listProblemsByCaseId(
    caseId: string,
    includeDeleted = false
  ): Promise<SqliteProblemRow[]> {
    return this.problemRepo.listByCaseId(this.adapter, caseId, includeDeleted);
  }

  public async listEvidenceByProblemId(problemId: string): Promise<SqliteProblemEvidenceRow[]> {
    return this.problemRepo.listEvidenceByProblemId(this.adapter, problemId);
  }

  public async getProblemCount(): Promise<number> {
    return this.problemRepo.count(this.adapter);
  }

  public async getDiagnosisVersionById(id: string): Promise<SqliteDiagnosisVersionRow | null> {
    return this.diagnosisRepo.getVersionById(this.adapter, id);
  }

  public async listDiagnosisVersionsByCaseId(caseId: string): Promise<SqliteDiagnosisVersionRow[]> {
    return this.diagnosisRepo.listVersionsByCaseId(this.adapter, caseId);
  }

  public async listDiagnosisItemsByVersionId(versionId: string): Promise<SqliteDiagnosisItemRow[]> {
    return this.diagnosisRepo.listItemsByVersionId(this.adapter, versionId);
  }

  public async getDiagnosisVersionCount(): Promise<number> {
    return this.diagnosisRepo.countVersions(this.adapter);
  }
}
