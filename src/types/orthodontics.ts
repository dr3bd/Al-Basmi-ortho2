export type LanguageMode = 'ar' | 'en';

export type CaseStatus =
  | 'New'
  | 'Consultation'
  | 'Records'
  | 'Diagnosis'
  | 'Treatment Planning'
  | 'Active Treatment'
  | 'Finishing'
  | 'Debond'
  | 'Retention'
  | 'Completed'
  | 'Follow-up'
  | 'Archived';

export type TimepointStage =
  | 'T0_Initial'
  | 'T1_Progress'
  | 'T2_PreFinishing'
  | 'T3_Final'
  | 'T4_Retention';

export type FindingCategory = 'Normal Finding' | 'Clinical Finding' | 'Actual Problem' | 'Risk / Concern' | 'Missing Information';

export type DomainSection = 'Skeletal' | 'Dental' | 'Occlusal' | 'Soft Tissue' | 'CBCT / Radiographic';

export type OutcomeStatus = 'Achieved' | 'Partially Achieved' | 'Not Achieved' | 'In Progress' | 'Not Assessed';

export type DataSourceOrigin = 'Doctor-Entered' | 'AI-Suggested' | 'Doctor-Approved';

export interface Patient {
  id: string;
  fullNameAr: string;
  fullNameEn: string;
  gender: 'Male' | 'Female';
  dob: string;
  phone: string;
  guardianName?: string;
  medicalHistory: string;
  dentalHistory: string;
  allergies: string;
  notes: string;
  createdAt: string;
  isDemo?: boolean; // Synthetic demo patient flag (isolated from SQLite)
}

export interface ExtraoralExam {
  facialSymmetry: 'Symmetrical' | 'Mild Asymmetry' | 'Deviation to Right' | 'Deviation to Left';
  facialType: 'Mesofacial' | 'Dolichofacial' | 'Brachyfacial';
  profile: 'Straight' | 'Convex' | 'Concave';
  verticalProportions: 'Balanced' | 'Increased Lower Anterior Facial Height' | 'Decreased Lower Anterior Facial Height';
  lipCompetence: 'Competent' | 'Incompetent' | 'Potentially Competent';
  nasolabialAngle: 'Normal (90-110°)' | 'Acute (<90°)' | 'Obtuse (>110°)';
  mentolabialSulcus: 'Normal' | 'Deep' | 'Shallow';
  chinProminence: 'Normal' | 'Protrusive' | 'Recessive';
  smileArc: 'Consonant' | 'Flat' | 'Reverse';
  gingivalDisplayOnSmileMm: number;
  notes: string;
}

export interface IntraoralExam {
  oralHygiene: 'Good' | 'Fair' | 'Poor';
  gingivalBiotype: 'Thick' | 'Normal' | 'Thin / Fragile';
  maxillaryArchForm: 'Ovoid' | 'Tapered' | 'Square' | 'Constricted';
  mandibularArchForm: 'Ovoid' | 'Tapered' | 'Square' | 'Constricted';
  maxillaryCrowdingMm: number; // negative for spacing, positive for crowding
  mandibularCrowdingMm: number;
  missingTeeth: string[]; // FDI notation e.g., ["18", "28"]
  impactedTeeth: string[]; // e.g., ["13", "23"]
  ectopicTeeth: string[];
  rotationsSummary: string;
  frenumAttachment: 'Normal' | 'High Labial' | 'Ankyloglossia';
  notes: string;
}

export interface OcclusalExam {
  molarRight: 'Class I' | 'Class II Full' | 'Class II Half-Cusp' | 'Class III';
  molarLeft: 'Class I' | 'Class II Full' | 'Class II Half-Cusp' | 'Class III';
  canineRight: 'Class I' | 'Class II' | 'Class III' | 'Ectopic/Unassessable';
  canineLeft: 'Class I' | 'Class II' | 'Class III' | 'Ectopic/Unassessable';
  overjetInitialMm: number;
  overjetCurrentMm: number;
  overbiteInitialMm: number;
  overbiteCurrentMm: number;
  crossbite: 'None' | 'Anterior' | 'Unilateral Posterior Right' | 'Unilateral Posterior Left' | 'Bilateral Posterior';
  openBite: 'None' | 'Anterior' | 'Posterior';
  upperMidlineMm: number; // + right, - left
  lowerMidlineMm: number;
  curveOfSpeeMm: number;
  functionalShift: 'None' | 'Anterior CR-CO Shift' | 'Lateral Shift Right' | 'Lateral Shift Left';
  boltonAnteriorRatio: number; // norm 77.2%
  boltonOverallRatio: number; // norm 91.3%
}

