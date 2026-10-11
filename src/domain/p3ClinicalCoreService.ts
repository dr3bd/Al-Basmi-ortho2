/**
 * ORTHODONTIC CLINICAL PLATFORM
 * P3-A + P3-B + P3-C — Unified Clinical Core Execution Contract v1.0
 *
 * Implements:
 * - P3-A: Patient Management (PA-01..PA-15, Gate G-P3A)
 * - P3-B: Orthodontic Case Management (PB-01..PB-15, Gate G-P3B)
 * - P3-C: Clinical Examination + Findings + Tooth Findings + Arch Measurements (PC-01..PC-20, Gate G-P3C)
 * - P3-X: Integrated Clinical Core Verification (PX-01..PX-10, Gate G-P3-ABC)
 *
 * Frozen Baselines (Zero Schema or Domain Contract Modifications):
 * - SCHEMA_FREEZE_v1.0
 * - DOMAIN_BOUNDARY_CONTRACT_v1.0
 * - USE_CASE_CONTRACT_v1.0
 * - DOMAIN_VALIDATION_CONTRACT_v1.0
 * - REPOSITORY_DATA_ACCESS_CONTRACT_v1.0
 * - DOMAIN_FREEZE_v1.0
 */

import {
  SqliteArchMeasurementRow,
  SqliteAuditLogRow,
  SqliteClinicalExaminationRow,
  SqliteClinicalFindingRow,
  SqliteOrthodonticCaseRow,
  SqlitePatientRow,
  SqliteSyncOperationRow,
  SqliteToothFindingRow,
} from './p0SqliteSchema';
import {
  AuthoritativeValidationRole,
  DomainValidationEngine,
  ValidationCommandInput,
  ValidationResult,
} from './p2cDomainValidationEngine';
import {
  AuthoritativeRepositories,
  OrthodonticCaseDomainEntity,
  PatientDomainEntity,
  PersistenceMapper,
} from './p2dRepositoryContract';
import {
  AuthoritativeRelationalDatabaseState,
  cloneAuthoritativeDatabase,
  createSeededAuthoritativeDatabase,
  restoreAuthoritativeDatabase,
} from './p2eAndP2fPipelineAndQuery';

export type P3UserRole = AuthoritativeValidationRole;

export interface P3ExecutionContext {
  operation_id: string;
  user_id: string;
  user_role: P3UserRole;
  device_id: string;
  timestamp: string;
  is_online: boolean;
}

/**
 * R1 Reintegration: P3ClinicalCoreDatabase is now a strict alias to the single
 * AuthoritativeRelationalDatabaseState. No parallel 8-table database exists.
 */
export type P3ClinicalCoreDatabase = AuthoritativeRelationalDatabaseState;

export const VALID_FDI_TEETH = new Set([
  // Permanent 11-18, 21-28, 31-38, 41-48
  '11','12','13','14','15','16','17','18',
  '21','22','23','24','25','26','27','28',
  '31','32','33','34','35','36','37','38',
  '41','42','43','44','45','46','47','48',
  // Primary 51-55, 61-65, 71-75, 81-85
  '51','52','53','54','55',
  '61','62','63','64','65',
  '71','72','73','74','75',
  '81','82','83','84','85',
]);

