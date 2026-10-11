/**
 * P0 — ORTHODONTIC CLINICAL ARCHITECTURE & CANONICAL RELATIONAL SCHEMA
 * Principle: Enter Once → Validate → Approve → Reuse Everywhere
 * Layering: UI → Domain / Application Layer → Clinical Data Model → Repository → Local Database → Sync Engine → Cloud
 */

export type EntityStatus = 'Active' | 'Archived' | 'Inactive';

export type StructuredFindingValue<T = string | number> = {
  value: T;
  status: 'Normal' | 'Mild Deviation' | 'Moderate Deviation' | 'Severe Deviation';
  confidence: 'Confirmed' | 'Likely' | 'Possible' | 'Insufficient Data';
  source: 'Doctor' | 'Cephalometric' | 'CBCT' | 'AI Suggestion (Reviewed)';
  notes?: string;
};

// 1. PATIENT ENTITY (Independent of OrthodonticCase: 1 Patient -> N Cases)
export interface P0PatientEntity {
  patientId: string;
  patientCode: string;
  firstNameAr: string;
  middleNameAr: string;
  lastNameAr: string;
  firstNameEn: string;
  lastNameEn: string;
  preferredName: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female';
  phone: string;
  secondaryPhone?: string;
  email?: string;
  address?: string;
  emergencyContact: string;
  occupation?: string;
  referralSource: string;
  generalMedicalNotes: string;
  allergies: string;
  medications: string;
  createdAt: string;
  updatedAt: string;
  status: EntityStatus;
}

// 2. ORTHODONTIC CASE ENTITY
export type P0CaseType =
  | 'New Case'
  | 'Comprehensive'
  | 'Limited'
  | 'Interceptive'
  | 'Orthopedic'
  | 'Surgical-Orthodontic'
  | 'Retreatment'
  | 'Retention'
  | 'Consultation Only';

export type P0TreatmentStatus =
  | 'Consultation'
  | 'Records'
  | 'Diagnosis'
  | 'Treatment Planning'
  | 'Active Treatment'
  | 'Finishing'
  | 'Debond'
  | 'Retention'
  | 'Completed'
  | 'Discontinued'
  | 'Transferred';

export interface P0OrthodonticCaseEntity {
  caseId: string;
  caseCode: string;
  patientId: string; // Foreign Key -> P0PatientEntity.patientId
  caseType: P0CaseType;
  chiefComplaintAr: string;
  chiefComplaintEn: string;
  referralReason: string;
  consultationDate: string;
  startDate: string;
  estimatedEndDate: string;
  actualEndDate?: string;
  treatmentStatus: P0TreatmentStatus;
  treatmentStage: 'T0_Initial' | 'T1_Progress' | 'T2_PreFinishing' | 'T3_Final' | 'T4_Retention';
  treatingDoctorId: string;
  clinicId: string;
  primaryDiagnosisId: string; // Foreign Key -> P0DiagnosisEntity.diagnosisId
  activeTreatmentPlanId: string; // Foreign Key -> P0TreatmentPlanEntity.planId
  retentionStatus: 'Not Started' | 'Active Dual Retention' | 'Follow-up';
  createdAt: string;
  updatedAt: string;
}

// 3. CLINICAL RECORD ENTITY (Separated from Case, linked via caseId & visitId)
export type P0ClinicalRecordType =
  | 'Medical History'
  | 'Dental History'
  | 'Extraoral Examination'
  | 'Intraoral Examination'
  | 'Occlusal Examination'
  | 'Skeletal Assessment'
  | 'Functional & TMJ Examination'
  | 'Periodontal Examination'
  | 'Airway & CBCT Assessment';

