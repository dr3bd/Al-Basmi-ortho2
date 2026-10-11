/**
 * ORTHODONTIC CLINICAL PLATFORM
 * P3-C — Clinical Examination + Clinical Findings + Tooth Findings + Arch Measurements
 * Service & Query Layer (Section 5 of P3-A+P3-B+P3-C Execution Contract)
 */

import {
  SqliteArchMeasurementRow,
  SqliteAuditLogRow,
  SqliteClinicalExaminationRow,
  SqliteClinicalFindingRow,
  SqliteProblemEvidenceRow,
  SqliteProblemRow,
  SqliteSyncOperationRow,
  SqliteToothFindingRow,
} from './p0SqliteSchema';
import {
  DomainValidationEngine,
  ValidationCommandInput,
} from './p2cDomainValidationEngine';
import {
  AuthoritativeRepositories,
  ProblemDomainEntity,
} from './p2dRepositoryContract';
import { restoreAuthoritativeDatabase } from './p2eAndP2fPipelineAndQuery';
import {
  cloneP3ClinicalCoreDatabase,
  P3ClinicalCoreDatabase,
  P3ExecutionContext,
  P3ServiceResult,
} from './p3ClinicalCoreService';

export interface CreateClinicalExaminationDto {
  id: string;
  case_id: string;
  visit_id?: string | null;
  examination_date: string;
  examiner_id: string;
  examination_stage: SqliteClinicalExaminationRow['examination_stage'];
  status?: 'DRAFT' | 'CONFIRMED';
  general_findings?: string | null;
  notes?: string | null;
  initial_findings?: Array<Omit<AddClinicalFindingDto, 'examination_id' | 'case_id'>>;
  initial_tooth_findings?: Array<Omit<AddToothFindingDto, 'examination_id' | 'case_id'>>;
  initial_arch_measurements?: Array<Omit<AddArchMeasurementDto, 'examination_id' | 'case_id'>>;
  simulateChildInsertionFailure?: boolean;
}

export interface UpdateClinicalExaminationDto {
  id: string;
  case_id: string;
  expected_version: number;
  examination_date?: string;
  examiner_id?: string;
  examination_stage?: SqliteClinicalExaminationRow['examination_stage'];
  general_findings?: string | null;
  notes?: string | null;
}

export interface AddClinicalFindingDto {
  id: string;
  case_id: string;
  examination_id: string;
  category: SqliteClinicalFindingRow['category'];
  finding_code: string;
  value: string;
  unit?: string | null;
  severity: SqliteClinicalFindingRow['severity'];
  side: SqliteClinicalFindingRow['side'];
  location?: string | null;
  clinical_significance: SqliteClinicalFindingRow['clinical_significance'];
  notes?: string | null;
}

export interface AddToothFindingDto {
  id: string;
  case_id: string;
  examination_id: string;
  tooth_number: string;
  finding_type: SqliteToothFindingRow['finding_type'];
  status?: string;
  condition?: string;
  position?: string;
  angulation?: string;
  eruption_status?: string;
  mobility?: string;
  rotation?: string;
  inclination?: string;
  presence_status: SqliteToothFindingRow['presence_status'];
  notes?: string | null;
}

export interface AddArchMeasurementDto {
  id: string;
  case_id: string;
  examination_id: string;
  arch: SqliteArchMeasurementRow['arch'];
  measurement_type: SqliteArchMeasurementRow['measurement_type'];
  value: number;
  unit: string;
  method: SqliteArchMeasurementRow['method'];
  reference?: string;
  notes?: string | null;
}

export interface RecordProblemFromExaminationDto {
  id: string;
  case_id: string;
  examination_id: string;
  problem_code: string;
  category: SqliteProblemRow['category'];
  title: string;
  description: string;
  severity: SqliteProblemRow['severity'];
  priority: number;
  evidence_links: Array<{
    id: string;
    evidence_type: SqliteProblemEvidenceRow['evidence_type'];
    source_entity_type: SqliteProblemEvidenceRow['source_entity_type'];
    source_entity_id: string;
    measurement_value?: string | null;
    measurement_unit?: string | null;
    interpretation: string;
  }>;
}

export interface ClinicalExaminationAggregateView {
  examination: SqliteClinicalExaminationRow;
  findings: SqliteClinicalFindingRow[];
  tooth_findings: SqliteToothFindingRow[];
  arch_measurements: SqliteArchMeasurementRow[];
}