export function normalizeBilingualSearchName(
  firstName: string,
  middleName: string | null | undefined,
  lastName: string
): string {
  const raw = [firstName, middleName || '', lastName]
    .join(' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return raw
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

export function createSeededP3ClinicalCoreDatabase(): AuthoritativeRelationalDatabaseState {
  const now = '2026-10-07T09:00:00Z';
  const db = createSeededAuthoritativeDatabase();

  // Seed Patient 1 (Arabic + English bilingual record)
  const p1: SqlitePatientRow = {
    id: 'pat-p3-001',
    patient_number: 'PAT-2026-0001',
    first_name: 'سارة',
    middle_name: 'خالد',
    last_name: 'المنصور',
    full_name_normalized: normalizeBilingualSearchName('سارة', 'خالد', 'المنصور') + ' sarah khaled al-mansour',
    date_of_birth: '2011-04-12',
    sex: 'FEMALE',
    nationality: 'SA',
    phone: '+966501234567',
    secondary_phone: '+966509876543',
    email: 'sarah.mansour@example.sa',
    address: 'الرياض - حي العليا',
    occupation: 'طالبة',
    guardian_name: 'خالد المنصور',
    guardian_phone: '+966501112233',
    emergency_contact: 'خالد المنصور (+966501112233)',
    medical_alert: 'لا توجد أمراض جهازية · حساسية البنسلين: لا يوجد',
    general_notes: 'تاريخ سني: تنظيف دوري ومراجعة تقويمية أولية',
    status: 'ACTIVE',
    created_at: now,
    updated_at: now,
    created_by: 'usr-ortho-01',
    updated_by: 'usr-ortho-01',
    version: 1,
    is_deleted: 0,
    deleted_at: null,
  };
  db.patients.set(p1.id, p1);

  // Seed Patient 2
  const p2: SqlitePatientRow = {
    id: 'pat-p3-002',
    patient_number: 'PAT-2026-0002',
    first_name: 'Faisal',
    middle_name: 'Omar',
    last_name: 'Al-Harbi',
    full_name_normalized: normalizeBilingualSearchName('Faisal', 'Omar', 'Al-Harbi') + ' فيصل عمر الحربي',
    date_of_birth: '2008-09-20',
    sex: 'MALE',
    nationality: 'SA',
    phone: '+966554433221',
    secondary_phone: null,
    email: 'faisal.harbi@example.sa',
    address: 'Jeddah - Al Rawdah',
    occupation: 'Student',
    guardian_name: 'Omar Al-Harbi',
    guardian_phone: '+966554433200',
    emergency_contact: 'Omar Al-Harbi',
    medical_alert: 'Controlled mild asthma',
    general_notes: 'Previous interceptive appliance in 2021',
    status: 'ACTIVE',
    created_at: now,
    updated_at: now,
    created_by: 'usr-ortho-01',
    updated_by: 'usr-ortho-01',
    version: 1,
    is_deleted: 0,
    deleted_at: null,
  };
  db.patients.set(p2.id, p2);

  // Seed Case 1 for Patient 1
  // ARCHITECTURAL NOTE: case_status represents administrative/case lifecycle (Section 4.3).
  // Clinical treatment phase (e.g. ALIGNMENT_LEVELING) is distinct from lifecycle status.
  // Because SqliteOrthodonticCaseRow currently lacks a dedicated treatment_phase column,
  // the truthful case_status ('ACTIVE_TREATMENT') is preserved, and treatment phase is documented in notes.
  const c1: SqliteOrthodonticCaseRow = {
    id: 'case-p3-001',
    case_number: 'ORT-2026-000101',
    patient_id: p1.id,
    case_type: 'COMPREHENSIVE',
    case_status: 'ACTIVE_TREATMENT',
    chief_complaint: 'بروز الأسنان الأمامية العلوية مع ازدحام القواطع السفلية',
    referral_source: 'General Dentist Referral',
    start_date: '2026-01-15',
    target_completion_date: '2027-07-15',
    actual_completion_date: null,
    growth_status: 'PEAK_GROWTH',
    skeletal_maturity_status: 'CS3',
    primary_provider_id: 'usr-ortho-01',
    clinic_id: 'clinic-main-01',
    current_diagnosis_version_id: null,
    current_treatment_plan_id: null,
    notes: 'توقعات المريض: ابتسامة متناسقة وإغلاق البروز السني الأمامي بدون جراحة [Clinical Treatment Phase: ALIGNMENT_LEVELING]',
    created_at: now,
    updated_at: now,
    created_by: 'usr-ortho-01',
    updated_by: 'usr-ortho-01',
    version: 1,
    is_deleted: 0,
    deleted_at: null,
  };
  db.orthodontic_cases.set(c1.id, c1);

  // Seed Case 2 for Patient 1 (Multi-case per patient support: Interceptive Phase I completed)
  // ARCHITECTURAL NOTE: Phase I interceptive case concluded with retention appliance.
  // Truthful case_status is 'COMPLETED' (or 'RETENTION' where active retention surveillance continues).
  // Clinical retention phase details are preserved in notes pending dedicated phase schema column.
  const c2: SqliteOrthodonticCaseRow = {
    id: 'case-p3-002',
    case_number: 'ORT-2026-000102',
    patient_id: p1.id,
    case_type: 'INTERCEPTIVE',
    case_status: 'COMPLETED',
    chief_complaint: 'توسيع الفك العلوي المرحلي المبكر (Phase I Expansion)',
    referral_source: 'Pediatric Dentistry',
    start_date: '2024-02-10',
    target_completion_date: '2025-02-10',
    actual_completion_date: '2025-01-25',
    growth_status: 'PRE_PUBERTAL',
    skeletal_maturity_status: 'CS2',
    primary_provider_id: 'usr-ortho-01',
    clinic_id: 'clinic-main-01',
    current_diagnosis_version_id: null,
    current_treatment_plan_id: null,
    notes: 'توقعات المريض: توسيع الفك العلوي | مرحلة التثبيت: FIXED_AND_HAWLEY | اكتملت المرحلة الأولى بنجاح قبل الانتقال للحالة الشاملة ORT-2026-000101 [Clinical Treatment Phase: RETENTION / APPLIANCE: FIXED_AND_HAWLEY]',
    created_at: now,
    updated_at: now,
    created_by: 'usr-ortho-01',
    updated_by: 'usr-ortho-01',
    version: 1,
    is_deleted: 0,
    deleted_at: null,
  };
  db.orthodontic_cases.set(c2.id, c2);

  // Seed Clinical Examination for Case 1
  const ex1: SqliteClinicalExaminationRow = {
    id: 'exam-p3-001',
    case_id: c1.id,
    visit_id: null,
    examination_date: '2026-01-16',
    examiner_id: 'usr-ortho-01',
    examination_stage: 'INITIAL',
    status: 'CONFIRMED',
    general_findings: 'فحص سريري تقويمي أولي شامل (T0 Initial Records) | Extraoral: محدب متوسط نتيجة تراجع الفك السفلي | Intraoral: عناية جيدة | Occlusal: بروز 7.5 مم مع صنف ثانٍ | Skeletal: ANB 6.2° | Dental: ميلان دهليزي | Soft Tissue: تباعد شفاه 3 مم | Functional: طبيعي',
    notes: 'المريضة متعاونة واللثة سليمة مع وجود ازدحام سفلي 5.2 مم وبروز سهمي 7.5 مم',
    created_at: now,
    updated_at: now,
    created_by: 'usr-ortho-01',
    updated_by: 'usr-ortho-01',
    version: 1,
    is_deleted: 0,
    deleted_at: null,
  };
  db.clinical_examinations.set(ex1.id, ex1);

  // Seed structured findings across categories (EXTRAORAL, INTRAORAL, OCCLUSAL, SKELETAL, DENTAL, SOFT_TISSUE, FUNCTIONAL)
  const seededFindings: SqliteClinicalFindingRow[] = [
    {
      id: 'cf-p3-001',
      examination_id: ex1.id,
      category: 'EXTRAORAL',
      finding_code: 'PROFILE_CONVEXITY',
      value: 'CONVEX_PROFILE',
      unit: null,
      severity: 'MODERATE',
      side: 'NONE',
      location: 'FACIAL_PROFILE',
      clinical_significance: 'CLINICAL_FINDING',
      notes: 'Facial Profile Convexity: محدب متوسط نتيجة تراجع الفك السفلي',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'cf-p3-002',
      examination_id: ex1.id,
      category: 'SOFT_TISSUE',
      finding_code: 'LIP_COMPETENCE',
      value: 'INCOMPETENT_3MM_REST',
      unit: 'mm',
      severity: 'MILD',
      side: 'MIDLINE',
      location: 'LIPS',
      clinical_significance: 'CLINICAL_FINDING',
      notes: 'Lip Competence at Rest: تباعد الشفاه في وضع الراحة 3 مم مع زاوية أنفية شفوية 96 درجة',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'cf-p3-003',
      examination_id: ex1.id,
      category: 'INTRAORAL',
      finding_code: 'ORAL_HYGIENE_GINGIVA',
      value: 'GOOD_HYGIENE_INTACT_PAPILLAE',
      unit: null,
      severity: 'NORMAL',
      side: 'BILATERAL',
      location: 'FULL_MOUTH',
      clinical_significance: 'NORMAL_OBSERVATION',
      notes: 'Oral Hygiene & Gingiva: عناية فموية جيدة، لا يوجد انحسار لثوي',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'cf-p3-004',
      examination_id: ex1.id,
      category: 'OCCLUSAL',
      finding_code: 'OVERJET_MM',
      value: '7.5',
      unit: 'mm',
      severity: 'MODERATE',
      side: 'MIDLINE',
      location: 'ANTERIOR_INCISORS',
      clinical_significance: 'PATHOLOGICAL_DEVIATION',
      notes: 'Overjet: بروز قواطع أمامي 7.5 مم مع علاقة أرحاء وناب صنف ثانٍ ثنائي الجانب',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'cf-p3-005',
      examination_id: ex1.id,
      category: 'SKELETAL',
      finding_code: 'SAGITTAL_SKELETAL_PATTERN',
      value: 'SKELETAL_CLASS_II_MANDIBULAR_RETROGNATHIA',
      unit: 'deg',
      severity: 'MODERATE',
      side: 'NONE',
      location: 'MAXILLO_MANDIBULAR',
      clinical_significance: 'PATHOLOGICAL_DEVIATION',
      notes: 'Sagittal Skeletal Relationship: ANB = 6.2°, نمط عمودي سوي (Normodivergent)',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'cf-p3-006',
      examination_id: ex1.id,
      category: 'DENTAL',
      finding_code: 'UPPER_INCISOR_INCLINATION',
      value: 'PROCLINED_U1_SN_112',
      unit: 'deg',
      severity: 'MODERATE',
      side: 'MIDLINE',
      location: 'MAXILLARY_ANTERIOR',
      clinical_significance: 'CLINICAL_FINDING',
      notes: 'Upper Incisor Inclination: ميلان دهليزي للقواطع العلوية',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'cf-p3-007',
      examination_id: ex1.id,
      category: 'FUNCTIONAL',
      finding_code: 'TMJ_CR_CO_SHIFT',
      value: 'NO_FUNCTIONAL_SHIFT_NORMAL_TMJ',
      unit: null,
      severity: 'NORMAL',
      side: 'BILATERAL',
      location: 'TMJ',
      clinical_significance: 'NORMAL_OBSERVATION',
      notes: 'TMJ & CR-CO Functional Shift: لا يوجد انزلاق وظيفي CR-CO ولا أصوات مفصلية',
      created_at: now,
      updated_at: now,
    },
  ];
  for (const f of seededFindings) {
    db.clinical_findings.set(f.id, f);
  }

  // Seed Tooth Findings (Structured FDI rows, zero JSON blobs)
  const seededTeeth: SqliteToothFindingRow[] = [
    {
      id: 'tf-p3-001',
      examination_id: ex1.id,
      tooth_number: '13',
      finding_type: 'DISPLACED',
      status: 'ECTOPIC_LABIAL',
      condition: 'SOUND_ENAMEL',
      position: 'HIGH_BUCCAL',
      angulation: 'MESIALLY_ANGULATED_15_DEG',
      eruption_status: 'PARTIALLY_ERUPTED',
      mobility: 'GRADE_0',
      rotation: 'MESIO_LABIAL_10_DEG',
      inclination: 'BUCCAL_CROWN_TORQUE',
      presence_status: 'PRESENT',
      notes: 'الناب العلوي الأيمن (FDI 13) في تموضع دهليزي مرتفع جزئياً [MODERATE]',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'tf-p3-002',
      examination_id: ex1.id,
      tooth_number: '32',
      finding_type: 'ROTATED',
      status: 'CROWDED_LINGUAL',
      condition: 'SOUND_ENAMEL',
      position: 'LINGUALLY_BLOCKED',
      angulation: 'UPRIGHT',
      eruption_status: 'FULLY_ERUPTED',
      mobility: 'GRADE_0',
      rotation: 'DISTO_LINGUAL_25_DEG',
      inclination: 'RETROCLINED',
      presence_status: 'PRESENT',
      notes: 'الرباعية السفلية اليسرى (FDI 32) ملتفة لسانياً بسبب ازدحام القوس [MODERATE]',
      created_at: now,
      updated_at: now,
    },
  ];
  for (const t of seededTeeth) {
    db.tooth_findings.set(t.id, t);
  }

  // Seed Arch Measurements (Structured rows)
  const seededArch: SqliteArchMeasurementRow[] = [
    {
      id: 'am-p3-001',
      examination_id: ex1.id,
      arch: 'MAXILLARY',
      measurement_type: 'INTERCANINE_WIDTH',
      value: 33.5,
      unit: 'mm',
      method: 'DIGITAL_SCAN',
      reference: '34.0 ± 1.5 mm',
      notes: 'عرض بين الأنياب العلوية ضمن الحدود الطبيعية الدنيا',
      created_at: now,
      updated_at: now,
    },
    // ARCHITECTURAL NOTE: Space Discrepancy Canonical Representation (Single Source of Truth)
    // Canonical SqliteArchMeasurementRow.measurement_type supports 'SPACE_DISCREPANCY'.
    // Independent measurement types for 'SPACE_REQUIRED' and 'SPACE_AVAILABLE' do not exist in the
    // frozen canonical relational schema (p0SqliteSchema.ts).
    // Therefore, SPACE_DISCREPANCY (-5.2 mm) is canonically and structurally persisted.
    // The clinical components (Space Required: 66.2mm, Space Available: 61.0mm) are recorded in notes
    // as descriptive context without fabricating unapproved schema fields. This limitation is
    // documented as a frozen-schema constraint pending formal governance.
    {
      id: 'am-p3-002',
      examination_id: ex1.id,
      arch: 'MANDIBULAR',
      measurement_type: 'SPACE_DISCREPANCY',
      value: -5.2,
      unit: 'mm',
      method: 'DIGITAL_SCAN',
      reference: '0.0 mm',
      notes: 'عجز مسافة (ازدحام) في القوس السفلية بمقدار 5.2 مم [Space Required: 66.2mm, Space Available: 61.0mm, Discrepancy: -5.2mm]',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'am-p3-003',
      examination_id: ex1.id,
      arch: 'BIMAXILLARY',
      measurement_type: 'BOLTON_ANTERIOR',
      value: 77.4,
      unit: '%',
      method: 'DIGITAL_SCAN',
      reference: '77.2 ± 1.65 %',
      notes: 'نسبة بولتون الأمامية متوازنة',
      created_at: now,
      updated_at: now,
    },
  ];
  for (const a of seededArch) {
    db.arch_measurements.set(a.id, a);
  }

  return db;
}

export function cloneP3ClinicalCoreDatabase(
  source: AuthoritativeRelationalDatabaseState
): AuthoritativeRelationalDatabaseState {
  return cloneAuthoritativeDatabase(source);
}

export interface P3ServiceResult<TData = unknown> {
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
}

// ============================================================================
// PART 1 — P3-A: PATIENT MANAGEMENT APPLICATION SERVICE & QUERY SERVICE
// ============================================================================

export interface CreatePatientCommandDto {
  id: string;
  patient_number: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  bilingual_alias?: string;
  date_of_birth: string;
  sex: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  nationality?: string | null;
  phone: string;
  secondary_phone?: string | null;
  email?: string | null;
  address?: string | null;
  occupation?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  emergency_contact?: string | null;
  medical_alert?: string | null;
  general_notes?: string | null;
}

export interface UpdatePatientCommandDto {
  id: string;
  expected_version: number;
  first_name?: string;
  middle_name?: string | null;
  last_name?: string;
  date_of_birth?: string;
  sex?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  phone?: string;
  secondary_phone?: string | null;
  email?: string | null;
  address?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  medical_alert?: string | null;
  general_notes?: string | null;
  status?: 'ACTIVE' | 'ARCHIVED' | 'INACTIVE';
}

export class P3APatientApplicationService {
  public static createPatient(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    dto: CreatePatientCommandDto
  ): P3ServiceResult<PatientDomainEntity> {
    // Idempotency check
    const existingSync = db.sync_operations.get(ctx.operation_id);
    if (existingSync) {
      const existingRes = AuthoritativeRepositories.patients.getById(db, existingSync.entity_id, true);
      return {
        committed: true,
        operation_id: ctx.operation_id,
        idempotent_hit: true,
        data: existingRes.data,
        resulting_version: existingSync.entity_version ?? existingSync.result_version,
        audit_id: `aud-${ctx.operation_id}`,
        sync_operation_id: existingSync.id ?? existingSync.operation_id,
        validation: null,
        error_code: null,
        error_message: null,
      };
    }

    // Route through authoritative DomainValidationEngine (no role rewriting!)
    const dupByNum = AuthoritativeRepositories.patients.getByPatientNumber(db, dto.patient_number || '', true);
    const dupById = AuthoritativeRepositories.patients.exists(db, dto.id, true);

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'CreatePatient',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        patient_id: dto.id,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'Patient',
        entityId: dto.id,
        patientNumber: dto.patient_number?.trim() || '',
        patientFirstName: dto.first_name?.trim() || '',
        patientLastName: dto.last_name?.trim() || '',
        patientPhone: dto.phone?.trim() || '',
        patientDob: dto.date_of_birth,
        patientSex: dto.sex,
        patientId: dto.id,
        patientDuplicateExists: dupByNum.ok || dupById,
        version: 1,
        auditCreated: true,
        syncOutboxCreated: true,
      },
    };
    const valResult = DomainValidationEngine.validate(valInput);

    if (!valResult.valid) {
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
        error_message: valResult.errors[0]?.message || 'Validation failed.',
      };
    }

    // Atomic transaction on working copy via PatientRepository
    const txDb = cloneP3ClinicalCoreDatabase(db);
    const normalized =
      normalizeBilingualSearchName(dto.first_name, dto.middle_name, dto.last_name) +
      (dto.bilingual_alias ? ` ${dto.bilingual_alias.toLowerCase().trim()}` : '');

    const row: SqlitePatientRow = {
      id: dto.id,
      patient_number: dto.patient_number.trim(),
      first_name: dto.first_name.trim(),
      middle_name: dto.middle_name?.trim() || null,
      last_name: dto.last_name.trim(),
      full_name_normalized: normalized,
      date_of_birth: dto.date_of_birth,
      sex: dto.sex,
      nationality: dto.nationality || null,
      phone: dto.phone.trim(),
      secondary_phone: dto.secondary_phone || null,
      email: dto.email || null,
      address: dto.address || null,
      occupation: dto.occupation || null,
      guardian_name: dto.guardian_name || null,
      guardian_phone: dto.guardian_phone || null,
      emergency_contact: dto.emergency_contact || null,
      medical_alert: dto.medical_alert || null,
      general_notes: dto.general_notes || null,
      status: 'ACTIVE',
      created_at: ctx.timestamp,
      updated_at: ctx.timestamp,
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
      version: 1,
      is_deleted: 0,
      deleted_at: null,
    };

    const repoCreateRes = AuthoritativeRepositories.patients.create(txDb, row);
    if (!repoCreateRes.ok || !repoCreateRes.data) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code: repoCreateRes.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoCreateRes.error?.message || 'Repository create patient failed.',
      };
    }

    const auditId = `aud-${ctx.operation_id}`;
    txDb.audit_logs.set(auditId, ({
      id: auditId,
      entity_type: 'Patient',
      entity_id: row.id,
      action_type: 'CREATE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      device_id: ctx.device_id,
      reason: `Created patient ${row.patient_number}`,
      previous_state_snapshot: null,
      new_state_snapshot: JSON.stringify(row),
      created_at: ctx.timestamp,
    }) as any);

    txDb.sync_operations.set(ctx.operation_id, ({
      id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'Patient',
      entity_id: row.id,
      operation_type: 'INSERT',
      entity_version: 1,
      base_version: null,
      payload_json: JSON.stringify(row),
      idempotency_key: ctx.operation_id,
      sync_status: 'PENDING',
      retry_count: 0,
      last_error: null,
      created_at: ctx.timestamp,
      synced_at: null,
    }) as any);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: repoCreateRes.data,
      resulting_version: repoCreateRes.resulting_version,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }

  public static updatePatient(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    dto: UpdatePatientCommandDto
  ): P3ServiceResult<PatientDomainEntity> {
    const existingRes = AuthoritativeRepositories.patients.getRowById(db, dto.id, true);
    const existing = existingRes.ok && existingRes.data ? existingRes.data : null;

    const nextFirst = dto.first_name !== undefined ? dto.first_name.trim() : existing?.first_name || '';
    const nextMiddle = dto.middle_name !== undefined ? dto.middle_name : existing?.middle_name || null;
    const nextLast = dto.last_name !== undefined ? dto.last_name.trim() : existing?.last_name || '';
    const nextPhone = dto.phone !== undefined ? dto.phone.trim() : existing?.phone || '';
    const nextDob = dto.date_of_birth ?? existing?.date_of_birth ?? '';
    const nextSex = dto.sex ?? existing?.sex ?? 'UNKNOWN';

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'UpdatePatient',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        patient_id: dto.id,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'Patient',
        entityId: dto.id,
        patientId: dto.id,
        patientNumber: existing?.patient_number || 'PAT-UNKNOWN',
        patientFirstName: nextFirst,
        patientLastName: nextLast,
        patientPhone: nextPhone,
        patientDob: nextDob,
        patientSex: nextSex,
        patientExists: Boolean(existing),
        patientIsDeleted: Boolean(existing && existing.is_deleted === 1),
        isDeletedTarget: Boolean(existing && existing.is_deleted === 1),
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
        error_code: valResult.errors[0]?.code || 'ERR_ENTITY_NOT_FOUND',
        error_message: valResult.errors[0]?.message || `Patient ${dto.id} not found or validation failed.`,
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const nameChanged =
      dto.first_name !== undefined || dto.middle_name !== undefined || dto.last_name !== undefined;

    const repoUpdateRes = AuthoritativeRepositories.patients.update(txDb, dto.id, dto.expected_version, {
      first_name: nextFirst,
      middle_name: nextMiddle,
      last_name: nextLast,
      full_name_normalized: nameChanged
        ? `${normalizeBilingualSearchName(nextFirst, nextMiddle, nextLast)} ${existing.full_name_normalized}`.trim()
        : existing.full_name_normalized,
      date_of_birth: nextDob,
      sex: nextSex,
      phone: nextPhone,
      secondary_phone: dto.secondary_phone !== undefined ? dto.secondary_phone : existing.secondary_phone,
      email: dto.email !== undefined ? dto.email : existing.email,
      address: dto.address !== undefined ? dto.address : existing.address,
      guardian_name: dto.guardian_name !== undefined ? dto.guardian_name : existing.guardian_name,
      guardian_phone: dto.guardian_phone !== undefined ? dto.guardian_phone : existing.guardian_phone,
      medical_alert: dto.medical_alert !== undefined ? dto.medical_alert : existing.medical_alert,
      general_notes: dto.general_notes !== undefined ? dto.general_notes : existing.general_notes,
      status: dto.status ?? existing.status,
      updated_at: ctx.timestamp,
      updated_by: ctx.user_id,
    });

    if (!repoUpdateRes.ok || !repoUpdateRes.data) {
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
          repoUpdateRes.error?.code === 'ERR_REPOSITORY_VERSION_CONFLICT'
            ? 'ERR_VERSION_CONFLICT'
            : repoUpdateRes.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoUpdateRes.error?.message || 'Patient update failed.',
      };
    }

    const updatedRow = AuthoritativeRepositories.patients.getRowById(txDb, dto.id, true).data!;
    const nextVersion = updatedRow.version;

    const auditId = `aud-${ctx.operation_id}`;
    txDb.audit_logs.set(auditId, ({
      id: auditId,
      entity_type: 'Patient',
      entity_id: updatedRow.id,
      action_type: 'UPDATE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      device_id: ctx.device_id,
      reason: `Updated patient ${updatedRow.patient_number} v${existing.version}->v${nextVersion}`,
      previous_state_snapshot: JSON.stringify(existing),
      new_state_snapshot: JSON.stringify(updatedRow),
      created_at: ctx.timestamp,
    }) as any);

    txDb.sync_operations.set(ctx.operation_id, ({
      id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'Patient',
      entity_id: updatedRow.id,
      operation_type: 'UPDATE',
      entity_version: nextVersion,
      base_version: existing.version,
      payload_json: JSON.stringify(updatedRow),
      idempotency_key: ctx.operation_id,
      sync_status: 'PENDING',
      retry_count: 0,
      last_error: null,
      created_at: ctx.timestamp,
      synced_at: null,
    }) as any);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: repoUpdateRes.data,
      resulting_version: nextVersion,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }

  public static softDeletePatient(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    patientId: string,
    expectedVersion: number,
    reason: string
  ): P3ServiceResult<PatientDomainEntity> {
    const existingRes = AuthoritativeRepositories.patients.getRowById(db, patientId, true);
    const existing = existingRes.ok && existingRes.data ? existingRes.data : null;

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'SoftDeletePatient',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        patient_id: patientId,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'Patient',
        entityId: patientId,
        patientId,
        patientNumber: existing?.patient_number || 'PAT-UNKNOWN',
        patientExists: Boolean(existing),
        patientIsDeleted: Boolean(existing && existing.is_deleted === 1),
        isDeletedTarget: Boolean(existing && existing.is_deleted === 1),
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
        error_code: valResult.errors[0]?.code || 'ERR_ENTITY_NOT_FOUND',
        error_message: valResult.errors[0]?.message || `Patient ${patientId} not found.`,
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const repoDelRes = AuthoritativeRepositories.patients.softDelete(
      txDb,
      patientId,
      expectedVersion,
      ctx.timestamp,
      ctx.user_id
    );
    if (!repoDelRes.ok || !repoDelRes.data) {
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
          repoDelRes.error?.code === 'ERR_REPOSITORY_VERSION_CONFLICT'
            ? 'ERR_VERSION_CONFLICT'
            : repoDelRes.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoDelRes.error?.message || `Version mismatch on softDeletePatient.`,
      };
    }

    const deletedRow = AuthoritativeRepositories.patients.getRowById(txDb, patientId, true).data!;
    const nextVersion = deletedRow.version;

    const auditId = `aud-${ctx.operation_id}`;
    txDb.audit_logs.set(auditId, ({
      id: auditId,
      entity_type: 'Patient',
      entity_id: patientId,
      action_type: 'SOFT_DELETE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      device_id: ctx.device_id,
      reason,
      previous_state_snapshot: JSON.stringify(existing),
      new_state_snapshot: JSON.stringify(deletedRow),
      created_at: ctx.timestamp,
    }) as any);

    txDb.sync_operations.set(ctx.operation_id, ({
      id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'Patient',
      entity_id: patientId,
      operation_type: 'SOFT_DELETE',
      entity_version: nextVersion,
      base_version: existing.version,
      payload_json: JSON.stringify(deletedRow),
      idempotency_key: ctx.operation_id,
      sync_status: 'PENDING',
      retry_count: 0,
      last_error: null,
      created_at: ctx.timestamp,
      synced_at: null,
    }) as any);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: repoDelRes.data,
      resulting_version: nextVersion,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }

  public static restorePatient(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    patientId: string,
    expectedVersion: number
  ): P3ServiceResult<PatientDomainEntity> {
    const existingRes = AuthoritativeRepositories.patients.getRowById(db, patientId, true);
    const existing = existingRes.ok && existingRes.data ? existingRes.data : null;

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'RestorePatient',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        patient_id: patientId,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'Patient',
        entityId: patientId,
        patientId,
        patientNumber: existing?.patient_number || 'PAT-UNKNOWN',
        patientExists: Boolean(existing),
        patientIsDeleted: Boolean(existing && existing.is_deleted === 1),
        isDeletedTarget: false,
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
        error_code: valResult.errors[0]?.code || 'ERR_ENTITY_NOT_FOUND',
        error_message: valResult.errors[0]?.message || `Patient ${patientId} not found.`,
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const repoRestoreRes = AuthoritativeRepositories.patients.restore(
      txDb,
      patientId,
      expectedVersion,
      ctx.timestamp,
      ctx.user_id
    );
    if (!repoRestoreRes.ok || !repoRestoreRes.data) {
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
          repoRestoreRes.error?.code === 'ERR_REPOSITORY_VERSION_CONFLICT'
            ? 'ERR_VERSION_CONFLICT'
            : repoRestoreRes.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoRestoreRes.error?.message || `Restore patient failed.`,
      };
    }

    const restoredRow = AuthoritativeRepositories.patients.getRowById(txDb, patientId, true).data!;
    const nextVersion = restoredRow.version;

    const auditId = `aud-${ctx.operation_id}`;
    txDb.audit_logs.set(auditId, ({
      id: auditId,
      entity_type: 'Patient',
      entity_id: patientId,
      action_type: 'RESTORE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      device_id: ctx.device_id,
      reason: `Restored patient ${existing.patient_number}`,
      previous_state_snapshot: JSON.stringify(existing),
      new_state_snapshot: JSON.stringify(restoredRow),
      created_at: ctx.timestamp,
    }) as any);

    txDb.sync_operations.set(ctx.operation_id, ({
      id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'Patient',
      entity_id: patientId,
      operation_type: 'RESTORE',
      entity_version: nextVersion,
      base_version: expectedVersion,
      payload_json: JSON.stringify(restoredRow),
      idempotency_key: ctx.operation_id,
      sync_status: 'PENDING',
      retry_count: 0,
      last_error: null,
      created_at: ctx.timestamp,
      synced_at: null,
    }) as any);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: repoRestoreRes.data,
      resulting_version: nextVersion,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }
}

