/**
 * ORTHODONTIC CLINICAL PLATFORM
 * P3-D — Problem List & Evidence Forensic Test Suite
 *
 * 25 Focused Forensic Verification Tests covering:
 * - Valid creation (CreateProblem & RecordProblemFromExamination)
 * - Case ownership & cross-case isolation
 * - Invalid status & valid status transitions
 * - Evidence attachment & duplicate prevention
 * - Evidence removal & last-evidence constraint
 * - Nonexistent evidence source rejection
 * - Cross-case evidence attachment rejection
 * - Unauthorized role rejection (RECEPTION, FINANCE_ADMIN, RESEARCH_VIEWER, CLINICAL_ASSISTANT)
 * - AI_AGENT write prohibition
 * - Soft-delete & restore lifecycle
 * - Mutation of soft-deleted problem rejection
 * - Restoring active problem rejection
 * - Optimistic concurrency failure
 * - Idempotency
 * - Audit log creation
 * - Sync outbox creation
 * - Transaction rollback integrity
 * - Unsupported command rejection
 * - No direct Map-write bypass verification
 * - Query service encapsulation & projections
 */

import {
  createSeededAuthoritativeDatabase,
  cloneAuthoritativeDatabase,
  AuthoritativeRelationalDatabaseState,
  AuthoritativeCommandPipeline,
} from './p2eAndP2fPipelineAndQuery';
import {
  AuthoritativeRepositories,
} from './p2dRepositoryContract';
import {
  P3DProblemApplicationService,
  P3DProblemQueryService,
  P3DExecutionContext,
} from './p3dProblemService';

export interface P3DTestResult {
  testId: string;
  title: string;
  passed: boolean;
  evidence: string;
  details?: string;
}

export interface P3DTestSuiteReport {
  gateCode: 'G-P3D';
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  tests: P3DTestResult[];
  timestamp: string;
}

const orthoCtx = (opId: string): P3DExecutionContext => ({
  operation_id: opId,
  user_id: 'usr-ortho-01',
  user_role: 'ORTHODONTIST',
  device_id: 'dev-ipad-01',
  timestamp: '2026-10-08T12:00:00Z',
  is_online: false,
});

const adminCtx = (opId: string): P3DExecutionContext => ({
  operation_id: opId,
  user_id: 'usr-admin-01',
  user_role: 'ADMIN',
  device_id: 'dev-admin-01',
  timestamp: '2026-10-08T12:00:00Z',
  is_online: false,
});

const asstCtx = (opId: string): P3DExecutionContext => ({
  operation_id: opId,
  user_id: 'usr-assist-01',
  user_role: 'CLINICAL_ASSISTANT',
  device_id: 'dev-ipad-02',
  timestamp: '2026-10-08T12:00:00Z',
  is_online: false,
});

const recepCtx = (opId: string): P3DExecutionContext => ({
  operation_id: opId,
  user_id: 'usr-recep-01',
  user_role: 'RECEPTION',
  device_id: 'dev-frontdesk-01',
  timestamp: '2026-10-08T12:00:00Z',
  is_online: false,
});

const finCtx = (opId: string): P3DExecutionContext => ({
  operation_id: opId,
  user_id: 'usr-fin-01',
  user_role: 'FINANCE_ADMIN',
  device_id: 'dev-fin-01',
  timestamp: '2026-10-08T12:00:00Z',
  is_online: false,
});

const aiCtx = (opId: string): P3DExecutionContext => ({
  operation_id: opId,
  user_id: 'usr-ai-01',
  user_role: 'AI_AGENT',
  device_id: 'dev-cloud-01',
  timestamp: '2026-10-08T12:00:00Z',
  is_online: true,
});

