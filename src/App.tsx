import React from 'react';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Database,
  FileText,
  FolderKanban,
  Languages,
  Package,
  Plus,
  Search,
  Stethoscope,
  Wifi,
  WifiOff,
  Compass,
  Camera,
} from 'lucide-react';
import {
  AuditLogItem,
  CBCTAndRadiographicRecord,
  CaseFinancialRecord,
  ClinicalVisit,
  DiagnosisRecord,
  DomainSection,
  ExtraoralExam,
  FindingCategory,
  IntraoralExam,
  InventoryMaterial,
  LanguageMode,
  OcclusalExam,
  OrthodonticCase,
  OutcomeStatus,
  Patient,
  ProblemObjectiveItem,
  ResidualAndRetentionRecord,
  SyncQueueEntry,
} from './types/orthodontics';
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_CASES,
  INITIAL_INVENTORY,
  INITIAL_PATIENTS,
  INITIAL_SYNC_QUEUE,
} from './data/seedCases';
import {
  ORTHODONTIC_EVIDENCE_LIBRARY,
  runClinicalConsistencyAndQualityChecks,
} from './domain/cephalometricEngine';
import {
  formatCaseStatus,
  formatSkeletalSagittal,
} from './utils/i18n';
import { ClinicalCaseWorkspace } from './components/ClinicalCaseWorkspace';
import { P3ClinicalCoreWorkspace } from './components/P3ClinicalCoreWorkspace';
import { ReportEngineView } from './components/ReportEngineView';
import { AIDecisionSupportView } from './components/AIDecisionSupportView';
import { OperationalAndSyncView } from './components/OperationalAndSyncView';
import { PatientMasterList } from './components/patient/PatientMasterList';
import { PatientDetailView } from './components/patient/PatientDetailView';
import { NewPatientModal } from './components/patient/NewPatientModal';
import { useClinicalStorage } from './storage/context/ClinicalStorageContext.tsx';
import {
  SqlitePatientRow,
  SqliteOrthodonticCaseRow,
  SqliteVisitRow,
  SqliteProblemRow,
  SqliteDiagnosisVersionRow,
  SqliteDiagnosisItemRow,
  SqliteClinicalFindingRow,
} from './domain/p0SqliteSchema.ts';

/**
 * Maps an authoritative SQLite patient row into the UI presentation model.
 */
function mapSqlitePatientToUi(row: SqlitePatientRow): Patient {
  const parts = (row.full_name_normalized || '').split('|');
  const arName = parts[0]?.trim() || `${row.first_name} ${row.last_name}`;
  const enName = parts[1]?.trim() || `${row.first_name} ${row.last_name}`;

  return {
    id: row.id,
    fullNameAr: arName,
    fullNameEn: enName,
    gender: row.sex === 'FEMALE' ? 'Female' : 'Male',
    dob: row.date_of_birth,
    phone: row.phone,
    guardianName: row.guardian_name || undefined,
    medicalHistory: row.medical_alert || 'No systemic contraindications.',
    dentalHistory: 'Initial orthodontic consultation.',
    allergies: 'None',
    notes: row.general_notes || '',
    createdAt: row.created_at ? row.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
    isDemo: false, // Authoritative SQLite patient
  };
}

/**
 * Maps an authoritative SQLite visit row to UI presentation model.
 */
function mapSqliteVisitToUi(row: SqliteVisitRow, index: number): ClinicalVisit {
  return {
    id: row.id,
    visitNumber: index + 1,
    date: row.visit_date,
    stage: 'T1_Progress',
    visitType: (row.visit_type as ClinicalVisit['visitType']) || 'Adjustment',
    procedures: row.chief_reason ? [row.chief_reason] : ['Routine Clinical Check'],
    upperArchwire: '0.016 NiTi Upper',
    lowerArchwire: '0.016 NiTi Lower',
    elasticsConfig: 'None',
    materialsIssuedIds: [],
    clinicalNotesEn: row.clinical_notes || '',
    clinicalNotesAr: row.clinical_notes || '',
    nextPlan: 'Continue biomechanics alignment',
    nextAppointmentDate: row.next_visit_date || '2026-11-15',
  };
}

/**
 * Maps an authoritative SQLite orthodontic case row into the UI presentation model.
 */
/**
 * Maps an authoritative SQLite problem row to UI presentation model.
 */
function mapSqliteProblemToUi(row: SqliteProblemRow): ProblemObjectiveItem {
  const domainCategoryMap: Record<string, DomainSection> = {
    SKELETAL: 'Skeletal',
    DENTAL: 'Dental',
    FACIAL: 'Soft Tissue',
    FUNCTIONAL: 'Occlusal',
    AIRWAY: 'CBCT / Radiographic',
    TMJ: 'Skeletal',
    PERIODONTAL: 'Dental',
    OTHER: 'Dental',
  };

  const outcomeStatusMap: Record<string, OutcomeStatus> = {
    ACTIVE: 'In Progress',
    RESOLVED: 'Achieved',
    SUPERSEDED: 'Partially Achieved',
  };

  return {
    id: row.id,
    domain: domainCategoryMap[row.category] || 'Dental',
    classification: row.severity === 'MILD' ? 'Clinical Finding' : 'Actual Problem',
    findingEn: row.title,
    findingAr: row.description || row.title,
    objectiveEn: `Resolve ${row.problem_code}`,
    objectiveAr: `معالجة ${row.problem_code}`,
    strategyMechanicsEn: '',
    strategyMechanicsAr: '',
    outcomeResultEn: row.status === 'RESOLVED' ? 'Resolved' : 'In Progress',
    outcomeResultAr: row.status === 'RESOLVED' ? 'تم الحل بنجاح' : 'قيد المتابعة السريرية',
    outcomeStatus: outcomeStatusMap[row.status] || 'In Progress',
    origin: 'Doctor-Approved',
    approvedByDoctor: true,
  };
}

function createBlankExtraoralExam(): ExtraoralExam {
  return {
    facialSymmetry: 'Symmetrical',
    facialType: 'Mesofacial',
    profile: 'Straight',
    verticalProportions: 'Balanced',
    lipCompetence: 'Competent',
    nasolabialAngle: 'Normal (90-110°)',
    mentolabialSulcus: 'Normal',
    chinProminence: 'Normal',
    smileArc: 'Consonant',
    gingivalDisplayOnSmileMm: 0,
    notes: '',
  };
}

function createBlankIntraoralExam(): IntraoralExam {
  return {
    oralHygiene: 'Good',
    gingivalBiotype: 'Normal',
    maxillaryArchForm: 'Ovoid',
    mandibularArchForm: 'Ovoid',
    maxillaryCrowdingMm: 0,
    mandibularCrowdingMm: 0,
    missingTeeth: [],
    impactedTeeth: [],
    ectopicTeeth: [],
    rotationsSummary: '',
    frenumAttachment: 'Normal',
    notes: '',
  };
}

function createBlankOcclusalExam(): OcclusalExam {
  return {
    molarRight: 'Class I',
    molarLeft: 'Class I',
    canineRight: 'Class I',
    canineLeft: 'Class I',
    overjetInitialMm: 2,
    overjetCurrentMm: 2,
    overbiteInitialMm: 2,
    overbiteCurrentMm: 2,
    crossbite: 'None',
    openBite: 'None',
    upperMidlineMm: 0,
    lowerMidlineMm: 0,
    curveOfSpeeMm: 0,
    functionalShift: 'None',
    boltonAnteriorRatio: 77.2,
    boltonOverallRatio: 91.3,
  };
}

function createBlankCBCTRecord(): CBCTAndRadiographicRecord {
  return {
    panoramicSummary: '',
    rootResorptionStatus: 'None',
    alveolarBoneStatus: 'Adequate',
    airwayAssessment: 'Normal Pharyngeal Airway',
    tmjStatus: 'Normal Condylar Morphology',
    cvmStage: 'CS3 (Peak)',
    tadSafeZonesNotes: '',
  };
}

function createBlankDiagnosisRecord(startDate: string): DiagnosisRecord {
  return {
    version: 0,
    updatedAt: startDate,
    approvedBy: '',
    origin: 'Doctor-Approved',
    skeletalSagittal: 'Skeletal Class I',
    skeletalVertical: 'Normodivergent',
    skeletalTransverse: 'Normal Transverse Maxillo-Mandibular Width',
    dentalSummaryEn: '',
    dentalSummaryAr: '',
    occlusalSummaryEn: '',
    occlusalSummaryAr: '',
    softTissueSummaryEn: '',
    softTissueSummaryAr: '',
    comprehensiveStatementEn: '',
    comprehensiveStatementAr: '',
    differentialDiagnosis: '',
  };
}

function createBlankRetentionRecord(): ResidualAndRetentionRecord {
  return {
    upperRetainer: 'Vacuum-Formed Essix',
    lowerRetainer: 'Fixed Lingual 3-3 Bonded',
    wearProtocol: '',
    residualProblemsEn: [],
    residualProblemsAr: [],
    treatmentLimitationsEn: [],
    treatmentLimitationsAr: [],
    relapseRiskLevel: 'Low',
  };
}

function createBlankFinancialRecord(): CaseFinancialRecord {
  return {
    totalFee: 0,
    discount: 0,
    labCost: 0,
    otherDirectCost: 0,
    currency: 'SAR',
    installments: [],
  };
}

function applySqliteFindingsToCaseExams(findings?: SqliteClinicalFindingRow[]): {
  extraoral: ExtraoralExam;
  intraoral: IntraoralExam;
  occlusal: OcclusalExam;
  cbctAndRadiographs: CBCTAndRadiographicRecord;
} {
  const extraoral = createBlankExtraoralExam();
  const intraoral = createBlankIntraoralExam();
  const occlusal = createBlankOcclusalExam();
  const cbctAndRadiographs = createBlankCBCTRecord();

  if (!findings || findings.length === 0) {
    return { extraoral, intraoral, occlusal, cbctAndRadiographs };
  }

  for (const f of findings) {
    switch (f.finding_code) {
      case 'FACIAL_TYPE':
        extraoral.facialType = f.value as ExtraoralExam['facialType'];
        break;
      case 'FACIAL_PROFILE':
        extraoral.profile = f.value as ExtraoralExam['profile'];
        break;
      case 'LIP_COMPETENCE':
        extraoral.lipCompetence = f.value as ExtraoralExam['lipCompetence'];
        break;
      case 'NASOLABIAL_ANGLE':
        extraoral.nasolabialAngle = f.value as ExtraoralExam['nasolabialAngle'];
        break;
      case 'SMILE_ARC':
        extraoral.smileArc = f.value as ExtraoralExam['smileArc'];
        break;
      case 'MAX_CROWDING_MM':
        intraoral.maxillaryCrowdingMm = Number(f.value) || 0;
        break;
      case 'MAND_CROWDING_MM':
        intraoral.mandibularCrowdingMm = Number(f.value) || 0;
        break;
      case 'MAX_ARCH_FORM':
        intraoral.maxillaryArchForm = f.value as IntraoralExam['maxillaryArchForm'];
        break;
      case 'GINGIVAL_BIOTYPE':
        intraoral.gingivalBiotype = f.value as IntraoralExam['gingivalBiotype'];
        break;
      case 'ROTATIONS_SUMMARY':
        intraoral.rotationsSummary = f.value;
        break;
      case 'OVERJET_INITIAL_MM':
        occlusal.overjetInitialMm = Number(f.value) || 0;
        break;
      case 'OVERJET_CURRENT_MM':
        occlusal.overjetCurrentMm = Number(f.value) || 0;
        break;
      case 'MOLAR_RIGHT':
        occlusal.molarRight = f.value as OcclusalExam['molarRight'];
        break;
      case 'CANINE_RIGHT':
        occlusal.canineRight = f.value as OcclusalExam['canineRight'];
        break;
      case 'CROSSBITE':
        occlusal.crossbite = f.value as OcclusalExam['crossbite'];
        break;
      case 'CURVE_OF_SPEE_MM':
        occlusal.curveOfSpeeMm = Number(f.value) || 0;
        break;
      case 'BOLTON_ANTERIOR_RATIO':
        occlusal.boltonAnteriorRatio = Number(f.value) || 77.2;
        break;
      case 'CVM_STAGE':
        cbctAndRadiographs.cvmStage = f.value as CBCTAndRadiographicRecord['cvmStage'];
        break;
      case 'ALVEOLAR_BONE_STATUS':
        cbctAndRadiographs.alveolarBoneStatus = f.value as CBCTAndRadiographicRecord['alveolarBoneStatus'];
        break;
      case 'ROOT_RESORPTION_STATUS':
        cbctAndRadiographs.rootResorptionStatus = f.value as CBCTAndRadiographicRecord['rootResorptionStatus'];
        break;
      case 'TAD_SAFE_ZONES_NOTES':
        cbctAndRadiographs.tadSafeZonesNotes = f.value;
        break;
    }
  }

  return { extraoral, intraoral, occlusal, cbctAndRadiographs };
}