export class P3APatientQueryService {
  public static getPatientById(
    db: P3ClinicalCoreDatabase,
    patientId: string,
    includeDeleted = false
  ): SqlitePatientRow | null {
    const res = AuthoritativeRepositories.patients.getRowById(db, patientId, includeDeleted);
    return res.ok && res.data ? res.data : null;
  }

  public static searchPatients(
    db: P3ClinicalCoreDatabase,
    query: string,
    includeDeleted = false
  ): SqlitePatientRow[] {
    const listRes = AuthoritativeRepositories.patients.listActive(db, includeDeleted);
    const rows = listRes.data || [];
    const q = query.trim().toLowerCase();
    const qNorm = normalizeBilingualSearchName(q, '', '');
    const qTokens = qNorm.split(/\s+/).filter(Boolean);
    return rows
      .filter((row) => {
        if (!q) return true;
        const allTokensMatch =
          qTokens.length > 0 && qTokens.every((tok) => row.full_name_normalized.includes(tok));
        return (
          row.patient_number.toLowerCase().includes(q) ||
          row.phone.toLowerCase().includes(q) ||
          (row.secondary_phone && row.secondary_phone.toLowerCase().includes(q)) ||
          row.first_name.toLowerCase().includes(q) ||
          row.last_name.toLowerCase().includes(q) ||
          row.full_name_normalized.includes(qNorm) ||
          row.full_name_normalized.includes(q) ||
          allTokensMatch
        );
      })
      .map((r) => ({ ...r }));
  }
}