export interface CBCTAndRadiographicRecord {
  panoramicSummary: string;
  rootResorptionStatus: 'None' | 'Mild Apical Blunting' | 'Moderate Resorption';
  alveolarBoneStatus: 'Adequate' | 'Thin Labial Cortical Plate' | 'Dehiscence / Fenestration Risk';
  airwayAssessment: 'Normal Pharyngeal Airway' | 'Constricted Oropharynx' | 'Adenoid Hypertrophy';
  tmjStatus: 'Normal Condylar Morphology' | 'Clicking / Disc Displacement' | 'Condylar Flattening';
  cvmStage: 'CS1' | 'CS2' | 'CS3 (Peak)' | 'CS4' | 'CS5' | 'CS6 (Mature)';
  tadSafeZonesNotes: string;
}

export interface ProblemObjectiveItem {
  id: string;
  domain: DomainSection;
  classification: FindingCategory;
  findingEn: string;
  findingAr: string;
  objectiveEn: string;
  objectiveAr: string;
  strategyMechanicsEn: string;
  strategyMechanicsAr: string;
  outcomeResultEn: string;
  outcomeResultAr: string;
  outcomeStatus: OutcomeStatus;
  origin: DataSourceOrigin;
  approvedByDoctor: boolean;
}

export interface DiagnosisRecord {
  version: number;
  updatedAt: string;
  approvedBy: string;
  origin: DataSourceOrigin;
  skeletalSagittal: 'Skeletal Class I' | 'Skeletal Class II (Maxillary Prognathism)' | 'Skeletal Class II (Mandibular Retrognathism)' | 'Skeletal Class III';
  skeletalVertical: 'Normodivergent' | 'Hyperdivergent (High Angle)' | 'Hypodivergent (Low Angle)';
  skeletalTransverse: 'Normal Transverse Maxillo-Mandibular Width' | 'Maxillary Transverse Deficiency' | 'Asymmetric Transverse';
  dentalSummaryEn: string;
  dentalSummaryAr: string;
  occlusalSummaryEn: string;
  occlusalSummaryAr: string;
  softTissueSummaryEn: string;
  softTissueSummaryAr: string;
  comprehensiveStatementEn: string;
  comprehensiveStatementAr: string;
  differentialDiagnosis: string;
}

export interface TreatmentOption {
  id: string;
  label: 'Option A' | 'Option B' | 'Option C';
  titleEn: string;
  titleAr: string;
  approachType: 'Non-Extraction' | 'Premolar Extraction' | 'Distalization + TADs' | 'MARPE + Fixed' | 'Surgical-Orthodontic';
  extractionTeeth: string;
  anchoragePlan: 'Minimum' | 'Moderate' | 'Maximum (Transpalatal Arch)' | 'Absolute (Skeletal TADs)';
  applianceSystem: string;
  advantagesEn: string;
  disadvantagesEn: string;
  risksAndLimitationsEn: string;
  expectedProfileEffect: string;
  isSelected: boolean;
}

export interface CephalometricLandmark {
  id: string;
  code: 'S' | 'N' | 'A' | 'B' | 'Pog' | 'Me' | 'Go' | 'Po' | 'Or' | 'ANS' | 'PNS' | 'U1i' | 'U1a' | 'L1i' | 'L1a';
  nameEn: string;
  nameAr: string;
  x: number; // percentage 0-100 on tracing canvas
  y: number;
  confidence: number;
  doctorVerified: boolean;
}

export type CephAnalysisSchool = 'Steiner' | 'Tweed' | 'Downs' | 'McNamara' | 'Ricketts' | 'Jarabak' | 'Wits' | 'Custom';

export interface CephMeasurementDefinition {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  school: CephAnalysisSchool;
  unit: '°' | 'mm' | '%';
  normMean: number;
  normSd: number;
  highMeaningEn: string;
  lowMeaningEn: string;
  highMeaningAr: string;
  lowMeaningAr: string;
}

export interface CephStageRecord {
  stage: TimepointStage;
  date: string;
  doctorVerified: boolean;
  values: Record<string, number>; // key = measurement code e.g. 'SNA', 'SNB', 'ANB'
  landmarks: CephalometricLandmark[];
  superimpositionNotesEn: string;
  superimpositionNotesAr: string;
}