export interface P0ClinicalRecordEntity {
  recordId: string;
  caseId: string;
  visitId?: string;
  recordDate: string;
  clinicianId: string;
  recordType: P0ClinicalRecordType;
  status: 'Draft' | 'Confirmed';
  structuredFindings: Record<string, StructuredFindingValue<string | number>>;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// 4. PROBLEM LIST ENTITY (Finding ≠ Problem; links to TreatmentObjective)
export type P0ProblemCategory =
  | 'Skeletal'
  | 'Dental'
  | 'Occlusal'
  | 'Soft Tissue'
  | 'Functional'
  | 'Airway'
  | 'Periodontal'
  | 'Esthetic';

export interface P0ProblemEntity {
  problemId: string;
  caseId: string;
  category: P0ProblemCategory;
  isActualProblem: boolean; // False = Normal/Positive Finding (no treatment required)
  titleAr: string;
  titleEn: string;
  severity: 'Normal' | 'Mild' | 'Moderate' | 'Severe';
  priority: 1 | 2 | 3 | 4;
  status: 'Active' | 'Resolved' | 'Improved' | 'Persistent' | 'Not Applicable';
  evidenceRecordIds: string[];
  treatmentRequired: boolean;
  treatmentObjectiveId?: string; // Foreign Key -> P0TreatmentObjectiveEntity.objectiveId
  createdAt: string;
  updatedAt: string;
}

// 5. TREATMENT OBJECTIVE ENTITY
export interface P0TreatmentObjectiveEntity {
  objectiveId: string;
  caseId: string;
  problemId: string; // Foreign Key -> P0ProblemEntity.problemId
  category: P0ProblemCategory;
  descriptionAr: string;
  descriptionEn: string;
  priority: 1 | 2 | 3;
  measurableTarget: string; // e.g., "Reduce Overjet from 7.5mm to 2.0-2.5mm"
  status: 'Achieved' | 'Partially Achieved' | 'In Progress' | 'Not Achieved';
  outcomeNotesAr: string;
  outcomeNotesEn: string;
}

// 6. VERSIONED DIAGNOSIS ENTITY (Diagnosis V1 -> V2 -> V3)
export interface P0DiagnosisVersionEntity {
  diagnosisId: string;
  caseId: string;
  version: number;
  skeletalDiagnosisAr: string;
  skeletalDiagnosisEn: string;
  dentalDiagnosisAr: string;
  dentalDiagnosisEn: string;
  occlusalDiagnosisAr: string;
  occlusalDiagnosisEn: string;
  softTissueDiagnosisAr: string;
  softTissueDiagnosisEn: string;
  functionalDiagnosisAr: string;
  overallDiagnosisAr: string;
  overallDiagnosisEn: string;
  changeReasonAr: string;
  changeReasonEn: string;
  supportingEvidenceSummary: string;
  confidence: 'Confirmed by Doctor' | 'Likely' | 'Preliminary';
  status: 'Active Approved' | 'Superseded (Historical Version)' | 'Draft';
  createdBy: string;
  createdAt: string;
  approvedAt: string;
}

// 7. VERSIONED TREATMENT PLAN ENTITY (Plan V1 -> V2, never deletes historical plans)
export interface P0TreatmentPlanVersionEntity {
  planId: string;
  caseId: string;
  version: number;
  optionLabel: 'Option A' | 'Option B' | 'Option C';
  titleAr: string;
  titleEn: string;
  rationaleAr: string;
  rationaleEn: string;
  linkedObjectiveIds: string[];
  biomechanicsSummary: string;
  appliances: string;
  extractions: string;
  anchorage: string;
  estimatedDurationMonths: number;
  risksAndLimitationsAr: string;
  retentionPlanAr: string;
  changeReasonAr?: string;
  status: 'Draft' | 'Proposed' | 'Discussed' | 'Selected & Approved' | 'Superseded';
  approvedAt?: string;
}

// 8. CEPHALOMETRIC STUDY & LANDMARK ENTITIES
export interface P0CephalometricLandmark {
  landmarkId: string;
  code: string;
  name: string;
  x: number;
  y: number;
  confidencePercent: number;
  source: 'Manual' | 'AI' | 'Corrected';
  reviewedByDoctor: boolean;
}

export interface P0CephalometricStudyEntity {
  studyId: string;
  caseId: string;
  mediaId: string;
  stage: 'T0_Initial' | 'T1_Progress' | 'T2_PreFinishing' | 'T3_Final' | 'T4_Retention';
  date: string;
  landmarks: P0CephalometricLandmark[];
  measurements: Record<string, number>;
  analysesIncluded: ('Steiner' | 'Tweed' | 'Downs' | 'McNamara' | 'Ricketts' | 'Jarabak')[];
  clinicianReviewed: boolean;
  version: number;
}

// 9. MEDIA METADATA ENTITY (Decoupled from binary blobs via hash & filePath)
export interface P0MediaEntity {
  mediaId: string;
  caseId: string;
  patientId: string;
  visitId?: string;
  mediaType: 'Photograph' | 'X-Ray' | 'CBCT' | 'Cephalogram' | 'Intraoral Scan';
  category: string;
  stage: 'T0_Initial' | 'T1_Progress' | 'T3_Final' | 'T4_Retention';
  filePath: string;
  thumbnailPath: string;
  captureDate: string;
  sha256Hash: string;
  createdAt: string;
}

// 10. STOCK TRANSACTION & CASE MATERIAL CONSUMPTION
export interface P0StockTransactionEntity {
  transactionId: string;
  materialId: string;
  materialName: string;
  caseId?: string;
  visitId?: string;
  type: 'Purchase (In)' | 'Issue to Case (Out)' | 'Return' | 'Adjustment';
  quantity: number;
  unitCost: number;
  date: string;
  userId: string;
}

// 11. USER & RBAC SECURITY ENTITY
export interface P0UserEntity {
  userId: string;
  nameAr: string;
  nameEn: string;
  username: string;
  role: 'Orthodontist' | 'Assistant' | 'Reception' | 'Accountant' | 'Administrator' | 'Researcher';
  permissions: string[];
  clinicId: string;
  active: boolean;
}

// 12. NORMALIZED P0 DATABASE SNAPSHOT
export interface P0NormalizedDatabase {
  schemaVersion: string;
  patients: P0PatientEntity[];
  cases: P0OrthodonticCaseEntity[];
  clinicalRecords: P0ClinicalRecordEntity[];
  problems: P0ProblemEntity[];
  objectives: P0TreatmentObjectiveEntity[];
  diagnosisVersions: P0DiagnosisVersionEntity[];
  treatmentPlanVersions: P0TreatmentPlanVersionEntity[];
  cephalometricStudies: P0CephalometricStudyEntity[];
  mediaMetadata: P0MediaEntity[];
  stockTransactions: P0StockTransactionEntity[];
  users: P0UserEntity[];
}