// ============================================================================
// PART 2 — P3-B: ORTHODONTIC CASE MANAGEMENT APPLICATION SERVICE & QUERY SERVICE
// ============================================================================

export type OrthodonticCaseStatus = SqliteOrthodonticCaseRow['case_status'];

// Authoritative Case Status Transition Matrix (Section 4.3)
const VALID_CASE_STATUS_TRANSITIONS: Record<OrthodonticCaseStatus, OrthodonticCaseStatus[]> = {
  CONSULTATION: ['RECORDS', 'DIAGNOSIS', 'DISCONTINUED', 'TRANSFERRED'],
  RECORDS: ['DIAGNOSIS', 'TREATMENT_PLANNING', 'DISCONTINUED', 'TRANSFERRED'],
  DIAGNOSIS: ['TREATMENT_PLANNING', 'ACTIVE_TREATMENT', 'RECORDS', 'DISCONTINUED', 'TRANSFERRED'],
  TREATMENT_PLANNING: ['ACTIVE_TREATMENT', 'DIAGNOSIS', 'DISCONTINUED', 'TRANSFERRED'],
  ACTIVE_TREATMENT: ['FINISHING', 'DEBOND', 'RETENTION', 'DISCONTINUED', 'TRANSFERRED'],
  FINISHING: ['DEBOND', 'RETENTION', 'ACTIVE_TREATMENT', 'DISCONTINUED', 'TRANSFERRED'],
  DEBOND: ['RETENTION', 'COMPLETED', 'DISCONTINUED', 'TRANSFERRED'],
  RETENTION: ['COMPLETED', 'ACTIVE_TREATMENT', 'DISCONTINUED', 'TRANSFERRED'],
  COMPLETED: ['RETENTION'], // Completed cases can only re-enter retention monitoring; cannot jump to CONSULTATION
  DISCONTINUED: ['CONSULTATION'],
  TRANSFERRED: [],
};