export class P3CClinicalExaminationApplicationService {
  public static recordClinicalExamination(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    dto: CreateClinicalExaminationDto
  ): P3ServiceResult<ClinicalExaminationAggregateView> {
    // Idempotency
    const existingSync = db.sync_operations.get(ctx.operation_id);
    if (existingSync) {
      return {
        committed: true,
        operation_id: ctx.operation_id,
        idempotent_hit: true,
        data: P3CClinicalExaminationQueryService.getExaminationAggregate(db, existingSync.entity_id),
        resulting_version: existingSync.entity_version ?? existingSync.result_version,
        audit_id: `aud-${ctx.operation_id}`,
        sync_operation_id: existingSync.id ?? existingSync.operation_id,
        validation: null,
        error_code: null,
        error_message: null,
      };
    }

    const caseRes = AuthoritativeRepositories.orthodonticCases.getRowById(db, dto.case_id, true);
    const orthoCase = caseRes.ok && caseRes.data ? caseRes.data : null;

    // Validate parent examination via DomainValidationEngine
    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'RecordClinicalExamination',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        patient_id: orthoCase?.patient_id,
        case_id: dto.case_id,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'ClinicalExamination',
        entityId: dto.id,
        patientId: orthoCase?.patient_id || 'pat-unknown',
        caseId: dto.case_id,
        examinationId: dto.id,
        caseExists: Boolean(orthoCase),
        caseIsDeleted: Boolean(orthoCase && orthoCase.is_deleted === 1),
        examinationStage: dto.examination_stage,
        examinationDate: dto.examination_date,
        examinerId: dto.examiner_id,
        requestedExaminationStatus: dto.status ?? 'DRAFT',
        version: 1,
        auditCreated: true,
        syncOutboxCreated: true,
      },
    };
    const valResult = DomainValidationEngine.validate(valInput);

    if (!valResult.valid || !orthoCase) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code: valResult.errors[0]?.code || 'ERR_CASE_NOT_FOUND',
        error_message: valResult.errors[0]?.message || 'Validation failed.',
      };
    }

    // Begin atomic transaction via ClinicalExaminationRepository
    const txDb = cloneP3ClinicalCoreDatabase(db);
    try {
      // Authority Ruling Section 3: RecordClinicalExamination creates examination in DRAFT status
      const examRow: SqliteClinicalExaminationRow = {
        id: dto.id,
        case_id: dto.case_id,
        visit_id: dto.visit_id || null,
        examination_date: dto.examination_date,
        examiner_id: dto.examiner_id,
        examination_stage: dto.examination_stage,
        status: 'DRAFT',
        general_findings: dto.general_findings || null,
        notes: dto.notes || null,
        created_at: ctx.timestamp,
        updated_at: ctx.timestamp,
        created_by: ctx.user_id,
        updated_by: ctx.user_id,
        version: 1,
        is_deleted: 0,
        deleted_at: null,
      };

      const initialFindingRows: SqliteClinicalFindingRow[] = [];
      for (const f of dto.initial_findings || []) {
        const cfVal = DomainValidationEngine.validate({
          context: {
            command_id: 'AddClinicalFinding',
            operation_id: `${ctx.operation_id}-cf-${f.id}`,
            user_id: ctx.user_id,
            user_role: ctx.user_role,
            device_id: ctx.device_id,
            case_id: dto.case_id,
            schema_version: 'SCHEMA_FREEZE_v1.0',
            domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
            timestamp: ctx.timestamp,
            mode: 'STRICT',
          },
          payload: {
            entityType: 'ClinicalFinding',
            entityId: f.id,
            caseId: dto.case_id,
            examinationId: examRow.id,
            examinationExists: true,
            examinationIsDeleted: false,
            examinationStatus: 'DRAFT',
            findingCategory: f.category,
            findingCode: f.finding_code,
            findingSeverity: f.severity,
            findingSide: f.side,
            clinicalSignificance: f.clinical_significance,
            version: 1,
            auditCreated: true,
            syncOutboxCreated: true,
          },
        });
        if (!cfVal.valid) {
          throw {
            code: cfVal.errors[0]?.code || 'ERR_INVALID_CLINICAL_FINDING',
            message: cfVal.errors[0]?.message || 'Invalid initial clinical finding.',
            validation: cfVal,
          };
        }
        initialFindingRows.push({
          id: f.id,
          examination_id: examRow.id,
          category: f.category,
          finding_code: f.finding_code.trim(),
          value: f.value,
          unit: f.unit || null,
          severity: f.severity,
          side: f.side,
          location: f.location || null,
          clinical_significance: f.clinical_significance,
          notes: f.notes || null,
          created_at: ctx.timestamp,
          updated_at: ctx.timestamp,
        });
      }

      const initialToothRows: SqliteToothFindingRow[] = [];
      for (const tf of dto.initial_tooth_findings || []) {
        const tfVal = DomainValidationEngine.validate({
          context: {
            command_id: 'AddToothFinding',
            operation_id: `${ctx.operation_id}-tf-${tf.id}`,
            user_id: ctx.user_id,
            user_role: ctx.user_role,
            device_id: ctx.device_id,
            case_id: dto.case_id,
            schema_version: 'SCHEMA_FREEZE_v1.0',
            domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
            timestamp: ctx.timestamp,
            mode: 'STRICT',
          },
          payload: {
            entityType: 'ToothFinding',
            entityId: tf.id,
            caseId: dto.case_id,
            examinationId: examRow.id,
            examinationExists: true,
            examinationIsDeleted: false,
            examinationStatus: 'DRAFT',
            toothNumberFdi: tf.tooth_number,
            toothFindingType: tf.finding_type,
            presenceStatus: tf.presence_status,
            version: 1,
            auditCreated: true,
            syncOutboxCreated: true,
          },
        });
        if (!tfVal.valid) {
          throw {
            code: tfVal.errors[0]?.code || 'ERR_INVALID_FDI_TOOTH_NUMBER',
            message: tfVal.errors[0]?.message || `Invalid FDI tooth number: ${tf.tooth_number}`,
            validation: tfVal,
          };
        }
        initialToothRows.push({
          id: tf.id,
          examination_id: examRow.id,
          tooth_number: tf.tooth_number,
          finding_type: tf.finding_type,
          status: tf.status || 'RECORDED',
          condition: tf.condition || 'SOUND',
          position: tf.position || 'NORMAL',
          angulation: tf.angulation || 'NORMAL',
          eruption_status: tf.eruption_status || 'ERUPTED',
          mobility: tf.mobility || 'GRADE_0',
          rotation: tf.rotation || 'NONE',
          inclination: tf.inclination || 'NORMAL',
          presence_status: tf.presence_status,
          notes: tf.notes || null,
          created_at: ctx.timestamp,
          updated_at: ctx.timestamp,
        });
      }

      const initialArchRows: SqliteArchMeasurementRow[] = [];
      for (const am of dto.initial_arch_measurements || []) {
        const amVal = DomainValidationEngine.validate({
          context: {
            command_id: 'AddArchMeasurement',
            operation_id: `${ctx.operation_id}-am-${am.id}`,
            user_id: ctx.user_id,
            user_role: ctx.user_role,
            device_id: ctx.device_id,
            case_id: dto.case_id,
            schema_version: 'SCHEMA_FREEZE_v1.0',
            domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
            timestamp: ctx.timestamp,
            mode: 'STRICT',
          },
          payload: {
            entityType: 'ArchMeasurement',
            entityId: am.id,
            caseId: dto.case_id,
            examinationId: examRow.id,
            examinationExists: true,
            examinationIsDeleted: false,
            examinationStatus: 'DRAFT',
            archType: am.arch,
            archMeasurementType: am.measurement_type,
            archMeasurementValue: am.value,
            archMeasurementMethod: am.method,
            version: 1,
            auditCreated: true,
            syncOutboxCreated: true,
          },
        });
        if (!amVal.valid) {
          throw {
            code: amVal.errors[0]?.code || 'ERR_INVALID_ARCH_MEASUREMENT',
            message: amVal.errors[0]?.message || `Invalid arch measurement.`,
            validation: amVal,
          };
        }
        initialArchRows.push({
          id: am.id,
          examination_id: examRow.id,
          arch: am.arch,
          measurement_type: am.measurement_type,
          value: am.value,
          unit: am.unit || 'mm',
          method: am.method,
          reference: am.reference || 'Standard Norm',
          notes: am.notes || null,
          created_at: ctx.timestamp,
          updated_at: ctx.timestamp,
        });
      }

      const repoRes = AuthoritativeRepositories.clinicalExaminations.createAggregate(
        txDb,
        examRow,
        initialFindingRows,
        initialToothRows,
        initialArchRows
      );
      if (!repoRes.ok || !repoRes.data) {
        throw {
          code: repoRes.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
          message: repoRes.error?.message || 'Failed to persist examination aggregate via repository.',
        };
      }

      // PC15 fault-injection test hook: rollback parent + children if child fails
      if (dto.simulateChildInsertionFailure) {
        throw {
          code: 'ERR_ATOMIC_CHILD_INSERT_FAILURE',
          message: 'Simulated child insertion failure inside recordClinicalExamination — rolling back entire examination.',
        };
      }

      const auditId = `aud-${ctx.operation_id}`;
      const auditRow: SqliteAuditLogRow & Record<string, any> = {
        id: auditId,
        entity_type: 'ClinicalExamination',
        entity_id: examRow.id,
        operation_type: 'CREATE',
        user_id: ctx.user_id,
        device_id: ctx.device_id,
        timestamp: ctx.timestamp,
        entity_version_before: null,
        entity_version_after: 1,
        old_payload: null,
        new_payload: JSON.stringify(examRow),
        reason_code: `Recorded ClinicalExamination (${examRow.examination_stage}) for Case ${orthoCase.case_number}`,
        metadata_json: JSON.stringify({
          actor_role: ctx.user_role,
          case_number: orthoCase.case_number,
        }),
        action_type: 'CREATE',
        actor_user_id: ctx.user_id,
        actor_role: ctx.user_role,
        reason: `Recorded ClinicalExamination (${examRow.examination_stage}) for Case ${orthoCase.case_number}`,
        previous_state_snapshot: null,
        new_state_snapshot: JSON.stringify(examRow),
        created_at: ctx.timestamp,
      };
      txDb.audit_logs.set(auditId, auditRow);

      const syncRow: SqliteSyncOperationRow & Record<string, any> = {
        operation_id: ctx.operation_id,
        device_id: ctx.device_id,
        entity_type: 'ClinicalExamination',
        entity_id: examRow.id,
        operation_type: 'CREATE',
        base_version: 0,
        result_version: 1,
        payload: JSON.stringify(examRow),
        created_at: ctx.timestamp,
        sync_status: 'PENDING',
        retry_count: 0,
        error_code: null,
        error_message: null,
        id: ctx.operation_id,
        entity_version: 1,
        payload_json: JSON.stringify(examRow),
        idempotency_key: ctx.operation_id,
        last_error: null,
        synced_at: null,
      };
      txDb.sync_operations.set(ctx.operation_id, syncRow);

      restoreAuthoritativeDatabase(db, txDb);
      return {
        committed: true,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: P3CClinicalExaminationQueryService.getExaminationAggregate(db, examRow.id),
        resulting_version: 1,
        audit_id: auditId,
        sync_operation_id: ctx.operation_id,
        validation: valResult,
        error_code: null,
        error_message: null,
      };
    } catch (err: unknown) {
      const typedErr = err as { code?: string; message?: string; validation?: ValidationCommandInput };
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code: typedErr.code || 'ERR_EXAMINATION_TRANSACTION_ROLLBACK',
        error_message: typedErr.message || 'Rolled back clinical examination transaction.',
      };
    }
  }

  public static updateClinicalExamination(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    dto: UpdateClinicalExaminationDto
  ): P3ServiceResult<ClinicalExaminationAggregateView> {
    const existingRes = AuthoritativeRepositories.clinicalExaminations.getRowById(db, dto.id, true);
    const existing = existingRes.ok && existingRes.data ? existingRes.data : null;

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'UpdateClinicalExamination',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        case_id: dto.case_id,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'ClinicalExamination',
        entityId: dto.id,
        caseId: dto.case_id,
        examinationId: dto.id,
        examinationExists: Boolean(existing),
        examinationIsDeleted: Boolean(existing && existing.is_deleted === 1),
        isDeletedTarget: Boolean(existing && existing.is_deleted === 1),
        examinationCaseIdMatch: existing ? existing.case_id === dto.case_id : true,
        examinationStatus: existing?.status || 'DRAFT',
        examinationStage: dto.examination_stage ?? existing?.examination_stage,
        examinationDate: dto.examination_date ?? existing?.examination_date,
        examinerId: dto.examiner_id ?? existing?.examiner_id,
        baseVersion: dto.expected_version,
        currentVersion: existing ? existing.version : dto.expected_version,
        expectedVersion: dto.expected_version,
        actualVersion: existing ? existing.version : dto.expected_version,
        version: existing ? existing.version + 1 : 2,
        auditCreated: true,
        syncOutboxCreated: true,
      },
    };
    const valResult = DomainValidationEngine.validate(valInput);

    if (!valResult.valid || !existing) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code: valResult.errors[0]?.code || 'ERR_EXAMINATION_NOT_FOUND',
        error_message: valResult.errors[0]?.message || 'Examination update validation failed.',
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const repoUpd = AuthoritativeRepositories.clinicalExaminations.update(
      txDb,
      dto.case_id,
      dto.id,
      dto.expected_version,
      {
        examination_date: dto.examination_date ?? existing.examination_date,
        examination_stage: dto.examination_stage ?? existing.examination_stage,
        general_findings: dto.general_findings !== undefined ? dto.general_findings : existing.general_findings,
        notes: dto.notes !== undefined ? dto.notes : existing.notes,
      },
      ctx.timestamp,
      ctx.user_id
    );

    if (!repoUpd.ok || !repoUpd.data) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code:
          repoUpd.error?.code === 'ERR_REPOSITORY_VERSION_CONFLICT'
            ? 'ERR_VERSION_CONFLICT'
            : repoUpd.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoUpd.error?.message || 'Examination update failed.',
      };
    }

    const updatedRow = AuthoritativeRepositories.clinicalExaminations.getRowById(txDb, dto.id, true).data!;
    const nextVersion = updatedRow.version;

    const auditId = `aud-${ctx.operation_id}`;
    const auditRow: SqliteAuditLogRow & Record<string, any> = {
      id: auditId,
      entity_type: 'ClinicalExamination',
      entity_id: dto.id,
      operation_type: 'UPDATE',
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      entity_version_before: existing.version,
      entity_version_after: nextVersion,
      old_payload: JSON.stringify(existing),
      new_payload: JSON.stringify(updatedRow),
      reason_code: `Updated ClinicalExamination ${dto.id} v${existing.version}->v${nextVersion}`,
      metadata_json: JSON.stringify({
        actor_role: ctx.user_role,
      }),
      action_type: 'UPDATE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      reason: `Updated ClinicalExamination ${dto.id} v${existing.version}->v${nextVersion}`,
      previous_state_snapshot: JSON.stringify(existing),
      new_state_snapshot: JSON.stringify(updatedRow),
      created_at: ctx.timestamp,
    };
    txDb.audit_logs.set(auditId, auditRow);

    const syncRow: SqliteSyncOperationRow & Record<string, any> = {
      operation_id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'ClinicalExamination',
      entity_id: dto.id,
      operation_type: 'UPDATE',
      base_version: existing.version,
      result_version: nextVersion,
      payload: JSON.stringify(updatedRow),
      created_at: ctx.timestamp,
      sync_status: 'PENDING',
      retry_count: 0,
      error_code: null,
      error_message: null,
      id: ctx.operation_id,
      entity_version: nextVersion,
      payload_json: JSON.stringify(updatedRow),
      idempotency_key: ctx.operation_id,
      last_error: null,
      synced_at: null,
    };
    txDb.sync_operations.set(ctx.operation_id, syncRow);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: P3CClinicalExaminationQueryService.getExaminationAggregate(db, dto.id),
      resulting_version: nextVersion,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }

  public static confirmClinicalExamination(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    caseId: string,
    examinationId: string,
    expectedVersion: number
  ): P3ServiceResult<ClinicalExaminationAggregateView> {
    const existingRes = AuthoritativeRepositories.clinicalExaminations.getRowById(db, examinationId, true);
    const existing = existingRes.ok && existingRes.data ? existingRes.data : null;

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'ConfirmClinicalExamination',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        case_id: caseId,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'ClinicalExamination',
        entityId: examinationId,
        caseId,
        examinationId,
        examinationExists: Boolean(existing),
        examinationIsDeleted: Boolean(existing && existing.is_deleted === 1),
        isDeletedTarget: Boolean(existing && existing.is_deleted === 1),
        examinationCaseIdMatch: existing ? existing.case_id === caseId : true,
        examinationStatus: existing?.status || 'DRAFT',
        baseVersion: expectedVersion,
        currentVersion: existing ? existing.version : expectedVersion,
        expectedVersion,
        actualVersion: existing ? existing.version : expectedVersion,
        version: existing ? existing.version + 1 : 2,
        auditCreated: true,
        syncOutboxCreated: true,
      },
    };
    const valResult = DomainValidationEngine.validate(valInput);

    if (!valResult.valid || !existing) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code: valResult.errors[0]?.code || 'ERR_EXAMINATION_NOT_FOUND',
        error_message: valResult.errors[0]?.message || 'Examination confirmation failed.',
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const repoConfirm = AuthoritativeRepositories.clinicalExaminations.confirm(
      txDb,
      caseId,
      examinationId,
      expectedVersion,
      ctx.timestamp,
      ctx.user_id
    );

    if (!repoConfirm.ok || !repoConfirm.data) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code:
          repoConfirm.error?.code === 'ERR_REPOSITORY_VERSION_CONFLICT'
            ? 'ERR_VERSION_CONFLICT'
            : repoConfirm.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoConfirm.error?.message || 'Confirm examination failed.',
      };
    }

    const confirmedRow = AuthoritativeRepositories.clinicalExaminations.getRowById(txDb, examinationId, true).data!;
    const nextVersion = confirmedRow.version;

    const auditId = `aud-${ctx.operation_id}`;
    const auditRow: SqliteAuditLogRow & Record<string, any> = {
      id: auditId,
      entity_type: 'ClinicalExamination',
      entity_id: examinationId,
      operation_type: 'UPDATE',
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      entity_version_before: existing.version,
      entity_version_after: nextVersion,
      old_payload: JSON.stringify(existing),
      new_payload: JSON.stringify(confirmedRow),
      reason_code: `Confirmed ClinicalExamination ${examinationId} (DRAFT -> CONFIRMED)`,
      metadata_json: JSON.stringify({
        actor_role: ctx.user_role,
      }),
      action_type: 'APPROVE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      reason: `Confirmed ClinicalExamination ${examinationId} (DRAFT -> CONFIRMED)`,
      previous_state_snapshot: JSON.stringify(existing),
      new_state_snapshot: JSON.stringify(confirmedRow),
      created_at: ctx.timestamp,
    };
    txDb.audit_logs.set(auditId, auditRow);

    const syncRow: SqliteSyncOperationRow & Record<string, any> = {
      operation_id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'ClinicalExamination',
      entity_id: examinationId,
      operation_type: 'UPDATE',
      base_version: existing.version,
      result_version: nextVersion,
      payload: JSON.stringify(confirmedRow),
      created_at: ctx.timestamp,
      sync_status: 'PENDING',
      retry_count: 0,
      error_code: null,
      error_message: null,
      id: ctx.operation_id,
      entity_version: nextVersion,
      payload_json: JSON.stringify(confirmedRow),
      idempotency_key: ctx.operation_id,
      last_error: null,
      synced_at: null,
    };
    txDb.sync_operations.set(ctx.operation_id, syncRow);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: P3CClinicalExaminationQueryService.getExaminationAggregate(db, examinationId),
      resulting_version: nextVersion,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }

  public static softDeleteClinicalExamination(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    caseId: string,
    examinationId: string,
    expectedVersion: number,
    reason: string
  ): P3ServiceResult<ClinicalExaminationAggregateView> {
    const existingRes = AuthoritativeRepositories.clinicalExaminations.getRowById(db, examinationId, true);
    const existing = existingRes.ok && existingRes.data ? existingRes.data : null;

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'SoftDeleteClinicalExamination',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        case_id: caseId,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'ClinicalExamination',
        entityId: examinationId,
        caseId,
        examinationId,
        examinationExists: Boolean(existing),
        examinationIsDeleted: Boolean(existing && existing.is_deleted === 1),
        isDeletedTarget: Boolean(existing && existing.is_deleted === 1),
        examinationCaseIdMatch: existing ? existing.case_id === caseId : true,
        baseVersion: expectedVersion,
        currentVersion: existing ? existing.version : expectedVersion,
        expectedVersion,
        actualVersion: existing ? existing.version : expectedVersion,
        version: existing ? existing.version + 1 : 2,
        auditCreated: true,
        syncOutboxCreated: true,
      },
    };
    const valResult = DomainValidationEngine.validate(valInput);

    if (!valResult.valid || !existing) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code: valResult.errors[0]?.code || 'ERR_EXAMINATION_NOT_FOUND',
        error_message: valResult.errors[0]?.message || 'Soft delete examination failed.',
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const repoDel = AuthoritativeRepositories.clinicalExaminations.softDelete(
      txDb,
      caseId,
      examinationId,
      expectedVersion,
      ctx.timestamp,
      ctx.user_id
    );

    if (!repoDel.ok || !repoDel.data) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code:
          repoDel.error?.code === 'ERR_REPOSITORY_VERSION_CONFLICT'
            ? 'ERR_VERSION_CONFLICT'
            : repoDel.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoDel.error?.message || 'Soft delete examination failed.',
      };
    }

    const deletedRow = AuthoritativeRepositories.clinicalExaminations.getRowById(txDb, examinationId, true).data!;
    const nextVersion = deletedRow.version;

    const auditId = `aud-${ctx.operation_id}`;
    const auditRow: SqliteAuditLogRow & Record<string, any> = {
      id: auditId,
      entity_type: 'ClinicalExamination',
      entity_id: examinationId,
      operation_type: 'DELETE',
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      entity_version_before: existing.version,
      entity_version_after: nextVersion,
      old_payload: JSON.stringify(existing),
      new_payload: JSON.stringify(deletedRow),
      reason_code: reason,
      metadata_json: JSON.stringify({
        actor_role: ctx.user_role,
      }),
      action_type: 'SOFT_DELETE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      reason,
      previous_state_snapshot: JSON.stringify(existing),
      new_state_snapshot: JSON.stringify(deletedRow),
      created_at: ctx.timestamp,
    };
    txDb.audit_logs.set(auditId, auditRow);

    const syncRow: SqliteSyncOperationRow & Record<string, any> = {
      operation_id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'ClinicalExamination',
      entity_id: examinationId,
      operation_type: 'DELETE',
      base_version: existing.version,
      result_version: nextVersion,
      payload: JSON.stringify(deletedRow),
      created_at: ctx.timestamp,
      sync_status: 'PENDING',
      retry_count: 0,
      error_code: null,
      error_message: null,
      id: ctx.operation_id,
      entity_version: nextVersion,
      payload_json: JSON.stringify(deletedRow),
      idempotency_key: ctx.operation_id,
      last_error: null,
      synced_at: null,
    };
    txDb.sync_operations.set(ctx.operation_id, syncRow);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: P3CClinicalExaminationQueryService.getExaminationAggregate(db, examinationId, true),
      resulting_version: nextVersion,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }

  public static restoreClinicalExamination(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    caseId: string,
    examinationId: string,
    expectedVersion: number
  ): P3ServiceResult<ClinicalExaminationAggregateView> {
    const existingRes = AuthoritativeRepositories.clinicalExaminations.getRowById(db, examinationId, true);
    const existing = existingRes.ok && existingRes.data ? existingRes.data : null;

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'RestoreClinicalExamination',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        case_id: caseId,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'ClinicalExamination',
        entityId: examinationId,
        caseId,
        examinationId,
        examinationExists: Boolean(existing),
        examinationIsDeleted: Boolean(existing && existing.is_deleted === 1),
        isDeletedTarget: false,
        examinationCaseIdMatch: existing ? existing.case_id === caseId : true,
        baseVersion: expectedVersion,
        currentVersion: existing ? existing.version : expectedVersion,
        expectedVersion,
        actualVersion: existing ? existing.version : expectedVersion,
        version: existing ? existing.version + 1 : 2,
        auditCreated: true,
        syncOutboxCreated: true,
      },
    };
    const valResult = DomainValidationEngine.validate(valInput);

    if (!valResult.valid || !existing) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code: valResult.errors[0]?.code || 'ERR_EXAMINATION_NOT_FOUND',
        error_message: valResult.errors[0]?.message || 'Restore examination failed.',
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const repoRestore = AuthoritativeRepositories.clinicalExaminations.restore(
      txDb,
      caseId,
      examinationId,
      expectedVersion,
      ctx.timestamp,
      ctx.user_id
    );

    if (!repoRestore.ok || !repoRestore.data) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code:
          repoRestore.error?.code === 'ERR_REPOSITORY_VERSION_CONFLICT'
            ? 'ERR_VERSION_CONFLICT'
            : repoRestore.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoRestore.error?.message || 'Restore examination failed.',
      };
    }

    const restoredRow = AuthoritativeRepositories.clinicalExaminations.getRowById(txDb, examinationId, true).data!;
    const nextVersion = restoredRow.version;

    const auditId = `aud-${ctx.operation_id}`;
    const auditRow: SqliteAuditLogRow & Record<string, any> = {
      id: auditId,
      entity_type: 'ClinicalExamination',
      entity_id: examinationId,
      operation_type: 'RESTORE',
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      entity_version_before: existing.version,
      entity_version_after: nextVersion,
      old_payload: JSON.stringify(existing),
      new_payload: JSON.stringify(restoredRow),
      reason_code: `Restored ClinicalExamination ${examinationId}`,
      metadata_json: JSON.stringify({
        actor_role: ctx.user_role,
      }),
      action_type: 'RESTORE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      reason: `Restored ClinicalExamination ${examinationId}`,
      previous_state_snapshot: JSON.stringify(existing),
      new_state_snapshot: JSON.stringify(restoredRow),
      created_at: ctx.timestamp,
    };
    txDb.audit_logs.set(auditId, auditRow);

    const syncRow: SqliteSyncOperationRow & Record<string, any> = {
      operation_id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'ClinicalExamination',
      entity_id: examinationId,
      operation_type: 'RESTORE',
      base_version: existing.version,
      result_version: nextVersion,
      payload: JSON.stringify(restoredRow),
      created_at: ctx.timestamp,
      sync_status: 'PENDING',
      retry_count: 0,
      error_code: null,
      error_message: null,
      id: ctx.operation_id,
      entity_version: nextVersion,
      payload_json: JSON.stringify(restoredRow),
      idempotency_key: ctx.operation_id,
      last_error: null,
      synced_at: null,
    };
    txDb.sync_operations.set(ctx.operation_id, syncRow);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: P3CClinicalExaminationQueryService.getExaminationAggregate(db, examinationId),
      resulting_version: nextVersion,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }

  public static addClinicalFinding(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    dto: AddClinicalFindingDto
  ): P3ServiceResult<SqliteClinicalFindingRow> {
    const examRes = AuthoritativeRepositories.clinicalExaminations.getRowById(db, dto.examination_id, true);
    const exam = examRes.ok && examRes.data ? examRes.data : null;

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'AddClinicalFinding',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        case_id: dto.case_id,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'ClinicalFinding',
        entityId: dto.id,
        caseId: dto.case_id,
        examinationId: dto.examination_id,
        examinationExists: Boolean(exam),
        examinationIsDeleted: Boolean(exam && exam.is_deleted === 1),
        isDeletedTarget: Boolean(exam && exam.is_deleted === 1),
        examinationCaseIdMatch: exam ? exam.case_id === dto.case_id : true,
        examinationStatus: exam?.status || 'DRAFT',
        findingCategory: dto.category,
        findingCode: dto.finding_code,
        findingSeverity: dto.severity,
        findingSide: dto.side,
        clinicalSignificance: dto.clinical_significance,
        version: exam ? exam.version + 1 : 1,
        auditCreated: true,
        syncOutboxCreated: true,
      },
    };
    const valResult = DomainValidationEngine.validate(valInput);

    if (!valResult.valid || !exam) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code: valResult.errors[0]?.code || 'ERR_EXAMINATION_NOT_FOUND',
        error_message: valResult.errors[0]?.message || 'Finding validation failed.',
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const findingRow: SqliteClinicalFindingRow = {
      id: dto.id,
      examination_id: dto.examination_id,
      category: dto.category,
      finding_code: dto.finding_code.trim(),
      value: dto.value,
      unit: dto.unit || null,
      severity: dto.severity,
      side: dto.side,
      location: dto.location || null,
      clinical_significance: dto.clinical_significance,
      notes: dto.notes || null,
      created_at: ctx.timestamp,
      updated_at: ctx.timestamp,
    };

    const repoAddRes = AuthoritativeRepositories.clinicalExaminations.addFinding(
      txDb,
      dto.case_id,
      dto.examination_id,
      findingRow,
      ctx.user_id,
      ctx.timestamp
    );

    if (!repoAddRes.ok || !repoAddRes.data) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code:
          repoAddRes.error?.code === 'ERR_REPOSITORY_NOT_FOUND'
            ? 'ERR_EXAMINATION_NOT_FOUND'
            : repoAddRes.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoAddRes.error?.message || `Examination ${dto.examination_id} not found.`,
      };
    }

    const nextExamVer = repoAddRes.resulting_version!;
    const baseVer = nextExamVer - 1;

    const auditId = `aud-${ctx.operation_id}`;
    const auditRow: SqliteAuditLogRow & Record<string, any> = {
      id: auditId,
      entity_type: 'ClinicalFinding',
      entity_id: findingRow.id,
      operation_type: 'CREATE',
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      entity_version_before: baseVer,
      entity_version_after: nextExamVer,
      old_payload: null,
      new_payload: JSON.stringify(findingRow),
      reason_code: `Added ${findingRow.category} finding (${findingRow.finding_code}) to exam ${dto.examination_id}`,
      metadata_json: JSON.stringify({
        actor_role: ctx.user_role,
        examination_id: dto.examination_id,
      }),
      action_type: 'CREATE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      reason: `Added ${findingRow.category} finding (${findingRow.finding_code}) to exam ${dto.examination_id}`,
      previous_state_snapshot: null,
      new_state_snapshot: JSON.stringify(findingRow),
      created_at: ctx.timestamp,
    };
    txDb.audit_logs.set(auditId, auditRow);

    const syncRow: SqliteSyncOperationRow & Record<string, any> = {
      operation_id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'ClinicalFinding',
      entity_id: findingRow.id,
      operation_type: 'CREATE',
      base_version: baseVer,
      result_version: nextExamVer,
      payload: JSON.stringify(findingRow),
      created_at: ctx.timestamp,
      sync_status: 'PENDING',
      retry_count: 0,
      error_code: null,
      error_message: null,
      id: ctx.operation_id,
      entity_version: nextExamVer,
      payload_json: JSON.stringify(findingRow),
      idempotency_key: ctx.operation_id,
      last_error: null,
      synced_at: null,
    };
    txDb.sync_operations.set(ctx.operation_id, syncRow);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: repoAddRes.data,
      resulting_version: nextExamVer,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }

  public static addToothFinding(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    dto: AddToothFindingDto
  ): P3ServiceResult<SqliteToothFindingRow> {
    const examRes = AuthoritativeRepositories.clinicalExaminations.getRowById(db, dto.examination_id, true);
    const exam = examRes.ok && examRes.data ? examRes.data : null;

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'AddToothFinding',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        case_id: dto.case_id,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'ToothFinding',
        entityId: dto.id,
        caseId: dto.case_id,
        examinationId: dto.examination_id,
        examinationExists: Boolean(exam),
        examinationIsDeleted: Boolean(exam && exam.is_deleted === 1),
        isDeletedTarget: Boolean(exam && exam.is_deleted === 1),
        examinationCaseIdMatch: exam ? exam.case_id === dto.case_id : true,
        examinationStatus: exam?.status || 'DRAFT',
        toothNumberFdi: dto.tooth_number,
        toothFindingType: dto.finding_type,
        presenceStatus: dto.presence_status,
        version: exam ? exam.version + 1 : 1,
        auditCreated: true,
        syncOutboxCreated: true,
      },
    };
    const valResult = DomainValidationEngine.validate(valInput);

    if (!valResult.valid || !exam) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code: valResult.errors[0]?.code || 'ERR_INVALID_FDI_TOOTH_NUMBER',
        error_message: valResult.errors[0]?.message || 'Tooth finding validation failed.',
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const toothRow: SqliteToothFindingRow = {
      id: dto.id,
      examination_id: dto.examination_id,
      tooth_number: dto.tooth_number,
      finding_type: dto.finding_type,
      status: dto.status || 'RECORDED',
      condition: dto.condition || 'SOUND',
      position: dto.position || 'NORMAL',
      angulation: dto.angulation || 'NORMAL',
      eruption_status: dto.eruption_status || 'ERUPTED',
      mobility: dto.mobility || 'GRADE_0',
      rotation: dto.rotation || 'NONE',
      inclination: dto.inclination || 'NORMAL',
      presence_status: dto.presence_status,
      notes: dto.notes || null,
      created_at: ctx.timestamp,
      updated_at: ctx.timestamp,
    };

    const repoAddRes = AuthoritativeRepositories.clinicalExaminations.addToothFinding(
      txDb,
      dto.case_id,
      dto.examination_id,
      toothRow,
      ctx.user_id,
      ctx.timestamp
    );

    if (!repoAddRes.ok || !repoAddRes.data) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code:
          repoAddRes.error?.code === 'ERR_REPOSITORY_NOT_FOUND'
            ? 'ERR_EXAMINATION_NOT_FOUND'
            : repoAddRes.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoAddRes.error?.message || 'Tooth finding creation failed.',
      };
    }

    const nextExamVer = repoAddRes.resulting_version!;
    const baseVer = nextExamVer - 1;

    const auditId = `aud-${ctx.operation_id}`;
    const auditRow: SqliteAuditLogRow & Record<string, any> = {
      id: auditId,
      entity_type: 'ToothFinding',
      entity_id: toothRow.id,
      operation_type: 'CREATE',
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      entity_version_before: baseVer,
      entity_version_after: nextExamVer,
      old_payload: null,
      new_payload: JSON.stringify(toothRow),
      reason_code: `Added ToothFinding (FDI #${toothRow.tooth_number}: ${toothRow.finding_type})`,
      metadata_json: JSON.stringify({
        actor_role: ctx.user_role,
        examination_id: dto.examination_id,
      }),
      action_type: 'CREATE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      reason: `Added ToothFinding (FDI #${toothRow.tooth_number}: ${toothRow.finding_type})`,
      previous_state_snapshot: null,
      new_state_snapshot: JSON.stringify(toothRow),
      created_at: ctx.timestamp,
    };
    txDb.audit_logs.set(auditId, auditRow);

    const syncRow: SqliteSyncOperationRow & Record<string, any> = {
      operation_id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'ToothFinding',
      entity_id: toothRow.id,
      operation_type: 'CREATE',
      base_version: baseVer,
      result_version: nextExamVer,
      payload: JSON.stringify(toothRow),
      created_at: ctx.timestamp,
      sync_status: 'PENDING',
      retry_count: 0,
      error_code: null,
      error_message: null,
      id: ctx.operation_id,
      entity_version: nextExamVer,
      payload_json: JSON.stringify(toothRow),
      idempotency_key: ctx.operation_id,
      last_error: null,
      synced_at: null,
    };
    txDb.sync_operations.set(ctx.operation_id, syncRow);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: repoAddRes.data,
      resulting_version: nextExamVer,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }

  public static addArchMeasurement(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    dto: AddArchMeasurementDto
  ): P3ServiceResult<SqliteArchMeasurementRow> {
    const examRes = AuthoritativeRepositories.clinicalExaminations.getRowById(db, dto.examination_id, true);
    const exam = examRes.ok && examRes.data ? examRes.data : null;

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'AddArchMeasurement',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        case_id: dto.case_id,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'ArchMeasurement',
        entityId: dto.id,
        caseId: dto.case_id,
        examinationId: dto.examination_id,
        examinationExists: Boolean(exam),
        examinationIsDeleted: Boolean(exam && exam.is_deleted === 1),
        isDeletedTarget: Boolean(exam && exam.is_deleted === 1),
        examinationCaseIdMatch: exam ? exam.case_id === dto.case_id : true,
        examinationStatus: exam?.status || 'DRAFT',
        archType: dto.arch,
        archMeasurementType: dto.measurement_type,
        archMeasurementValue: dto.value,
        archMeasurementMethod: dto.method,
        version: exam ? exam.version + 1 : 1,
        auditCreated: true,
        syncOutboxCreated: true,
      },
    };
    const valResult = DomainValidationEngine.validate(valInput);

    if (!valResult.valid || !exam) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code: valResult.errors[0]?.code || 'ERR_INVALID_ARCH_MEASUREMENT',
        error_message: valResult.errors[0]?.message || 'Arch measurement validation failed.',
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const archRow: SqliteArchMeasurementRow = {
      id: dto.id,
      examination_id: dto.examination_id,
      arch: dto.arch,
      measurement_type: dto.measurement_type,
      value: dto.value,
      unit: dto.unit || 'mm',
      method: dto.method,
      reference: dto.reference || 'Standard Norm',
      notes: dto.notes || null,
      created_at: ctx.timestamp,
      updated_at: ctx.timestamp,
    };

    const repoAddRes = AuthoritativeRepositories.clinicalExaminations.addArchMeasurement(
      txDb,
      dto.case_id,
      dto.examination_id,
      archRow,
      ctx.user_id,
      ctx.timestamp
    );

    if (!repoAddRes.ok || !repoAddRes.data) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code:
          repoAddRes.error?.code === 'ERR_REPOSITORY_NOT_FOUND'
            ? 'ERR_EXAMINATION_NOT_FOUND'
            : repoAddRes.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoAddRes.error?.message || 'Arch measurement creation failed.',
      };
    }

    const nextExamVer = repoAddRes.resulting_version!;
    const baseVer = nextExamVer - 1;

    const auditId = `aud-${ctx.operation_id}`;
    const auditRow: SqliteAuditLogRow & Record<string, any> = {
      id: auditId,
      entity_type: 'ArchMeasurement',
      entity_id: archRow.id,
      operation_type: 'CREATE',
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      entity_version_before: baseVer,
      entity_version_after: nextExamVer,
      old_payload: null,
      new_payload: JSON.stringify(archRow),
      reason_code: `Added ArchMeasurement (${archRow.arch} ${archRow.measurement_type}: ${archRow.value}${archRow.unit})`,
      metadata_json: JSON.stringify({
        actor_role: ctx.user_role,
        examination_id: dto.examination_id,
      }),
      action_type: 'CREATE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      reason: `Added ArchMeasurement (${archRow.arch} ${archRow.measurement_type}: ${archRow.value}${archRow.unit})`,
      previous_state_snapshot: null,
      new_state_snapshot: JSON.stringify(archRow),
      created_at: ctx.timestamp,
    };
    txDb.audit_logs.set(auditId, auditRow);

    const syncRow: SqliteSyncOperationRow & Record<string, any> = {
      operation_id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'ArchMeasurement',
      entity_id: archRow.id,
      operation_type: 'CREATE',
      base_version: baseVer,
      result_version: nextExamVer,
      payload: JSON.stringify(archRow),
      created_at: ctx.timestamp,
      sync_status: 'PENDING',
      retry_count: 0,
      error_code: null,
      error_message: null,
      id: ctx.operation_id,
      entity_version: nextExamVer,
      payload_json: JSON.stringify(archRow),
      idempotency_key: ctx.operation_id,
      last_error: null,
      synced_at: null,
    };
    txDb.sync_operations.set(ctx.operation_id, syncRow);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: repoAddRes.data,
      resulting_version: nextExamVer,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }

  public static recordProblemFromExamination(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    dto: RecordProblemFromExaminationDto
  ): P3ServiceResult<ProblemDomainEntity> {
    const caseRes = AuthoritativeRepositories.orthodonticCases.getRowById(db, dto.case_id, true);
    const orthoCase = caseRes.ok && caseRes.data ? caseRes.data : null;

    const examRes = AuthoritativeRepositories.clinicalExaminations.getRowById(db, dto.examination_id, true);
    const exam = examRes.ok && examRes.data ? examRes.data : null;

    // Collect referenced evidence entity descriptors (existence + case_id) for DomainValidationEngine
    const referencedEntities: NonNullable<
      ValidationCommandInput['payload']['referencedEntities']
    > = (dto.evidence_links || []).map((ev) => {
      let exists = false;
      let resolvedCaseId = '';
      if (ev.source_entity_type === 'clinical_findings') {
        const cf = db.clinical_findings.get(ev.source_entity_id);
        const cfExam = cf ? db.clinical_examinations.get(cf.examination_id) : null;
        exists = Boolean(cf && cfExam && cfExam.is_deleted === 0);
        resolvedCaseId = cfExam?.case_id || '';
      } else if (ev.source_entity_type === 'tooth_findings') {
        const tf = db.tooth_findings.get(ev.source_entity_id);
        const tfExam = tf ? db.clinical_examinations.get(tf.examination_id) : null;
        exists = Boolean(tf && tfExam && tfExam.is_deleted === 0);
        resolvedCaseId = tfExam?.case_id || '';
      } else if (ev.source_entity_type === 'arch_measurements') {
        const am = db.arch_measurements.get(ev.source_entity_id);
        const amExam = am ? db.clinical_examinations.get(am.examination_id) : null;
        exists = Boolean(am && amExam && amExam.is_deleted === 0);
        resolvedCaseId = amExam?.case_id || '';
      }
      return {
        label: `ProblemEvidence:${ev.source_entity_type}`,
        entityId: ev.source_entity_id,
        exists,
        caseId: resolvedCaseId,
      };
    });

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'RecordProblemFromExamination',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        patient_id: orthoCase?.patient_id,
        case_id: dto.case_id,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'Problem',
        entityId: dto.id,
        patientId: orthoCase?.patient_id || 'pat-unknown',
        caseId: dto.case_id,
        examinationId: dto.examination_id,
        caseExists: Boolean(orthoCase),
        caseIsDeleted: Boolean(orthoCase && orthoCase.is_deleted === 1),
        examinationExists: Boolean(exam),
        examinationIsDeleted: Boolean(exam && exam.is_deleted === 1),
        examinationCaseIdMatch: exam ? exam.case_id === dto.case_id : true,
        referencedEntities,
        problemCode: dto.problem_code,
        problemCategory: dto.category,
        problemSeverity: dto.severity,
        problemEvidenceCount: dto.evidence_links ? dto.evidence_links.length : 0,
        problemEvidenceItems: (dto.evidence_links || []).map((ev) => ({
          id: ev.id,
          evidence_type: ev.evidence_type,
          source_entity_type: ev.source_entity_type,
          source_entity_id: ev.source_entity_id,
          interpretation: ev.interpretation,
        })),
        version: 1,
        auditCreated: true,
        syncOutboxCreated: true,
      },
    };
    const valResult = DomainValidationEngine.validate(valInput);

    if (!valResult.valid || !orthoCase || !exam) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code: valResult.errors[0]?.code || 'ERR_VALIDATION',
        error_message: valResult.errors[0]?.message || 'Problem validation failed.',
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const problemRow: SqliteProblemRow = {
      id: dto.id,
      case_id: dto.case_id,
      problem_code: dto.problem_code.trim(),
      category: dto.category,
      title: dto.title.trim(),
      description: dto.description.trim(),
      severity: dto.severity,
      priority: dto.priority,
      status: 'ACTIVE',
      identified_at: ctx.timestamp,
      resolved_at: null,
      source_type: 'INITIAL_DIAGNOSIS',
      source_reference_id: dto.examination_id,
      created_at: ctx.timestamp,
      updated_at: ctx.timestamp,
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
      version: 1,
      is_deleted: 0,
      deleted_at: null,
    };

    const evidenceRows: SqliteProblemEvidenceRow[] = dto.evidence_links.map((ev) => ({
      id: ev.id,
      problem_id: dto.id,
      evidence_type: ev.evidence_type,
      source_entity_type: ev.source_entity_type,
      source_entity_id: ev.source_entity_id,
      measurement_value: ev.measurement_value ?? null,
      measurement_unit: ev.measurement_unit ?? null,
      interpretation: ev.interpretation,
      created_at: ctx.timestamp,
      created_by: ctx.user_id,
    }));

    const repoProb = AuthoritativeRepositories.problems.create(txDb, problemRow, evidenceRows);
    if (!repoProb.ok || !repoProb.data) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code: repoProb.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoProb.error?.message || 'Problem repository create failed.',
      };
    }

    const auditId = `aud-${ctx.operation_id}`;
    const auditRow: SqliteAuditLogRow & Record<string, any> = {
      id: auditId,
      entity_type: 'Problem',
      entity_id: problemRow.id,
      operation_type: 'CREATE',
      user_id: ctx.user_id,
      device_id: ctx.device_id,
      timestamp: ctx.timestamp,
      entity_version_before: null,
      entity_version_after: 1,
      old_payload: null,
      new_payload: JSON.stringify(problemRow),
      reason_code: `Recorded Problem (${problemRow.problem_code}) from examination ${dto.examination_id}`,
      metadata_json: JSON.stringify({
        actor_role: ctx.user_role,
        examination_id: dto.examination_id,
      }),
      action_type: 'CREATE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      reason: `Recorded Problem (${problemRow.problem_code}) from examination ${dto.examination_id}`,
      previous_state_snapshot: null,
      new_state_snapshot: JSON.stringify(problemRow),
      created_at: ctx.timestamp,
    };
    txDb.audit_logs.set(auditId, auditRow);

    const syncRow: SqliteSyncOperationRow & Record<string, any> = {
      operation_id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'Problem',
      entity_id: problemRow.id,
      operation_type: 'CREATE',
      base_version: 0,
      result_version: 1,
      payload: JSON.stringify(problemRow),
      created_at: ctx.timestamp,
      sync_status: 'PENDING',
      retry_count: 0,
      error_code: null,
      error_message: null,
      id: ctx.operation_id,
      entity_version: 1,
      payload_json: JSON.stringify(problemRow),
      idempotency_key: ctx.operation_id,
      last_error: null,
      synced_at: null,
    };
    txDb.sync_operations.set(ctx.operation_id, syncRow);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: repoProb.data,
      resulting_version: 1,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }
}

export class P3CClinicalExaminationQueryService {
  public static getExaminationAggregate(
    db: P3ClinicalCoreDatabase,
    examinationId: string,
    includeDeleted = false
  ): ClinicalExaminationAggregateView | null {
    const res = AuthoritativeRepositories.clinicalExaminations.getById(db, examinationId, includeDeleted);
    const rowRes = AuthoritativeRepositories.clinicalExaminations.getRowById(db, examinationId, includeDeleted);
    if (!res.ok || !res.data || !rowRes.ok || !rowRes.data) return null;
    const entity = res.data;
    return {
      examination: rowRes.data,
      findings: entity.findings,
      tooth_findings: entity.toothFindings,
      arch_measurements: entity.archMeasurements,
    };
  }

  public static listExaminationsByCase(
    db: P3ClinicalCoreDatabase,
    caseId: string
  ): ClinicalExaminationAggregateView[] {
    const res = AuthoritativeRepositories.clinicalExaminations.listByCaseId(db, caseId, false);
    if (!res.ok || !res.data) return [];
    return res.data
      .map((entity) => P3CClinicalExaminationQueryService.getExaminationAggregate(db, entity.id)!)
      .filter(Boolean);
  }
}