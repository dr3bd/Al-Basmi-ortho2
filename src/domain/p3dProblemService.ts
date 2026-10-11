/**
 * ORTHODONTIC CLINICAL PLATFORM
 * P3-D — Problem List & Evidence Application and Query Services
 *
 * Implements:
 * - Problem List & Evidence Lifecycle
 * - 8 Authorized Commands:
 *   1. CreateProblem
 *   2. RecordProblemFromExamination
 *   3. AttachProblemEvidence / AddProblemEvidence
 *   4. DetachProblemEvidence / RemoveProblemEvidence
 *   5. UpdateProblem
 *   6. UpdateProblemStatus (including Resolve / Reopen)
 *   7. SoftDeleteProblem
 *   8. RestoreProblem
 * - Pure pipeline routing via AuthoritativeCommandPipeline.execute
 * - DomainValidationEngine as single validation authority
 * - ProblemRepository as single persistence authority
 * - Zero direct Map writes / Zero persistence bypass
 * - Cross-case isolation safety invariant
 * - Immutable report / diagnosis protection: no P3-E / financial logic
 */

import {
  SqliteProblemEvidenceRow,
  SqliteProblemRow,
} from './p0SqliteSchema';
import {
  AuthoritativeValidationRole,
  ValidationResult,
} from './p2cDomainValidationEngine';
import {
  AuthoritativeRepositories,
} from './p2dRepositoryContract';
import {
  AuthoritativeCommandPipeline,
  AuthoritativeQueryReadService,
  AuthoritativeRelationalDatabaseState,
  P2ECommandPipelineInput,
  P2ECommandPipelineResult,
} from './p2eAndP2fPipelineAndQuery';

export type P3DUserRole = AuthoritativeValidationRole;

export interface P3DExecutionContext {
  operation_id: string;
  user_id: string;
  user_role: P3DUserRole;
  device_id: string;
  timestamp: string;
  is_online?: boolean;
}

export interface ProblemEvidenceView {
  id: string;
  problem_id: string;
  evidence_type: SqliteProblemEvidenceRow['evidence_type'];
  source_entity_type: string;
  source_entity_id: string;
  measurement_value: string | null;
  measurement_unit: string | null;
  interpretation: string;
  created_at: string;
  created_by: string;
}

export interface ProblemAggregateView {
  id: string;
  case_id: string;
  problem_code: string;
  category: SqliteProblemRow['category'];
  title: string;
  description: string | null;
  severity: SqliteProblemRow['severity'];
  priority: number;
  status: SqliteProblemRow['status'];
  identified_at: string;
  resolved_at: string | null;
  source_type: SqliteProblemRow['source_type'];
  source_reference_id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  version: number;
  is_deleted: boolean;
  deleted_at: string | null;
  evidence: ProblemEvidenceView[];
  evidence_count: number;
}

export interface P3DServiceResult<TData = ProblemAggregateView> {
  committed: boolean;
  operation_id: string;
  idempotent_hit: boolean;
  data: TData | null;
  resulting_version: number | null;
  audit_id: string | null;
  sync_operation_id: string | null;
  validation: ValidationResult | null;
  error_code: string | null;
  error_message: string | null;
  pipeline_stages_executed: string[];
}

export interface InitialEvidenceDto {
  id: string;
  evidence_type: SqliteProblemEvidenceRow['evidence_type'];
  source_entity_type: string;
  source_entity_id: string;
  measurement_value?: string | null;
  measurement_unit?: string | null;
  interpretation: string;
}

export interface CreateProblemCommandDto {
  id: string;
  case_id: string;
  problem_code: string;
  category: SqliteProblemRow['category'];
  title: string;
  description?: string | null;
  severity: SqliteProblemRow['severity'];
  priority?: number;
  status?: SqliteProblemRow['status'];
  identified_at?: string;
  source_type?: SqliteProblemRow['source_type'];
  source_reference_id?: string;
  initial_evidence: InitialEvidenceDto[];
}

export interface RecordProblemFromExaminationDto {
  id: string;
  case_id: string;
  examination_id: string;
  problem_code: string;
  category: SqliteProblemRow['category'];
  title: string;
  description?: string | null;
  severity: SqliteProblemRow['severity'];
  priority?: number;
  evidence_links: InitialEvidenceDto[];
}