// ARCHITECTURAL NOTE: case_status represents case lifecycle state (CONSULTATION..COMPLETED).
// Clinical treatment phase (e.g. ALIGNMENT_LEVELING, SPACE_CLOSURE) must NOT be passed to case_status.
// Pending formal schema governance for a dedicated treatment_phase column, phase notes belong in notes.
export interface CreateOrthodonticCaseCommandDto {
  id: string;
  case_number: string;
  patient_id: string;
  case_type: SqliteOrthodonticCaseRow['case_type'];
  case_status?: OrthodonticCaseStatus;
  chief_complaint: string;
  referral_source?: string | null;
  start_date: string;
  target_completion_date?: string;
  growth_status?: SqliteOrthodonticCaseRow['growth_status'];
  skeletal_maturity_status?: string;
  primary_provider_id: string;
  clinic_id: string;
  notes?: string | null;
}

export interface UpdateOrthodonticCaseCommandDto {
  id: string;
  expected_version: number;
  case_type?: SqliteOrthodonticCaseRow['case_type'];
  chief_complaint?: string;
  target_completion_date?: string;
  growth_status?: SqliteOrthodonticCaseRow['growth_status'];
  skeletal_maturity_status?: string;
  notes?: string | null;
}

export class P3BOrthodonticCaseApplicationService {
  public static createOrthodonticCase(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    dto: CreateOrthodonticCaseCommandDto
  ): P3ServiceResult<OrthodonticCaseDomainEntity> {
    // Idempotency
    const existingSync = db.sync_operations.get(ctx.operation_id);
    if (existingSync) {
      const existingCaseRes = AuthoritativeRepositories.orthodonticCases.getById(
        db,
        existingSync.entity_id,
        true
      );
      return {
        committed: true,
        operation_id: ctx.operation_id,
        idempotent_hit: true,
        data: existingCaseRes.data,
        resulting_version: existingSync.entity_version ?? existingSync.result_version,
        audit_id: `aud-${ctx.operation_id}`,
        sync_operation_id: existingSync.id ?? existingSync.operation_id,
        validation: null,
        error_code: null,
        error_message: null,
      };
    }

    const patRes = AuthoritativeRepositories.patients.getRowById(db, dto.patient_id, true);
    const patient = patRes.ok && patRes.data ? patRes.data : null;
    const allCases = AuthoritativeRepositories.orthodonticCases.listActive(db, true).data || [];
    const dupCaseNum = allCases.some(
      (c) => c.case_number.toLowerCase() === (dto.case_number || '').trim().toLowerCase()
    );
    const dupCaseId = AuthoritativeRepositories.orthodonticCases.exists(db, dto.id, true);

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'CreateOrthodonticCase',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        patient_id: dto.patient_id,
        case_id: dto.id,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'OrthodonticCase',
        entityId: dto.id,
        patientId: dto.patient_id,
        caseId: dto.id,
        caseNumber: dto.case_number?.trim() || '',
        caseType: dto.case_type,
        caseStatus: dto.case_status || 'CONSULTATION',
        chiefComplaint: dto.chief_complaint?.trim() || '',
        startDate: dto.start_date,
        targetCompletionDate: dto.target_completion_date,
        patientExists: Boolean(patient),
        patientIsDeleted: Boolean(patient && patient.is_deleted === 1),
        caseDuplicateExists: dupCaseNum || dupCaseId,
        version: 1,
        auditCreated: true,
        syncOutboxCreated: true,
      },
    };
    const valResult = DomainValidationEngine.validate(valInput);

    if (!valResult.valid || !patient) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code: valResult.errors[0]?.code || 'ERR_PATIENT_NOT_FOUND',
        error_message: valResult.errors[0]?.message || 'Validation failed.',
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const caseRow: SqliteOrthodonticCaseRow = {
      id: dto.id,
      case_number: dto.case_number.trim(),
      patient_id: dto.patient_id,
      case_type: dto.case_type,
      case_status: dto.case_status || 'CONSULTATION',
      chief_complaint: dto.chief_complaint.trim(),
      referral_source: dto.referral_source || null,
      start_date: dto.start_date,
      target_completion_date: dto.target_completion_date || '2028-01-15',
      actual_completion_date: null,
      growth_status: dto.growth_status || 'PEAK_GROWTH',
      skeletal_maturity_status: dto.skeletal_maturity_status || 'CS3',
      primary_provider_id: dto.primary_provider_id,
      clinic_id: dto.clinic_id,
      current_diagnosis_version_id: null,
      current_treatment_plan_id: null,
      notes: dto.notes || null,
      created_at: ctx.timestamp,
      updated_at: ctx.timestamp,
      created_by: ctx.user_id,
      updated_by: ctx.user_id,
      version: 1,
      is_deleted: 0,
      deleted_at: null,
    };

    const repoCreateRes = AuthoritativeRepositories.orthodonticCases.create(txDb, caseRow);
    if (!repoCreateRes.ok || !repoCreateRes.data) {
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
          repoCreateRes.error?.code === 'ERR_REPOSITORY_DUPLICATE'
            ? 'ERR_DUPLICATE_CASE_NUMBER'
            : repoCreateRes.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoCreateRes.error?.message || `Duplicate case_number or id: ${dto.case_number}`,
      };
    }

    const auditId = `aud-${ctx.operation_id}`;
    txDb.audit_logs.set(auditId, ({
      id: auditId,
      entity_type: 'OrthodonticCase',
      entity_id: caseRow.id,
      action_type: 'CREATE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      device_id: ctx.device_id,
      reason: `Created OrthodonticCase ${caseRow.case_number} for patient ${patient.patient_number}`,
      previous_state_snapshot: null,
      new_state_snapshot: JSON.stringify(caseRow),
      created_at: ctx.timestamp,
    }) as any);

    txDb.sync_operations.set(ctx.operation_id, ({
      id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'OrthodonticCase',
      entity_id: caseRow.id,
      operation_type: 'INSERT',
      entity_version: 1,
      base_version: null,
      payload_json: JSON.stringify(caseRow),
      idempotency_key: ctx.operation_id,
      sync_status: 'PENDING',
      retry_count: 0,
      last_error: null,
      created_at: ctx.timestamp,
      synced_at: null,
    }) as any);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: repoCreateRes.data,
      resulting_version: repoCreateRes.resulting_version,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }

  public static updateOrthodonticCase(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    dto: UpdateOrthodonticCaseCommandDto
  ): P3ServiceResult<OrthodonticCaseDomainEntity> {
    const existingRes = AuthoritativeRepositories.orthodonticCases.getRowById(db, dto.id, true);
    const existing = existingRes.ok && existingRes.data ? existingRes.data : null;

    const nextType = dto.case_type ?? existing?.case_type ?? 'COMPREHENSIVE';
    const nextComplaint =
      dto.chief_complaint !== undefined ? dto.chief_complaint.trim() : existing?.chief_complaint || '';
    const nextTargetDate = dto.target_completion_date ?? existing?.target_completion_date ?? undefined;

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'UpdateOrthodonticCase',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        patient_id: existing?.patient_id,
        case_id: dto.id,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'OrthodonticCase',
        entityId: dto.id,
        patientId: existing?.patient_id || 'pat-unknown',
        caseId: dto.id,
        caseNumber: existing?.case_number || 'ORT-UNKNOWN',
        caseType: nextType,
        caseStatus: existing?.case_status || 'CONSULTATION',
        chiefComplaint: nextComplaint,
        startDate: existing?.start_date || '2026-01-01',
        targetCompletionDate: nextTargetDate,
        caseExists: Boolean(existing),
        caseIsDeleted: Boolean(existing && existing.is_deleted === 1),
        isDeletedTarget: Boolean(existing && existing.is_deleted === 1),
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
        error_code: valResult.errors[0]?.code || 'ERR_ENTITY_NOT_FOUND',
        error_message: valResult.errors[0]?.message || `Case ${dto.id} not found.`,
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const repoUpdateRes = AuthoritativeRepositories.orthodonticCases.update(
      txDb,
      dto.id,
      dto.expected_version,
      {
        case_type: nextType,
        chief_complaint: nextComplaint,
        target_completion_date: nextTargetDate ?? existing.target_completion_date,
        growth_status: dto.growth_status ?? existing.growth_status,
        skeletal_maturity_status: dto.skeletal_maturity_status ?? existing.skeletal_maturity_status,
        notes: dto.notes !== undefined ? dto.notes : existing.notes,
        updated_at: ctx.timestamp,
        updated_by: ctx.user_id,
      }
    );

    if (!repoUpdateRes.ok || !repoUpdateRes.data) {
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
          repoUpdateRes.error?.code === 'ERR_REPOSITORY_VERSION_CONFLICT'
            ? 'ERR_VERSION_CONFLICT'
            : repoUpdateRes.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoUpdateRes.error?.message || `Case version conflict.`,
      };
    }

    const updatedRow = AuthoritativeRepositories.orthodonticCases.getRowById(txDb, dto.id, true).data!;
    const nextVersion = updatedRow.version;

    const auditId = `aud-${ctx.operation_id}`;
    txDb.audit_logs.set(auditId, ({
      id: auditId,
      entity_type: 'OrthodonticCase',
      entity_id: updatedRow.id,
      action_type: 'UPDATE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      device_id: ctx.device_id,
      reason: `Updated case ${updatedRow.case_number}`,
      previous_state_snapshot: JSON.stringify(existing),
      new_state_snapshot: JSON.stringify(updatedRow),
      created_at: ctx.timestamp,
    }) as any);

    txDb.sync_operations.set(ctx.operation_id, ({
      id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'OrthodonticCase',
      entity_id: updatedRow.id,
      operation_type: 'UPDATE',
      entity_version: nextVersion,
      base_version: existing.version,
      payload_json: JSON.stringify(updatedRow),
      idempotency_key: ctx.operation_id,
      sync_status: 'PENDING',
      retry_count: 0,
      last_error: null,
      created_at: ctx.timestamp,
      synced_at: null,
    }) as any);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: repoUpdateRes.data,
      resulting_version: nextVersion,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }

  public static transitionOrthodonticCaseStatus(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    caseId: string,
    targetStatus: OrthodonticCaseStatus,
    expectedVersion: number,
    reason: string
  ): P3ServiceResult<OrthodonticCaseDomainEntity> {
    const existingRes = AuthoritativeRepositories.orthodonticCases.getRowById(db, caseId, true);
    const existing = existingRes.ok && existingRes.data ? existingRes.data : null;

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'TransitionOrthodonticCaseStatus',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        patient_id: existing?.patient_id,
        case_id: caseId,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'OrthodonticCase',
        entityId: caseId,
        patientId: existing?.patient_id || 'pat-unknown',
        caseId,
        caseNumber: existing?.case_number || 'ORT-UNKNOWN',
        caseExists: Boolean(existing),
        caseIsDeleted: Boolean(existing && existing.is_deleted === 1),
        isDeletedTarget: Boolean(existing && existing.is_deleted === 1),
        fromCaseStatus: existing?.case_status,
        toCaseStatus: targetStatus,
        caseStatus: targetStatus,
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
        error_code: valResult.errors[0]?.code || 'ERR_ENTITY_NOT_FOUND',
        error_message: valResult.errors[0]?.message || `Case ${caseId} transition validation failed.`,
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const repoUpdateRes = AuthoritativeRepositories.orthodonticCases.update(
      txDb,
      caseId,
      expectedVersion,
      {
        case_status: targetStatus,
        actual_completion_date:
          targetStatus === 'COMPLETED' ? ctx.timestamp.slice(0, 10) : existing.actual_completion_date,
        updated_at: ctx.timestamp,
        updated_by: ctx.user_id,
      }
    );

    if (!repoUpdateRes.ok || !repoUpdateRes.data) {
      return {
        committed: false,
        operation_id: ctx.operation_id,
        idempotent_hit: false,
        data: null,
        resulting_version: null,
        audit_id: null,
        sync_operation_id: null,
        validation: valResult,
        error_code: repoUpdateRes.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoUpdateRes.error?.message || 'Failed to update case status.',
      };
    }

    const updatedRow = AuthoritativeRepositories.orthodonticCases.getRowById(txDb, caseId, true).data!;
    const nextVersion = updatedRow.version;

    const auditId = `aud-${ctx.operation_id}`;
    txDb.audit_logs.set(auditId, ({
      id: auditId,
      entity_type: 'OrthodonticCase',
      entity_id: caseId,
      action_type: 'UPDATE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      device_id: ctx.device_id,
      reason: `Status transition ${existing.case_status} -> ${targetStatus}: ${reason}`,
      previous_state_snapshot: JSON.stringify(existing),
      new_state_snapshot: JSON.stringify(updatedRow),
      created_at: ctx.timestamp,
    }) as any);

    txDb.sync_operations.set(ctx.operation_id, ({
      id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'OrthodonticCase',
      entity_id: caseId,
      operation_type: 'UPDATE',
      entity_version: nextVersion,
      base_version: existing.version,
      payload_json: JSON.stringify(updatedRow),
      idempotency_key: ctx.operation_id,
      sync_status: 'PENDING',
      retry_count: 0,
      last_error: null,
      created_at: ctx.timestamp,
      synced_at: null,
    }) as any);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: repoUpdateRes.data,
      resulting_version: nextVersion,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }

  public static archiveOrthodonticCase(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    caseId: string,
    expectedVersion: number,
    reason: string
  ): P3ServiceResult<OrthodonticCaseDomainEntity> {
    const existingRes = AuthoritativeRepositories.orthodonticCases.getRowById(db, caseId, true);
    const existing = existingRes.ok && existingRes.data ? existingRes.data : null;

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'ArchiveOrthodonticCase',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        patient_id: existing?.patient_id,
        case_id: caseId,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'OrthodonticCase',
        entityId: caseId,
        patientId: existing?.patient_id || 'pat-unknown',
        caseId,
        caseNumber: existing?.case_number || 'ORT-UNKNOWN',
        caseExists: Boolean(existing),
        caseIsDeleted: Boolean(existing && existing.is_deleted === 1),
        isDeletedTarget: Boolean(existing && existing.is_deleted === 1),
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
        error_code: valResult.errors[0]?.code || 'ERR_ENTITY_NOT_FOUND',
        error_message: valResult.errors[0]?.message || `Case ${caseId} not found.`,
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const repoArchiveRes = AuthoritativeRepositories.orthodonticCases.softDelete(
      txDb,
      caseId,
      expectedVersion,
      ctx.timestamp,
      ctx.user_id
    );
    if (!repoArchiveRes.ok || !repoArchiveRes.data) {
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
          repoArchiveRes.error?.code === 'ERR_REPOSITORY_VERSION_CONFLICT'
            ? 'ERR_VERSION_CONFLICT'
            : repoArchiveRes.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoArchiveRes.error?.message || `Archive case failed.`,
      };
    }

    const archivedRow = AuthoritativeRepositories.orthodonticCases.getRowById(txDb, caseId, true).data!;
    const nextVersion = archivedRow.version;

    const auditId = `aud-${ctx.operation_id}`;
    txDb.audit_logs.set(auditId, ({
      id: auditId,
      entity_type: 'OrthodonticCase',
      entity_id: caseId,
      action_type: 'SOFT_DELETE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      device_id: ctx.device_id,
      reason,
      previous_state_snapshot: JSON.stringify(existing),
      new_state_snapshot: JSON.stringify(archivedRow),
      created_at: ctx.timestamp,
    }) as any);

    txDb.sync_operations.set(ctx.operation_id, ({
      id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'OrthodonticCase',
      entity_id: caseId,
      operation_type: 'SOFT_DELETE',
      entity_version: nextVersion,
      base_version: expectedVersion,
      payload_json: JSON.stringify(archivedRow),
      idempotency_key: ctx.operation_id,
      sync_status: 'PENDING',
      retry_count: 0,
      last_error: null,
      created_at: ctx.timestamp,
      synced_at: null,
    }) as any);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: repoArchiveRes.data,
      resulting_version: nextVersion,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }

  public static restoreOrthodonticCase(
    db: P3ClinicalCoreDatabase,
    ctx: P3ExecutionContext,
    caseId: string,
    expectedVersion: number
  ): P3ServiceResult<OrthodonticCaseDomainEntity> {
    const existingRes = AuthoritativeRepositories.orthodonticCases.getRowById(db, caseId, true);
    const existing = existingRes.ok && existingRes.data ? existingRes.data : null;

    const valInput: ValidationCommandInput = {
      context: {
        command_id: 'RestoreOrthodonticCase',
        operation_id: ctx.operation_id,
        user_id: ctx.user_id,
        user_role: ctx.user_role,
        device_id: ctx.device_id,
        patient_id: existing?.patient_id,
        case_id: caseId,
        schema_version: 'SCHEMA_FREEZE_v1.0',
        domain_version: 'DOMAIN_BOUNDARY_CONTRACT_v1.0',
        timestamp: ctx.timestamp,
        mode: 'STRICT',
      },
      payload: {
        entityType: 'OrthodonticCase',
        entityId: caseId,
        patientId: existing?.patient_id || 'pat-unknown',
        caseId,
        caseNumber: existing?.case_number || 'ORT-UNKNOWN',
        caseExists: Boolean(existing),
        caseIsDeleted: Boolean(existing && existing.is_deleted === 1),
        isDeletedTarget: false,
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
        error_code: valResult.errors[0]?.code || 'ERR_ENTITY_NOT_FOUND',
        error_message: valResult.errors[0]?.message || `Case ${caseId} not found.`,
      };
    }

    const txDb = cloneP3ClinicalCoreDatabase(db);
    const repoRestoreRes = AuthoritativeRepositories.orthodonticCases.restore(
      txDb,
      caseId,
      expectedVersion,
      ctx.timestamp,
      ctx.user_id
    );
    if (!repoRestoreRes.ok || !repoRestoreRes.data) {
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
          repoRestoreRes.error?.code === 'ERR_REPOSITORY_VERSION_CONFLICT'
            ? 'ERR_VERSION_CONFLICT'
            : repoRestoreRes.error?.code || 'ERR_REPOSITORY_CONSTRAINT',
        error_message: repoRestoreRes.error?.message || `Restore case failed.`,
      };
    }

    const restoredRow = AuthoritativeRepositories.orthodonticCases.getRowById(txDb, caseId, true).data!;
    const nextVersion = restoredRow.version;

    const auditId = `aud-${ctx.operation_id}`;
    txDb.audit_logs.set(auditId, ({
      id: auditId,
      entity_type: 'OrthodonticCase',
      entity_id: caseId,
      action_type: 'RESTORE',
      actor_user_id: ctx.user_id,
      actor_role: ctx.user_role,
      device_id: ctx.device_id,
      reason: `Restored case ${existing.case_number}`,
      previous_state_snapshot: JSON.stringify(existing),
      new_state_snapshot: JSON.stringify(restoredRow),
      created_at: ctx.timestamp,
    }) as any);

    txDb.sync_operations.set(ctx.operation_id, ({
      id: ctx.operation_id,
      device_id: ctx.device_id,
      entity_type: 'OrthodonticCase',
      entity_id: caseId,
      operation_type: 'RESTORE',
      entity_version: nextVersion,
      base_version: expectedVersion,
      payload_json: JSON.stringify(restoredRow),
      idempotency_key: ctx.operation_id,
      sync_status: 'PENDING',
      retry_count: 0,
      last_error: null,
      created_at: ctx.timestamp,
      synced_at: null,
    }) as any);

    restoreAuthoritativeDatabase(db, txDb);
    return {
      committed: true,
      operation_id: ctx.operation_id,
      idempotent_hit: false,
      data: repoRestoreRes.data,
      resulting_version: nextVersion,
      audit_id: auditId,
      sync_operation_id: ctx.operation_id,
      validation: valResult,
      error_code: null,
      error_message: null,
    };
  }
}

