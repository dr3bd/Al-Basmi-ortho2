/**
 * ORTHODONTIC CLINICAL PLATFORM — UNIFIED DATABASE SCHEMA v1.1 (P0.5 FORENSIC-VALIDATED PRE-P1 BASELINE)
 * & P1 CONCRETE DATABASE CONTRACT (P1-A through P1-I)
 *
 * Approach: Offline-First + Clinical SSOT + Versioned Clinical Reasoning + Auditability + AI Governance
 * Core Clinical Chain (12-Step Relational Lineage):
 * PATIENT -> ORTHODONTIC_CASE -> CLINICAL_FINDINGS -> PROBLEMS -> PROBLEM_EVIDENCE -> DIAGNOSIS ->
 * OBJECTIVES -> TREATMENT_PLAN -> PLANNED_INTERVENTIONS -> ACTUAL_VISIT_PROCEDURES ->
 * OUTCOME_ASSESSMENT -> RESIDUAL_PROBLEMS
 */

// 3. DEVICE IDENTITY (devices)
export interface SqliteDeviceRow {
  id: string; // UUID / ULID PK
  device_name: string;
  device_type: 'IPAD' | 'ANDROID_TABLET' | 'WINDOWS' | 'MACOS' | 'WEB' | 'OTHER';
  app_version: string | null;
  schema_version: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
  status: 'ACTIVE' | 'INACTIVE' | 'REVOKED';
}

// 4. USERS (users)
export interface SqliteUserRow {
  id: string; // UUID / ULID PK
  username: string;
  display_name: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  updated_at: string;
  version: number;
  is_deleted: 0 | 1;
  deleted_at: string | null;
}

// 52. SYNC CONFLICTS (sync_conflicts)
export interface SqliteSyncConflictRow {
  id: string;
  entity_type: string;
  entity_id: string;
  local_version: number;
  remote_version: number;
  local_payload: string;
  remote_payload: string;
  detected_at: string;
  resolution_status: 'PENDING' | 'RESOLVED_KEEP_LOCAL' | 'RESOLVED_ACCEPT_REMOTE' | 'MERGED_BY_DOCTOR';
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
}

// 5. PATIENT (patients)
export interface SqlitePatientRow {
  id: string; // UUID / ULID PK
  patient_number: string; // UNIQUE human-readable code
  first_name: string;
  middle_name: string | null;
  last_name: string;
  full_name_normalized: string;
  date_of_birth: string;
  sex: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  nationality: string | null;
  phone: string;
  secondary_phone: string | null;
  email: string | null;
  address: string | null;
  occupation: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  emergency_contact: string | null;
  medical_alert: string | null;
  general_notes: string | null;
  status: 'ACTIVE' | 'ARCHIVED' | 'INACTIVE';
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  version: number;
  is_deleted: 0 | 1;
  deleted_at: string | null;
}

// 4. ORTHODONTIC CASE (orthodontic_cases)
export interface SqliteOrthodonticCaseRow {
  id: string; // UUID / ULID PK
  case_number: string; // UNIQUE e.g., ORT-2026-000123
  patient_id: string; // FK -> patients.id ON DELETE RESTRICT
  case_type:
    | 'COMPREHENSIVE'
    | 'INTERCEPTIVE'
    | 'ORTHOPEDIC'
    | 'SURGICAL_ORTHODONTIC'
    | 'RETREATMENT'
    | 'LIMITED'
    | 'RETENTION_ONLY';
  case_status:
    | 'CONSULTATION'
    | 'RECORDS'
    | 'DIAGNOSIS'
    | 'TREATMENT_PLANNING'
    | 'ACTIVE_TREATMENT'
    | 'FINISHING'
    | 'DEBOND'
    | 'RETENTION'
    | 'COMPLETED'
    | 'DISCONTINUED'
    | 'TRANSFERRED';
  chief_complaint: string;
  referral_source: string | null;
  start_date: string;
  target_completion_date: string;
  actual_completion_date: string | null;
  growth_status: 'PRE_PUBERTAL' | 'PEAK_GROWTH' | 'POST_PUBERTAL' | 'NON_GROWING_ADULT';
  skeletal_maturity_status: string; // e.g., CS1..CS6
  primary_provider_id: string;
  clinic_id: string;
  current_diagnosis_version_id: string | null; // Derived pointer only (NOT SSOT)
  current_treatment_plan_id: string | null; // Derived pointer only (NOT SSOT)
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  version: number;
  is_deleted: 0 | 1;
  deleted_at: string | null;
}

// 5. CLINICAL EXAMINATION (clinical_examinations)
export interface SqliteClinicalExaminationRow {
  id: string;
  case_id: string;
  visit_id: string | null;
  examination_date: string;
  examiner_id: string;
  examination_stage:
    | 'INITIAL'
    | 'PRE_TREATMENT'
    | 'PROGRESS'
    | 'POST_TREATMENT'
    | 'RETENTION'
    | 'FOLLOW_UP'
    | 'OTHER';
  status: 'DRAFT' | 'CONFIRMED';
  general_findings: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  version: number;
  is_deleted: 0 | 1;
  deleted_at: string | null;
}