export interface AttachProblemEvidenceDto {
  id: string;
  case_id: string;
  problem_id: string;
  evidence_type: SqliteProblemEvidenceRow['evidence_type'];
  source_entity_type: string;
  source_entity_id: string;
  measurement_value?: string | null;
  measurement_unit?: string | null;
  interpretation: string;
}

export interface DetachProblemEvidenceDto {
  case_id: string;
  problem_id: string;
  evidence_id: string;
}

export interface UpdateProblemDto {
  case_id: string;
  problem_id: string;
  expected_version: number;
  problem_code?: string;
  category?: SqliteProblemRow['category'];
  title?: string;
  description?: string | null;
  severity?: SqliteProblemRow['severity'];
  priority?: number;
  identified_at?: string;
  source_type?: SqliteProblemRow['source_type'];
  source_reference_id?: string;
}

export interface UpdateProblemStatusDto {
  case_id: string;
  problem_id: string;
  expected_version: number;
  target_status: SqliteProblemRow['status'];
  resolved_at?: string | null;
}

export interface SoftDeleteProblemDto {
  case_id: string;
  problem_id: string;
  expected_version: number;
  reason?: string;
}

export interface RestoreProblemDto {
  case_id: string;
  problem_id: string;
  expected_version: number;
}

function mapRowToAggregateView(
  row: SqliteProblemRow,
  evidenceRows: SqliteProblemEvidenceRow[]
): ProblemAggregateView {
  return {
    id: row.id,
    case_id: row.case_id,
    problem_code: row.problem_code,
    category: row.category,
    title: row.title,
    description: row.description,
    severity: row.severity,
    priority: row.priority,
    status: row.status,
    identified_at: row.identified_at,
    resolved_at: row.resolved_at,
    source_type: row.source_type,
    source_reference_id: row.source_reference_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
    version: row.version,
    is_deleted: row.is_deleted === 1,
    deleted_at: row.deleted_at,
    evidence: evidenceRows.map((ev) => ({
      id: ev.id,
      problem_id: ev.problem_id,
      evidence_type: ev.evidence_type,
      source_entity_type: ev.source_entity_type,
      source_entity_id: ev.source_entity_id,
      measurement_value: ev.measurement_value,
      measurement_unit: ev.measurement_unit,
      interpretation: ev.interpretation,
      created_at: ev.created_at,
      created_by: ev.created_by,
    })),
    evidence_count: evidenceRows.length,
  };
}

function toP3DServiceResult(
  db: AuthoritativeRelationalDatabaseState,
  res: P2ECommandPipelineResult,
  caseId: string,
  problemId: string,
  includeDeleted = false
): P3DServiceResult<ProblemAggregateView> {
  if (res.local_commit_status === 'LOCAL_COMMITTED') {
    const data = P3DProblemQueryService.getProblemById(db, caseId, problemId, includeDeleted);
    return {
      committed: true,
      operation_id: res.operation_id,
      idempotent_hit: res.idempotent_hit,
      data,
      resulting_version: res.resulting_version,
      audit_id: res.audit_id,
      sync_operation_id: res.sync_operation_id,
      validation: null,
      error_code: null,
      error_message: null,
      pipeline_stages_executed: res.pipeline_stages_executed,
    };
  }

  const primaryErr = res.errors[0];
  return {
    committed: false,
    operation_id: res.operation_id,
    idempotent_hit: false,
    data: null,
    resulting_version: null,
    audit_id: null,
    sync_operation_id: null,
    validation: null,
    error_code: primaryErr?.code || 'ERR_PIPELINE_EXECUTION_FAILED',
    error_message: primaryErr?.message || 'Pipeline execution failed.',
    pipeline_stages_executed: res.pipeline_stages_executed,
  };
}

// ============================================================================
// P3-D: PROBLEM APPLICATION SERVICE
// All clinical mutations execute through AuthoritativeCommandPipeline
// ============================================================================