/**
 * Maps an authoritative SQLite case row to UI presentation model.
 */
function mapSqliteCaseToUi(
  row: SqliteOrthodonticCaseRow,
  patient?: Patient,
  visits: ClinicalVisit[] = [],
  problems?: ProblemObjectiveItem[],
  diagnosis?: DiagnosisRecord,
  examFindings?: SqliteClinicalFindingRow[]
): OrthodonticCase {
  const caseTypeUiMap: Record<string, OrthodonticCase['caseType']> = {
    COMPREHENSIVE: 'Comprehensive Fixed Appliance',
    INTERCEPTIVE: 'Growth Modification + Fixed',
    ORTHOPEDIC: 'MARPE + Skeletal Anchorage',
    SURGICAL_ORTHODONTIC: 'Surgical-Orthodontic',
    RETREATMENT: 'Retreatment',
    LIMITED: 'Clear Aligner Therapy',
    RETENTION_ONLY: 'Comprehensive Fixed Appliance',
  };

  const caseStatusUiMap: Record<string, OrthodonticCase['status']> = {
    CONSULTATION: 'Consultation',
    RECORDS: 'Records',
    DIAGNOSIS: 'Diagnosis',
    TREATMENT_PLANNING: 'Treatment Planning',
    ACTIVE_TREATMENT: 'Active Treatment',
    FINISHING: 'Finishing',
    DEBOND: 'Debond',
    RETENTION: 'Retention',
    COMPLETED: 'Completed',
    DISCONTINUED: 'Archived',
    TRANSFERRED: 'Archived',
  };

  const exams = applySqliteFindingsToCaseExams(examFindings);

  return {
    id: row.id,
    patientId: row.patient_id,
    caseType: caseTypeUiMap[row.case_type] || 'Comprehensive Fixed Appliance',
    status: caseStatusUiMap[row.case_status] || 'Consultation',
    startDate: row.start_date,
    expectedCompletionDate: row.target_completion_date || row.start_date,
    treatingDoctor:
      row.primary_provider_id === 'usr-dr-albasmi'
        ? 'Dr. Al-Basmi (Orthodontic Specialist)'
        : row.primary_provider_id,
    chiefComplaintEn: row.chief_complaint,
    chiefComplaintAr:
      row.notes || (patient?.fullNameAr ? `حالة تقويمية للمريض ${patient.fullNameAr}` : ''),
    patientExpectations: '',
    extraoral: exams.extraoral,
    intraoral: exams.intraoral,
    occlusal: exams.occlusal,
    cbctAndRadiographs: exams.cbctAndRadiographs,
    problemList: problems && problems.length > 0 ? problems : [],
    diagnosis: diagnosis || createBlankDiagnosisRecord(row.start_date),
    diagnosisHistory: [],
    treatmentOptions: [],
    cephRecords: [],
    visits,
    photos: [],
    retentionAndResidual: createBlankRetentionRecord(),
    financials: createBlankFinancialRecord(),
    referencesIds: [],
    isDemo: false, // Authoritative physical SQLite case
  };
}

const STORAGE_KEYS = {
  // Legacy patient key isolated - no longer written to (SQLite is authoritative for patients)
  LEGACY_PATIENTS: 'albasmi_orth_patients_v1',
  CASES: 'albasmi_orth_cases_v1',
  INVENTORY: 'albasmi_orth_inventory_v1',
  AUDIT: 'albasmi_orth_audit_v1',
  SYNC: 'albasmi_orth_sync_v1',
};

type PrimaryNavSection =
  | 'dashboard'
  | 'patients'
  | 'case_workspace'
  | 'reports'
  | 'ai_assistant'
  | 'operations';

type CaseSubTab =
  | 'examination'
  | 'diagnosis_problems'
  | 'cephalometrics'
  | 'treatment_plan'
  | 'visits_progress'
  | 'media_comparison';