// 6. CLINICAL FINDINGS (clinical_findings)
export interface SqliteClinicalFindingRow {
  id: string;
  examination_id: string;
  category:
    | 'EXTRAORAL'
    | 'INTRAORAL'
    | 'OCCLUSAL'
    | 'SKELETAL'
    | 'DENTAL'
    | 'SOFT_TISSUE'
    | 'FUNCTIONAL'
    | 'ESTHETIC'
    | 'GROWTH'
    | 'AIRWAY'
    | 'PERIODONTAL'
    | 'OTHER';
  finding_code: string;
  value: string;
  unit: string | null;
  severity: 'NORMAL' | 'MILD' | 'MODERATE' | 'SEVERE';
  side: 'RIGHT' | 'LEFT' | 'BILATERAL' | 'MIDLINE' | 'NONE';
  location: string | null;
  clinical_significance: 'NORMAL_OBSERVATION' | 'CLINICAL_FINDING' | 'PATHOLOGICAL_DEVIATION';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// 7. TOOTH FINDINGS (tooth_findings)
export interface SqliteToothFindingRow {
  id: string;
  examination_id: string;
  tooth_number: string; // FDI 11..48
  finding_type:
    | 'MISSING'
    | 'IMPACTED'
    | 'SUPERNUMERARY'
    | 'ROTATED'
    | 'TIPPED'
    | 'INTRUDED'
    | 'EXTRUDED'
    | 'DISPLACED'
    | 'ABNORMAL_MORPHOLOGY';
  status: string;
  condition: string;
  position: string;
  angulation: string;
  eruption_status: string;
  mobility: string;
  rotation: string;
  inclination: string;
  presence_status: 'PRESENT' | 'IMPACTED_UNERUPTED' | 'CONGENITALLY_MISSING' | 'EXTRACTED';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// 8. ARCH MEASUREMENTS (arch_measurements)
export interface SqliteArchMeasurementRow {
  id: string;
  examination_id: string;
  arch: 'MAXILLARY' | 'MANDIBULAR' | 'BIMAXILLARY';
  measurement_type:
    | 'ARCH_WIDTH'
    | 'ARCH_LENGTH'
    | 'ARCH_PERIMETER'
    | 'INTERCANINE_WIDTH'
    | 'INTERMOLAR_WIDTH'
    | 'SPACE_DISCREPANCY'
    | 'BOLTON_ANTERIOR';
  value: number;
  unit: string;
  method: 'DIGITAL_SCAN' | 'PLASTER_CAST' | 'CBCT_3D';
  reference: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// 10. PROBLEMS & 26. RESIDUAL PROBLEMS (problems)
export interface SqliteProblemRow {
  id: string;
  case_id: string;
  problem_code: string;
  category:
    | 'SKELETAL'
    | 'DENTAL'
    | 'OCCLUSAL'
    | 'SOFT_TISSUE'
    | 'FUNCTIONAL'
    | 'ESTHETIC'
    | 'GROWTH'
    | 'AIRWAY'
    | 'PERIODONTAL'
    | 'OTHER';
  title: string;
  description: string | null;
  severity: 'MILD' | 'MODERATE' | 'SEVERE';
  priority: number;
  status: 'ACTIVE' | 'RESOLVED' | 'IMPROVED' | 'RESIDUAL_PERSISTENT';
  identified_at: string;
  resolved_at: string | null;
  source_type: 'INITIAL_DIAGNOSIS' | 'MID_TREATMENT_FINDING' | 'POST_TREATMENT_RESIDUAL';
  source_reference_id: string; // Links to examination_id or treatment_outcomes.id for residual problems
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  version: number;
  is_deleted: 0 | 1;
  deleted_at: string | null;
}

// 11. PROBLEM EVIDENCE (problem_evidence)
export interface SqliteProblemEvidenceRow {
  id: string;
  problem_id: string;
  evidence_type: 'CLINICAL_FINDING' | 'TOOTH_FINDING' | 'ARCH_MEASUREMENT' | 'CEPHALOMETRIC' | 'CBCT';
  source_entity_type: string;
  source_entity_id: string;
  measurement_value: string;
  measurement_unit: string;
  interpretation: string;
  created_at: string;
  created_by: string;
}

// 12. DIAGNOSIS VERSIONING (diagnosis_versions)
export interface SqliteDiagnosisVersionRow {
  id: string;
  case_id: string;
  version_number: number;
  status: 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'SUPERSEDED' | 'REJECTED';
  diagnosis_date: string;
  diagnosed_by: string;
  clinical_summary: string;
  general_notes: string | null;
  created_at: string;
  created_by: string;
  approved_at: string | null;
  approved_by: string | null;
  supersedes_version_id: string | null;
}

// 13. DIAGNOSIS ITEMS (diagnosis_items)
export interface SqliteDiagnosisItemRow {
  id: string;
  diagnosis_version_id: string;
  category:
    | 'SKELETAL'
    | 'DENTAL'
    | 'OCCLUSAL'
    | 'SOFT_TISSUE'
    | 'FUNCTIONAL'
    | 'ESTHETIC'
    | 'GROWTH'
    | 'AIRWAY'
    | 'PERIODONTAL'
    | 'OTHER';
  diagnosis_code: string;
  title: string;
  description: string;
  severity: 'NORMAL' | 'MILD' | 'MODERATE' | 'SEVERE';
  certainty: 'CONFIRMED' | 'LIKELY' | 'POSSIBLE' | 'INSUFFICIENT_DATA';
  created_at: string;
}

// 14. DIAGNOSIS EVIDENCE (diagnosis_evidence)
export interface SqliteDiagnosisEvidenceRow {
  id: string;
  diagnosis_item_id: string;
  evidence_type: string;
  source_entity_type: string;
  source_entity_id: string;
  value: string;
  unit: string;
  interpretation: string;
  created_at: string;
  created_by: string;
}

// 15. DIAGNOSIS <-> PROBLEM (diagnosis_problem_links)
export interface SqliteDiagnosisProblemLinkRow {
  id: string;
  diagnosis_item_id: string;
  problem_id: string;
  relationship_type: 'EXPLAINS' | 'CONTRIBUTES_TO' | 'ASSOCIATED_WITH';
  created_at: string;
}

// 16. TREATMENT OBJECTIVES (treatment_objectives)
export interface SqliteTreatmentObjectiveRow {
  id: string;
  case_id: string;
  objective_code: string;
  title: string;
  description: string;
  priority: number;
  status: 'ACTIVE' | 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'MODIFIED';
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  version: number;
}

// 17. OBJECTIVE <-> PROBLEM (objective_problems)
export interface SqliteObjectiveProblemJunctionRow {
  id: string;
  objective_id: string;
  problem_id: string;
  relationship_type: 'PRIMARY_RESOLUTION' | 'SECONDARY_IMPROVEMENT' | 'COMPENSATORY';
  created_at: string;
}

// 18. DIAGNOSIS <-> OBJECTIVE (diagnosis_objectives)
export interface SqliteDiagnosisObjectiveLinkRow {
  id: string;
  diagnosis_item_id: string;
  objective_id: string;
  relationship_type: 'DIRECT_RATIONALE' | 'BIOMECHANICAL_CONSTRAINT';
  created_at: string;
}

// 19. TREATMENT PLANS (treatment_plans)
export interface SqliteTreatmentPlanRow {
  id: string;
  case_id: string;
  version_number: number;
  status: 'DRAFT' | 'PROPOSED' | 'APPROVED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'SUPERSEDED';
  title: string;
  summary: string;
  diagnosis_version_id: string; // Rule 2: Approved Plan requires Approved Diagnosis
  created_at: string;
  created_by: string;
  approved_at: string | null;
  approved_by: string | null;
  supersedes_plan_id: string | null;
}

// 21. PLANNED INTERVENTIONS (planned_interventions)
export interface SqlitePlannedInterventionRow {
  id: string;
  treatment_plan_id: string;
  objective_id: string | null;
  intervention_type: 'EXTRACTION' | 'APPLIANCE_BONDING' | 'TAD_ANCHORAGE' | 'ARCHWIRE_MECHANICS' | 'ELASTICS' | 'RETENTION';
  title: string;
  description: string;
  sequence_order: number;
  planned_start: string;
  planned_end: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'EXECUTED' | 'SKIPPED';
  created_at: string;
  updated_at: string;
}

// 24. VISIT PROCEDURES (visit_procedures)
export interface SqliteVisitProcedureRow {
  id: string;
  visit_id: string;
  planned_intervention_id: string | null; // Critical: Planned != Actual unless linked here
  procedure_code: string;
  procedure_type: string;
  description: string;
  tooth_number: string | null;
  arch: 'UPPER' | 'LOWER' | 'BOTH' | null;
  quadrant: string | null;
  status: 'COMPLETED' | 'PARTIAL';
  performed_at: string;
  performed_by: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// 25. TREATMENT OUTCOMES (treatment_outcomes)
export interface SqliteTreatmentOutcomeRow {
  id: string;
  case_id: string;
  objective_id: string;
  assessment_stage: 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'RETENTION' | 'FOLLOW_UP';
  assessment_date: string;
  assessed_by: string;
  status: 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED' | 'NOT_ASSESSED';
  measurement_value: string;
  measurement_unit: string;
  clinical_assessment: string;
  evidence_summary: string;
  created_at: string;
}

// 37. REPORT SNAPSHOTS (report_snapshots)
export interface SqliteReportSnapshotRow {
  report_snapshot_id: string;
  report_version_id: string;
  case_version: number;
  diagnosis_version: number;
  treatment_plan_version: number;
  snapshot_hash: string;
  snapshot_created_at: string;
}

// 40. AI CONTEXT SNAPSHOTS (ai_context_snapshots)
export interface SqliteAiContextSnapshotRow {
  id: string;
  ai_session_id: string;
  case_id: string;
  case_version: number;
  context_hash: string;
  context_json: string;
  created_at: string;
}

// 41. AI SUGGESTIONS (ai_suggestions)
export interface SqliteAiSuggestionRow {
  id: string;
  ai_session_id: string;
  case_id: string;
  suggestion_type: 'DIAGNOSIS_REVIEW' | 'PROBLEM_LIST' | 'OBJECTIVE_REVIEW' | 'PLAN_CRITIQUE';
  content: string;
  certainty: 'CONFIRMED' | 'LIKELY' | 'POSSIBLE' | 'INSUFFICIENT_DATA';
  status: 'AI_SUGGESTION_ONLY' | 'PROMOTED_AFTER_DOCTOR_APPROVAL' | 'REJECTED_BY_DOCTOR';
  doctor_decision: 'ACCEPTED' | 'EDITED' | 'REJECTED' | 'PENDING';
  doctor_comment: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

// 43. CASE FEE ITEMS (case_fee_items) & 46. CASE MATERIAL CONSUMPTION (case_material_consumption)
export interface SqliteCaseFeeItemRow {
  id: string;
  case_id: string;
  fee_type: 'TREATMENT' | 'RECORDS' | 'RETENTION' | 'ADDITIONAL' | 'OTHER';
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
}

export interface SqliteCaseMaterialConsumptionRow {
  id: string;
  case_id: string;
  visit_id: string;
  material_id: string;
  quantity: number;
  unit: string;
  estimated_cost: number;
  consumed_at: string;
}

// 49. SYNC OPERATIONS (sync_operations) & 50. SYNC TOMBSTONES (sync_tombstones)
export interface SqliteTreatmentPlanObjectiveRow {
  id: string;
  treatment_plan_id: string;
  objective_id: string;
  priority: number;
  notes: string | null;
}

export interface SqliteVisitRow {
  id: string;
  case_id: string;
  appointment_id: string | null;
  visit_date: string;
  visit_type: string;
  provider_id: string;
  chief_reason: string | null;
  clinical_notes: string | null;
  next_visit_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  version: number;
  is_deleted: 0 | 1;
  deleted_at: string | null;
}

export interface SqliteMediaAssetRow {
  id: string;
  case_id: string;
  patient_id: string;
  media_type: string;
  captured_at: string;
  captured_by: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  storage_provider: string;
  storage_path: string;
  thumbnail_path: string | null;
  upload_status: 'LOCAL_ONLY' | 'PENDING_UPLOAD' | 'UPLOADED' | 'FAILED';
  remote_id: string | null;
  checksum: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: 0 | 1;
  deleted_at: string | null;
}

export interface SqliteCephalometricStudyRow {
  id: string;
  case_id: string;
  media_id: string | null;
  study_stage: 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'OTHER';
  study_date: string;
  analysis_status: string;
  landmark_review_status: string;
  created_at: string;
  updated_at: string;
}

export interface SqliteCephalometricLandmarkRow {
  id: string;
  study_id: string;
  landmark_code: string;
  x: number;
  y: number;
  confidence: number | null;
  source: 'MANUAL' | 'AI' | 'IMPORTED';
  review_status: string;
  corrected_by: string | null;
  corrected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SqliteCephalometricMeasurementRow {
  id: string;
  study_id: string;
  analysis_code: string;
  measurement_code: string;
  value: number;
  unit: string;
  reference_value: number | null;
  normal_range: string | null;
  interpretation: string | null;
  created_at: string;
}

export interface SqliteReportRow {
  id: string;
  case_id: string;
  report_type: string;
  title: string;
  language: string;
  status: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

export interface SqliteReportVersionRow {
  id: string;
  report_id: string;
  version_number: number;
  template_id: string;
  source_data_snapshot: string;
  rendered_document_reference: string | null;
  status: string;
  created_at: string;
  created_by: string;
  approved_at: string | null;
  approved_by: string | null;
}

export interface SqliteAiSessionRow {
  id: string;
  case_id: string;
  provider: string;
  model: string;
  started_at: string;
  completed_at: string | null;
  purpose: string;
  status: string;
  created_by: string;
}

export interface SqlitePaymentRow {
  id: string;
  case_id: string;
  payment_date: string;
  amount: number;
  currency: string;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
  created_by: string;
}

export interface SqliteAuditLogRow {
  id: string;
  entity_type: string;
  entity_id: string;
  operation_type: string;
  user_id: string;
  device_id: string;
  timestamp: string;
  entity_version_before: number | null;
  entity_version_after: number | null;
  old_payload: string | null;
  new_payload: string | null;
  reason_code: string | null;
  metadata_json: string | null;
}

export type SqliteObjectiveProblemRow = SqliteObjectiveProblemJunctionRow;
export type SqliteDiagnosisObjectiveRow = SqliteDiagnosisObjectiveLinkRow;
export type SqliteAISuggestionRow = SqliteAiSuggestionRow;

export interface SqliteSyncOperationRow {
  operation_id: string;
  device_id: string;
  entity_type: string;
  entity_id: string;
  operation_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  base_version: number;
  result_version: number;
  payload: string;
  created_at: string;
  sync_status: 'PENDING' | 'SYNCED' | 'CONFLICT' | 'FAILED';
  retry_count: number;
  error_code: string | null;
  error_message: string | null;
}

export interface SqliteSyncTombstoneRow {
  id: string;
  entity_type: string;
  entity_id: string;
  deleted_version: number;
  deleted_at: string;
  deleted_by: string;
  device_id: string;
}

export interface SqliteSchemaMigrationRow {
  version: number;
  migration_name: string;
  applied_at: string;
  checksum: string;
}

// P1-G: SEED & REFERENCE DATA ROWS (Sections 31-37)
export interface SqliteToothNumberingSystemRow {
  code: 'FDI' | 'UNIVERSAL' | 'PALMER';
  name: string;
  is_default: 0 | 1;
  version: number;
}

export interface SqliteCephalometricAnalysisDefRow {
  analysis_code: string;
  name_en: string;
  name_ar: string;
  version: number;
  active: 0 | 1;
}

export interface SqliteCephalometricLandmarkDefRow {
  landmark_code: string;
  name_en: string;
  name_ar: string;
  anatomical_definition: string;
  active: 0 | 1;
}

export interface SqliteCephalometricMeasurementDefRow {
  id: string;
  analysis_code: string;
  measurement_code: string;
  unit: string;
  norm_mean: number;
  norm_sd: number;
}

// Section 13-16: Separation of SQLite Constraints vs Domain Validation Rules (Rules A-I)
export const P1_F_SEPARATION_OF_CONCERNS = {
  sqliteEnforces: [
    'PRIMARY KEY (Offline UUID/ULID)',
    'FOREIGN KEY ... ON DELETE RESTRICT',
    'NOT NULL structural fields',
    'UNIQUE(patient_number), UNIQUE(case_number)',
    'UNIQUE(case_id, version_number) on diagnosis_versions & treatment_plans',
    'UNIQUE(objective_id, problem_id) on objective_problems',
    'UNIQUE(study_id, landmark_code) on cephalometric_landmarks',
    'UNIQUE(entity_type, entity_id) on sync_tombstones',
    'Simple CHECK constraints for status/stage/enum values',
  ],
  domainServiceEnforces: [
    {
      ruleCode: 'Rule A',
      titleAr: 'اعتماد التشخيص (Diagnosis Approval)',
      titleEn: 'Rule A: Diagnosis Approval',
      descAr: 'لا يجوز تحويل diagnosis_version إلى APPROVED إذا كان عدد diagnosis_items يساوي صفراً.',
      descEn: 'A diagnosis_version cannot become APPROVED unless at least one diagnosis_item exists.',
    },
    {
      ruleCode: 'Rule B',
      titleAr: 'اعتماد الخطة العلاجية (Treatment Plan Approval)',
      titleEn: 'Rule B: Treatment Plan Approval',
      descAr: 'لا يجوز اعتماد treatment_plan إلا إذا كان مرتبطاً بـ diagnosis_version معتمد (APPROVED) ومعرفات أهداف تابعة لنفس الحالة.',
      descEn: 'A treatment_plan cannot become APPROVED unless linked to an APPROVED diagnosis_version and valid case objectives.',
    },
    {
      ruleCode: 'Rule C',
      titleAr: 'ارتباط الهدف العلاجي (Objective Validation)',
      titleEn: 'Rule C: Objective Validation',
      descAr: 'يجب أن يرتبط كل هدف علاجي بمشكلة سريرية واحدة على الأقل (objective_problems) أو مبرر تشخيصي (diagnosis_objectives).',
      descEn: 'A treatment_objective must link to >= 1 problem or >= 1 diagnosis_item.',
    },
    {
      ruleCode: 'Rule D',
      titleAr: 'التحقق من إجراء الجلسة (Procedure Validation)',
      titleEn: 'Rule D: Visit Procedure Validation',
      descAr: 'إذا تم ربط visit_procedure بـ planned_intervention_id فيجب أن ينتميا لنفس الحالة التقويمية (منع تلوث الحالات).',
      descEn: 'If visit_procedure.planned_intervention_id is provided, both must belong to the same case_id.',
    },
    {
      ruleCode: 'Rule E',
      titleAr: 'التحقق من النتيجة المرحلية (Outcome Validation)',
      titleEn: 'Rule E: Outcome Validation',
      descAr: 'يجب أن ينتمي الهدف العلاجي في treatment_outcomes إلى نفس الحالة (case_id).',
      descEn: 'treatment_outcomes.objective_id must belong to the same case_id.',
    },
    {
      ruleCode: 'Rule F',
      titleAr: 'بوابة مراجعة الذكاء الاصطناعي (AI Governance Gate)',
      titleEn: 'Rule F: AI Governance Gate',
      descAr: 'لا يتحول أي ai_suggestion إلى سجل سريري إلا عبر خدمة اعتماد الطبيب التي تسجل reviewed_by وreviewed_at وaudit_logs.',
      descEn: 'ai_suggestions cannot mutate clinical tables without explicit Doctor Review Decision & Audit entry.',
    },
    {
      ruleCode: 'Rule G',
      titleAr: 'ثبات لقطة التقرير المعتمد (Report Immutability)',
      titleEn: 'Rule G: Report Immutability',
      descAr: 'بمجرد اعتماد report_version تصبح لقطة البيانات غير قابلة للتعديل؛ أي تعديل ينشئ إصداراً جديداً (version_number + 1).',
      descEn: 'Approved report_versions are immutable; edits require creating version_number + 1.',
    },
    {
      ruleCode: 'Rule H',
      titleAr: 'ثبات التشخيص والخطة بعد الاعتماد (Historical Immutability)',
      titleEn: 'Rule H: Diagnosis & Plan Immutability',
      descAr: 'لا يُعدّل التشخيص المعتمد أو الخطة المعتمدة في مكانها؛ ينشئ النظام إصداراً جديداً ويربطه بـ supersedes_version_id.',
      descEn: 'Approved diagnosis/plan cannot be edited in place; spawns new version linked via supersedes_id.',
    },
    {
      ruleCode: 'Rule I',
      titleAr: 'الحذف الناعم وشاهدة المزامنة (Soft Delete & Tombstone)',
      titleEn: 'Rule I: Soft Delete Contract',
      descAr: 'عند حذف كيان سريري يُضبط is_deleted=1 وdeleted_at ويُسجل في audit_logs وsync_tombstones وsync_operations.',
      descEn: 'Soft delete sets is_deleted=1, deleted_at, and writes audit_logs + sync_tombstones + sync_operations.',
    },
  ],
};

// Section 2 & 45: 12-Step Core Clinical Chain Traceability Proof
export interface ForensicClinicalChainTrace {
  patientCode: string;
  caseCode: string;
  findingId: string;
  findingSummary: string;
  problemId: string;
  problemTitle: string;
  problemEvidenceId: string;
  diagnosisVersionId: string;
  diagnosisItemId: string;
  diagnosisTitle: string;
  diagnosisEvidenceId: string;
  objectiveId: string;
  objectiveTarget: string;
  treatmentPlanId: string;
  plannedInterventionId: string;
  plannedInterventionDesc: string;
  actualVisitProcedureId: string;
  actualVisitDesc: string;
  outcomeT1Status: string;
  outcomeCurrentStatus: string;
  residualProblemStatus: string;
}

export interface ForensicIntegrityCheckResult {
  code: string;
  category: 'Clinical Contradiction' | 'Chain Integrity Rule' | 'Expected Record Completeness';
  integrityLevel: 'Level 1 — Required' | 'Level 2 — Clinically Expected' | 'Level 3 — Recommended';
  status: 'PASS' | 'WARNING';
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
}

// Section 66: P1 Concrete Database Execution Stages (P1-A -> P1-I)
export const P1_CONCRETE_DATABASE_MILESTONES = [
  {
    code: 'P1-A',
    titleAr: 'المخطط الفيزيائي لقاعدة البيانات (Database Physical Schema)',
    titleEn: 'P1-A: Database Physical Schema (SQLite WAL + Strict Types)',
    status: 'COMPLETED',
    descAr: 'تحويل كافة جداول v1.1 إلى أوامر CREATE TABLE فيزيائية مع تحديد الأنواع الدقيقة (TEXT, REAL, INTEGER).',
  },
  {
    code: 'P1-B',
    titleAr: 'التحقق من العلاقات الكيانية (Entity Relationship Validation)',
    titleEn: 'P1-B: Entity Relationship & Junction Validation',
    status: 'COMPLETED',
    descAr: 'ربط السلسلة الكاملة عبر المفاتيح الأجنبية وجداول الربط (diagnosis_problem_links, objective_problems, diagnosis_objectives).',
  },
  {
    code: 'P1-C',
    titleAr: 'هوية عدم الاتصال والمزامنة الموزعة (Offline ID / Sync Identity)',
    titleEn: 'P1-C: Offline ULID/UUID & Sync Operation Identity',
    status: 'COMPLETED',
    descAr: 'اعتماد UUID/ULID غير المعتمد على الخادم مع base_version -> result_version وجدول sync_tombstones.',
  },
  {
    code: 'P1-D',
    titleAr: 'الفهارس والقيود الصارمة (Indexes + CHECK / UNIQUE / CASCADE Constraints)',
    titleEn: 'P1-D: Indexes, CHECK Enums, UNIQUE & ON DELETE Policies',
    status: 'COMPLETED',
    descAr: 'إضافة قيود CHECK للقوائم القياسية وسياسات ON DELETE RESTRICT لمنع حذف السجلات السريرية المرتبطة.',
  },
  {
    code: 'P1-E',
    titleAr: 'استراتيجية ترحيل الإصدارات (Migration Strategy & Checksums)',
    titleEn: 'P1-E: Deterministic Schema Migration Strategy',
    status: 'COMPLETED',
    descAr: 'تتبع إصدارات قاعدة البيانات عبر جدول schema_migrations مع بصمة تحقق SHA-256 لكل ترحيل.',
  },
  {
    code: 'P1-F',
    titleAr: 'قيود التكامل السريري العشرة (10 Clinical Integrity Rules)',
    titleEn: 'P1-F: Clinical Integrity Rules Enforcement (Rules 1–10)',
    status: 'COMPLETED',
    descAr: 'منع اعتماد خطة بدون تشخيص معتمد، ومنع اعتبار الإجراء المخطط منفذاً، وحساب الرصيد حصراً من مجموع الدفعات.',
  },
  {
    code: 'P1-G',
    titleAr: 'البيانات المرجعية القياسية (Seed / Reference Data)',
    titleEn: 'P1-G: Orthodontic Reference & Cephalometric Seed Data',
    status: 'COMPLETED',
    descAr: 'تجهيز القيم المرجعية لتحاليل Steiner, McNamara, Tweed, Ricketts ومصادر الأدلة العلمية.',
  },
  {
    code: 'P1-H',
    titleAr: 'حزمة الاختبارات الجنائية للمخطط (Schema Forensic Test Suite)',
    titleEn: 'P1-H: Relational Chain & Contradiction Forensic Test Suite',
    status: 'COMPLETED',
    descAr: 'تشغيل استعلام السلسلة السريرية من 12 خطوة وفحص كشف التناقضات السريرية تلقائياً.',
  },
  {
    code: 'P1-I',
    titleAr: 'تجميد مخطط قاعدة البيانات الرسمي (Schema Freeze v1.1)',
    titleEn: 'P1-I: Official Schema Freeze v1.1 (Ready for P2 Domain)',
    status: 'FROZEN',
    descAr: 'اعتماد وتجميد عقد قاعدة البيانات المرجعي بالكامل قبل الانتقال لطبقات التطبيق العليا.',
  },
];

export const P0_NON_BREAKABLE_RULES = [
  {
    code: 'RULE-01 & 02',
    titleEn: 'Objective Requires Problem/Diagnosis & Approved Plan Requires Approved Diagnosis',
    titleAr: 'القاعدة 1 و2: كل هدف يرتبط بمشكلة/تشخيص، ولا تُعتمد خطة دون تشخيص معتمد',
    descAr:
      'يرتبط كل هدف علاجي بجدول objective_problems وdiagnosis_objectives، وتشترط الخطة المعتمدة وجود diagnosis_version_id معتمد.',
    descEn:
      'Every objective links via objective_problems & diagnosis_objectives; approved treatment_plans require an APPROVED diagnosis_version_id.',
  },
  {
    code: 'RULE-03 & 04',
    titleEn: 'Outcome Requires Objective & Planned Intervention ≠ Actual Visit Procedure',
    titleAr: 'القاعدة 3 و4: النتيجة تشترط هدفاً، والتدخل المخطط لا يعني التنفيذ الفعلي',
    descAr:
      'يُفصل جدول planned_interventions عن جدول visit_procedures مع الربط الاختياري بـ planned_intervention_id لإثبات التنفيذ.',
    descEn:
      'planned_interventions are strictly separated from visit_procedures; actual execution is proven via planned_intervention_id.',
  },
  {
    code: 'RULE-05 & 06',
    titleEn: 'AI Suggestion ≠ Clinical SSOT Until Doctor Review Decision',
    titleAr: 'القاعدة 5 و6: اقتراح الذكاء الاصطناعي ليس حقيقة سريرية إلا بعد قرار الطبيب',
    descAr:
      'تُحفظ مخرجات الذكاء الاصطناعي في ai_suggestions مع لقطة ai_context_snapshots ولا تتحول إلى سجل سريري إلا بقرار ACCEPTED/EDITED.',
    descEn:
      'AI outputs remain isolated in ai_suggestions with ai_context_snapshots until explicit doctor_decision.',
  },
  {
    code: 'RULE-07 & 09',
    titleEn: 'Immutable Report Snapshots & Preserved Historical Diagnosis Versions',
    titleAr: 'القاعدة 7 و9: لقطات التقارير المعتمدة غير قابلة للتغيير وإصدارات التشخيص محفوظة',
    descAr:
      'يسجل report_snapshots أرقام إصدارات الحالة والتشخيص والخطة وبصمة الهاش (snapshot_hash) دون المساس بالإصدارات السابقة.',
    descEn:
      'report_snapshots freezes case_version, diagnosis_version, treatment_plan_version, and snapshot_hash.',
  },
  {
    code: 'RULE-08',
    titleEn: 'Derived Financial Balance Strictly From case_fee_items & payments',
    titleAr: 'القاعدة 8: الرصيد المالي يُشتق حصراً من مجموع الرسوم ناقص المدفوعات الفعلية',
    descAr:
      'لا يُستخدم paid_amount أو remaining_amount كمصدر حقيقة؛ المصدر الوحيد هو طرح جدول payments من case_fee_items.',
    descEn:
      'Financial balances are derived dynamically from SUM(case_fee_items) - SUM(payments).',
  },
  {
    code: 'RULE-10',
    titleEn: 'Traceable Soft Deletion + Sync Tombstones + Residual Problems Lineage',
    titleAr: 'القاعدة 10: الحذف المتتبع (is_deleted + sync_tombstones) وتوثيق المشكلات المتبقية',
    descAr:
      'لا يُحذف أي سجل سريري فعلياً؛ يُسجل في audit_logs وsync_tombstones، وتُضاف المشكلات المتبقية كـ Residual Problems دون تشويه التاريخ.',
    descEn:
      'Clinical records use is_deleted + deleted_at + sync_tombstones; post-treatment issues spawn Residual Problems preserving history.',
  },
];

export const P0_PRODUCTION_SQLITE_DDL = `-- ============================================================================
-- ORTHODONTIC CLINICAL PLATFORM — P1 Physical Database Contract v1.0
-- Based on: Unified Schema v1.1 | Target: SQLite (Offline-First / Sync-Ready)
-- Identity: Offline-Generated UUID/ULID | Concurrency: base_version -> result_version
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- 3. DEVICE IDENTITY (devices)
CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    device_type TEXT NOT NULL CHECK (device_type IN ('IPAD','ANDROID_TABLET','WINDOWS','MACOS','WEB','OTHER')),
    app_version TEXT,
    schema_version TEXT,
    last_sync_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
);

-- 4. USERS (users)
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT
);

-- 5. PATIENT (patients)
CREATE TABLE patients (
    id TEXT PRIMARY KEY,
    patient_number TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    middle_name TEXT,
    last_name TEXT NOT NULL,
    full_name_normalized TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    sex TEXT NOT NULL CHECK (sex IN ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN')),
    nationality TEXT,
    phone TEXT NOT NULL,
    secondary_phone TEXT,
    email TEXT,
    address TEXT,
    occupation TEXT,
    guardian_name TEXT,
    guardian_phone TEXT,
    emergency_contact TEXT,
    medical_alert TEXT,
    general_notes TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED', 'INACTIVE')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    deleted_at TEXT
);

-- 4. ORTHODONTIC CASE (orthodontic_cases)
CREATE TABLE orthodontic_cases (
    id TEXT PRIMARY KEY,
    case_number TEXT NOT NULL UNIQUE,
    patient_id TEXT NOT NULL,
    case_type TEXT NOT NULL CHECK (case_type IN ('COMPREHENSIVE','INTERCEPTIVE','ORTHOPEDIC','SURGICAL_ORTHODONTIC','RETREATMENT','LIMITED','RETENTION_ONLY')),
    case_status TEXT NOT NULL DEFAULT 'CONSULTATION' CHECK (case_status IN ('CONSULTATION','RECORDS','DIAGNOSIS','TREATMENT_PLANNING','ACTIVE_TREATMENT','FINISHING','DEBOND','RETENTION','COMPLETED','DISCONTINUED','TRANSFERRED')),
    chief_complaint TEXT NOT NULL,
    referral_source TEXT,
    start_date TEXT NOT NULL,
    target_completion_date TEXT,
    actual_completion_date TEXT,
    growth_status TEXT,
    skeletal_maturity_status TEXT,
    primary_provider_id TEXT NOT NULL,
    clinic_id TEXT NOT NULL,
    current_diagnosis_version_id TEXT, -- Derived pointer only (NOT SSOT)
    current_treatment_plan_id TEXT,    -- Derived pointer only (NOT SSOT)
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    deleted_at TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT
);

-- 5. CLINICAL EXAMINATION (clinical_examinations)
CREATE TABLE clinical_examinations (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    visit_id TEXT,
    examination_date TEXT NOT NULL,
    examiner_id TEXT NOT NULL,
    examination_stage TEXT NOT NULL CHECK (examination_stage IN ('INITIAL','PRE_TREATMENT','PROGRESS','POST_TREATMENT','RETENTION','FOLLOW_UP','OTHER')),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CONFIRMED')),
    general_findings TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    deleted_at TEXT,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT
);

-- 6. CLINICAL FINDINGS (clinical_findings)
CREATE TABLE clinical_findings (
    id TEXT PRIMARY KEY,
    examination_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('EXTRAORAL','INTRAORAL','OCCLUSAL','SKELETAL','DENTAL','SOFT_TISSUE','FUNCTIONAL','ESTHETIC','GROWTH','AIRWAY','PERIODONTAL','OTHER')),
    finding_code TEXT NOT NULL,
    value TEXT NOT NULL,
    unit TEXT,
    severity TEXT CHECK (severity IN ('NORMAL','MILD','MODERATE','SEVERE')),
    side TEXT CHECK (side IN ('RIGHT','LEFT','BILATERAL','MIDLINE','NONE')),
    location TEXT,
    clinical_significance TEXT NOT NULL DEFAULT 'NORMAL_OBSERVATION',
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (examination_id) REFERENCES clinical_examinations(id) ON DELETE RESTRICT
);

-- 7. TOOTH FINDINGS (tooth_findings - No JSON blobs)
CREATE TABLE tooth_findings (
    id TEXT PRIMARY KEY,
    examination_id TEXT NOT NULL,
    tooth_number TEXT NOT NULL,
    finding_type TEXT NOT NULL CHECK (finding_type IN ('MISSING','IMPACTED','SUPERNUMERARY','ROTATED','TIPPED','INTRUDED','EXTRUDED','DISPLACED','ABNORMAL_MORPHOLOGY')),
    status TEXT,
    condition TEXT,
    position TEXT,
    angulation TEXT,
    eruption_status TEXT,
    mobility TEXT,
    rotation TEXT,
    inclination TEXT,
    presence_status TEXT NOT NULL DEFAULT 'PRESENT',
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (examination_id) REFERENCES clinical_examinations(id) ON DELETE RESTRICT
);

-- 8. ARCH MEASUREMENTS (arch_measurements)
CREATE TABLE arch_measurements (
    id TEXT PRIMARY KEY,
    examination_id TEXT NOT NULL,
    arch TEXT NOT NULL CHECK (arch IN ('MAXILLARY','MANDIBULAR','BIMAXILLARY')),
    measurement_type TEXT NOT NULL CHECK (measurement_type IN ('ARCH_WIDTH','ARCH_LENGTH','ARCH_PERIMETER','INTERCANINE_WIDTH','INTERMOLAR_WIDTH','SPACE_DISCREPANCY','BOLTON_ANTERIOR')),
    value REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'mm',
    method TEXT,
    reference TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (examination_id) REFERENCES clinical_examinations(id) ON DELETE RESTRICT
);

-- 10. PROBLEMS & 26. RESIDUAL PROBLEMS (problems)
CREATE TABLE problems (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    problem_code TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('SKELETAL','DENTAL','OCCLUSAL','SOFT_TISSUE','FUNCTIONAL','ESTHETIC','GROWTH','AIRWAY','PERIODONTAL','OTHER')),
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL CHECK (severity IN ('MILD','MODERATE','SEVERE')),
    priority INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RESOLVED','IMPROVED','RESIDUAL_PERSISTENT')),
    identified_at TEXT NOT NULL,
    resolved_at TEXT,
    source_type TEXT NOT NULL DEFAULT 'INITIAL_DIAGNOSIS' CHECK (source_type IN ('INITIAL_DIAGNOSIS','MID_TREATMENT_FINDING','POST_TREATMENT_RESIDUAL')),
    source_reference_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    deleted_at TEXT,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT
);

-- 11. PROBLEM EVIDENCE (problem_evidence - SSOT for problem justification)
CREATE TABLE problem_evidence (
    id TEXT PRIMARY KEY,
    problem_id TEXT NOT NULL,
    evidence_type TEXT NOT NULL,
    source_entity_type TEXT NOT NULL,
    source_entity_id TEXT NOT NULL,
    measurement_value TEXT,
    measurement_unit TEXT,
    interpretation TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE RESTRICT
);

-- 12. DIAGNOSIS VERSIONING (diagnosis_versions)
CREATE TABLE diagnosis_versions (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','UNDER_REVIEW','APPROVED','SUPERSEDED','REJECTED')),
    diagnosis_date TEXT NOT NULL,
    diagnosed_by TEXT NOT NULL,
    clinical_summary TEXT NOT NULL,
    general_notes TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    approved_at TEXT,
    approved_by TEXT,
    supersedes_version_id TEXT,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT,
    FOREIGN KEY (supersedes_version_id) REFERENCES diagnosis_versions(id) ON DELETE RESTRICT,
    UNIQUE(case_id, version_number)
);

-- 13. DIAGNOSIS ITEMS (diagnosis_items)
CREATE TABLE diagnosis_items (
    id TEXT PRIMARY KEY,
    diagnosis_version_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('SKELETAL','DENTAL','OCCLUSAL','SOFT_TISSUE','FUNCTIONAL','ESTHETIC','GROWTH','AIRWAY','PERIODONTAL','OTHER')),
    diagnosis_code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL DEFAULT 'MODERATE',
    certainty TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (certainty IN ('CONFIRMED','LIKELY','POSSIBLE','INSUFFICIENT_DATA')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (diagnosis_version_id) REFERENCES diagnosis_versions(id) ON DELETE RESTRICT
);

-- 14. DIAGNOSIS EVIDENCE (diagnosis_evidence)
CREATE TABLE diagnosis_evidence (
    id TEXT PRIMARY KEY,
    diagnosis_item_id TEXT NOT NULL,
    evidence_type TEXT NOT NULL,
    source_entity_type TEXT NOT NULL,
    source_entity_id TEXT NOT NULL,
    value TEXT NOT NULL,
    unit TEXT,
    interpretation TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    FOREIGN KEY (diagnosis_item_id) REFERENCES diagnosis_items(id) ON DELETE RESTRICT
);

-- 15. DIAGNOSIS <-> PROBLEM (diagnosis_problem_links)
CREATE TABLE diagnosis_problem_links (
    id TEXT PRIMARY KEY,
    diagnosis_item_id TEXT NOT NULL,
    problem_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN ('EXPLAINS','CONTRIBUTES_TO','ASSOCIATED_WITH')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (diagnosis_item_id) REFERENCES diagnosis_items(id) ON DELETE RESTRICT,
    FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE RESTRICT,
    UNIQUE(diagnosis_item_id, problem_id)
);

-- 16. TREATMENT OBJECTIVES (treatment_objectives)
CREATE TABLE treatment_objectives (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    objective_code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    priority INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT
);

-- 17. OBJECTIVE <-> PROBLEM (objective_problems - One Objective may address Multiple Problems)
CREATE TABLE objective_problems (
    id TEXT PRIMARY KEY,
    objective_id TEXT NOT NULL,
    problem_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL DEFAULT 'PRIMARY_RESOLUTION',
    created_at TEXT NOT NULL,
    FOREIGN KEY (objective_id) REFERENCES treatment_objectives(id) ON DELETE RESTRICT,
    FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE RESTRICT,
    UNIQUE(objective_id, problem_id)
);

-- 18. DIAGNOSIS <-> OBJECTIVE (diagnosis_objectives)
CREATE TABLE diagnosis_objectives (
    id TEXT PRIMARY KEY,
    diagnosis_item_id TEXT NOT NULL,
    objective_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL DEFAULT 'DIRECT_RATIONALE',
    created_at TEXT NOT NULL,
    FOREIGN KEY (diagnosis_item_id) REFERENCES diagnosis_items(id) ON DELETE RESTRICT,
    FOREIGN KEY (objective_id) REFERENCES treatment_objectives(id) ON DELETE RESTRICT,
    UNIQUE(diagnosis_item_id, objective_id)
);

-- 19. TREATMENT PLANS (treatment_plans)
CREATE TABLE treatment_plans (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PROPOSED','APPROVED','ACTIVE','COMPLETED','CANCELLED','SUPERSEDED')),
    title TEXT NOT NULL,
    summary TEXT,
    diagnosis_version_id TEXT NOT NULL, -- Rule 2: Links directly to approved diagnosis version
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    approved_at TEXT,
    approved_by TEXT,
    supersedes_plan_id TEXT,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT,
    FOREIGN KEY (diagnosis_version_id) REFERENCES diagnosis_versions(id) ON DELETE RESTRICT,
    FOREIGN KEY (supersedes_plan_id) REFERENCES treatment_plans(id) ON DELETE RESTRICT,
    UNIQUE(case_id, version_number)
);

-- 20. PLAN OBJECTIVES (treatment_plan_objectives)
CREATE TABLE treatment_plan_objectives (
    id TEXT PRIMARY KEY,
    treatment_plan_id TEXT NOT NULL,
    objective_id TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    FOREIGN KEY (treatment_plan_id) REFERENCES treatment_plans(id) ON DELETE RESTRICT,
    FOREIGN KEY (objective_id) REFERENCES treatment_objectives(id) ON DELETE RESTRICT,
    UNIQUE(treatment_plan_id, objective_id)
);

-- 21. PLANNED INTERVENTIONS (planned_interventions)
CREATE TABLE planned_interventions (
    id TEXT PRIMARY KEY,
    treatment_plan_id TEXT NOT NULL,
    objective_id TEXT,
    intervention_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    sequence_order INTEGER NOT NULL,
    planned_start TEXT,
    planned_end TEXT,
    status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','EXECUTED','SKIPPED')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (treatment_plan_id) REFERENCES treatment_plans(id) ON DELETE RESTRICT,
    FOREIGN KEY (objective_id) REFERENCES treatment_objectives(id) ON DELETE RESTRICT
);

-- 23. VISITS (visits) & 24. VISIT PROCEDURES (visit_procedures)
CREATE TABLE visits (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    appointment_id TEXT,
    visit_date TEXT NOT NULL,
    visit_type TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    chief_reason TEXT,
    clinical_notes TEXT,
    next_visit_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    deleted_at TEXT,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT
);

CREATE TABLE visit_procedures (
    id TEXT PRIMARY KEY,
    visit_id TEXT NOT NULL,
    planned_intervention_id TEXT, -- Rule 4: Proves whether planned_intervention was actually performed
    procedure_code TEXT NOT NULL,
    procedure_type TEXT NOT NULL,
    description TEXT NOT NULL,
    tooth_number TEXT,
    arch TEXT,
    quadrant TEXT,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    performed_at TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE RESTRICT,
    FOREIGN KEY (planned_intervention_id) REFERENCES planned_interventions(id) ON DELETE RESTRICT
);

-- 25. TREATMENT OUTCOMES (treatment_outcomes - Append-Only Longitudinal History)
CREATE TABLE treatment_outcomes (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    objective_id TEXT NOT NULL,
    assessment_stage TEXT NOT NULL CHECK (assessment_stage IN ('T0','T1','T2','T3','T4','RETENTION','FOLLOW_UP')),
    assessment_date TEXT NOT NULL,
    assessed_by TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACHIEVED','PARTIALLY_ACHIEVED','NOT_ACHIEVED','NOT_ASSESSED')),
    measurement_value TEXT,
    measurement_unit TEXT,
    clinical_assessment TEXT,
    evidence_summary TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT,
    FOREIGN KEY (objective_id) REFERENCES treatment_objectives(id) ON DELETE RESTRICT
);

-- 27. MEDIA ASSETS (media_assets)
CREATE TABLE media_assets (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    media_type TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    captured_by TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER,
    storage_provider TEXT NOT NULL DEFAULT 'LOCAL_FS',
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    upload_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY' CHECK (upload_status IN ('LOCAL_ONLY','PENDING_UPLOAD','UPLOADED','FAILED')),
    remote_id TEXT,
    checksum TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    deleted_at TEXT,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT
);

-- 31-33. CEPHALOMETRIC STUDIES, LANDMARKS & MEASUREMENTS
CREATE TABLE cephalometric_studies (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    media_id TEXT,
    study_stage TEXT NOT NULL CHECK (study_stage IN ('T0','T1','T2','T3','T4','OTHER')),
    study_date TEXT NOT NULL,
    analysis_status TEXT NOT NULL DEFAULT 'COMPLETED',
    landmark_review_status TEXT NOT NULL DEFAULT 'DOCTOR_APPROVED',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT
);

CREATE TABLE cephalometric_landmarks (
    id TEXT PRIMARY KEY,
    study_id TEXT NOT NULL,
    landmark_code TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    confidence REAL,
    source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','AI','IMPORTED')),
    review_status TEXT NOT NULL DEFAULT 'APPROVED',
    corrected_by TEXT,
    corrected_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (study_id) REFERENCES cephalometric_studies(id) ON DELETE RESTRICT,
    UNIQUE(study_id, landmark_code)
);

CREATE TABLE cephalometric_measurements (
    id TEXT PRIMARY KEY,
    study_id TEXT NOT NULL,
    analysis_code TEXT NOT NULL,
    measurement_code TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    reference_value REAL,
    normal_range TEXT,
    interpretation TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (study_id) REFERENCES cephalometric_studies(id) ON DELETE RESTRICT
);

-- 35-37. REPORTS, REPORT VERSIONS & IMMUTABLE SNAPSHOTS
CREATE TABLE reports (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    report_type TEXT NOT NULL,
    title TEXT NOT NULL,
    language TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT
);

CREATE TABLE report_versions (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    template_id TEXT NOT NULL,
    source_data_snapshot TEXT NOT NULL,
    rendered_document_reference TEXT,
    status TEXT NOT NULL DEFAULT 'APPROVED',
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    approved_at TEXT,
    approved_by TEXT,
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE RESTRICT,
    UNIQUE(report_id, version_number)
);

CREATE TABLE report_snapshots (
    report_snapshot_id TEXT PRIMARY KEY,
    report_version_id TEXT NOT NULL,
    case_version INTEGER NOT NULL,
    diagnosis_version INTEGER NOT NULL,
    treatment_plan_version INTEGER NOT NULL,
    snapshot_hash TEXT NOT NULL,
    snapshot_created_at TEXT NOT NULL,
    FOREIGN KEY (report_version_id) REFERENCES report_versions(id) ON DELETE RESTRICT
);

-- 39-41. AI SESSIONS, AI CONTEXT SNAPSHOTS & AI SUGGESTIONS
CREATE TABLE ai_sessions (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    created_by TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT
);

CREATE TABLE ai_context_snapshots (
    id TEXT PRIMARY KEY,
    ai_session_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    case_version INTEGER NOT NULL,
    context_hash TEXT NOT NULL,
    context_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (ai_session_id) REFERENCES ai_sessions(id) ON DELETE RESTRICT,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT
);

CREATE TABLE ai_suggestions (
    id TEXT PRIMARY KEY,
    ai_session_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    suggestion_type TEXT NOT NULL,
    content TEXT NOT NULL,
    certainty TEXT NOT NULL CHECK (certainty IN ('CONFIRMED','LIKELY','POSSIBLE','INSUFFICIENT_DATA')),
    status TEXT NOT NULL DEFAULT 'AI_SUGGESTION_ONLY',
    doctor_decision TEXT NOT NULL DEFAULT 'PENDING' CHECK (doctor_decision IN ('ACCEPTED','EDITED','REJECTED','PENDING')),
    doctor_comment TEXT,
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewed_by TEXT,
    FOREIGN KEY (ai_session_id) REFERENCES ai_sessions(id) ON DELETE RESTRICT,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT
);

-- 43-46. FINANCIALS & CASE MATERIAL CONSUMPTION (SSOT for Balance & Direct Cost)
CREATE TABLE case_fee_items (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    fee_type TEXT NOT NULL CHECK (fee_type IN ('TREATMENT','RECORDS','RETENTION','ADDITIONAL','OTHER')),
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL,
    discount REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT
);

CREATE TABLE payments (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'SAR',
    payment_method TEXT NOT NULL,
    reference TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT
);

CREATE TABLE case_material_consumption (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    visit_id TEXT NOT NULL,
    material_id TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    estimated_cost REAL NOT NULL,
    consumed_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES orthodontic_cases(id) ON DELETE RESTRICT,
    FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE RESTRICT
);

-- 48-50. APPEND-ONLY AUDIT LOG, SYNC OPERATIONS & TOMBSTONES
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    entity_version_before INTEGER,
    entity_version_after INTEGER,
    old_payload TEXT,
    new_payload TEXT,
    reason_code TEXT,
    metadata_json TEXT
);

CREATE TABLE sync_operations (
    operation_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('CREATE','UPDATE','DELETE','RESTORE')),
    base_version INTEGER NOT NULL,
    result_version INTEGER NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (sync_status IN ('PENDING','SYNCED','CONFLICT','FAILED')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    error_message TEXT
);

CREATE TABLE sync_tombstones (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    deleted_version INTEGER NOT NULL,
    deleted_at TEXT NOT NULL,
    deleted_by TEXT,
    device_id TEXT NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(id),
    UNIQUE(entity_type, entity_id)
);

-- 52. SYNC CONFLICT TABLE (sync_conflicts)
CREATE TABLE sync_conflicts (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    local_version INTEGER NOT NULL,
    remote_version INTEGER NOT NULL,
    local_payload TEXT NOT NULL,
    remote_payload TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    resolution_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (resolution_status IN ('PENDING','RESOLVED_KEEP_LOCAL','RESOLVED_ACCEPT_REMOTE','MERGED_BY_DOCTOR')),
    resolved_by TEXT,
    resolved_at TEXT,
    resolution_notes TEXT,
    FOREIGN KEY (resolved_by) REFERENCES users(id)
);

CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    migration_name TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    checksum TEXT NOT NULL
);

-- P1-G: EXTENSIBLE REFERENCE & SEED DATA DEFINITIONS (Sections 34-37)
CREATE TABLE tooth_numbering_systems (
    code TEXT PRIMARY KEY CHECK (code IN ('FDI','UNIVERSAL','PALMER')),
    name TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE cephalometric_analysis_definitions (
    analysis_code TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE cephalometric_landmark_definitions (
    landmark_code TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    anatomical_definition TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE cephalometric_measurement_definitions (
    id TEXT PRIMARY KEY,
    analysis_code TEXT NOT NULL,
    measurement_code TEXT NOT NULL,
    unit TEXT NOT NULL,
    norm_mean REAL NOT NULL,
    norm_sd REAL NOT NULL,
    FOREIGN KEY (analysis_code) REFERENCES cephalometric_analysis_definitions(analysis_code) ON DELETE RESTRICT,
    UNIQUE(analysis_code, measurement_code)
);

-- P1-D: TARGETED WORKLOAD INDEXES (Sections 2-12)
-- 3. Patient Search
CREATE INDEX idx_patients_name ON patients(full_name_normalized);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_status ON patients(status);

-- 4. Case Queries
CREATE INDEX idx_cases_patient ON orthodontic_cases(patient_id);
CREATE INDEX idx_cases_status ON orthodontic_cases(case_status);
CREATE INDEX idx_cases_provider ON orthodontic_cases(primary_provider_id);

-- 5. Clinical Timeline Indexes
CREATE INDEX idx_visits_case_date ON visits(case_id, visit_date);
CREATE INDEX idx_exams_case_date ON clinical_examinations(case_id, examination_date);
CREATE INDEX idx_outcomes_case_date ON treatment_outcomes(case_id, assessment_date);

-- 6. Problem / Diagnosis Indexes
CREATE INDEX idx_problems_case_status ON problems(case_id, status);
CREATE INDEX idx_diagnosis_case_version ON diagnosis_versions(case_id, version_number);
CREATE INDEX idx_diagnosis_items_version ON diagnosis_items(diagnosis_version_id);
CREATE INDEX idx_problem_evidence_problem ON problem_evidence(problem_id);

-- 7. Treatment Indexes
CREATE INDEX idx_objectives_case ON treatment_objectives(case_id);
CREATE INDEX idx_objective_problems_problem ON objective_problems(problem_id);
CREATE INDEX idx_plans_case_version ON treatment_plans(case_id, version_number);
CREATE INDEX idx_plan_interventions ON planned_interventions(treatment_plan_id);
CREATE INDEX idx_visit_procedures_visit ON visit_procedures(visit_id);

-- 8. Media Indexes
CREATE INDEX idx_media_case_type ON media_assets(case_id, media_type);

-- 9. Cephalometric Indexes
CREATE INDEX idx_ceph_case_stage ON cephalometric_studies(case_id, study_stage);
CREATE INDEX idx_ceph_measurements_study ON cephalometric_measurements(study_id);
CREATE INDEX idx_ceph_landmarks_study ON cephalometric_landmarks(study_id);

-- 10. AI / Report Indexes
CREATE INDEX idx_ai_sessions_case ON ai_sessions(case_id);
CREATE INDEX idx_ai_suggestions_case ON ai_suggestions(case_id);
CREATE INDEX idx_reports_case ON reports(case_id);
CREATE INDEX idx_report_versions_report ON report_versions(report_id);

-- 11. Sync Indexes
CREATE INDEX idx_sync_pending ON sync_operations(sync_status, created_at);
CREATE INDEX idx_sync_entity ON sync_operations(entity_type, entity_id);
CREATE INDEX idx_sync_device ON sync_operations(device_id);
CREATE INDEX idx_conflicts_status ON sync_conflicts(resolution_status);
CREATE INDEX idx_tombstone_entity ON sync_tombstones(entity_type, entity_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
`;