export class P3DProblemApplicationService {
  /**
   * 1. CreateProblem
   */
  public static createProblem(
    db: AuthoritativeRelationalDatabaseState,
    ctx: P3DExecutionContext,
    dto: CreateProblemCommandDto
  ): P3DServiceResult<ProblemAggregateView> {
    const pipelineCmd: P2ECommandPipelineInput = {
      operation_id: ctx.operation_id,
      command_id: 'CreateProblem',
      entity_type: 'Problem',
      entity_id: dto.id,
      case_id: dto.case_id,
      user_id: ctx.user_id,
      user_role: ctx.user_role,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      base_version: null,
      payload: {
        entityType: 'Problem',
        entityId: dto.id,
        caseId: dto.case_id,
        problemId: dto.id,
        problemCode: dto.problem_code,
        problemCategory: dto.category,
        problemTitle: dto.title,
        problemDescription: dto.description ?? null,
        problemSeverity: dto.severity,
        problemPriority: dto.priority ?? 1,
        problemStatus: dto.status ?? 'ACTIVE',
        problemTargetStatus: dto.status ?? 'ACTIVE',
        identifiedAt: dto.identified_at ?? ctx.timestamp.slice(0, 10),
        problemIdentifiedAt: dto.identified_at ?? ctx.timestamp.slice(0, 10),
        sourceType: dto.source_type ?? 'INITIAL_DIAGNOSIS',
        problemSourceType: dto.source_type ?? 'INITIAL_DIAGNOSIS',
        sourceReferenceId: dto.source_reference_id ?? '',
        problemSourceReferenceId: dto.source_reference_id ?? '',
        initialEvidence: dto.initial_evidence.map((ev) => ({
          id: ev.id,
          evidenceType: ev.evidence_type,
          evidence_type: ev.evidence_type,
          sourceEntityType: ev.source_entity_type,
          source_entity_type: ev.source_entity_type,
          sourceEntityId: ev.source_entity_id,
          source_entity_id: ev.source_entity_id,
          measurementValue: ev.measurement_value ?? null,
          measurement_value: ev.measurement_value ?? null,
          measurementUnit: ev.measurement_unit ?? null,
          measurement_unit: ev.measurement_unit ?? null,
          interpretation: ev.interpretation,
        })),
        problemEvidenceCount: dto.initial_evidence.length,
        p3Mode: true,
      },
    };

    const res = AuthoritativeCommandPipeline.execute(db, pipelineCmd);
    return toP3DServiceResult(db, res, dto.case_id, dto.id, false);
  }

  /**
   * 2. RecordProblemFromExamination
   */
  public static recordProblemFromExamination(
    db: AuthoritativeRelationalDatabaseState,
    ctx: P3DExecutionContext,
    dto: RecordProblemFromExaminationDto
  ): P3DServiceResult<ProblemAggregateView> {
    const pipelineCmd: P2ECommandPipelineInput = {
      operation_id: ctx.operation_id,
      command_id: 'RecordProblemFromExamination',
      entity_type: 'Problem',
      entity_id: dto.id,
      case_id: dto.case_id,
      user_id: ctx.user_id,
      user_role: ctx.user_role,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      base_version: null,
      payload: {
        entityType: 'Problem',
        entityId: dto.id,
        caseId: dto.case_id,
        problemId: dto.id,
        examinationId: dto.examination_id,
        problemCode: dto.problem_code,
        problemCategory: dto.category,
        problemTitle: dto.title,
        problemDescription: dto.description ?? null,
        problemSeverity: dto.severity,
        problemPriority: dto.priority ?? 1,
        problemStatus: 'ACTIVE',
        problemTargetStatus: 'ACTIVE',
        identifiedAt: ctx.timestamp.slice(0, 10),
        problemIdentifiedAt: ctx.timestamp.slice(0, 10),
        sourceType: 'INITIAL_DIAGNOSIS',
        problemSourceType: 'INITIAL_DIAGNOSIS',
        sourceReferenceId: dto.examination_id,
        problemSourceReferenceId: dto.examination_id,
        initialEvidence: dto.evidence_links.map((ev) => ({
          id: ev.id,
          evidenceType: ev.evidence_type,
          evidence_type: ev.evidence_type,
          sourceEntityType: ev.source_entity_type,
          source_entity_type: ev.source_entity_type,
          sourceEntityId: ev.source_entity_id,
          source_entity_id: ev.source_entity_id,
          measurementValue: ev.measurement_value ?? null,
          measurement_value: ev.measurement_value ?? null,
          measurementUnit: ev.measurement_unit ?? null,
          measurement_unit: ev.measurement_unit ?? null,
          interpretation: ev.interpretation,
        })),
        problemEvidenceItems: dto.evidence_links.map((ev) => ({
          id: ev.id,
          evidence_type: ev.evidence_type,
          source_entity_type: ev.source_entity_type,
          source_entity_id: ev.source_entity_id,
          measurement_value: ev.measurement_value ?? null,
          measurement_unit: ev.measurement_unit ?? null,
          interpretation: ev.interpretation,
        })),
        problemEvidenceCount: dto.evidence_links.length,
        p3Mode: true,
      },
    };

    const res = AuthoritativeCommandPipeline.execute(db, pipelineCmd);
    return toP3DServiceResult(db, res, dto.case_id, dto.id, false);
  }