export default function App() {
  const [language, setLanguage] = React.useState<LanguageMode>('ar');
  const [isOnline, setIsOnline] = React.useState<boolean>(true);
  const [activeNav, setActiveNav] = React.useState<PrimaryNavSection>('patients');
  const [activeCaseTab, setActiveCaseTab] = React.useState<CaseSubTab>('diagnosis_problems');
  const [activeOpTab, setActiveOpTab] = React.useState<
    'p0_architecture' | 'p3_sandbox' | 'finance' | 'inventory' | 'sync'
  >('p0_architecture');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [showNewCaseModal, setShowNewCaseModal] = React.useState<boolean>(false);
  const [showNewPatientModal, setShowNewPatientModal] = React.useState<boolean>(false);
  const [selectedPatientId, setSelectedPatientId] = React.useState<string | null>(null);
  const [caseScope, setCaseScope] = React.useState<'all' | 'clinical' | 'demo'>('all');

  // Clinical SQLite Storage Integration (Phase R2-A, R2-B, R2-C, R2-D)
  const {
    cohort2PatientService,
    cohort2CaseService,
    cohort2VisitService,
    cohort2ProblemDiagnosisService,
    deviceInfo,
    status: storageStatus,
    mode: storageMode,
    isDurable,
    errorMessage: storageErrorMessage,
    retryInitialization,
    switchStorageMode,
  } = useClinicalStorage();
  const [persistenceError, setPersistenceError] = React.useState<string | null>(null);
  const [isCreatingCase, setIsCreatingCase] = React.useState<boolean>(false);

  // In-memory display projection of patients (authoritatively loaded from SQLite upon storage readiness)
  const [patients, setPatients] = React.useState<Patient[]>(INITIAL_PATIENTS);

  // Load authoritative patients from SQLite upon storage readiness
  React.useEffect(() => {
    let isMounted = true;
    async function loadSqlitePatients() {
      if (storageStatus === 'READY' && cohort2PatientService) {
        try {
          const sqliteRows = await cohort2PatientService.listActivePatients();
          if (isMounted) {
            const mapped = (sqliteRows || []).map(mapSqlitePatientToUi);
            setPatients((prev) => {
              if (storageMode === 'CLINICAL') {
                return mapped;
              }
              const sqliteIds = new Set(mapped.map((p) => p.id));
              const remainingDemo = prev.filter(
                (p) => !sqliteIds.has(p.id) && INITIAL_PATIENTS.some((dp) => dp.id === p.id)
              );
              return [...mapped, ...remainingDemo];
            });
          }
        } catch (err) {
          console.error('Failed to load authoritative patients from SQLite:', err);
        }
      }
    }
    loadSqlitePatients();
    return () => {
      isMounted = false;
    };
  }, [storageStatus, cohort2PatientService, storageMode]);

  const [cases, setCases] = React.useState<OrthodonticCase[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CASES);
      return saved ? JSON.parse(saved) : INITIAL_CASES;
    } catch {
      return INITIAL_CASES;
    }
  });

  // Load authoritative orthodontic cases, visits, examinations, problems & diagnoses from SQLite upon storage readiness
  React.useEffect(() => {
    let isMounted = true;
    async function loadSqliteCases() {
      if (storageStatus === 'READY' && cohort2CaseService) {
        try {
          const sqliteRows = await cohort2CaseService.listActiveCases();
          if (isMounted && sqliteRows && sqliteRows.length > 0) {
            const mappedCases: OrthodonticCase[] = [];
            for (const row of sqliteRows) {
              const pat = patients.find((p) => p.id === row.patient_id);
              let caseVisits: ClinicalVisit[] = [];
              let examFindings: SqliteClinicalFindingRow[] | undefined = undefined;
              if (cohort2VisitService) {
                try {
                  const visitRows = await cohort2VisitService.listVisitsByCaseId(row.id);
                  caseVisits = visitRows.map((vr, idx) => mapSqliteVisitToUi(vr, idx));
                  const exams = await cohort2VisitService.listExaminationsByCaseId(row.id);
                  if (exams && exams.length > 0) {
                    examFindings = await cohort2VisitService.listFindingsByExaminationId(exams[0].id);
                  }
                } catch {
                  // Ignore visit/exam load failure for single case
                }
              }

              let caseProblems: ProblemObjectiveItem[] | undefined = undefined;
              let caseDiagnosis: DiagnosisRecord | undefined = undefined;
              if (cohort2ProblemDiagnosisService) {
                try {
                  const probRows = await cohort2ProblemDiagnosisService.listProblemsByCaseId(row.id);
                  if (probRows && probRows.length > 0) {
                    caseProblems = probRows.map(mapSqliteProblemToUi);
                  }
                  const diagVersions = await cohort2ProblemDiagnosisService.listDiagnosisVersionsByCaseId(row.id);
                  if (diagVersions && diagVersions.length > 0) {
                    const latest = [...diagVersions].sort((a, b) => b.version_number - a.version_number)[0];
                    const diagItems: SqliteDiagnosisItemRow[] =
                      await cohort2ProblemDiagnosisService.listDiagnosisItemsByVersionId(latest.id);
                    const sagItem = diagItems.find((i) => i.diagnosis_code === 'DIAG_SKELETAL_SAGITTAL');
                    const vertItem = diagItems.find((i) => i.diagnosis_code === 'DIAG_SKELETAL_VERTICAL');
                    const transItem = diagItems.find((i) => i.diagnosis_code === 'DIAG_SKELETAL_TRANSVERSE');

                    caseDiagnosis = {
                      version: latest.version_number,
                      updatedAt: latest.created_at ? latest.created_at.slice(0, 10) : row.start_date,
                      approvedBy: latest.approved_by || (latest.status === 'APPROVED' ? 'Dr. Al-Basmi' : ''),
                      origin: 'Doctor-Approved',
                      skeletalSagittal:
                        (sagItem?.title as DiagnosisRecord['skeletalSagittal']) || 'Skeletal Class I',
                      skeletalVertical:
                        (vertItem?.title as DiagnosisRecord['skeletalVertical']) || 'Normodivergent',
                      skeletalTransverse:
                        (transItem?.title as DiagnosisRecord['skeletalTransverse']) ||
                        'Normal Transverse Maxillo-Mandibular Width',
                      dentalSummaryEn: latest.clinical_summary || '',
                      dentalSummaryAr: latest.general_notes || latest.clinical_summary || '',
                      occlusalSummaryEn: '',
                      occlusalSummaryAr: '',
                      softTissueSummaryEn: '',
                      softTissueSummaryAr: '',
                      comprehensiveStatementEn: latest.clinical_summary || '',
                      comprehensiveStatementAr: latest.general_notes || latest.clinical_summary || '',
                      differentialDiagnosis: '',
                    };
                  }
                } catch {
                  // Ignore problem/diagnosis load failure for single case
                }
              }

              mappedCases.push(
                mapSqliteCaseToUi(row, pat, caseVisits, caseProblems, caseDiagnosis, examFindings)
              );
            }

            setCases((prev) => {
              const sqliteCaseIds = new Set(mappedCases.map((c) => c.id));
              const remainingDemoCases = prev.filter(
                (c) => !sqliteCaseIds.has(c.id) && (c.isDemo || INITIAL_CASES.some((dc) => dc.id === c.id))
              );
              return [...mappedCases, ...remainingDemoCases];
            });
          }
        } catch (err) {
          console.error('Failed to load authoritative cases from SQLite:', err);
        }
      }
    }
    loadSqliteCases();
    return () => {
      isMounted = false;
    };
  }, [storageStatus, cohort2CaseService, cohort2VisitService, cohort2ProblemDiagnosisService, patients]);

  const [inventory, setInventory] = React.useState<InventoryMaterial[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.INVENTORY);
      return saved ? JSON.parse(saved) : INITIAL_INVENTORY;
    } catch {
      return INITIAL_INVENTORY;
    }
  });

  const [auditLogs, setAuditLogs] = React.useState<AuditLogItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AUDIT);
      return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
    } catch {
      return INITIAL_AUDIT_LOGS;
    }
  });

  const [syncQueue, setSyncQueue] = React.useState<SyncQueueEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SYNC);
      return saved ? JSON.parse(saved) : INITIAL_SYNC_QUEUE;
    } catch {
      return INITIAL_SYNC_QUEUE;
    }
  });

  const [selectedCaseId, setSelectedCaseId] = React.useState<string | null>(null);

  // New Case Modal State (links to existing target patient)
  const [newCaseTargetPatientId, setNewCaseTargetPatientId] = React.useState<string>('');
  const [newCaseType, setNewCaseType] = React.useState<string>('Comprehensive Fixed Appliance');
  const [newCaseStartDate, setNewCaseStartDate] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [newCaseChiefComplaintEn, setNewCaseChiefComplaintEn] = React.useState('');

  // Persist non-migrated clinical entities to Local Storage (Patients & Cases are authoritative in SQLite)
  React.useEffect(() => {
    try {
      // Legacy case isolation: Only store demo cases in localStorage; physical SQLite is SSOT for clinical cases
      const demoCasesOnly = cases.filter((c) => c.isDemo);
      localStorage.setItem(STORAGE_KEYS.CASES, JSON.stringify(demoCasesOnly));
      localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
      localStorage.setItem(STORAGE_KEYS.AUDIT, JSON.stringify(auditLogs));
      localStorage.setItem(STORAGE_KEYS.SYNC, JSON.stringify(syncQueue));
    } catch {
      // Ignore storage quota errors in sandboxed iframes
    }
  }, [cases, inventory, auditLogs, syncQueue]);

  const visiblePatients = React.useMemo(() => {
    if (storageMode === 'CLINICAL') {
      return patients.filter((p) => !p.isDemo);
    }
    if (caseScope === 'clinical') {
      return patients.filter((p) => !p.isDemo);
    }
    if (caseScope === 'demo') {
      return patients.filter((p) => p.isDemo);
    }
    return patients;
  }, [patients, storageMode, caseScope]);

  const visibleCases = React.useMemo(() => {
    if (storageMode === 'CLINICAL') {
      return cases.filter((c) => !c.isDemo);
    }
    if (caseScope === 'clinical') {
      return cases.filter((c) => !c.isDemo);
    }
    if (caseScope === 'demo') {
      return cases.filter((c) => c.isDemo);
    }
    return cases;
  }, [cases, storageMode, caseScope]);

  const caseCountsByPatient = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of visibleCases) {
      counts[c.patientId] = (counts[c.patientId] || 0) + 1;
    }
    return counts;
  }, [visibleCases]);

  // 1. Patient Anchor Resolution (Strict Mode Isolation)
  const activePatient = React.useMemo<Patient | undefined>(() => {
    if (selectedPatientId) {
      const match = visiblePatients.find((p) => p.id === selectedPatientId);
      if (match) return match;
    }
    return visiblePatients[0];
  }, [visiblePatients, selectedPatientId]);

  // 2. Case Resolution Strictly Bounded to Active Patient
  const activeCase = React.useMemo<OrthodonticCase | undefined>(() => {
    if (!activePatient) return undefined;
    const patientCases = visibleCases.filter((c) => c.patientId === activePatient.id);
    if (selectedCaseId) {
      const match = patientCases.find((c) => c.id === selectedCaseId);
      if (match) return match;
    }
    return patientCases[0];
  }, [activePatient, visibleCases, selectedCaseId]);

  // 3. Loop-Free Selection State Synchronization
  React.useEffect(() => {
    if (activePatient && selectedPatientId !== activePatient.id) {
      setSelectedPatientId(activePatient.id);
    } else if (!activePatient && selectedPatientId !== null) {
      setSelectedPatientId(null);
    }
    if (activeCase && selectedCaseId !== activeCase.id) {
      setSelectedCaseId(activeCase.id);
    } else if (!activeCase && selectedCaseId !== null) {
      setSelectedCaseId(null);
    }
  }, [activePatient, activeCase, selectedPatientId, selectedCaseId]);

  const activeWarnings = React.useMemo(
    () => (activeCase ? runClinicalConsistencyAndQualityChecks(activeCase) : []),
    [activeCase]
  );

  const appendAuditLog = (domain: string, action: string, details: string) => {
    const newEntry: AuditLogItem = {
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
      actor: 'Dr. Al-Basmi',
      role: 'Orthodontist',
      domain,
      action,
      details,
    };
    setAuditLogs((prev) => [newEntry, ...prev]);
  };

  const handleUpdateCase = async (
    updated: OrthodonticCase,
    auditAction?: string,
    auditDetails?: string
  ) => {
    // Contract Invariant: Resolve target case baseline from authoritative state (§17 Cross-Case Isolation)
    const baseCase = cases.find((c) => c.id === updated.id);
    if (!baseCase) {
      console.warn(`Blocked case update: Target case ${updated.id} not found in state.`);
      return;
    }
    if (updated.patientId !== baseCase.patientId) {
      console.warn(`Blocked case update: Cross-case ownership mutation rejected for case ${updated.id}.`);
      return;
    }

    // Classification Invariant (§1, §16): Reject classification tampering and derive trusted persistence routing
    if (Boolean(updated.isDemo) !== Boolean(baseCase.isDemo)) {
      console.warn(`Blocked case update: Case classification (isDemo) tampering rejected for case ${updated.id}.`);
      return;
    }
    const isClinical = !baseCase.isDemo;
    updated = { ...updated, isDemo: baseCase.isDemo };

    // If case is an authoritative physical SQLite case, enforce SQLite persistence for problems & diagnosis
    if (isClinical) {
      if (storageStatus !== 'READY' || !cohort2ProblemDiagnosisService) {
        setPersistenceError(
          language === 'ar'
            ? 'محرك التخزين السريري SQLite غير جاهز بعد لحفظ التعديلات السريرية.'
            : 'SQLite clinical storage engine is not ready to record clinical modifications.'
        );
        return;
      }
      if (storageMode === 'CLINICAL' && !isDurable) {
        setPersistenceError(
          language === 'ar'
            ? 'خطأ أمني: التخزين الدائم غير متوفر في الوضع السريري. تم منع حفظ التعديلات.'
            : 'Security Violation: Durable persistent storage is unavailable in Clinical Mode. Clinical write blocked.'
        );
        return;
      }

      try {
        const deviceId = deviceInfo?.deviceId || 'dev-browser-client';
        const nowIso = new Date().toISOString();

        // 0A. Detect updated case metadata (chief complaint / notes)
        if (
          cohort2CaseService &&
          (updated.chiefComplaintEn !== baseCase.chiefComplaintEn ||
            updated.chiefComplaintAr !== baseCase.chiefComplaintAr)
        ) {
          await cohort2CaseService.updateCaseMetadata({
            caseId: updated.id,
            chiefComplaint: updated.chiefComplaintEn || 'Orthodontic Consultation',
            notes: updated.chiefComplaintAr || null,
            userId: 'usr-dr-albasmi',
            userRole: 'ORTHODONTIST',
            deviceId,
            timestamp: nowIso,
          });
          const verifiedCase = await cohort2CaseService.getCaseById(updated.id);
          if (!verifiedCase) {
            throw new Error(`Post-write verification failed: Case ${updated.id} not found after update.`);
          }
        }

        // 0B. Detect updated clinical examination (extraoral, intraoral, occlusal, cbct)
        const examChanged =
          JSON.stringify(updated.extraoral) !== JSON.stringify(baseCase.extraoral) ||
          JSON.stringify(updated.intraoral) !== JSON.stringify(baseCase.intraoral) ||
          JSON.stringify(updated.occlusal) !== JSON.stringify(baseCase.occlusal) ||
          JSON.stringify(updated.cbctAndRadiographs) !== JSON.stringify(baseCase.cbctAndRadiographs);
        if (examChanged && cohort2VisitService) {
          const examRes = await cohort2VisitService.createExamination({
            caseId: updated.id,
            examinationDate: nowIso.slice(0, 10),
            examinerId: 'usr-dr-albasmi',
            examinationStage: 'INITIAL',
            status: 'CONFIRMED',
            generalFindings: updated.chiefComplaintEn || 'Clinical Examination',
            notes: updated.extraoral.notes || updated.intraoral.notes || null,
            findings: [
              { category: 'EXTRAORAL', findingCode: 'FACIAL_TYPE', value: updated.extraoral.facialType },
              { category: 'EXTRAORAL', findingCode: 'FACIAL_PROFILE', value: updated.extraoral.profile },
              { category: 'SOFT_TISSUE', findingCode: 'LIP_COMPETENCE', value: updated.extraoral.lipCompetence },
              { category: 'SOFT_TISSUE', findingCode: 'NASOLABIAL_ANGLE', value: updated.extraoral.nasolabialAngle },
              { category: 'ESTHETIC', findingCode: 'SMILE_ARC', value: updated.extraoral.smileArc },
              { category: 'INTRAORAL', findingCode: 'MAX_CROWDING_MM', value: String(updated.intraoral.maxillaryCrowdingMm), unit: 'mm' },
              { category: 'INTRAORAL', findingCode: 'MAND_CROWDING_MM', value: String(updated.intraoral.mandibularCrowdingMm), unit: 'mm' },
              { category: 'INTRAORAL', findingCode: 'MAX_ARCH_FORM', value: updated.intraoral.maxillaryArchForm },
              { category: 'PERIODONTAL', findingCode: 'GINGIVAL_BIOTYPE', value: updated.intraoral.gingivalBiotype },
              { category: 'INTRAORAL', findingCode: 'ROTATIONS_SUMMARY', value: updated.intraoral.rotationsSummary || 'None' },
              { category: 'OCCLUSAL', findingCode: 'OVERJET_INITIAL_MM', value: String(updated.occlusal.overjetInitialMm), unit: 'mm' },
              { category: 'OCCLUSAL', findingCode: 'OVERJET_CURRENT_MM', value: String(updated.occlusal.overjetCurrentMm), unit: 'mm' },
              { category: 'OCCLUSAL', findingCode: 'MOLAR_RIGHT', value: updated.occlusal.molarRight },
              { category: 'OCCLUSAL', findingCode: 'CANINE_RIGHT', value: updated.occlusal.canineRight },
              { category: 'OCCLUSAL', findingCode: 'CROSSBITE', value: updated.occlusal.crossbite },
              { category: 'OCCLUSAL', findingCode: 'CURVE_OF_SPEE_MM', value: String(updated.occlusal.curveOfSpeeMm), unit: 'mm' },
              { category: 'INTRAORAL', findingCode: 'BOLTON_ANTERIOR_RATIO', value: String(updated.occlusal.boltonAnteriorRatio), unit: '%' },
              { category: 'OTHER', findingCode: 'CVM_STAGE', value: updated.cbctAndRadiographs.cvmStage },
              { category: 'PERIODONTAL', findingCode: 'ALVEOLAR_BONE_STATUS', value: updated.cbctAndRadiographs.alveolarBoneStatus },
              { category: 'OTHER', findingCode: 'ROOT_RESORPTION_STATUS', value: updated.cbctAndRadiographs.rootResorptionStatus },
              { category: 'OTHER', findingCode: 'TAD_SAFE_ZONES_NOTES', value: updated.cbctAndRadiographs.tadSafeZonesNotes || 'None' },
            ],
            userId: 'usr-dr-albasmi',
            userRole: 'ORTHODONTIST',
            deviceId,
            timestamp: nowIso,
          });
          const verifiedExam = await cohort2VisitService.getExaminationById(examRes.examination.id);
          if (!verifiedExam) {
            throw new Error(`Post-write verification failed: Examination ${examRes.examination.id} not found in SQLite.`);
          }
        }

        // 1. Detect newly added problems
        const existingProblems = baseCase.problemList || [];
        const newProblems = (updated.problemList || []).filter(
          (up) => !existingProblems.some((ep) => ep.id === up.id)
        );
        for (const np of newProblems) {
          const categoryMap: Record<string, SqliteProblemRow['category']> = {
            'Skeletal': 'SKELETAL',
            'Dental': 'DENTAL',
            'Soft Tissue': 'SOFT_TISSUE',
            'Occlusal': 'OCCLUSAL',
            'CBCT / Radiographic': 'AIRWAY',
          };
          const pRes = await cohort2ProblemDiagnosisService.createProblem({
            id: np.id.startsWith('prob_') ? `prb-${np.id}` : np.id,
            caseId: updated.id,
            problemCode: `PRB-${np.domain.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-4)}`,
            category: categoryMap[np.domain] || 'OTHER',
            title: np.findingEn || np.findingAr || 'Orthodontic Finding',
            description: np.findingAr || np.findingEn || null,
            severity: np.classification === 'Actual Problem' ? 'MODERATE' : 'MILD',
            sourceReferenceId: updated.id,
            userId: 'usr-dr-albasmi',
            userRole: 'ORTHODONTIST',
            deviceId,
            timestamp: nowIso,
          });
          // Post-write verification
          const verified = await cohort2ProblemDiagnosisService.getProblemById(pRes.problem.id);
          if (!verified) {
            throw new Error(`Post-write verification failed: Problem ${pRes.problem.id} not found in SQLite.`);
          }
        }

        // 2. Detect updated problem statuses
        for (const up of updated.problemList || []) {
          const ep = existingProblems.find((p) => p.id === up.id);
          if (ep && ep.outcomeStatus !== up.outcomeStatus) {
            const mappedStatus = up.outcomeStatus === 'Achieved' ? 'RESOLVED' : 'ACTIVE';
            const problemId = up.id.startsWith('prob_') ? `prb-${up.id}` : up.id;
            const pExists = await cohort2ProblemDiagnosisService.getProblemById(problemId);
            if (pExists) {
              await cohort2ProblemDiagnosisService.updateProblemStatus({
                problemId,
                targetStatus: mappedStatus,
                userId: 'usr-dr-albasmi',
                userRole: 'ORTHODONTIST',
                deviceId,
                timestamp: nowIso,
              });
            }
          }
        }

        // 3. Detect updated diagnosis (any structured field or synthesis statement change)
        const diagChanged =
          updated.diagnosis &&
          (updated.diagnosis.version > baseCase.diagnosis.version ||
            updated.diagnosis.skeletalSagittal !== baseCase.diagnosis.skeletalSagittal ||
            updated.diagnosis.skeletalVertical !== baseCase.diagnosis.skeletalVertical ||
            updated.diagnosis.skeletalTransverse !== baseCase.diagnosis.skeletalTransverse ||
            updated.diagnosis.comprehensiveStatementEn !== baseCase.diagnosis.comprehensiveStatementEn ||
            updated.diagnosis.comprehensiveStatementAr !== baseCase.diagnosis.comprehensiveStatementAr);

        if (diagChanged) {
          const existingDiagVersions = await cohort2ProblemDiagnosisService.listDiagnosisVersionsByCaseId(
            updated.id
          );
          const nextVerNum =
            existingDiagVersions.length > 0
              ? Math.max(...existingDiagVersions.map((v) => v.version_number)) + 1
              : 1;
          const prevLatestId =
            existingDiagVersions.length > 0
              ? [...existingDiagVersions].sort((a, b) => b.version_number - a.version_number)[0].id
              : null;

          const effectiveSummaryEn =
            updated.diagnosis.comprehensiveStatementEn?.trim() ||
            `${updated.diagnosis.skeletalSagittal} · ${updated.diagnosis.skeletalVertical} · ${updated.diagnosis.skeletalTransverse}`;

          const diagResult = await cohort2ProblemDiagnosisService.createDiagnosisDraft({
            caseId: updated.id,
            versionNumber: nextVerNum,
            diagnosedBy: 'usr-dr-albasmi',
            clinicalSummary: effectiveSummaryEn,
            generalNotes: updated.diagnosis.comprehensiveStatementAr || null,
            supersedesVersionId: prevLatestId,
            items: [
              {
                category: 'SKELETAL',
                diagnosisCode: 'DIAG_SKELETAL_SAGITTAL',
                title: updated.diagnosis.skeletalSagittal,
                description: 'Skeletal Sagittal Classification',
                severity: 'MODERATE',
                certainty: 'CONFIRMED',
              },
              {
                category: 'SKELETAL',
                diagnosisCode: 'DIAG_SKELETAL_VERTICAL',
                title: updated.diagnosis.skeletalVertical,
                description: 'Skeletal Vertical Classification',
                severity: 'MODERATE',
                certainty: 'CONFIRMED',
              },
              {
                category: 'SKELETAL',
                diagnosisCode: 'DIAG_SKELETAL_TRANSVERSE',
                title: updated.diagnosis.skeletalTransverse,
                description: 'Skeletal Transverse Classification',
                severity: 'MODERATE',
                certainty: 'CONFIRMED',
              },
            ],
            userId: 'usr-dr-albasmi',
            userRole: 'ORTHODONTIST',
            deviceId,
            timestamp: nowIso,
          });

          const verifiedDiag = await cohort2ProblemDiagnosisService.getDiagnosisVersionById(
            diagResult.diagnosisVersion.id
          );
          if (!verifiedDiag) {
            throw new Error(
              `Post-write verification failed: Diagnosis version ${diagResult.diagnosisVersion.id} not found in SQLite.`
            );
          }

          updated = {
            ...updated,
            diagnosis: {
              ...updated.diagnosis,
              version: nextVerNum,
            },
          };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setPersistenceError(msg);
        console.error('Clinical case update persistence failed (transaction rolled back):', err);
        return; // Halt immediately; do not mutate in-memory state on failed write
      }
    }

    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    if (auditAction) {
      appendAuditLog('Clinical Core', auditAction, `${updated.id}: ${auditDetails || ''}`);
    }
    if (!isOnline) {
      setSyncQueue((prev) => [
        {
          id: `sync_${Date.now()}`,
          caseId: updated.id,
          entityType: auditAction || 'Clinical Record Update',
          operation: 'UPDATE',
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
          status: 'Pending Offline',
        },
        ...prev,
      ]);
    }
  };

  const handleAddQuickVisit = async (visit: ClinicalVisit) => {
    if (!activeCase) return;
    // If case is not a demo case, enforce SQLite persistence
    if (!activeCase.isDemo) {
      if (storageStatus !== 'READY' || !cohort2VisitService) {
        setPersistenceError(
          language === 'ar'
            ? 'محرك التخزين السريري SQLite غير جاهز بعد لحفظ الزيارات.'
            : 'SQLite clinical storage engine is not ready to record visits.'
        );
        return;
      }

      if (storageMode === 'CLINICAL' && !isDurable) {
        setPersistenceError(
          language === 'ar'
            ? 'خطأ أمني: التخزين الدائم غير متوفر في الوضع السريري. تم منع حفظ الزيارة.'
            : 'Security Violation: Durable persistent storage is unavailable in Clinical Mode. Visit write blocked.'
        );
        return;
      }

      try {
        const deviceId = deviceInfo?.deviceId || 'dev-browser-client';
        const nowIso = new Date().toISOString();

        // 1. Authoritative SQLite persistence (Atomic: visits + audit_logs + sync_operations)
        const visitResult = await cohort2VisitService.createVisit({
          id: visit.id,
          caseId: activeCase.id,
          visitDate: visit.date || nowIso.slice(0, 10),
          visitType: visit.visitType,
          providerId: 'usr-dr-albasmi',
          chiefReason: visit.procedures.join(', ') || visit.visitType,
          clinicalNotes: visit.clinicalNotesEn || visit.clinicalNotesAr || null,
          nextVisitDate: visit.nextAppointmentDate || null,
          userId: 'usr-dr-albasmi',
          userRole: 'ORTHODONTIST',
          deviceId,
          timestamp: nowIso,
        });

        // 2. Post-write verification gate
        const verified = await cohort2VisitService.getVisitById(visitResult.visit.id);
        if (!verified) {
          throw new Error('Post-write verification failed: Visit was not found in SQLite after commit.');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setPersistenceError(msg);
        console.error('Visit persistence failed (transaction rolled back):', err);
        return; // Prevent optimistic UI state insertion upon persistence failure
      }
    }

    // 1. Add visit to case presentation state
    const updatedCase: OrthodonticCase = {
      ...activeCase,
      visits: [visit, ...activeCase.visits],
    };
    setCases((prev) => prev.map((c) => (c.id === activeCase.id ? updatedCase : c)));

    // 2. Deduct materials from inventory
    if (visit.materialsIssuedIds.length > 0) {
      setInventory((prev) =>
        prev.map((mat) => {
          const used = visit.materialsIssuedIds.find((u) => u.materialId === mat.id);
          return used
            ? { ...mat, stockQuantity: Math.max(0, mat.stockQuantity - used.quantity) }
            : mat;
        })
      );
    }

    appendAuditLog(
      'Visits (SQLite)',
      `Logged Visit #${visit.visitNumber} (${visit.visitType})`,
      `Case ${activeCase.id}: ${visit.procedures.join(', ')}`
    );
  };

  const handleAcceptAIProblem = (newItem: ProblemObjectiveItem) => {
    if (!activeCase) return;
    handleUpdateCase(
      {
        ...activeCase,
        problemList: [...activeCase.problemList, newItem],
      },
      'Doctor Approved AI-Suggested Problem',
      newItem.findingEn
    );
  };

  const handleApproveAIDiagnosisDraft = (summaryEn: string) => {
    if (!activeCase) return;
    handleUpdateCase(
      {
        ...activeCase,
        diagnosis: {
          ...activeCase.diagnosis,
          version: activeCase.diagnosis.version + 1,
          updatedAt: new Date().toISOString().slice(0, 10),
          origin: 'Doctor-Approved',
          comprehensiveStatementEn: summaryEn,
        },
      },
      'Doctor Approved AI Diagnostic Synthesis',
      `Updated Diagnosis to v${activeCase.diagnosis.version + 1}`
    );
  };

  const handleRecordPayment = (installmentId: string, amount: number) => {
    if (!activeCase || !activePatient || activeCase.patientId !== activePatient.id) {
      console.warn('Blocked financial mutation: missing valid case or case does not belong to active patient.');
      return;
    }
    const targetInstallment = activeCase.financials.installments.find((inst) => inst.id === installmentId);
    if (!targetInstallment) {
      console.warn(`Blocked financial mutation: installment ${installmentId} does not belong to activeCase ${activeCase.id}.`);
      return;
    }
    const updatedInstallments = activeCase.financials.installments.map((inst) =>
      inst.id === installmentId
        ? {
            ...inst,
            paidAmount: inst.paidAmount + amount,
            status: 'Paid' as const,
            paymentDate: new Date().toISOString().slice(0, 10),
            method: 'Card' as const,
          }
        : inst
    );
    handleUpdateCase(
      {
        ...activeCase,
        financials: {
          ...activeCase.financials,
          installments: updatedInstallments,
        },
      },
      'Recorded Installment Payment',
      `Collected ${amount} ${activeCase.financials.currency}`
    );
  };

  const handleRestockMaterial = (materialId: string, quantity: number) => {
    setInventory((prev) =>
      prev.map((m) => (m.id === materialId ? { ...m, stockQuantity: m.stockQuantity + quantity } : m))
    );
    appendAuditLog('Inventory', 'Restocked Orthodontic Material', `Material ${materialId} +${quantity}`);
  };

  const handleResolveConflict = (syncId: string, choice: 'local' | 'remote') => {
    setSyncQueue((prev) =>
      prev.map((s) => (s.id === syncId ? { ...s, status: 'Synced' } : s))
    );
    appendAuditLog(
      'Sync Engine',
      `Resolved Multi-Device Conflict (${choice.toUpperCase()} Chosen)`,
      `Sync item ${syncId} resolved by Dr. Al-Basmi`
    );
  };

  const handleSyncAllPending = async () => {
    if (!isOnline) {
      setPersistenceError(
        language === 'ar'
          ? 'لا يمكن بدء المزامنة أثناء انقطاع الاتصال.'
          : 'Cannot start synchronization while offline.'
      );
      return;
    }

    try {
      const response = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cases, deviceId: deviceInfo?.deviceId || 'browser-client' }),
      });

      // Never report success for an HTTP failure or a static-host SPA fallback.
      if (!response.ok) {
        throw new Error(`Cloud sync endpoint failed with HTTP ${response.status}.`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error(
          'Cloud sync endpoint is unavailable or returned a non-JSON response. No sync status was changed.'
        );
      }

      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== 'object' ||
        !('syncedCount' in result) ||
        typeof (result as { syncedCount?: unknown }).syncedCount !== 'number' ||
        !Number.isFinite((result as { syncedCount: number }).syncedCount)
      ) {
        throw new Error('Cloud sync acknowledgement is invalid. No sync status was changed.');
      }

      // This endpoint currently receives a case snapshot, not the queued operations.
      // Do not mark individual offline operations as Synced until a durable sync
      // protocol acknowledges those exact operation IDs.
      appendAuditLog(
        'Cloud Sync',
        'Cloud Endpoint Acknowledged Case Snapshot',
        `Endpoint acknowledged ${(result as { syncedCount: number }).syncedCount} case items; pending operations remain pending until individually acknowledged.`
      );
      setPersistenceError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPersistenceError(
        language === 'ar'
          ? `فشلت المزامنة ولم تُعلَن العناصر كمزامنة: ${message}`
          : `Synchronization failed; pending items were not marked as synced: ${message}`
      );
      console.error('Cloud synchronization failed:', err);
    }
  };

  const handleExportBackupJson = () => {
    const backupPayload = {
      platform: 'Al-Basmi Orth v1.0',
      exportedAt: new Date().toISOString(),
      patients,
      cases,
      inventory,
      auditLogs,
    };
    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AlBasmi_Orth_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenNewCaseModal = (patientId?: string) => {
    setPersistenceError(null);
    if (patientId) {
      setNewCaseTargetPatientId(patientId);
    } else if (activeNav === 'patients' && activePatient) {
      setNewCaseTargetPatientId(activePatient.id);
    } else {
      setNewCaseTargetPatientId('');
    }
    setNewCaseStartDate(new Date().toISOString().slice(0, 10));
    setShowNewCaseModal(true);
  };

  const handleCreateNewCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setPersistenceError(null);

    const targetPatient = visiblePatients.find((p) => p.id === newCaseTargetPatientId);
    if (!targetPatient) {
      setPersistenceError(
        language === 'ar'
          ? 'خطأ: يجب اختيار مريض مسجل مسبقاً لربط الحالة التقويمية به.'
          : 'Error: An existing, registered patient must be selected to link this orthodontic case.'
      );
      return;
    }

    if (storageMode === 'CLINICAL' && targetPatient.isDemo) {
      setPersistenceError(
        language === 'ar'
          ? 'خطأ أمني: لا يمكن إنشاء حالة سريرية لمريض تجريبي في الوضع السريري.'
          : 'Security Violation: Cannot create clinical cases for synthetic demo patients in Clinical Mode.'
      );
      return;
    }

    const chiefComplaint = newCaseChiefComplaintEn.trim();
    if (!chiefComplaint) {
      setPersistenceError(
        language === 'ar'
          ? 'يرجى إدخال الشكوى الرئيسية للحالة التقويمية.'
          : 'Please enter the chief complaint for the orthodontic case.'
      );
      return;
    }

    const isClinical = !targetPatient.isDemo;

    if (isClinical) {
      if (storageStatus !== 'READY' || !cohort2CaseService) {
        setPersistenceError(
          language === 'ar'
            ? 'محرك التخزين السريري SQLite غير جاهز بعد أو غير متوفر. يرجى الانتظار.'
            : 'SQLite clinical storage engine is not ready or unavailable.'
        );
        return;
      }

      if (storageMode === 'CLINICAL' && !isDurable) {
        setPersistenceError(
          language === 'ar'
            ? 'خطأ أمني: التخزين الدائم غير متوفر في الوضع السريري. تم منع حفظ السجل لحماية بيانات المريض.'
            : 'Security Violation: Durable persistent storage is unavailable in Clinical Mode. Clinical write blocked.'
        );
        return;
      }
    }

    setIsCreatingCase(true);
    try {
      const newCaseNumber = `ORT-2026-${Date.now().toString().slice(-6)}`;
      const newCaseId = `case-${Date.now()}`;
      const nowIso = new Date().toISOString();
      const startDate = newCaseStartDate || nowIso.slice(0, 10);
      const deviceId = deviceInfo?.deviceId || 'dev-browser-client';

      let createdUiCase: OrthodonticCase;

      if (isClinical) {
        if (!cohort2CaseService) {
          throw new Error('Cohort2CasePersistenceService is unavailable.');
        }

        const caseTypeSqliteMap: Record<string, SqliteOrthodonticCaseRow['case_type']> = {
          'Comprehensive Fixed Appliance': 'COMPREHENSIVE',
          'Growth Modification + Fixed': 'INTERCEPTIVE',
          'MARPE + Skeletal Anchorage': 'ORTHOPEDIC',
          'Surgical-Orthodontic': 'SURGICAL_ORTHODONTIC',
          'Clear Aligner Therapy': 'LIMITED',
          'Retreatment': 'RETREATMENT',
        };

        const caseResult = await cohort2CaseService.createCase({
          id: newCaseId,
          caseNumber: newCaseNumber,
          patientId: targetPatient.id,
          caseType: caseTypeSqliteMap[newCaseType] || 'COMPREHENSIVE',
          caseStatus: 'CONSULTATION',
          chiefComplaint,
          startDate,
          primaryProviderId: 'usr-dr-albasmi',
          clinicId: 'clinic-main',
          userId: 'usr-dr-albasmi',
          userRole: 'ORTHODONTIST',
          deviceId,
          timestamp: nowIso,
          notes: targetPatient.fullNameAr ? `حالة تقويمية للمريض ${targetPatient.fullNameAr}` : null,
        });

        // Post-write verification gate: Confirm case exists authoritatively in SQLite
        const verifiedCase = await cohort2CaseService.getCaseById(caseResult.case.id);
        if (!verifiedCase) {
          throw new Error(
            'Post-write verification failed: Case row was not found in SQLite after commit.'
          );
        }

        createdUiCase = mapSqliteCaseToUi(verifiedCase, targetPatient);
      } else {
        // Ephemeral Demo mode case
        createdUiCase = {
          id: newCaseNumber,
          patientId: targetPatient.id,
          caseType: newCaseType as OrthodonticCase['caseType'],
          status: 'Consultation',
          startDate,
          expectedCompletionDate: new Date(Date.now() + 540 * 86400000).toISOString().slice(0, 10),
          treatingDoctor: 'Dr. Al-Basmi (Orthodontic Specialist)',
          chiefComplaintEn: chiefComplaint,
          chiefComplaintAr: targetPatient.fullNameAr ? `حالة تقويمية للمريض ${targetPatient.fullNameAr}` : '',
          patientExpectations: '',
          extraoral: createBlankExtraoralExam(),
          intraoral: createBlankIntraoralExam(),
          occlusal: createBlankOcclusalExam(),
          cbctAndRadiographs: createBlankCBCTRecord(),
          problemList: [],
          diagnosis: createBlankDiagnosisRecord(startDate),
          diagnosisHistory: [],
          treatmentOptions: [],
          cephRecords: [],
          visits: [],
          photos: [],
          retentionAndResidual: createBlankRetentionRecord(),
          financials: createBlankFinancialRecord(),
          referencesIds: [],
          isDemo: true,
        };
      }

      setCases((prev) => [createdUiCase, ...prev]);
      setSelectedPatientId(targetPatient.id);
      setSelectedCaseId(createdUiCase.id);
      setShowNewCaseModal(false);
      setNewCaseChiefComplaintEn('');
      setActiveNav('case_workspace');
      setActiveCaseTab('examination');
      appendAuditLog(
        isClinical ? 'Case Core (SQLite)' : 'Case Core (Demo)',
        `Created Orthodontic Case ${createdUiCase.id} (${newCaseNumber}) for Patient ${targetPatient.id}`,
        targetPatient.fullNameEn
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPersistenceError(msg);
      console.error('Case creation failed (transaction rolled back):', err);
    } finally {
      setIsCreatingCase(false);
    }
  };

  const filteredCases = cases.filter((c) => {
    if (caseScope === 'clinical' && c.isDemo) return false;
    if (caseScope === 'demo' && !c.isDemo) return false;
    const pat = patients.find((p) => p.id === c.patientId);
    const q = searchQuery.toLowerCase();
    return (
      c.id.toLowerCase().includes(q) ||
      c.caseType.toLowerCase().includes(q) ||
      Boolean(c.diagnosis?.skeletalSagittal?.toLowerCase().includes(q)) ||
      Boolean(pat?.fullNameEn?.toLowerCase().includes(q)) ||
      Boolean(pat?.fullNameAr?.includes(searchQuery))
    );
  });

  return (
    <div
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-screen flex flex-col bg-slate-50 text-slate-900"
    >
      {/* STORAGE DURABILITY & PREVIEW MODE ENFORCEMENT BANNERS */}
      {storageStatus === 'UNAVAILABLE' && (
        <div className="bg-red-600 text-white px-6 py-2.5 text-xs flex flex-wrap items-center justify-between gap-3 shadow-md z-40">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-white" />
            <span className="font-semibold">
              {language === 'ar'
                ? `تنبيه التخزين السريري: ${storageErrorMessage || 'التخزين الدائم (IndexedDB/OPFS) غير متاح في هذه البيئة. تم تجميد العمليات السريرية لمنع فقدان البيانات.'}`
                : `Clinical Persistence Unavailable: ${storageErrorMessage || 'Durable storage (IndexedDB/OPFS) is not accessible. Clinical mutations are blocked to protect patient data.'}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => retryInitialization()}
              className="px-3 py-1 bg-white text-red-700 font-semibold rounded text-[11px] hover:bg-red-50 transition-colors"
            >
              {language === 'ar' ? 'إعادة المحاولة' : 'Retry'}
            </button>
            <button
              onClick={() => switchStorageMode('PREVIEW')}
              className="px-3 py-1 bg-red-800 text-white font-semibold rounded text-[11px] hover:bg-red-900 border border-red-500 transition-colors"
            >
              {language === 'ar' ? 'التحويل لوضع المعاينة المؤقت' : 'Switch to Ephemeral Demo Mode'}
            </button>
          </div>
        </div>
      )}

      {storageMode === 'PREVIEW' && storageStatus === 'READY' && (
        <div className="bg-amber-500 text-slate-950 px-6 py-1.5 text-xs font-medium flex flex-wrap items-center justify-between gap-2 z-40">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-slate-950 flex-shrink-0" />
            <span>
              {language === 'ar'
                ? '⚡ وضع المعاينة التجريبي نشط: التخزين مؤقت في الذاكرة فقط (MemoryAsyncVFS). لن يتم حفظ البيانات سريرياً على القرص بشكل دائم.'
                : '⚡ Ephemeral Demo Mode Active: In-memory storage only (MemoryAsyncVFS). Clinical writes are NOT durably saved to disk.'}
            </span>
          </div>
          <button
            onClick={() => switchStorageMode('CLINICAL')}
            className="px-2.5 py-0.5 bg-slate-900 text-white text-[11px] font-semibold rounded hover:bg-slate-800 transition-colors"
          >
            {language === 'ar' ? 'العودة للوضع السريري الدائم' : 'Switch to Durable Clinical Mode'}
          </button>
        </div>
      )}

      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200">
        {/* Zone 1: Single Text Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveNav('case_workspace');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap"
        >
          Al-Basmi Orth
        </a>

        {/* Zone 2: 6 Primary Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            onClick={() => setActiveNav('dashboard')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeNav === 'dashboard'
                ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
                : 'hover:text-slate-900'
            }`}
          >
            {language === 'ar' ? 'لوحة العيادة' : 'Clinic Overview'}
          </button>
          <button
            onClick={() => setActiveNav('patients')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeNav === 'patients'
                ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
                : 'hover:text-slate-900'
            }`}
          >
            {language === 'ar' ? 'سجل المرضى' : 'Patients'}
          </button>
          <button
            onClick={() => setActiveNav('case_workspace')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeNav === 'case_workspace'
                ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
                : 'hover:text-slate-900'
            }`}
          >
            {language === 'ar' ? 'الملف السريري والسيفالومتري' : 'Clinical & Ceph Workspace'}
          </button>
          <button
            onClick={() => setActiveNav('reports')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeNav === 'reports'
                ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
                : 'hover:text-slate-900'
            }`}
          >
            {language === 'ar' ? 'التقارير العلمية' : 'Scientific Reports'}
          </button>
          <button
            onClick={() => setActiveNav('ai_assistant')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeNav === 'ai_assistant'
                ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
                : 'hover:text-slate-900'
            }`}
          >
            {language === 'ar' ? 'المساعد التقويمي الذكي' : 'AI Co-Pilot'}
          </button>
          <button
            onClick={() => setActiveNav('operations')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeNav === 'operations'
                ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
                : 'hover:text-slate-900'
            }`}
          >
            {language === 'ar' ? 'المالية والمخزن والمزامنة' : 'Finance, Inventory & Sync'}
          </button>
        </nav>

        {/* Zone 3: 3 Primary Actions (2-Option Language Switcher, New Patient & New Case) */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setLanguage('ar')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                language === 'ar'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              العربية
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                language === 'en'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              English
            </button>
          </div>
          <button
            onClick={() => setShowNewPatientModal(true)}
            className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap"
          >
            {language === 'ar' ? '+ مريض جديد' : '+ New Patient'}
          </button>
          <button
            onClick={() => handleOpenNewCaseModal(activeNav === 'patients' && activePatient ? activePatient.id : undefined)}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            {language === 'ar' ? '+ حالة تقويم جديدة' : '+ New Ortho Case'}
          </button>
        </div>
      </header>

      {/* MAIN TABLET-FIRST SPLIT WORKSPACE */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left Tablet Sidebar: Case Switcher, Offline Toggle & Quick Clinical Context */}
        <aside className="no-print w-full lg:w-72 bg-white border-b lg:border-b-0 lg:border-x border-slate-200 p-4 flex flex-col justify-between gap-4 shrink-0">
          <div className="space-y-4">
            {/* Search & Case Switcher */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-slate-800">
                  {language === 'ar' ? 'حالات التقويم المسجلة' : 'Orthodontic Cases'}
                </span>
                <span className="font-mono">
                  {language === 'ar' ? `${cases.length} حالات` : `${cases.length} Active`}
                </span>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute top-2.5 left-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    language === 'ar'
                      ? 'بحث برقم الحالة أو اسم المريض...'
                      : 'Search Case ID, Patient, Class...'
                  }
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* Case Scope Filter */}
              <div className="flex rounded-lg p-0.5 bg-slate-100 border border-slate-200 text-[10px] font-medium">
                <button
                  type="button"
                  onClick={() => setCaseScope('all')}
                  className={`flex-1 py-1 rounded transition-colors text-center ${
                    caseScope === 'all'
                      ? 'bg-white text-slate-900 font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {language === 'ar' ? 'الكل' : 'All'}
                </button>
                <button
                  type="button"
                  onClick={() => setCaseScope('clinical')}
                  className={`flex-1 py-1 rounded transition-colors text-center ${
                    caseScope === 'clinical'
                      ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {language === 'ar' ? 'سريري (SQLite)' : 'Clinical'}
                </button>
                <button
                  type="button"
                  onClick={() => setCaseScope('demo')}
                  className={`flex-1 py-1 rounded transition-colors text-center ${
                    caseScope === 'demo'
                      ? 'bg-amber-600 text-white font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {language === 'ar' ? 'تجريبي (Demo)' : 'Demo'}
                </button>
              </div>
            </div>

            {/* Case List */}
            <div className="space-y-2 max-h-72 lg:max-h-none overflow-y-auto">
              {filteredCases.map((c) => {
                const pat = patients.find((p) => p.id === c.patientId);
                const isSelected = c.id === activeCase?.id;
                const isCaseDemo = c.isDemo || pat?.isDemo;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCaseId(c.id)}
                    className={`w-full text-start p-3 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50/70 text-slate-800 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-mono ${isSelected ? 'text-cyan-400 font-semibold' : 'text-blue-700 font-semibold'}`}>
                          {c.id}
                        </span>
                        {isCaseDemo ? (
                          <span className="px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                            DEMO
                          </span>
                        ) : (
                          <span className="px-1 py-0.2 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            SQLITE
                          </span>
                        )}
                      </div>
                      <span className={isSelected ? 'text-slate-300' : 'text-slate-500'}>
                        {formatCaseStatus(language, c.status)}
                      </span>
                    </div>
                    <div className="text-xs font-semibold mt-1 truncate">
                      {language === 'ar' ? pat?.fullNameAr : pat?.fullNameEn}
                    </div>
                    <div
                      className={`text-[11px] mt-0.5 truncate ${
                        isSelected ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {formatSkeletalSagittal(language, c.diagnosis?.skeletalSagittal)} · OJ{' '}
                      {c.occlusal?.overjetInitialMm}→{c.occlusal?.overjetCurrentMm}mm
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Case Summary Metrics */}
            <div className="pt-3 border-t border-slate-200 space-y-2 text-xs">
              <div className="font-semibold text-slate-800">
                {language === 'ar' ? 'ملخص مؤشرات الحالة النشطة' : 'Active Case Telemetry'}
              </div>
              {activeCase ? (
                <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      {language === 'ar' ? 'النضج العظمي (CVM):' : 'CVM Maturation:'}
                    </span>
                    <span className="font-mono font-semibold text-slate-900">
                      {activeCase.cbctAndRadiographs?.cvmStage ?? '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      {language === 'ar' ? 'الزاوية السهمية (ANB):' : 'Initial / Final ANB:'}
                    </span>
                    <span className="font-mono font-semibold text-slate-900">
                      {activeCase.cephRecords?.[0]?.values['ANB'] ?? '—'}° →{' '}
                      {activeCase.cephRecords?.[activeCase.cephRecords.length - 1]?.values['ANB'] ?? '—'}°
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      {language === 'ar' ? 'البروز السني (Overjet):' : 'Overjet Progress:'}
                    </span>
                    <span className="font-mono font-semibold text-emerald-700">
                      {activeCase.occlusal?.overjetInitialMm ?? '—'}mm → {activeCase.occlusal?.overjetCurrentMm ?? '—'}mm
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      {language === 'ar' ? 'فحص الاتساق السريري:' : 'Quality Warnings:'}
                    </span>
                    <span
                      className={
                        activeWarnings.length > 0
                          ? 'text-amber-700 font-semibold'
                          : 'text-emerald-700 font-semibold'
                      }
                    >
                      {language === 'ar'
                        ? `${activeWarnings.length} تنبيهات`
                        : `${activeWarnings.length} Notices`}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 rounded border border-slate-200 text-slate-400 text-[11px] italic">
                  {language === 'ar' ? 'لا توجد حالة نشطة محددة' : 'No active case selected'}
                </div>
              )}
            </div>
          </div>

          {/* Offline-First / Online Mode Switcher */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <div className="text-[11px] text-slate-500 font-medium">
              {language === 'ar'
                ? 'وضع التشغيل (يعمل بالكامل بدون إنترنت):'
                : 'Operating Mode (Offline-First Architecture):'}
            </div>
            <button
              onClick={() => setIsOnline(!isOnline)}
              className={`w-full py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-between transition-colors ${
                isOnline
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {isOnline ? (
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                )}
                {isOnline
                  ? language === 'ar'
                    ? 'متصل بالسحابة (Cloud + AI)'
                    : 'ONLINE + CLOUD AI'
                  : language === 'ar'
                  ? 'وضع العمل المحلي (Offline)'
                  : 'OFFLINE LOCAL MODE'}
              </span>
              <span className="text-[10px] underline">
                {language === 'ar' ? 'تبديل' : 'Toggle'}
              </span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-5 lg:p-6 max-w-7xl mx-auto w-full space-y-6">
          {/* Active Patient & Case Context Ribbon */}
          {!activePatient || !activeCase ? (
            <div className="no-print bg-amber-50/80 border border-amber-200 rounded-lg p-4 text-xs text-amber-900 flex items-center justify-between">
              <div>
                <span className="font-semibold">
                  {language === 'ar' ? 'لا يوجد مريض أو حالة تقويمية محددة حالياً' : 'No active patient or case selected'}
                </span>
                <p className="text-[11px] text-amber-800/80 mt-0.5">
                  {language === 'ar'
                    ? 'يرجى تحديد مريض وحالة من القائمة الجانبية أو إضافة سجل سريري جديد.'
                    : 'Please select a patient and case from the sidebar or create a new clinical record.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="no-print bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-bold text-blue-700">{activeCase.id}</span>
                  <span>·</span>
                  <span>{formatSkeletalSagittal(language, activeCase.diagnosis?.skeletalSagittal)}</span>
                  <span>·</span>
                  <span>
                    {language === 'ar'
                      ? `الحالة: ${formatCaseStatus('ar', activeCase.status)}`
                      : `Stage: ${activeCase.status}`}
                  </span>
                  <span>·</span>
                  <span className="font-mono">
                    {language === 'ar'
                      ? `البدء: ${activeCase.startDate}`
                      : `Started: ${activeCase.startDate}`}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-lg font-bold text-slate-900">
                    {language === 'ar' ? activePatient.fullNameAr : activePatient.fullNameEn}
                  </h1>
                  {activeCase.isDemo || activePatient.isDemo ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                      {language === 'ar' ? 'بيانات تجريبية (Demo)' : 'Demo Record'}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      {language === 'ar' ? 'سجل سريري' : 'Clinical Record'}
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Workflow Navigation Shortcuts */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setActiveNav('case_workspace');
                    setActiveCaseTab('visits_progress');
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
                >
                  {language === 'ar' ? '+ تسجيل جلسة سريعة' : '+ Quick Visit'}
                </button>
                <button
                  onClick={() => {
                    setActiveNav('case_workspace');
                    setActiveCaseTab('cephalometrics');
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
                >
                  {language === 'ar'
                    ? 'التحليل السيفالومتري (Cephalometrics)'
                    : 'Ceph & Superimposition'}
                </button>
                <button
                  onClick={() => setActiveNav('ai_assistant')}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
                >
                  {language === 'ar' ? 'مناقشة الحالة بالذكاء الاصطناعي' : 'AI Case Discussion'}
                </button>
                <button
                  onClick={() => setActiveNav('reports')}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  {language === 'ar' ? 'إصدار التقرير العلمي' : 'Generate Scientific Report'}
                </button>
              </div>
            </div>
          )}

          {/* VIEW 1: CLINIC DASHBOARD */}
          {activeNav === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500">
                    {language === 'ar' ? 'الحالات التقويمية المسجلة' : 'Active Orthodontic Cases'}
                  </div>
                  <div className="text-2xl font-mono font-bold text-slate-900 mt-1">
                    {cases.length}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {language === 'ar'
                      ? 'محفوظة بالكامل في قاعدة البيانات المحلية'
                      : '100% Stored in Local Offline Database'}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500">
                    {language === 'ar'
                      ? 'نسبة تحقيق الأهداف العلاجية'
                      : 'Treatment Objective Achievement'}
                  </div>
                  <div className="text-2xl font-mono font-bold text-emerald-700 mt-1">94.2%</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {language === 'ar'
                      ? 'مرتبطة بسلسلة المشكلة ← الهدف ← النتيجة'
                      : 'Tracked across Problem → Outcome chains'}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500">
                    {language === 'ar' ? 'مواد تقويم قاربت على النفاد' : 'Low-Stock Ortho Materials'}
                  </div>
                  <div className="text-2xl font-mono font-bold text-amber-600 mt-1">
                    {inventory.filter((i) => i.stockQuantity <= i.minStock).length}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {language === 'ar'
                      ? 'زرعات (TADs) وموسعات هيكلية (MARPE)'
                      : 'TADs 1.6×8mm & MSE-II Expanders'}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500">
                    {language === 'ar'
                      ? 'سجلات بانتظار المزامنة أو الفصل'
                      : 'Sync Queue & Multi-Device Status'}
                  </div>
                  <div className="text-2xl font-mono font-bold text-blue-700 mt-1">
                    {syncQueue.filter((s) => s.status !== 'Synced').length}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {language === 'ar'
                      ? 'نظام حماية السجل من التعديل المتعارض نشط'
                      : 'Conflict resolution guard enabled'}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <h2 className="text-base font-semibold text-slate-900">
                  {language === 'ar'
                    ? 'سجل الحالات التقويمية الشامل'
                    : 'Orthodontic Clinical Case Registry'}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 text-start font-mono">
                          {language === 'ar' ? 'رقم الحالة' : 'Case ID'}
                        </th>
                        <th className="py-2.5 text-start">
                          {language === 'ar' ? 'اسم المريض' : 'Patient Name'}
                        </th>
                        <th className="py-2.5 text-start">
                          {language === 'ar' ? 'التشخيص الهيكلي' : 'Skeletal & Occlusal Diagnosis'}
                        </th>
                        <th className="py-2.5 text-start">
                          {language === 'ar' ? 'الخطة المعتمدة' : 'Appliance / Plan'}
                        </th>
                        <th className="py-2.5 text-end font-mono">
                          {language === 'ar' ? 'البروز السني (Overjet)' : 'Initial → Current OJ'}
                        </th>
                        <th className="py-2.5 text-start ps-3">
                          {language === 'ar' ? 'مرحلة العلاج' : 'Stage'}
                        </th>
                        <th className="py-2.5 text-end">
                          {language === 'ar' ? 'إجراء' : 'Action'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {cases.map((c) => {
                        const pat = patients.find((p) => p.id === c.patientId);
                        const selPlan = c.treatmentOptions.find((o) => o.isSelected);
                        return (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="py-3 font-mono font-semibold text-blue-700">{c.id}</td>
                            <td className="py-3 font-semibold text-slate-900">
                              {language === 'ar' ? pat?.fullNameAr : pat?.fullNameEn}
                            </td>
                            <td className="py-3 text-slate-700">
                              {formatSkeletalSagittal(language, c.diagnosis.skeletalSagittal)}
                            </td>
                            <td className="py-3 text-slate-600">
                              {language === 'ar'
                                ? selPlan?.titleAr || c.caseType
                                : selPlan?.approachType || c.caseType}
                            </td>
                            <td className="py-3 text-end font-mono">
                              {c.occlusal.overjetInitialMm}mm → {c.occlusal.overjetCurrentMm}mm
                            </td>
                            <td className="py-3 ps-3 text-slate-800">
                              {formatCaseStatus(language, c.status)}
                            </td>
                            <td className="py-3 text-end">
                              <button
                                onClick={() => {
                                  setSelectedCaseId(c.id);
                                  setActiveNav('case_workspace');
                                }}
                                className="px-3 py-1 bg-slate-900 text-white rounded text-[11px] font-medium hover:bg-slate-800"
                              >
                                {language === 'ar' ? 'فتح الملف' : 'Open Record'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: PATIENTS MASTER-DETAIL WORKSPACE */}
          {activeNav === 'patients' && (
            <div className="flex flex-col lg:flex-row bg-white rounded-xl border border-slate-200 overflow-hidden min-h-[640px] shadow-xs">
              <div className="w-full lg:w-80 xl:w-96 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col">
                <PatientMasterList
                  patients={visiblePatients}
                  selectedPatientId={activePatient?.id || null}
                  onSelectPatient={(id) => {
                    setSelectedPatientId(id);
                    const matchingCase = visibleCases.find((c) => c.patientId === id);
                    if (matchingCase) {
                      setSelectedCaseId(matchingCase.id);
                    }
                  }}
                  onOpenNewPatientModal={() => setShowNewPatientModal(true)}
                  language={language}
                  caseCountsByPatientId={caseCountsByPatient}
                  isStorageReady={storageStatus === 'READY'}
                  isClinicalMode={storageMode === 'CLINICAL'}
                />
              </div>
              <div className="flex-1 flex flex-col overflow-y-auto">
                <PatientDetailView
                  patient={activePatient}
                  cases={visibleCases}
                  activeCaseId={activeCase?.id || null}
                  onSelectCase={(caseId) => {
                    setSelectedCaseId(caseId);
                    setActiveNav('case_workspace');
                  }}
                  onOpenNewCaseModal={() => handleOpenNewCaseModal(activePatient?.id)}
                  language={language}
                  isStorageReady={storageStatus === 'READY'}
                />
              </div>
            </div>
          )}

          {/* VIEW 2: CLINICAL & CEPHALOMETRIC WORKSPACE (Unified SQLite-Backed Workspace) */}
          {activeNav === 'case_workspace' && (
            <div className="space-y-5">
              {/* Sub-navigation Tabs for the 6 Core Clinical Domains */}
              <div className="no-print flex flex-wrap gap-1.5 bg-slate-200/70 p-1.5 rounded-lg">
                {(
                  [
                    {
                      id: 'examination',
                      labelEn: '1. Clinical & CBCT Exam',
                      labelAr: '1. الفحص السريري والشعاعي (CBCT)',
                    },
                    {
                      id: 'diagnosis_problems',
                      labelEn: '2. Diagnosis & Problem Matrix',
                      labelAr: '2. التشخيص وقائمة المشاكل (Problem List)',
                    },
                    {
                      id: 'cephalometrics',
                      labelEn: '3. Cephalometrics & Superimposition',
                      labelAr: '3. التحليل السيفالومتري والمطابقة (Superimposition)',
                    },
                    {
                      id: 'treatment_plan',
                      labelEn: '4. Treatment Options (A/B/C)',
                      labelAr: '4. البدائل والخطة العلاجية',
                    },
                    {
                      id: 'visits_progress',
                      labelEn: '5. Quick Visits & Timeline',
                      labelAr: '5. الجلسات السريعة والخط الزمني',
                    },
                    {
                      id: 'media_comparison',
                      labelEn: '6. Before / Progress / Final',
                      labelAr: '6. الصور والمقارنة المراحل (قبل / أثناء / بعد)',
                    },
                  ] as { id: CaseSubTab; labelEn: string; labelAr: string }[]
                ).map((tItem) => (
                  <button
                    key={tItem.id}
                    onClick={() => setActiveCaseTab(tItem.id)}
                    className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                      activeCaseTab === tItem.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {language === 'ar' ? tItem.labelAr : tItem.labelEn}
                  </button>
                ))}
              </div>

              <ClinicalCaseWorkspace
                orthoCase={activeCase}
                patient={activePatient}
                warnings={activeWarnings}
                inventory={inventory}
                language={language}
                activeTab={activeCaseTab}
                onUpdateCase={handleUpdateCase}
                onAddQuickVisit={handleAddQuickVisit}
              />
            </div>
          )}

          {/* VIEW 3: SCIENTIFIC & CLINICAL REPORT ENGINE */}
          {activeNav === 'reports' && (
            <ReportEngineView
              orthoCase={activeCase}
              patient={activePatient}
              warnings={activeWarnings}
              references={ORTHODONTIC_EVIDENCE_LIBRARY}
              language={language}
            />
          )}

          {/* VIEW 4: AI ORTHODONTIC CO-PILOT */}
          {activeNav === 'ai_assistant' && (
            <AIDecisionSupportView
              orthoCase={activeCase}
              isOnline={isOnline}
              language={language}
              onAcceptSuggestedProblem={handleAcceptAIProblem}
              onApproveAIDiagnosisDraft={handleApproveAIDiagnosisDraft}
            />
          )}

          {/* VIEW 5: FINANCE, INVENTORY & OFFLINE SYNC ENGINE */}
          {activeNav === 'operations' && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-1.5 bg-slate-200/70 p-1.5 rounded-lg w-fit">
                <button
                  onClick={() => setActiveOpTab('p0_architecture')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold ${
                    activeOpTab === 'p0_architecture'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  {language === 'ar'
                    ? 'البنية المعمارية ونموذج البيانات (P0 Architecture)'
                    : 'P0 Domain Architecture & Versioning'}
                </button>
                <button
                  onClick={() => setActiveOpTab('p3_sandbox')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold ${
                    activeOpTab === 'p3_sandbox'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  {language === 'ar'
                    ? 'مختبر عقود النطاق السريري (P3 Sandbox)'
                    : 'P3 Domain Contract Sandbox'}
                </button>
                <button
                  onClick={() => setActiveOpTab('finance')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold ${
                    activeOpTab === 'finance'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  {language === 'ar'
                    ? 'الرسوم والأقساط ومساهمة الحالة'
                    : 'Case Financials & Direct Cost Contribution'}
                </button>
                <button
                  onClick={() => setActiveOpTab('inventory')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold ${
                    activeOpTab === 'inventory'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  {language === 'ar' ? 'مخزن مواد التقويم' : 'Mini Orthodontic Inventory'}
                </button>
                <button
                  onClick={() => setActiveOpTab('sync')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold ${
                    activeOpTab === 'sync'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  {language === 'ar'
                    ? 'المزامنة وحل التعارضات وسجل التدقيق'
                    : 'Offline Sync, Conflict Resolver & Audit Log'}
                </button>
              </div>

              {activeOpTab === 'p3_sandbox' ? (
                <P3ClinicalCoreWorkspace language={language} isOnline={isOnline} />
              ) : (
                <OperationalAndSyncView
                  activeSubTab={activeOpTab}
                  orthoCase={activeCase}
                  patient={activePatient}
                  allPatients={patients}
                  allCases={cases}
                  inventory={inventory}
                  auditLogs={auditLogs}
                  syncQueue={syncQueue}
                  isOnline={isOnline}
                  language={language}
                  onRecordPayment={handleRecordPayment}
                  onRestockMaterial={handleRestockMaterial}
                  onResolveConflict={handleResolveConflict}
                  onSyncAllPending={handleSyncAllPending}
                  onExportBackupJson={handleExportBackupJson}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* New Orthodontic Case Modal */}
      {showNewCaseModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {language === 'ar'
                  ? 'فتح حالة تقويمية جديدة'
                  : 'Create New Orthodontic Case'}
              </h3>
              <button
                onClick={() => setShowNewCaseModal(false)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Close ✕
              </button>
            </div>
            {persistenceError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span className="font-mono text-[11px]">{persistenceError}</span>
              </div>
            )}
            <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-900 rounded text-xs flex items-center justify-between">
              <span className="font-semibold">
                {language === 'ar' ? 'مسار الحفظ السريري:' : 'Persistence Engine:'}
              </span>
              <span className="font-mono text-[11px] font-medium text-blue-800">
                {storageMode === 'CLINICAL'
                  ? (language === 'ar' ? 'SQLite دائم (معتمد سريرياً)' : 'SQLite Durable (Clinical Canonical)')
                  : (language === 'ar' ? 'وضع المعاينة المؤقت (ذاكرة فقط)' : 'Ephemeral Preview (RAM Only)')}
              </span>
            </div>
            <form onSubmit={handleCreateNewCase} className="space-y-3.5 text-xs">
              {/* Target Patient Selection Dropdown */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {language === 'ar' ? 'المريض المستهدف *' : 'Target Patient *'}
                </label>
                <select
                  value={newCaseTargetPatientId}
                  onChange={(e) => {
                    setNewCaseTargetPatientId(e.target.value);
                    setPersistenceError(null);
                  }}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded font-medium bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">
                    {language === 'ar' ? '-- اختر مريضاً مسجلاً من القائمة --' : '-- Select registered patient --'}
                  </option>
                  {visiblePatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {language === 'ar' ? p.fullNameAr : p.fullNameEn} ({p.id}) {p.isDemo ? '(Demo)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Read-Only Patient Summary Card */}
              {(() => {
                const targetPat = visiblePatients.find((p) => p.id === newCaseTargetPatientId);
                if (targetPat) {
                  return (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">
                          {language === 'ar' ? targetPat.fullNameAr : targetPat.fullNameEn}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-blue-100 text-blue-800">
                          {targetPat.id}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 text-[11px]">
                        <span>
                          <strong className="text-slate-700">{language === 'ar' ? 'تاريخ الميلاد:' : 'DOB:'}</strong>{' '}
                          {targetPat.dob}
                        </span>
                        <span>
                          <strong className="text-slate-700">{language === 'ar' ? 'الجنس:' : 'Gender:'}</strong>{' '}
                          {targetPat.gender === 'Female'
                            ? (language === 'ar' ? 'أنثى' : 'Female')
                            : (language === 'ar' ? 'ذكر' : 'Male')}
                        </span>
                        {targetPat.phone && (
                          <span className="font-mono">
                            <strong className="text-slate-700">{language === 'ar' ? 'الهاتف:' : 'Phone:'}</strong>{' '}
                            {targetPat.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      {language === 'ar'
                        ? 'يرجى اختيار مريض من القائمة أعلاه لربط الحالة به.'
                        : 'Please select a patient from the dropdown above to link this case.'}
                    </span>
                  </div>
                );
              })()}

              {/* Orthodontic Case Type */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {language === 'ar' ? 'نوع الحالة التقويمية' : 'Orthodontic Case Type'}
                </label>
                <select
                  value={newCaseType}
                  onChange={(e) => setNewCaseType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded font-medium bg-white text-slate-900"
                >
                  <option value="Comprehensive Fixed Appliance">
                    {language === 'ar' ? 'تقويم شامل بأجهزة ثابتة (Comprehensive Fixed Appliance)' : 'Comprehensive Fixed Appliance'}
                  </option>
                  <option value="Growth Modification + Fixed">
                    {language === 'ar' ? 'تعديل نمو + أجهزة ثابتة (Growth Modification + Fixed)' : 'Growth Modification + Fixed'}
                  </option>
                  <option value="MARPE + Skeletal Anchorage">
                    {language === 'ar' ? 'توسيع عظمي MARPE + تثبيت هيكلي (MARPE + Skeletal Anchorage)' : 'MARPE + Skeletal Anchorage'}
                  </option>
                  <option value="Surgical-Orthodontic">
                    {language === 'ar' ? 'تقويم جراحي (Surgical-Orthodontic)' : 'Surgical-Orthodontic'}
                  </option>
                  <option value="Clear Aligner Therapy">
                    {language === 'ar' ? 'تقويم شفاف (Clear Aligner Therapy)' : 'Clear Aligner Therapy'}
                  </option>
                  <option value="Retreatment">
                    {language === 'ar' ? 'إعادة معالجة تقويمية (Retreatment)' : 'Retreatment'}
                  </option>
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {language === 'ar' ? 'تاريخ بدء الحالة' : 'Case Start Date'}
                </label>
                <input
                  type="date"
                  value={newCaseStartDate}
                  onChange={(e) => setNewCaseStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                />
              </div>

              {/* Chief Complaint */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {language === 'ar' ? 'الشكوى الرئيسية (Chief Complaint) *' : 'Chief Complaint *'}
                </label>
                <input
                  type="text"
                  required
                  value={newCaseChiefComplaintEn}
                  onChange={(e) => setNewCaseChiefComplaintEn(e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: تزاحم في الأسنان العلوية وعضة عميقة' : 'e.g., Upper anterior crowding and deep bite'}
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewCaseModal(false)}
                  disabled={isCreatingCase}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingCase || !newCaseTargetPatientId || !newCaseChiefComplaintEn.trim()}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
                >
                  {isCreatingCase ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{language === 'ar' ? 'جارٍ الحفظ في SQLite...' : 'Saving to SQLite...'}</span>
                    </>
                  ) : (
                    <span>{language === 'ar' ? 'إنشاء وحفظ الحالة' : 'Initialize & Save Case'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW PATIENT REGISTRATION MODAL */}
      <NewPatientModal
        isOpen={showNewPatientModal}
        onClose={() => setShowNewPatientModal(false)}
        onPatientCreated={(newPatient) => {
          setPatients((prev) => [newPatient, ...prev.filter((p) => p.id !== newPatient.id)]);
          setSelectedPatientId(newPatient.id);
          setActiveNav('patients');
        }}
        language={language}
        cohort2PatientService={cohort2PatientService}
        deviceId={deviceInfo?.deviceId || 'dev-browser-client'}
        isDurable={isDurable}
        storageMode={storageMode}
      />
    </div>
  );
}