export interface ClinicalVisit {
  id: string;
  visitNumber: number;
  date: string;
  stage: TimepointStage;
  visitType:
    | 'Consultation'
    | 'Records'
    | 'Bonding'
    | 'Adjustment'
    | 'Wire Change'
    | 'Elastic Change'
    | 'IPR'
    | 'Space Closure'
    | 'TAD Placement'
    | 'MARPE Activation'
    | 'Debond'
    | 'Retention Check'
    | 'Emergency';
  procedures: string[];
  upperArchwire: string;
  lowerArchwire: string;
  elasticsConfig: string;
  materialsIssuedIds: { materialId: string; materialName: string; quantity: number; unitCost: number }[];
  clinicalNotesEn: string;
  clinicalNotesAr: string;
  nextPlan: string;
  nextAppointmentDate: string;
}

export interface ClinicalPhotoRecord {
  id: string;
  stage: TimepointStage;
  date: string;
  category: 'Extraoral Frontal' | 'Extraoral Profile' | 'Extraoral Smile' | 'Intraoral Frontal' | 'Intraoral Right' | 'Intraoral Left' | 'Upper Occlusal' | 'Lower Occlusal' | 'Panoramic X-Ray' | 'Lateral Ceph';
  captionEn: string;
  captionAr: string;
  svgType: string; // deterministic high-precision clinical illustration key or dataURI
  dataUrl?: string;
}

export interface ResidualAndRetentionRecord {
  upperRetainer: 'Vacuum-Formed Essix' | 'Hawley Retainer' | 'Fixed Lingual 3-3 + Essix' | 'Begg Wrap-Around';
  lowerRetainer: 'Fixed Lingual 3-3 Bonded' | 'Vacuum-Formed Essix' | 'Fixed + Removable Dual';
  wearProtocol: string;
  residualProblemsEn: string[];
  residualProblemsAr: string[];
  treatmentLimitationsEn: string[];
  treatmentLimitationsAr: string[];
  relapseRiskLevel: 'Low' | 'Moderate' | 'High (Requires Long-Term Fixed Retention)';
}

export interface InstallmentRecord {
  id: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: 'Paid' | 'Pending' | 'Overdue';
  paymentDate?: string;
  method?: 'Cash' | 'Card' | 'Bank Transfer';
}

export interface CaseFinancialRecord {
  totalFee: number;
  discount: number;
  labCost: number;
  otherDirectCost: number;
  currency: string;
  installments: InstallmentRecord[];
}

export interface InventoryMaterial {
  id: string;
  sku: string;
  name: string;
  category: 'Brackets' | 'Archwires' | 'Elastics' | 'Power Chains' | 'TADs' | 'MARPE' | 'Bonding' | 'Retention';
  manufacturer: string;
  supplier: string;
  unit: string;
  unitCost: number;
  stockQuantity: number;
  minStock: number;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  actor: string;
  role: 'Orthodontist' | 'Assistant' | 'Reception';
  domain: string;
  action: string;
  details: string;
}

export interface SyncQueueEntry {
  id: string;
  caseId: string;
  entityType: string;
  operation: 'UPDATE' | 'CREATE';
  timestamp: string;
  status: 'Pending Offline' | 'Synced' | 'Conflict Detected';
  localValueSummary?: string;
  remoteValueSummary?: string;
}

export interface OrthodonticCase {
  id: string; // e.g., ORT-2026-00104
  patientId: string;
  caseType: 'Comprehensive Fixed Appliance' | 'Growth Modification + Fixed' | 'MARPE + Skeletal Anchorage' | 'Surgical-Orthodontic' | 'Clear Aligner Therapy' | 'Retreatment';
  status: CaseStatus;
  startDate: string;
  expectedCompletionDate: string;
  treatingDoctor: string;
  chiefComplaintAr: string;
  chiefComplaintEn: string;
  patientExpectations: string;
  extraoral: ExtraoralExam;
  intraoral: IntraoralExam;
  occlusal: OcclusalExam;
  cbctAndRadiographs: CBCTAndRadiographicRecord;
  problemList: ProblemObjectiveItem[];
  diagnosis: DiagnosisRecord;
  diagnosisHistory: DiagnosisRecord[];
  treatmentOptions: TreatmentOption[];
  cephRecords: CephStageRecord[];
  visits: ClinicalVisit[];
  photos: ClinicalPhotoRecord[];
  retentionAndResidual: ResidualAndRetentionRecord;
  financials: CaseFinancialRecord;
  referencesIds: string[];
  isDemo?: boolean; // Synthetic demo case flag (isolated from real clinical cases)
}

export interface ScientificReference {
  id: string;
  authors: string;
  year: number;
  title: string;
  journalOrBook: string;
  volumePages: string;
  domainTag: 'Cephalometrics' | 'Biomechanics' | 'Class II' | 'Class III' | 'MARPE & TADs' | 'Retention & Stability' | 'Root Resorption';
  apaCitation: string;
  vancouverCitation: string;
}