  /**
   * 3. AttachProblemEvidence / AddProblemEvidence
   */
  public static attachProblemEvidence(
    db: AuthoritativeRelationalDatabaseState,
    ctx: P3DExecutionContext,
    dto: AttachProblemEvidenceDto
  ): P3DServiceResult<ProblemAggregateView> {
    const pipelineCmd: P2ECommandPipelineInput = {
      operation_id: ctx.operation_id,
      command_id: 'AttachProblemEvidence',
      entity_type: 'Problem',
      entity_id: dto.id,
      case_id: dto.case_id,
      user_id: ctx.user_id,
      user_role: ctx.user_role,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      base_version: null,
      payload: {
        entityType: 'ProblemEvidence',
        entityId: dto.id,
        caseId: dto.case_id,
        problemId: dto.problem_id,
        evidenceId: dto.id,
        problemEvidenceId: dto.id,
        evidenceType: dto.evidence_type,
        evidence_type: dto.evidence_type,
        sourceEntityType: dto.source_entity_type,
        source_entity_type: dto.source_entity_type,
        sourceEntityId: dto.source_entity_id,
        source_entity_id: dto.source_entity_id,
        measurementValue: dto.measurement_value ?? null,
        measurement_value: dto.measurement_value ?? null,
        measurementUnit: dto.measurement_unit ?? null,
        measurement_unit: dto.measurement_unit ?? null,
        interpretation: dto.interpretation,
        p3Mode: true,
      },
    };

    const res = AuthoritativeCommandPipeline.execute(db, pipelineCmd);
    return toP3DServiceResult(db, res, dto.case_id, dto.problem_id, false);
  }

  /**
   * 4. DetachProblemEvidence / RemoveProblemEvidence
   */
  public static detachProblemEvidence(
    db: AuthoritativeRelationalDatabaseState,
    ctx: P3DExecutionContext,
    dto: DetachProblemEvidenceDto
  ): P3DServiceResult<ProblemAggregateView> {
    const pipelineCmd: P2ECommandPipelineInput = {
      operation_id: ctx.operation_id,
      command_id: 'DetachProblemEvidence',
      entity_type: 'Problem',
      entity_id: dto.evidence_id,
      case_id: dto.case_id,
      user_id: ctx.user_id,
      user_role: ctx.user_role,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      base_version: null,
      payload: {
        entityType: 'ProblemEvidence',
        entityId: dto.evidence_id,
        caseId: dto.case_id,
        problemId: dto.problem_id,
        problemEvidenceId: dto.evidence_id,
        evidenceId: dto.evidence_id,
        p3Mode: true,
      },
    };

    const res = AuthoritativeCommandPipeline.execute(db, pipelineCmd);
    return toP3DServiceResult(db, res, dto.case_id, dto.problem_id, false);
  }

  /**
   * 5. UpdateProblem
   */
  public static updateProblem(
    db: AuthoritativeRelationalDatabaseState,
    ctx: P3DExecutionContext,
    dto: UpdateProblemDto
  ): P3DServiceResult<ProblemAggregateView> {
    const pipelineCmd: P2ECommandPipelineInput = {
      operation_id: ctx.operation_id,
      command_id: 'UpdateProblem',
      entity_type: 'Problem',
      entity_id: dto.problem_id,
      case_id: dto.case_id,
      user_id: ctx.user_id,
      user_role: ctx.user_role,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      base_version: dto.expected_version,
      payload: {
        entityType: 'Problem',
        entityId: dto.problem_id,
        caseId: dto.case_id,
        problemId: dto.problem_id,
        expectedVersion: dto.expected_version,
        problemCode: dto.problem_code,
        problemCategory: dto.category,
        problemTitle: dto.title,
        problemDescription: dto.description,
        problemSeverity: dto.severity,
        problemPriority: dto.priority,
        identifiedAt: dto.identified_at,
        sourceType: dto.source_type,
        sourceReferenceId: dto.source_reference_id,
        p3Mode: true,
      },
    };

    const res = AuthoritativeCommandPipeline.execute(db, pipelineCmd);
    return toP3DServiceResult(db, res, dto.case_id, dto.problem_id, false);
  }