export class P3BOrthodonticCaseQueryService {
  public static getCaseById(
    db: P3ClinicalCoreDatabase,
    caseId: string,
    includeDeleted = false
  ): SqliteOrthodonticCaseRow | null {
    const res = AuthoritativeRepositories.orthodonticCases.getRowById(db, caseId, includeDeleted);
    return res.ok && res.data ? res.data : null;
  }

  public static listCasesByPatient(
    db: P3ClinicalCoreDatabase,
    patientId: string,
    includeDeleted = false
  ): SqliteOrthodonticCaseRow[] {
    const res = AuthoritativeRepositories.orthodonticCases.listByPatientId(db, patientId, includeDeleted);
    return res.data || [];
  }

  public static searchCases(
    db: P3ClinicalCoreDatabase,
    query: string,
    statusFilter?: OrthodonticCaseStatus | 'ALL'
  ): SqliteOrthodonticCaseRow[] {
    const listRes = AuthoritativeRepositories.orthodonticCases.listActive(db, false);
    const cases = listRes.data || [];
    const q = query.trim().toLowerCase();
    return cases
      .filter((c) => (!statusFilter || statusFilter === 'ALL' ? true : c.case_status === statusFilter))
      .filter((c) => {
        if (!q) return true;
        const pat = AuthoritativeRepositories.patients.getRowById(db, c.patient_id, true).data;
        return (
          c.case_number.toLowerCase().includes(q) ||
          c.chief_complaint.toLowerCase().includes(q) ||
          c.case_type.toLowerCase().includes(q) ||
          (pat && pat.full_name_normalized.includes(q))
        );
      })
      .map((c) => ({ ...c }));
  }
}