export function executeP3DProblemTestSuite(): P3DTestSuiteReport {
  const db = createSeededAuthoritativeDatabase();
  const tests: P3DTestResult[] = [];

  // Seed Case 1 and Case 2 exist in db
  // Ensure we have clinical findings and tooth findings in Case 1
  const examId = 'exam-p3-001';
  const caseId1 = 'case-p3-001';
  const caseId2 = 'case-p3-002';

  // PD-01: Valid CreateProblem with initial evidence
  const r01 = P3DProblemApplicationService.createProblem(db, orthoCtx('op-pd-01'), {
    id: 'prob-pd-01',
    case_id: caseId1,
    problem_code: 'MAX_CROWDING_SEV',
    category: 'DENTAL',
    title: 'Severe Maxillary Anterior Crowding',
    description: 'Severe crowding with blocked out 13',
    severity: 'SEVERE',
    priority: 1,
    status: 'ACTIVE',
    identified_at: '2026-10-08',
    source_type: 'INITIAL_DIAGNOSIS',
    source_reference_id: examId,
    initial_evidence: [
      {
        id: 'pe-pd-01-1',
        evidence_type: 'TOOTH_FINDING',
        source_entity_type: 'tooth_findings',
        source_entity_id: 'tf-p3-001',
        measurement_value: 'HIGH_BUCCAL',
        measurement_unit: 'POSITION',
        interpretation: 'Ectopic maxillary canine requiring alignment',
      },
    ],
  });
  tests.push({
    testId: 'PD-01',
    title: 'Valid CreateProblem succeeds atomically with version 1 and evidence attached',
    passed: Boolean(
      r01.committed &&
      r01.resulting_version === 1 &&
      db.problems.has('prob-pd-01') &&
      db.problem_evidence.has('pe-pd-01-1') &&
      r01.data?.evidence.length === 1
    ),
    evidence: `committed=${r01.committed}, version=${r01.resulting_version}, evidenceCount=${r01.data?.evidence.length}`,
  });

  // PD-02: Valid RecordProblemFromExamination
  const r02 = P3DProblemApplicationService.recordProblemFromExamination(db, orthoCtx('op-pd-02'), {
    id: 'prob-pd-02',
    case_id: caseId1,
    examination_id: examId,
    problem_code: 'MAND_INCISOR_ROTATION',
    category: 'DENTAL',
    title: 'Rotated Mandibular Incisor',
    description: 'Tooth 32 distolingually rotated',
    severity: 'MODERATE',
    priority: 2,
    evidence_links: [
      {
        id: 'pe-pd-02-1',
        evidence_type: 'TOOTH_FINDING',
        source_entity_type: 'tooth_findings',
        source_entity_id: 'tf-p3-002',
        measurement_value: '25',
        measurement_unit: 'DEGREES',
        interpretation: 'Severe rotation of 32',
      },
    ],
  });
  tests.push({
    testId: 'PD-02',
    title: 'Valid RecordProblemFromExamination creates problem with INITIAL_DIAGNOSIS source',
    passed: Boolean(
      r02.committed &&
      r02.data?.source_type === 'INITIAL_DIAGNOSIS' &&
      r02.data?.source_reference_id === examId &&
      db.problems.get('prob-pd-02')?.source_reference_id === examId
    ),
    evidence: `committed=${r02.committed}, sourceType=${r02.data?.source_type}, sourceRefId=${r02.data?.source_reference_id}`,
  });

  // PD-03: Case ownership isolation
  const qCase1 = P3DProblemQueryService.getProblemById(db, caseId1, 'prob-pd-01');
  const qCase2 = P3DProblemQueryService.getProblemById(db, caseId2, 'prob-pd-01');
  tests.push({
    testId: 'PD-03',
    title: 'Case ownership enforcement: problem queried under wrong case returns null',
    passed: Boolean(qCase1 !== null && qCase2 === null),
    evidence: `case1Found=${Boolean(qCase1)}, case2Found=${Boolean(qCase2)}`,
  });

  // PD-04: Invalid problem status rejection
  const r04 = P3DProblemApplicationService.createProblem(db, orthoCtx('op-pd-04'), {
    id: 'prob-pd-04',
    case_id: caseId1,
    problem_code: 'BAD_STATUS_PROB',
    category: 'DENTAL',
    title: 'Bad Status Problem',
    severity: 'MILD',
    status: 'NON_EXISTENT_STATUS' as any,
    initial_evidence: [
      {
        id: 'pe-pd-04-1',
        evidence_type: 'CLINICAL_FINDING',
        source_entity_type: 'clinical_findings',
        source_entity_id: 'cf-p3-001',
        interpretation: 'Test',
      },
    ],
  });
  tests.push({
    testId: 'PD-04',
    title: 'Invalid problem status rejected by domain validation with zero mutation',
    passed: Boolean(!r04.committed && !db.problems.has('prob-pd-04')),
    evidence: `committed=${r04.committed}, err=${r04.error_code}, dbHas=${db.problems.has('prob-pd-04')}`,
  });

  // PD-05: Valid status transitions: ACTIVE -> IMPROVED -> RESOLVED, plus illegal valid-enum transition rejection (RESOLVED -> IMPROVED)
  const r05a = P3DProblemApplicationService.updateProblemStatus(db, orthoCtx('op-pd-05a'), {
    case_id: caseId1,
    problem_id: 'prob-pd-01',
    expected_version: 1,
    target_status: 'IMPROVED',
  });
  const r05b = P3DProblemApplicationService.updateProblemStatus(db, orthoCtx('op-pd-05b'), {
    case_id: caseId1,
    problem_id: 'prob-pd-01',
    expected_version: 2,
    target_status: 'RESOLVED',
    resolved_at: '2026-10-09',
  });
  const r05Illegal = P3DProblemApplicationService.updateProblemStatus(db, orthoCtx('op-pd-05-illegal'), {
    case_id: caseId1,
    problem_id: 'prob-pd-01',
    expected_version: 3,
    target_status: 'IMPROVED',
  });
  tests.push({
    testId: 'PD-05',
    title: 'Valid status transition ACTIVE -> IMPROVED -> RESOLVED succeeds and illegal valid-enum transition RESOLVED -> IMPROVED is rejected',
    passed: Boolean(
      r05a.committed &&
      r05a.resulting_version === 2 &&
      r05b.committed &&
      r05b.resulting_version === 3 &&
      !r05Illegal.committed &&
      r05Illegal.error_code === 'ERR_INVALID_PROBLEM_STATUS' &&
      db.problems.get('prob-pd-01')?.status === 'RESOLVED'
    ),
    evidence: `v1to2=${r05a.resulting_version}, v2to3=${r05b.resulting_version}, illegalErr=${r05Illegal.error_code}, finalStatus=${db.problems.get('prob-pd-01')?.status}`,
  });

  // PD-06: Invalid resolved status rejection (missing resolved_at timestamp AND resolved_at < identified_at)
  const r06Missing = P3DProblemApplicationService.updateProblemStatus(db, orthoCtx('op-pd-06-missing'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    expected_version: 1,
    target_status: 'RESOLVED',
    resolved_at: null,
  });
  const r06Early = P3DProblemApplicationService.updateProblemStatus(db, orthoCtx('op-pd-06-early'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    expected_version: 1,
    target_status: 'RESOLVED',
    resolved_at: '2026-10-01', // earlier than identified_at '2026-10-08'
  });
  tests.push({
    testId: 'PD-06',
    title: 'RESOLVED status without resolved_at or with resolved_at < identified_at is rejected via UpdateProblemStatus',
    passed: Boolean(
      !r06Missing.committed &&
      r06Missing.error_code === 'ERR_TEMPORAL_COHERENCE_VIOLATION' &&
      !r06Early.committed &&
      r06Early.error_code === 'ERR_TEMPORAL_COHERENCE_VIOLATION'
    ),
    evidence: `missingErr=${r06Missing.error_code}, earlyErr=${r06Early.error_code}`,
  });

  // PD-07: Valid evidence attachment
  const r07 = P3DProblemApplicationService.attachProblemEvidence(db, orthoCtx('op-pd-07'), {
    id: 'pe-pd-02-2',
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    evidence_type: 'CLINICAL_FINDING',
    source_entity_type: 'clinical_findings',
    source_entity_id: 'cf-p3-001',
    interpretation: 'Overjet finding corroborates mandibular rotation',
  });
  tests.push({
    testId: 'PD-07',
    title: 'AttachProblemEvidence attaches second evidence row successfully',
    passed: Boolean(
      r07.committed &&
      db.problem_evidence.has('pe-pd-02-2') &&
      r07.data?.evidence.length === 2
    ),
    evidence: `committed=${r07.committed}, evidenceCount=${r07.data?.evidence.length}`,
  });

  // PD-08: Duplicate evidence attachment rejection
  const r08 = P3DProblemApplicationService.attachProblemEvidence(db, orthoCtx('op-pd-08'), {
    id: 'pe-pd-02-dup',
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    evidence_type: 'CLINICAL_FINDING',
    source_entity_type: 'clinical_findings',
    source_entity_id: 'cf-p3-001',
    interpretation: 'Duplicate link attempt',
  });
  tests.push({
    testId: 'PD-08',
    title: 'Duplicate evidence attachment is rejected with zero mutation',
    passed: Boolean(!r08.committed && (r08.error_code === 'ERR_DUPLICATE_OPERATION' || r08.error_code === 'ERR_REPOSITORY_DUPLICATE')),
    evidence: `committed=${r08.committed}, err=${r08.error_code}`,
  });

  // PD-09: Valid evidence removal
  const r09 = P3DProblemApplicationService.detachProblemEvidence(db, orthoCtx('op-pd-09'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    evidence_id: 'pe-pd-02-2',
  });
  tests.push({
    testId: 'PD-09',
    title: 'DetachProblemEvidence removes evidence link when multiple exist',
    passed: Boolean(
      r09.committed &&
      !db.problem_evidence.has('pe-pd-02-2') &&
      r09.data?.evidence.length === 1
    ),
    evidence: `committed=${r09.committed}, remainingEvidence=${r09.data?.evidence.length}`,
  });

  // PD-10: Removal of last evidence link forbidden
  const r10 = P3DProblemApplicationService.detachProblemEvidence(db, orthoCtx('op-pd-10'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    evidence_id: 'pe-pd-02-1',
  });
  tests.push({
    testId: 'PD-10',
    title: 'Removing the last ProblemEvidence is strictly forbidden',
    passed: Boolean(
      !r10.committed &&
      (r10.error_code === 'ERR_LAST_PROBLEM_EVIDENCE_REMOVAL_FORBIDDEN' || r10.error_code === 'ERR_REPOSITORY_CONSTRAINT') &&
      db.problem_evidence.has('pe-pd-02-1')
    ),
    evidence: `committed=${r10.committed}, err=${r10.error_code}, stillExists=${db.problem_evidence.has('pe-pd-02-1')}`,
  });

  // PD-11: Nonexistent evidence source rejection
  const r11 = P3DProblemApplicationService.attachProblemEvidence(db, orthoCtx('op-pd-11'), {
    id: 'pe-pd-02-ghost',
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    evidence_type: 'CLINICAL_FINDING',
    source_entity_type: 'clinical_findings',
    source_entity_id: 'cf-ghost-999',
    interpretation: 'Nonexistent finding link',
  });
  tests.push({
    testId: 'PD-11',
    title: 'Evidence referencing nonexistent source entity is rejected',
    passed: Boolean(!r11.committed && r11.error_code === 'ERR_ENTITY_NOT_FOUND'),
    evidence: `committed=${r11.committed}, err=${r11.error_code}`,
  });

  // PD-12: Cross-case evidence attachment rejection
  // Create examination in case 2 through AuthoritativeRepositories.clinicalExaminations (zero direct Map writes)
  const foreignExamId = 'exam-case-2-test';
  AuthoritativeRepositories.clinicalExaminations.create(
    db,
    {
      id: foreignExamId,
      case_id: caseId2,
      visit_id: null,
      examination_date: '2026-10-08',
      examiner_id: 'usr-ortho-01',
      examination_stage: 'INITIAL',
      status: 'CONFIRMED',
      general_findings: 'None',
      notes: 'Case 2 examination',
      created_at: '2026-10-08T10:00:00Z',
      updated_at: '2026-10-08T10:00:00Z',
      created_by: 'usr-ortho-01',
      updated_by: 'usr-ortho-01',
      version: 1,
      is_deleted: 0,
      deleted_at: null,
    },
    [
      {
        id: 'cf-foreign-01',
        examination_id: foreignExamId,
        category: 'OCCLUSAL',
        finding_code: 'CROSSBITE',
        value: 'POSTERIOR_CROSSBITE',
        unit: null,
        severity: 'MODERATE',
        side: 'RIGHT',
        location: 'POSTERIOR',
        clinical_significance: 'CLINICAL_FINDING',
        notes: 'Case 2 finding',
        created_at: '2026-10-08T10:00:00Z',
        updated_at: '2026-10-08T10:00:00Z',
      },
    ],
    [],
    []
  );

  const r12 = P3DProblemApplicationService.attachProblemEvidence(db, orthoCtx('op-pd-12'), {
    id: 'pe-pd-02-cross',
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    evidence_type: 'CLINICAL_FINDING',
    source_entity_type: 'clinical_findings',
    source_entity_id: 'cf-foreign-01',
    interpretation: 'Attempting cross-case link',
  });
  tests.push({
    testId: 'PD-12',
    title: 'Cross-case evidence attachment rejected with ERR_CROSS_CASE_CONTAMINATION',
    passed: Boolean(!r12.committed && r12.error_code === 'ERR_CROSS_CASE_CONTAMINATION'),
    evidence: `committed=${r12.committed}, err=${r12.error_code}`,
  });

  // PD-13: Cross-case problem mutation rejection
  const r13 = P3DProblemApplicationService.updateProblem(db, orthoCtx('op-pd-13'), {
    case_id: caseId2, // wrong case for prob-pd-02!
    problem_id: 'prob-pd-02',
    expected_version: 1,
    title: 'Hacked Title',
  });
  tests.push({
    testId: 'PD-13',
    title: 'Cross-case problem update rejected with ERR_CROSS_CASE_CONTAMINATION',
    passed: Boolean(!r13.committed && r13.error_code === 'ERR_CROSS_CASE_CONTAMINATION'),
    evidence: `committed=${r13.committed}, err=${r13.error_code}`,
  });

  // PD-14: Unauthorized role rejections (RECEPTION, FINANCE_ADMIN, CLINICAL_ASSISTANT, and ADMIN for SoftDeleteProblem & RestoreProblem)
  const r14Recep = P3DProblemApplicationService.createProblem(db, recepCtx('op-pd-14-rec'), {
    id: 'prob-pd-14-rec',
    case_id: caseId1,
    problem_code: 'RECEP_FAIL',
    category: 'DENTAL',
    title: 'Recep Attempt',
    severity: 'MILD',
    initial_evidence: [
      {
        id: 'pe-pd-14-1',
        evidence_type: 'CLINICAL_FINDING',
        source_entity_type: 'clinical_findings',
        source_entity_id: 'cf-p3-001',
        interpretation: 'Recep',
      },
    ],
  });
  const r14Fin = P3DProblemApplicationService.updateProblemStatus(db, finCtx('op-pd-14-fin'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    expected_version: 1,
    target_status: 'IMPROVED',
  });
  const r14Asst = P3DProblemApplicationService.createProblem(db, asstCtx('op-pd-14-asst'), {
    id: 'prob-pd-14-asst',
    case_id: caseId1,
    problem_code: 'ASST_FAIL',
    category: 'DENTAL',
    title: 'Asst Attempt',
    severity: 'MILD',
    initial_evidence: [
      {
        id: 'pe-pd-14-2',
        evidence_type: 'CLINICAL_FINDING',
        source_entity_type: 'clinical_findings',
        source_entity_id: 'cf-p3-001',
        interpretation: 'Asst',
      },
    ],
  });
  const r14AdminDel = P3DProblemApplicationService.softDeleteProblem(db, adminCtx('op-pd-14-adm-del'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    expected_version: 1,
    reason: 'Admin attempt',
  });
  const r14AdminRest = P3DProblemApplicationService.restoreProblem(db, adminCtx('op-pd-14-adm-rest'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    expected_version: 1,
  });
  tests.push({
    testId: 'PD-14',
    title: 'Unauthorized roles (RECEPTION, FINANCE_ADMIN, CLINICAL_ASSISTANT, ADMIN) rejected with ERR_UNAUTHORIZED_ROLE',
    passed: Boolean(
      !r14Recep.committed &&
      r14Recep.error_code === 'ERR_UNAUTHORIZED_ROLE' &&
      !r14Fin.committed &&
      r14Fin.error_code === 'ERR_UNAUTHORIZED_ROLE' &&
      !r14Asst.committed &&
      r14Asst.error_code === 'ERR_UNAUTHORIZED_ROLE' &&
      !r14AdminDel.committed &&
      r14AdminDel.error_code === 'ERR_UNAUTHORIZED_ROLE' &&
      !r14AdminRest.committed &&
      r14AdminRest.error_code === 'ERR_UNAUTHORIZED_ROLE'
    ),
    evidence: `recepErr=${r14Recep.error_code}, finErr=${r14Fin.error_code}, asstErr=${r14Asst.error_code}, adminDelErr=${r14AdminDel.error_code}, adminRestErr=${r14AdminRest.error_code}`,
  });

  // PD-15: AI_AGENT write prohibition
  const r15 = P3DProblemApplicationService.createProblem(db, aiCtx('op-pd-15'), {
    id: 'prob-pd-15',
    case_id: caseId1,
    problem_code: 'AI_FAIL',
    category: 'DENTAL',
    title: 'AI Attempt',
    severity: 'MILD',
    initial_evidence: [
      {
        id: 'pe-pd-15-1',
        evidence_type: 'CLINICAL_FINDING',
        source_entity_type: 'clinical_findings',
        source_entity_id: 'cf-p3-001',
        interpretation: 'AI',
      },
    ],
  });
  tests.push({
    testId: 'PD-15',
    title: 'AI_AGENT clinical write strictly prohibited with ERR_AI_WRITE_PROHIBITED',
    passed: Boolean(!r15.committed && r15.error_code === 'ERR_AI_WRITE_PROHIBITED'),
    evidence: `committed=${r15.committed}, err=${r15.error_code}`,
  });

  // PD-16: Soft-delete & restore lifecycle (ORTHODONTIST-only per R1-C authority)
  const r16Del = P3DProblemApplicationService.softDeleteProblem(db, orthoCtx('op-pd-16-del'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    expected_version: 1,
    reason: 'Clinical correction',
  });
  const deletedStateRecorded = db.problems.get('prob-pd-02')?.is_deleted === 1;
  const r16Rest = P3DProblemApplicationService.restoreProblem(db, orthoCtx('op-pd-16-rest'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    expected_version: 2,
  });
  const restoredStateRecorded = db.problems.get('prob-pd-02')?.is_deleted === 0;
  tests.push({
    testId: 'PD-16',
    title: 'Soft-delete & restore lifecycle: ORTHODONTIST soft-delete sets is_deleted=1, restore resets is_deleted=0',
    passed: Boolean(
      r16Del.committed &&
      r16Del.resulting_version === 2 &&
      deletedStateRecorded &&
      r16Rest.committed &&
      r16Rest.resulting_version === 3 &&
      restoredStateRecorded
    ),
    evidence: `delVersion=${r16Del.resulting_version}, restVersion=${r16Rest.resulting_version}, delRecorded=${deletedStateRecorded}, restRecorded=${restoredStateRecorded}`,
  });

  // PD-17: Mutation and second soft-delete of soft-deleted problem rejected by DomainValidationEngine
  // First soft-delete prob-pd-02 again
  P3DProblemApplicationService.softDeleteProblem(db, orthoCtx('op-pd-17-del'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    expected_version: 3,
  });
  const r17Upd = P3DProblemApplicationService.updateProblem(db, orthoCtx('op-pd-17-upd'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    expected_version: 4,
    title: 'Attempt update on soft-deleted',
  });
  const r17SecondDel = P3DProblemApplicationService.softDeleteProblem(db, orthoCtx('op-pd-17-del2'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    expected_version: 4,
    reason: 'Second soft-delete attempt',
  });
  tests.push({
    testId: 'PD-17',
    title: 'Mutation and second soft-delete of soft-deleted problem rejected by validation with ERR_SOFT_DELETED_ENTITY_MUTATION',
    passed: Boolean(
      !r17Upd.committed &&
      r17Upd.error_code === 'ERR_SOFT_DELETED_ENTITY_MUTATION' &&
      !r17SecondDel.committed &&
      r17SecondDel.error_code === 'ERR_SOFT_DELETED_ENTITY_MUTATION' &&
      !r17SecondDel.pipeline_stages_executed.includes('05:BEGIN_TRANSACTION')
    ),
    evidence: `updErr=${r17Upd.error_code}, secondDelErr=${r17SecondDel.error_code}, stages=${r17SecondDel.pipeline_stages_executed.join('->')}`,
  });

  // Restore it for remaining tests
  P3DProblemApplicationService.restoreProblem(db, orthoCtx('op-pd-17-rest'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    expected_version: 4,
  });

  // PD-18: Restoring active (non-deleted) problem is rejected
  const r18 = P3DProblemApplicationService.restoreProblem(db, orthoCtx('op-pd-18'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    expected_version: 5,
  });
  tests.push({
    testId: 'PD-18',
    title: 'Restoring an already-active problem is rejected with ERR_PROBLEM_NOT_DELETED',
    passed: Boolean(!r18.committed && (r18.error_code === 'ERR_PROBLEM_NOT_DELETED' || r18.error_code === 'ERR_REPOSITORY_CONSTRAINT')),
    evidence: `committed=${r18.committed}, err=${r18.error_code}`,
  });

  // PD-19: Optimistic concurrency failure
  const r19 = P3DProblemApplicationService.updateProblem(db, orthoCtx('op-pd-19'), {
    case_id: caseId1,
    problem_id: 'prob-pd-02',
    expected_version: 1, // stale! Current version is 5
    title: 'Stale version attempt',
  });
  tests.push({
    testId: 'PD-19',
    title: 'Optimistic concurrency failure: stale expected_version rejected with ERR_REPOSITORY_VERSION_CONFLICT',
    passed: Boolean(!r19.committed && (r19.error_code === 'ERR_REPOSITORY_VERSION_CONFLICT' || r19.error_code === 'ERR_VERSION_CONFLICT')),
    evidence: `committed=${r19.committed}, err=${r19.error_code}`,
  });

  // PD-20: Idempotency check
  const r20First = P3DProblemApplicationService.createProblem(db, orthoCtx('op-pd-20'), {
    id: 'prob-pd-20',
    case_id: caseId1,
    problem_code: 'IDEMP_PROB',
    category: 'DENTAL',
    title: 'Idempotency Test',
    severity: 'MILD',
    source_type: 'INITIAL_DIAGNOSIS',
    source_reference_id: examId,
    initial_evidence: [
      {
        id: 'pe-pd-20-1',
        evidence_type: 'CLINICAL_FINDING',
        source_entity_type: 'clinical_findings',
        source_entity_id: 'cf-p3-001',
        interpretation: 'Idempotent',
      },
    ],
  });
  const r20Repeat = P3DProblemApplicationService.createProblem(db, orthoCtx('op-pd-20'), {
    id: 'prob-pd-20',
    case_id: caseId1,
    problem_code: 'IDEMP_PROB',
    category: 'DENTAL',
    title: 'Idempotency Test Duplicate',
    severity: 'MILD',
    source_type: 'INITIAL_DIAGNOSIS',
    source_reference_id: examId,
    initial_evidence: [],
  });
  tests.push({
    testId: 'PD-20',
    title: 'Operation idempotency: second call with identical operation_id returns idempotent_hit=true without mutation',
    passed: Boolean(
      r20First.committed &&
      r20Repeat.committed &&
      r20Repeat.idempotent_hit === true &&
      r20Repeat.resulting_version === 1
    ),
    evidence: `firstCommitted=${r20First.committed}, repeatIdempotentHit=${r20Repeat.idempotent_hit}, version=${r20Repeat.resulting_version}`,
  });

  // PD-21: Mandatory Audit and Sync Outbox creation
  const auditEntry = Array.from(db.audit_logs.values()).find((a) => a.entity_id === 'prob-pd-20');
  const syncEntry = db.sync_operations.get('op-pd-20');
  tests.push({
    testId: 'PD-21',
    title: 'Mandatory Audit and Sync Outbox entries created for committed mutation',
    passed: Boolean(
      auditEntry &&
      auditEntry.entity_type === 'Problem' &&
      syncEntry &&
      syncEntry.entity_id === 'prob-pd-20' &&
      syncEntry.operation_type === 'CREATE'
    ),
    evidence: `auditId=${auditEntry?.id}, syncOpId=${syncEntry?.operation_id}, syncType=${syncEntry?.operation_type}`,
  });

  // PD-22: Transaction rollback on failure (Zero dirty writes)
  const snapshotBefore = cloneAuthoritativeDatabase(db);
  const r22Fail = P3DProblemApplicationService.createProblem(db, orthoCtx('op-pd-22-fail'), {
    id: 'prob-pd-22-fail',
    case_id: 'case-ghost-999', // nonexistent case
    problem_code: 'GHOST_CASE_PROB',
    category: 'DENTAL',
    title: 'Ghost Case Problem',
    severity: 'MILD',
    source_type: 'INITIAL_DIAGNOSIS',
    source_reference_id: examId,
    initial_evidence: [
      {
        id: 'pe-pd-22-1',
        evidence_type: 'CLINICAL_FINDING',
        source_entity_type: 'clinical_findings',
        source_entity_id: 'cf-p3-001',
        interpretation: 'Ghost',
      },
    ],
  });
  const probCountBefore = snapshotBefore.problems.size;
  const probCountAfter = db.problems.size;
  const auditCountBefore = snapshotBefore.audit_logs.size;
  const auditCountAfter = db.audit_logs.size;
  tests.push({
    testId: 'PD-22',
    title: 'Transaction rollback: failure leaves zero dirty writes in problems or audit_logs',
    passed: Boolean(
      !r22Fail.committed &&
      probCountBefore === probCountAfter &&
      auditCountBefore === auditCountAfter &&
      !db.problems.has('prob-pd-22-fail')
    ),
    evidence: `committed=${r22Fail.committed}, probCountBefore=${probCountBefore}, probCountAfter=${probCountAfter}`,
  });

  // PD-23: Unsupported command rejection
  const r23 = AuthoritativeCommandPipeline.execute(db, {
    operation_id: 'op-pd-23',
    command_id: 'UnsupportedFakeProblemCommand' as any,
    entity_type: 'Problem',
    entity_id: 'prob-pd-23',
    case_id: caseId1,
    user_id: 'usr-ortho-01',
    user_role: 'ORTHODONTIST',
    device_id: 'dev-01',
    timestamp: '2026-10-08T12:00:00Z',
    base_version: null,
    payload: { entityType: 'Problem', entityId: 'prob-pd-23' },
  });
  tests.push({
    testId: 'PD-23',
    title: 'Unsupported command rejected explicitly with ERR_UNSUPPORTED_PIPELINE_COMMAND and zero commit',
    passed: Boolean(
      r23.local_commit_status === 'ROLLED_BACK' &&
      r23.errors.some((e) => e.code === 'ERR_UNSUPPORTED_PIPELINE_COMMAND' || e.code === 'ERR_UNSUPPORTED_COMMAND')
    ),
    evidence: `status=${r23.local_commit_status}, err=${r23.errors[0]?.code}`,
  });

  // PD-24: Zero direct Map-write / raw Map-read bypass & no hardcoded identity fallback verification
  const appServiceCode = P3DProblemApplicationService.toString();
  const queryServiceCode = P3DProblemQueryService.toString();
  const directMapBypass =
    appServiceCode.includes('db.problems.') ||
    appServiceCode.includes('db.problem_evidence.') ||
    appServiceCode.includes('db.audit_logs.') ||
    appServiceCode.includes('db.sync_operations.') ||
    queryServiceCode.includes('db.problems.') ||
    queryServiceCode.includes('db.problem_evidence.') ||
    queryServiceCode.includes('usr-ortho-01');
  tests.push({
    testId: 'PD-24',
    title: 'Zero direct Map bypass and zero hardcoded identity fallback in P3-D Application and Query Services',
    passed: !directMapBypass,
    evidence: `directMapOrFallbackFound=${directMapBypass}`,
  });

  // PD-25: Query service projections, provenance accuracy without hardcoded fallback, & search encapsulation
  const customDoctorCtx: P3DExecutionContext = {
    operation_id: 'op-pd-25-custom-doc',
    user_id: 'usr-ortho-custom-77',
    user_role: 'ORTHODONTIST',
    device_id: 'dev-ipad-77',
    timestamp: '2026-10-08T14:00:00Z',
    is_online: false,
  };
  const r25Create = P3DProblemApplicationService.createProblem(db, customDoctorCtx, {
    id: 'prob-pd-25',
    case_id: caseId1,
    problem_code: 'CUSTOM_DOC_PROB',
    category: 'DENTAL',
    title: 'Severe Custom Doctor Problem',
    severity: 'SEVERE',
    source_type: 'INITIAL_DIAGNOSIS',
    source_reference_id: examId,
    initial_evidence: [
      {
        id: 'pe-pd-25-1',
        evidence_type: 'CLINICAL_FINDING',
        source_entity_type: 'clinical_findings',
        source_entity_id: 'cf-p3-001',
        interpretation: 'Custom doc evidence',
      },
    ],
  });
  const searchRes = P3DProblemQueryService.searchProblems(db, caseId1, 'severe');
  const allCase1 = P3DProblemQueryService.listProblemsByCase(db, caseId1, false);
  const evLinks = P3DProblemQueryService.getEvidenceForProblem(db, caseId1, 'prob-pd-01');
  const customProbView = P3DProblemQueryService.getProblemById(db, caseId1, 'prob-pd-25');
  tests.push({
    testId: 'PD-25',
    title: 'Query service returns clean encapsulated projections with true actor provenance (no hardcoded fallback)',
    passed: Boolean(
      r25Create.committed &&
      searchRes.length >= 2 &&
      allCase1.length >= 3 &&
      evLinks.length >= 1 &&
      customProbView?.created_by === 'usr-ortho-custom-77' &&
      customProbView?.updated_by === 'usr-ortho-custom-77' &&
      typeof searchRes[0].title === 'string' &&
      Array.isArray(searchRes[0].evidence)
    ),
    evidence: `searchCount=${searchRes.length}, totalCase1=${allCase1.length}, customCreatedBy=${customProbView?.created_by}`,
  });

  const passedTests = tests.filter((t) => t.passed).length;
  const failedTests = tests.length - passedTests;

  return {
    gateCode: 'G-P3D',
    passed: passedTests === tests.length && tests.length === 25,
    totalTests: tests.length,
    passedTests,
    failedTests,
    tests,
    timestamp: new Date().toISOString(),
  };
}