  /**
   * 6. UpdateProblemStatus
   */
  public static updateProblemStatus(
    db: AuthoritativeRelationalDatabaseState,
    ctx: P3DExecutionContext,
    dto: UpdateProblemStatusDto
  ): P3DServiceResult<ProblemAggregateView> {
    const pipelineCmd: P2ECommandPipelineInput = {
      operation_id: ctx.operation_id,
      command_id: 'UpdateProblemStatus',
      entity_type: 'Problem',
      entity_id: dto.problem_id,
      case_id: dto.case_id,
      user_id: ctx.user_id,
      user_role: ctx.user_role,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      base_version: dto.expected_version,
      payload: {
        entityType: 'Problem',
        entityId: dto.problem_id,
        caseId: dto.case_id,
        problemId: dto.problem_id,
        expectedVersion: dto.expected_version,
        problemStatus: dto.target_status,
        problemTargetStatus: dto.target_status,
        resolvedAt: dto.resolved_at ?? null,
        problemResolvedAt: dto.resolved_at ?? null,
        p3Mode: true,
      },
    };

    const res = AuthoritativeCommandPipeline.execute(db, pipelineCmd);
    return toP3DServiceResult(db, res, dto.case_id, dto.problem_id, false);
  }

  /**
   * 7. SoftDeleteProblem
   */
  public static softDeleteProblem(
    db: AuthoritativeRelationalDatabaseState,
    ctx: P3DExecutionContext,
    dto: SoftDeleteProblemDto
  ): P3DServiceResult<ProblemAggregateView> {
    const pipelineCmd: P2ECommandPipelineInput = {
      operation_id: ctx.operation_id,
      command_id: 'SoftDeleteProblem',
      entity_type: 'Problem',
      entity_id: dto.problem_id,
      case_id: dto.case_id,
      user_id: ctx.user_id,
      user_role: ctx.user_role,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      base_version: dto.expected_version,
      payload: {
        entityType: 'Problem',
        entityId: dto.problem_id,
        caseId: dto.case_id,
        problemId: dto.problem_id,
        expectedVersion: dto.expected_version,
        reason: dto.reason || 'Soft-deleted Problem',
        p3Mode: true,
      },
    };

    const res = AuthoritativeCommandPipeline.execute(db, pipelineCmd);
    return toP3DServiceResult(db, res, dto.case_id, dto.problem_id, true);
  }

  /**
   * 8. RestoreProblem
   */
  public static restoreProblem(
    db: AuthoritativeRelationalDatabaseState,
    ctx: P3DExecutionContext,
    dto: RestoreProblemDto
  ): P3DServiceResult<ProblemAggregateView> {
    const pipelineCmd: P2ECommandPipelineInput = {
      operation_id: ctx.operation_id,
      command_id: 'RestoreProblem',
      entity_type: 'Problem',
      entity_id: dto.problem_id,
      case_id: dto.case_id,
      user_id: ctx.user_id,
      user_role: ctx.user_role,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      base_version: dto.expected_version,
      payload: {
        entityType: 'Problem',
        entityId: dto.problem_id,
        caseId: dto.case_id,
        problemId: dto.problem_id,
        expectedVersion: dto.expected_version,
        p3Mode: true,
      },
    };

    const res = AuthoritativeCommandPipeline.execute(db, pipelineCmd);
    return toP3DServiceResult(db, res, dto.case_id, dto.problem_id, false);
  }
}

// ============================================================================
// P3-D: PROBLEM QUERY SERVICE
// Provides projections & aggregated views strictly via AuthoritativeQueryReadService
// and AuthoritativeRepositories without raw database Map access or fallbacks
// ============================================================================

export class P3DProblemQueryService {
  /**
   * Maps a ProblemDomainEntity from AuthoritativeQueryReadService into an encapsulated
   * ProblemAggregateView without direct Map reads or hardcoded user fallbacks.
   */
  private static mapDomainEntityToAggregateView(entity: {
    id: string;
    caseId: string;
    problemCode: string;
    category: SqliteProblemRow['category'];
    title: string;
    description: string | null;
    severity: SqliteProblemRow['severity'];
    priority: number;
    status: SqliteProblemRow['status'];
    identifiedAt: string;
    resolvedAt: string | null;
    sourceType: SqliteProblemRow['source_type'];
    sourceReferenceId: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy: string;
    version: number;
    isDeleted: boolean;
    deletedAt: string | null;
    evidence: SqliteProblemEvidenceRow[];
  }): ProblemAggregateView {
    return {
      id: entity.id,
      case_id: entity.caseId,
      problem_code: entity.problemCode,
      category: entity.category,
      title: entity.title,
      description: entity.description,
      severity: entity.severity,
      priority: entity.priority,
      status: entity.status,
      identified_at: entity.identifiedAt,
      resolved_at: entity.resolvedAt,
      source_type: entity.sourceType,
      source_reference_id: entity.sourceReferenceId,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
      created_by: entity.createdBy,
      updated_by: entity.updatedBy,
      version: entity.version,
      is_deleted: entity.isDeleted,
      deleted_at: entity.deletedAt,
      evidence: entity.evidence.map((ev) => ({
        id: ev.id,
        problem_id: ev.problem_id,
        evidence_type: ev.evidence_type,
        source_entity_type: ev.source_entity_type,
        source_entity_id: ev.source_entity_id,
        measurement_value: ev.measurement_value,
        measurement_unit: ev.measurement_unit,
        interpretation: ev.interpretation,
        created_at: ev.created_at,
        created_by: ev.created_by,
      })),
      evidence_count: entity.evidence.length,
    };
  }

  /**
   * Retrieves a single problem with evidence mapped into an aggregate view.
   * Preserves cross-case isolation via AuthoritativeQueryReadService.
   */
  public static getProblemById(
    db: AuthoritativeRelationalDatabaseState,
    caseId: string,
    problemId: string,
    includeDeleted = false
  ): ProblemAggregateView | null {
    const res = AuthoritativeQueryReadService.readProblemAggregateForCase(
      db,
      caseId,
      problemId,
      includeDeleted
    );
    if (!res.ok || !res.data) {
      return null;
    }
    return this.mapDomainEntityToAggregateView(res.data);
  }

  /**
   * Lists all problems belonging to a specific case via AuthoritativeQueryReadService.
   */
  public static listProblemsByCase(
    db: AuthoritativeRelationalDatabaseState,
    caseId: string,
    includeDeleted = false
  ): ProblemAggregateView[] {
    const res = AuthoritativeQueryReadService.readProblemAggregatesForCase(
      db,
      caseId,
      includeDeleted
    );
    if (!res.ok || !res.data) {
      return [];
    }

    return res.data.map((entity) => this.mapDomainEntityToAggregateView(entity));
  }

  /**
   * Lists only active (non-deleted) problems for a case.
   */
  public static listActiveProblemsByCase(
    db: AuthoritativeRelationalDatabaseState,
    caseId: string
  ): ProblemAggregateView[] {
    return this.listProblemsByCase(db, caseId, false);
  }

  /**
   * Returns all evidence links attached to a problem within a case.
   */
  public static getEvidenceForProblem(
    db: AuthoritativeRelationalDatabaseState,
    caseId: string,
    problemId: string
  ): ProblemEvidenceView[] {
    const aggregate = this.getProblemById(db, caseId, problemId, false);
    if (!aggregate) {
      return [];
    }
    return [...aggregate.evidence];
  }

  /**
   * Filters and searches problems within a case by keyword, category, and status.
   */
  public static searchProblems(
    db: AuthoritativeRelationalDatabaseState,
    caseId: string,
    query: string,
    categoryFilter?: SqliteProblemRow['category'] | 'ALL',
    severityFilter?: SqliteProblemRow['severity'] | 'ALL',
    statusFilter?: SqliteProblemRow['status'] | 'ALL'
  ): ProblemAggregateView[] {
    const all = this.listProblemsByCase(db, caseId, false);
    const q = query.trim().toLowerCase();

    return all.filter((prob) => {
      if (categoryFilter && categoryFilter !== 'ALL' && prob.category !== categoryFilter) {
        return false;
      }
      if (severityFilter && severityFilter !== 'ALL' && prob.severity !== severityFilter) {
        return false;
      }
      if (statusFilter && statusFilter !== 'ALL' && prob.status !== statusFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        prob.problem_code.toLowerCase().includes(q) ||
        prob.title.toLowerCase().includes(q) ||
        (prob.description && prob.description.toLowerCase().includes(q))
      );
    });
  }
}
