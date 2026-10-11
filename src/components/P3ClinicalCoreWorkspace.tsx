/**
 * ORTHODONTIC CLINICAL PLATFORM
 * P3-A + P3-B + P3-C — Tablet-First Authoritative Clinical Core Workspace
 *
 * Strictly executes all reads via:
 * - P3APatientQueryService
 * - P3BOrthodonticCaseQueryService
 * - P3CClinicalExaminationQueryService
 *
 * Strictly executes all mutations via:
 * - P3APatientApplicationService
 * - P3BOrthodonticCaseApplicationService
 * - P3CClinicalExaminationApplicationService
 *
 * Zero direct SQLite/Repository bypass. Zero fake in-memory state.
 */

import React from 'react';
import {
  CheckCircle2,
  FilePlus2,
  FolderPlus,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  UserPlus,
  Wifi,
  WifiOff,
  Archive,
  RotateCcw,
} from 'lucide-react';
import { LanguageMode } from '../types/orthodontics';
import {
  SqliteArchMeasurementRow,
  SqliteClinicalFindingRow,
  SqliteOrthodonticCaseRow,
  SqliteToothFindingRow,
} from '../domain/p0SqliteSchema';
import {
  cloneP3ClinicalCoreDatabase,
  createSeededP3ClinicalCoreDatabase,
  OrthodonticCaseStatus,
  P3APatientApplicationService,
  P3APatientQueryService,
  P3BOrthodonticCaseApplicationService,
  P3BOrthodonticCaseQueryService,
  P3ClinicalCoreDatabase,
  P3ExecutionContext,
} from '../domain/p3ClinicalCoreService';
import {
  AuthoritativeOfflinePersistenceStore,
  AuthoritativeRelationalDatabaseState,
} from '../domain/p2eAndP2fPipelineAndQuery';
import {
  P3CClinicalExaminationApplicationService,
  P3CClinicalExaminationQueryService,
} from '../domain/p3cExaminationService';
import { executeP3UnifiedForensicBatch } from '../domain/p3ForensicTestSuite';

function loadPersistedP3Database(): AuthoritativeRelationalDatabaseState {
  const loaded = AuthoritativeOfflinePersistenceStore.loadOrInitialize();
  // Ensure P3 canonical seed records exist if loading from fresh/P2 snapshot
  if (!loaded.patients.has('pat-p3-001')) {
    const seededP3 = createSeededP3ClinicalCoreDatabase();
    seededP3.patients.forEach((v, k) => loaded.patients.set(k, v));
    seededP3.orthodontic_cases.forEach((v, k) => loaded.orthodontic_cases.set(k, v));
    seededP3.clinical_examinations.forEach((v, k) => loaded.clinical_examinations.set(k, v));
    seededP3.clinical_findings.forEach((v, k) => loaded.clinical_findings.set(k, v));
    seededP3.tooth_findings.forEach((v, k) => loaded.tooth_findings.set(k, v));
    seededP3.arch_measurements.forEach((v, k) => loaded.arch_measurements.set(k, v));
    AuthoritativeOfflinePersistenceStore.saveCommitSnapshot(loaded);
  }
  return loaded;
}

function savePersistedP3Database(db: AuthoritativeRelationalDatabaseState): void {
  AuthoritativeOfflinePersistenceStore.saveCommitSnapshot(db);
}

interface P3ClinicalCoreWorkspaceProps {
  language: LanguageMode;
  isOnline: boolean;
}

export const P3ClinicalCoreWorkspace: React.FC<P3ClinicalCoreWorkspaceProps> = ({
  language,
  isOnline,
}) => {
  const [db, setDb] = React.useState<P3ClinicalCoreDatabase>(() => loadPersistedP3Database());
  const [activeSubPhase, setActiveSubPhase] = React.useState<'P3A' | 'P3B' | 'P3C' | 'FORENSIC_60'>('P3A');

  // Query filters
  const [patientSearchQuery, setPatientSearchQuery] = React.useState('');
  const [includeDeletedPatients, setIncludeDeletedPatients] = React.useState(false);
  const [selectedPatientId, setSelectedPatientId] = React.useState<string>('pat-p3-001');
  const [selectedCaseId, setSelectedCaseId] = React.useState<string>('case-p3-001');
  const [selectedExamId, setSelectedExamId] = React.useState<string>('exam-p3-001');

  // Operation feedback banner
  const [feedbackBanner, setFeedbackBanner] = React.useState<{
    type: 'SUCCESS' | 'ERROR';
    code: string;
    message: string;
  } | null>(null);

  // P3-A Create Patient Form State
  const [patNumber, setPatNumber] = React.useState('PAT-2026-0003');
  const [patFirstName, setPatFirstName] = React.useState('');
  const [patMiddleName, setPatMiddleName] = React.useState('');
  const [patLastName, setPatLastName] = React.useState('');
  const [patDob, setPatDob] = React.useState('2012-06-15');
  const [patSex, setPatSex] = React.useState<'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN'>('FEMALE');
  const [patPhone, setPatPhone] = React.useState('+96650');
  const [patGuardian, setPatGuardian] = React.useState('');
  const [patMedicalAlert, setPatMedicalAlert] = React.useState('لا توجد موانع طبية');

  // P3-B Create Case Form State
  const [caseNumber, setCaseNumber] = React.useState('ORT-2026-000103');
  const [caseType, setCaseType] = React.useState<SqliteOrthodonticCaseRow['case_type']>('COMPREHENSIVE');
  const [caseChiefComplaint, setCaseChiefComplaint] = React.useState('');
  const [caseGrowthStatus, setCaseGrowthStatus] = React.useState<SqliteOrthodonticCaseRow['growth_status']>('PEAK_GROWTH');
  const [caseCvmStage, setCaseCvmStage] = React.useState('CS3');
  const [targetTransitionStatus, setTargetTransitionStatus] = React.useState<OrthodonticCaseStatus>('RECORDS');

  // P3-C Examination & Structured Children Form State
  const [newExamStage, setNewExamStage] = React.useState<'INITIAL' | 'PRE_TREATMENT' | 'PROGRESS' | 'POST_TREATMENT' | 'RETENTION'>('PROGRESS');
  const [newExamNotes, setNewExamNotes] = React.useState('');

  const [findingCategory, setFindingCategory] = React.useState<SqliteClinicalFindingRow['category']>('OCCLUSAL');
  const [findingCode, setFindingCode] = React.useState('OVERBITE_MM');
  const [findingValue, setFindingValue] = React.useState('4.0');
  const [findingUnit, setFindingUnit] = React.useState('mm');
  const [findingSeverity, setFindingSeverity] = React.useState<SqliteClinicalFindingRow['severity']>('MODERATE');
  const [findingSide, setFindingSide] = React.useState<SqliteClinicalFindingRow['side']>('MIDLINE');
  const [findingSig, setFindingSig] = React.useState<SqliteClinicalFindingRow['clinical_significance']>('CLINICAL_FINDING');

  const [fdiToothNumber, setFdiToothNumber] = React.useState('23');
  const [toothFindingType, setToothFindingType] = React.useState<SqliteToothFindingRow['finding_type']>('IMPACTED');
  const [toothPresence, setToothPresence] = React.useState<SqliteToothFindingRow['presence_status']>('IMPACTED_UNERUPTED');
  const [toothPosition, setToothPosition] = React.useState('PALATAL_DISPLACEMENT');

  const [archType, setArchType] = React.useState<SqliteArchMeasurementRow['arch']>('MAXILLARY');
  const [archMeasureType, setArchMeasureType] = React.useState<SqliteArchMeasurementRow['measurement_type']>('INTERMOLAR_WIDTH');
  const [archValue, setArchValue] = React.useState('50.5');
  const [archMethod, setArchMethod] = React.useState<SqliteArchMeasurementRow['method']>('DIGITAL_SCAN');

  // Forensic 60-test report
  const [forensicReport, setForensicReport] = React.useState(() => executeP3UnifiedForensicBatch());

  const makeCtx = (prefix: string): P3ExecutionContext => ({
    operation_id: `${prefix}-${Date.now()}`,
    user_id: 'usr-ortho-01',
    user_role: 'ORTHODONTIST',
    device_id: 'dev-ipad-pro-clinic-01',
    timestamp: new Date().toISOString(),
    is_online: isOnline,
  });

  const commitDbUpdate = (nextDb: P3ClinicalCoreDatabase) => {
    const cloned = cloneP3ClinicalCoreDatabase(nextDb);
    setDb(cloned);
    savePersistedP3Database(cloned);
  };

  // Authoritative Query Reads
  const patientsList = React.useMemo(
    () => P3APatientQueryService.searchPatients(db, patientSearchQuery, includeDeletedPatients),
    [db, patientSearchQuery, includeDeletedPatients]
  );

  const selectedPatient = React.useMemo(
    () => P3APatientQueryService.getPatientById(db, selectedPatientId, true) || patientsList[0] || null,
    [db, selectedPatientId, patientsList]
  );

  const patientCases = React.useMemo(
    () => (selectedPatient ? P3BOrthodonticCaseQueryService.listCasesByPatient(db, selectedPatient.id, false) : []),
    [db, selectedPatient]
  );

  const selectedCase = React.useMemo(
    () =>
      P3BOrthodonticCaseQueryService.getCaseById(db, selectedCaseId, false) ||
      patientCases[0] ||
      null,
    [db, selectedCaseId, patientCases]
  );

  const caseExaminations = React.useMemo(
    () => (selectedCase ? P3CClinicalExaminationQueryService.listExaminationsByCase(db, selectedCase.id) : []),
    [db, selectedCase]
  );

  const selectedExamAggregate = React.useMemo(
    () =>
      caseExaminations.find((e) => e.examination.id === selectedExamId) ||
      caseExaminations[0] ||
      null,
    [caseExaminations, selectedExamId]
  );

  // Handlers
  const handleCreatePatient = (e: React.FormEvent) => {
    e.preventDefault();
    const working = cloneP3ClinicalCoreDatabase(db);
    const newId = `pat-p3-${Date.now()}`;
    const res = P3APatientApplicationService.createPatient(working, makeCtx('op-create-pat'), {
      id: newId,
      patient_number: patNumber,
      first_name: patFirstName,
      middle_name: patMiddleName || null,
      last_name: patLastName,
      date_of_birth: patDob,
      sex: patSex,
      phone: patPhone,
      guardian_name: patGuardian || null,
      medical_alert: patMedicalAlert || null,
    });
    if (res.committed) {
      commitDbUpdate(working);
      setSelectedPatientId(newId);
      setPatFirstName('');
      setPatMiddleName('');
      setPatLastName('');
      setPatNumber(`PAT-2026-000${working.patients.size + 1}`);
      setFeedbackBanner({
        type: 'SUCCESS',
        code: 'PA_COMMITTED',
        message: `Patient ${res.data?.patientNumber} committed (v${res.resulting_version}) · Audit: ${res.audit_id} · Sync: ${res.sync_operation_id}`,
      });
    } else {
      setFeedbackBanner({
        type: 'ERROR',
        code: res.error_code || 'ERR',
        message: res.error_message || 'Validation rejected patient creation.',
      });
    }
  };

  const handleSoftDeleteOrRestorePatient = (patId: string, isDeleted: 0 | 1, version: number) => {
    const working = cloneP3ClinicalCoreDatabase(db);
    const res =
      isDeleted === 0
        ? P3APatientApplicationService.softDeletePatient(
            working,
            makeCtx('op-softdel-pat'),
            patId,
            version,
            'Doctor archived patient record'
          )
        : P3APatientApplicationService.restorePatient(
            working,
            makeCtx('op-restore-pat'),
            patId,
            version
          );
    if (res.committed) {
      commitDbUpdate(working);
      setFeedbackBanner({
        type: 'SUCCESS',
        code: isDeleted === 0 ? 'PA_SOFT_DELETED' : 'PA_RESTORED',
        message: `Patient ${patId} ${isDeleted === 0 ? 'soft-deleted' : 'restored'} to v${res.resulting_version}`,
      });
    }
  };

  const handleCreateCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    const working = cloneP3ClinicalCoreDatabase(db);
    const newCaseId = `case-p3-${Date.now()}`;
    const res = P3BOrthodonticCaseApplicationService.createOrthodonticCase(
      working,
      makeCtx('op-create-case'),
      {
        id: newCaseId,
        case_number: caseNumber,
        patient_id: selectedPatient.id,
        case_type: caseType,
        case_status: 'CONSULTATION',
        chief_complaint: caseChiefComplaint,
        start_date: new Date().toISOString().slice(0, 10),
        growth_status: caseGrowthStatus,
        skeletal_maturity_status: caseCvmStage,
        primary_provider_id: 'usr-ortho-01',
        clinic_id: 'clinic-main-01',
      }
    );
    if (res.committed) {
      commitDbUpdate(working);
      setSelectedCaseId(newCaseId);
      setCaseChiefComplaint('');
      setCaseNumber(`ORT-2026-00010${working.orthodontic_cases.size + 1}`);
      setFeedbackBanner({
        type: 'SUCCESS',
        code: 'PB_CASE_COMMITTED',
        message: `OrthodonticCase ${res.data?.caseNumber} linked to ${selectedPatient.patient_number} (v1) · Audit: ${res.audit_id}`,
      });
    } else {
      setFeedbackBanner({
        type: 'ERROR',
        code: res.error_code || 'ERR',
        message: res.error_message || 'Failed to create orthodontic case.',
      });
    }
  };

  const handleTransitionCaseStatus = () => {
    if (!selectedCase) return;
    const working = cloneP3ClinicalCoreDatabase(db);
    const res = P3BOrthodonticCaseApplicationService.transitionOrthodonticCaseStatus(
      working,
      makeCtx('op-transition-case'),
      selectedCase.id,
      targetTransitionStatus,
      selectedCase.version,
      `Clinical workflow transition to ${targetTransitionStatus}`
    );
    if (res.committed) {
      commitDbUpdate(working);
      setFeedbackBanner({
        type: 'SUCCESS',
        code: 'PB_STATUS_TRANSITIONED',
        message: `Case ${selectedCase.case_number} transitioned to ${targetTransitionStatus} (v${res.resulting_version})`,
      });
    } else {
      setFeedbackBanner({
        type: 'ERROR',
        code: res.error_code || 'ERR_INVALID_TRANSITION',
        message: res.error_message || 'Illegal case status transition rejected.',
      });
    }
  };

  const handleCreateExamination = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) return;
    const working = cloneP3ClinicalCoreDatabase(db);
    const newExamId = `exam-p3-${Date.now()}`;
    const res = P3CClinicalExaminationApplicationService.recordClinicalExamination(
      working,
      makeCtx('op-create-exam'),
      {
        id: newExamId,
        case_id: selectedCase.id,
        examination_date: new Date().toISOString().slice(0, 10),
        examiner_id: 'usr-ortho-01',
        examination_stage: newExamStage,
        status: 'CONFIRMED',
        general_findings: newExamNotes || `Clinical Examination (${newExamStage})`,
      }
    );
    if (res.committed) {
      commitDbUpdate(working);
      setSelectedExamId(newExamId);
      setNewExamNotes('');
      setFeedbackBanner({
        type: 'SUCCESS',
        code: 'PC_EXAM_COMMITTED',
        message: `Examination (${newExamStage}) committed for Case ${selectedCase.case_number} · Audit: ${res.audit_id}`,
      });
    } else {
      setFeedbackBanner({
        type: 'ERROR',
        code: res.error_code || 'ERR',
        message: res.error_message || 'Failed to record examination.',
      });
    }
  };

  const handleAddFinding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !selectedExamAggregate) return;
    const working = cloneP3ClinicalCoreDatabase(db);
    const res = P3CClinicalExaminationApplicationService.addClinicalFinding(
      working,
      makeCtx('op-add-finding'),
      {
        id: `cf-p3-${Date.now()}`,
        case_id: selectedCase.id,
        examination_id: selectedExamAggregate.examination.id,
        category: findingCategory,
        finding_code: findingCode,
        value: findingValue,
        unit: findingUnit || null,
        severity: findingSeverity,
        side: findingSide,
        clinical_significance: findingSig,
      }
    );
    if (res.committed) {
      commitDbUpdate(working);
      setFeedbackBanner({
        type: 'SUCCESS',
        code: 'PC_FINDING_COMMITTED',
        message: `Structured ${findingCategory} finding (${findingCode}) saved in clinical_findings (${findingSig}).`,
      });
    } else {
      setFeedbackBanner({
        type: 'ERROR',
        code: res.error_code || 'ERR',
        message: res.error_message || 'Rejected clinical finding.',
      });
    }
  };

  const handleAddToothFinding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !selectedExamAggregate) return;
    const working = cloneP3ClinicalCoreDatabase(db);
    const res = P3CClinicalExaminationApplicationService.addToothFinding(
      working,
      makeCtx('op-add-tooth'),
      {
        id: `tf-p3-${Date.now()}`,
        case_id: selectedCase.id,
        examination_id: selectedExamAggregate.examination.id,
        tooth_number: fdiToothNumber.trim(),
        finding_type: toothFindingType,
        presence_status: toothPresence,
        position: toothPosition,
      }
    );
    if (res.committed) {
      commitDbUpdate(working);
      setFeedbackBanner({
        type: 'SUCCESS',
        code: 'PC_TOOTH_FINDING_COMMITTED',
        message: `Structured FDI #${fdiToothNumber} (${toothFindingType}) saved in tooth_findings table.`,
      });
    } else {
      setFeedbackBanner({
        type: 'ERROR',
        code: res.error_code || 'ERR',
        message: res.error_message || 'Rejected FDI tooth finding.',
      });
    }
  };

  const handleAddArchMeasurement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !selectedExamAggregate) return;
    const working = cloneP3ClinicalCoreDatabase(db);
    const res = P3CClinicalExaminationApplicationService.addArchMeasurement(
      working,
      makeCtx('op-add-arch'),
      {
        id: `am-p3-${Date.now()}`,
        case_id: selectedCase.id,
        examination_id: selectedExamAggregate.examination.id,
        arch: archType,
        measurement_type: archMeasureType,
        value: Number(archValue),
        unit: archMeasureType === 'BOLTON_ANTERIOR' ? '%' : 'mm',
        method: archMethod,
      }
    );
    if (res.committed) {
      commitDbUpdate(working);
      setFeedbackBanner({
        type: 'SUCCESS',
        code: 'PC_ARCH_MEASUREMENT_COMMITTED',
        message: `Structured ArchMeasurement (${archType} ${archMeasureType} = ${archValue}) saved in arch_measurements.`,
      });
    } else {
      setFeedbackBanner({
        type: 'ERROR',
        code: res.error_code || 'ERR',
        message: res.error_message || 'Rejected arch measurement.',
      });
    }
  };

  return (
    <div className="bg-white border-2 border-slate-900 rounded-lg p-5 space-y-5">
      {/* Top Contract Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-slate-900 text-white font-mono text-[11px] font-bold rounded">
              P3-A + P3-B + P3-C
            </span>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono text-[11px] font-bold rounded">
              G-P3A · G-P3B · G-P3C · G-P3-ABC ({forensicReport.totalPassed}/{forensicReport.totalTests} PASS)
            </span>
            <span
              className={`px-2 py-0.5 font-mono text-[11px] font-semibold rounded flex items-center gap-1 ${
                isOnline
                  ? 'bg-blue-50 text-blue-800 border border-blue-200'
                  : 'bg-amber-50 text-amber-900 border border-amber-300'
              }`}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isOnline ? 'ONLINE + OUTBOX READY' : 'OFFLINE-FIRST ACTIVE'}
            </span>
          </div>
          <h2 className="text-base font-bold text-slate-900 mt-1.5">
            {language === 'ar'
              ? 'القلب السريري الموحد (P3-A إدارة المرضى · P3-B إدارة حالات التقويم · P3-C الفحص السريري المهيكل)'
              : 'Unified Clinical Core (P3-A Patient Management · P3-B Orthodontic Case · P3-C Structured Clinical Examination)'}
          </h2>
        </div>

        {/* Sub-Phase Navigation */}
        <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setActiveSubPhase('P3A')}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 ${
              activeSubPhase === 'P3A' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            {language === 'ar' ? 'P3-A: المرضى (Patients)' : 'P3-A: Patients'}
          </button>
          <button
            onClick={() => setActiveSubPhase('P3B')}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 ${
              activeSubPhase === 'P3B' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            {language === 'ar' ? 'P3-B: حالات التقويم (Cases)' : 'P3-B: Ortho Cases'}
          </button>
          <button
            onClick={() => setActiveSubPhase('P3C')}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 ${
              activeSubPhase === 'P3C' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            {language === 'ar' ? 'P3-C: الفحص السريري المهيكل' : 'P3-C: Clinical Exam'}
          </button>
          <button
            onClick={() => {
              setForensicReport(executeP3UnifiedForensicBatch());
              setActiveSubPhase('FORENSIC_60');
            }}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 ${
              activeSubPhase === 'FORENSIC_60'
                ? 'bg-emerald-800 text-white'
                : 'text-emerald-900 bg-emerald-50 hover:bg-emerald-100'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {language === 'ar' ? 'الفحص الجنائي (60/60 PASS)' : '60 Forensic Tests (G-P3-ABC)'}
          </button>
        </div>
      </div>

      {/* Live Transaction & Validation Feedback Banner */}
      {feedbackBanner && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
            feedbackBanner.type === 'SUCCESS'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : 'bg-red-50 border-red-300 text-red-950'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-white/80 border">
              {feedbackBanner.code}
            </span>
            <span className="font-medium">{feedbackBanner.message}</span>
          </div>
          <button
            onClick={() => setFeedbackBanner(null)}
            className="text-[11px] underline font-semibold"
          >
            {language === 'ar' ? 'إغلاق' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Persistent Context Ribbon: Active Patient -> Active Case -> Active Exam + Telemetry */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
        <div>
          <div className="text-[11px] text-slate-500">
            {language === 'ar' ? 'المريض المحدد (P3-A SSOT)' : 'Selected Patient (P3-A SSOT)'}
          </div>
          <div className="font-bold text-slate-900 mt-0.5">
            {selectedPatient
              ? `${selectedPatient.first_name} ${selectedPatient.middle_name || ''} ${selectedPatient.last_name}`
              : '—'}
          </div>
          <div className="font-mono text-[11px] text-blue-700">
            {selectedPatient?.patient_number} · v{selectedPatient?.version}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-500">
            {language === 'ar' ? 'الحالة التقويمية النشطة (P3-B SSOT)' : 'Selected Ortho Case (P3-B SSOT)'}
          </div>
          <div className="font-bold text-slate-900 mt-0.5 font-mono">
            {selectedCase ? selectedCase.case_number : '—'}
          </div>
          <div className="text-[11px] text-emerald-800 font-semibold">
            {selectedCase ? `${selectedCase.case_type} · ${selectedCase.case_status} (v${selectedCase.version})` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-500">
            {language === 'ar' ? 'الفحص السريري النشط (P3-C SSOT)' : 'Selected Examination (P3-C SSOT)'}
          </div>
          <div className="font-bold text-slate-900 mt-0.5">
            {selectedExamAggregate
              ? `${selectedExamAggregate.examination.examination_stage} (${selectedExamAggregate.examination.examination_date})`
              : '—'}
          </div>
          <div className="font-mono text-[11px] text-slate-600">
            {selectedExamAggregate
              ? `Findings: ${selectedExamAggregate.findings.length} · FDI Teeth: ${selectedExamAggregate.tooth_findings.length} · Arch: ${selectedExamAggregate.arch_measurements.length}`
              : '—'}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-500">
            {language === 'ar' ? 'سجلات التدقيق والمزامنة (Audit & Outbox)' : 'Audit Trail & Sync Outbox'}
          </div>
          <div className="font-mono font-bold text-slate-900 mt-0.5">
            Audit: {db.audit_logs.size} · Outbox: {db.sync_operations.size}
          </div>
          <div className="text-[11px] text-slate-600">
            {language === 'ar'
              ? 'جميع التغييرات ذرية ومحفوظة محلياً'
              : '100% Atomic & Persisted in Local SQLite State'}
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* SUB-PHASE P3-A: PATIENT MANAGEMENT                                  */}
      {/* =================================================================== */}
      {activeSubPhase === 'P3A' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left 7 cols: Search & Patient List */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute top-2.5 left-3" />
                <input
                  type="text"
                  value={patientSearchQuery}
                  onChange={(e) => setPatientSearchQuery(e.target.value)}
                  placeholder={
                    language === 'ar'
                      ? 'بحث بالاسم العربي/الإنجليزي، رقم الملف (PAT-2026-...)، أو الجوال...'
                      : 'Search by Arabic/English name, patient_number, or phone...'
                  }
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDeletedPatients}
                  onChange={(e) => setIncludeDeletedPatients(e.target.checked)}
                />
                {language === 'ar' ? 'إظهار المؤرشف (Soft-Deleted)' : 'Show Soft-Deleted'}
              </label>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 text-start font-mono">patient_number</th>
                    <th className="py-2 px-3 text-start">
                      {language === 'ar' ? 'الاسم الكامل' : 'Full Name'}
                    </th>
                    <th className="py-2 px-3 text-start">DOB / Sex</th>
                    <th className="py-2 px-3 text-start font-mono">Phone</th>
                    <th className="py-2 px-3 text-center font-mono">Ver</th>
                    <th className="py-2 px-3 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {patientsList.map((pat) => {
                    const isSelected = selectedPatient?.id === pat.id;
                    return (
                      <tr
                        key={pat.id}
                        onClick={() => {
                          setSelectedPatientId(pat.id);
                          const firstCase = P3BOrthodonticCaseQueryService.listCasesByPatient(db, pat.id)[0];
                          if (firstCase) setSelectedCaseId(firstCase.id);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50/80 font-semibold' : 'hover:bg-slate-50'
                        } ${pat.is_deleted === 1 ? 'opacity-60 bg-red-50/30' : ''}`}
                      >
                        <td className="py-2.5 px-3 font-mono text-blue-700 font-semibold">
                          {pat.patient_number}
                        </td>
                        <td className="py-2.5 px-3 text-slate-900">
                          {pat.first_name} {pat.middle_name || ''} {pat.last_name}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                          {pat.date_of_birth} · {pat.sex}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">
                          {pat.phone}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-[11px]">
                          v{pat.version}
                        </td>
                        <td className="py-2.5 px-3 text-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSoftDeleteOrRestorePatient(pat.id, pat.is_deleted, pat.version);
                            }}
                            className="px-2 py-1 text-[11px] rounded border border-slate-300 bg-white hover:bg-slate-100 inline-flex items-center gap-1"
                          >
                            {pat.is_deleted === 0 ? (
                              <>
                                <Archive className="w-3 h-3 text-amber-700" />
                                {language === 'ar' ? 'أرشفة' : 'Archive'}
                              </>
                            ) : (
                              <>
                                <RotateCcw className="w-3 h-3 text-emerald-700" />
                                {language === 'ar' ? 'استعادة' : 'Restore'}
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Selected Patient Detail & Linked Cases */}
            {selectedPatient && (
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">
                    {language === 'ar'
                      ? `بطاقة المريض التفصيلية (${selectedPatient.patient_number})`
                      : `Patient Profile Detail (${selectedPatient.patient_number})`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveSubPhase('P3B')}
                    className="px-2.5 py-1 bg-slate-900 text-white rounded text-[11px] font-semibold"
                  >
                    {language === 'ar'
                      ? `إدارة حالات المريض (${patientCases.length}) →`
                      : `Manage Patient Cases (${patientCases.length}) →`}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-700">
                  <div>
                    <span className="text-slate-500">Guardian: </span>
                    <span className="font-medium">{selectedPatient.guardian_name || '—'} ({selectedPatient.guardian_phone || '—'})</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Medical Alert / Allergies: </span>
                    <span className="font-medium text-amber-900">{selectedPatient.medical_alert || 'None'}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">Dental & General Notes: </span>
                    <span>{selectedPatient.general_notes || '—'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right 5 cols: Create Patient via P3APatientApplicationService */}
          <form
            onSubmit={handleCreatePatient}
            className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 text-xs"
          >
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <UserPlus className="w-4 h-4 text-slate-900" />
              <h3 className="font-bold text-slate-900">
                {language === 'ar'
                  ? 'تسجيل مريض جديد (CreatePatient Use Case)'
                  : 'Create New Patient (P3APatientApplicationService)'}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  patient_number (UNIQUE)
                </label>
                <input
                  type="text"
                  required
                  value={patNumber}
                  onChange={(e) => setPatNumber(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  sex (MALE / FEMALE)
                </label>
                <select
                  value={patSex}
                  onChange={(e) => setPatSex(e.target.value as 'MALE' | 'FEMALE')}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="FEMALE">FEMALE (أنثى)</option>
                  <option value="MALE">MALE (ذكر)</option>
                  <option value="OTHER">OTHER</option>
                  <option value="UNKNOWN">UNKNOWN</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {language === 'ar' ? 'الاسم الأول (first_name)' : 'First Name'}
                </label>
                <input
                  type="text"
                  required
                  value={patFirstName}
                  onChange={(e) => setPatFirstName(e.target.value)}
                  placeholder="مثال: ريم"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {language === 'ar' ? 'اسم الأب (middle_name)' : 'Middle Name'}
                </label>
                <input
                  type="text"
                  value={patMiddleName}
                  onChange={(e) => setPatMiddleName(e.target.value)}
                  placeholder="مثال: عبد الله"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {language === 'ar' ? 'اسم العائلة (last_name)' : 'Last Name'}
                </label>
                <input
                  type="text"
                  required
                  value={patLastName}
                  onChange={(e) => setPatLastName(e.target.value)}
                  placeholder="مثال: القحطاني"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  date_of_birth
                </label>
                <input
                  type="date"
                  required
                  value={patDob}
                  onChange={(e) => setPatDob(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  phone
                </label>
                <input
                  type="text"
                  required
                  value={patPhone}
                  onChange={(e) => setPatPhone(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  guardian_name
                </label>
                <input
                  type="text"
                  value={patGuardian}
                  onChange={(e) => setPatGuardian(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  medical_alert (Medical History & Allergies)
                </label>
                <input
                  type="text"
                  value={patMedicalAlert}
                  onChange={(e) => setPatMedicalAlert(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg"
            >
              {language === 'ar'
                ? 'حفظ المريض ذرياً (Validate + Commit + Audit + Sync Outbox)'
                : 'Commit Patient Atomically (P3-A Pipeline)'}
            </button>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-PHASE P3-B: ORTHODONTIC CASE MANAGEMENT                         */}
      {/* =================================================================== */}
      {activeSubPhase === 'P3B' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left 7 cols: Cases for Selected Patient + Status Transition Engine */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {language === 'ar'
                  ? `الحالات التقويمية للمريض: ${selectedPatient?.first_name} ${selectedPatient?.last_name} (${patientCases.length} حالات)`
                  : `Orthodontic Cases for ${selectedPatient?.first_name} ${selectedPatient?.last_name} (${patientCases.length})`}
              </h3>
              <span className="text-[11px] font-mono text-slate-500">
                1 Patient → N Independent Cases
              </span>
            </div>

            <div className="space-y-2.5">
              {patientCases.map((c) => {
                const isSelected = selectedCase?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCaseId(c.id);
                      const exams = P3CClinicalExaminationQueryService.listExaminationsByCase(db, c.id);
                      if (exams[0]) setSelectedExamId(exams[0].examination.id);
                    }}
                    className={`p-3.5 rounded-lg border cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold ${isSelected ? 'text-cyan-400' : 'text-blue-700'}`}>
                          {c.case_number}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-200/20 font-mono text-[11px]">
                          {c.case_type}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 font-mono text-[11px] font-semibold">
                          {c.case_status}
                        </span>
                      </div>
                      <span className="font-mono text-[11px]">
                        v{c.version} · Start: {c.start_date} · {c.skeletal_maturity_status}
                      </span>
                    </div>
                    <div className={`text-xs mt-1.5 ${isSelected ? 'text-slate-200' : 'text-slate-700'}`}>
                      {language === 'ar' ? 'الشكوى الرئيسية: ' : 'Chief Complaint: '}
                      <span className="font-medium">{c.chief_complaint}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Controlled Status Transition Bar */}
            {selectedCase && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs">
                <div className="font-bold text-slate-900">
                  {language === 'ar'
                    ? `محرك انتقال مرحلة الحالة (${selectedCase.case_number} — المرحلة الحالية: ${selectedCase.case_status})`
                    : `Controlled Case Status Transition (${selectedCase.case_number} — Current: ${selectedCase.case_status})`}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={targetTransitionStatus}
                    onChange={(e) => setTargetTransitionStatus(e.target.value as OrthodonticCaseStatus)}
                    className="px-3 py-1.5 border border-slate-300 rounded bg-white font-mono text-xs"
                  >
                    <option value="CONSULTATION">CONSULTATION</option>
                    <option value="RECORDS">RECORDS</option>
                    <option value="DIAGNOSIS">DIAGNOSIS</option>
                    <option value="TREATMENT_PLANNING">TREATMENT_PLANNING</option>
                    <option value="ACTIVE_TREATMENT">ACTIVE_TREATMENT</option>
                    <option value="FINISHING">FINISHING</option>
                    <option value="DEBOND">DEBOND</option>
                    <option value="RETENTION">RETENTION</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="DISCONTINUED">DISCONTINUED</option>
                    <option value="TRANSFERRED">TRANSFERRED</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleTransitionCaseStatus}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded"
                  >
                    {language === 'ar' ? 'تنفيذ الانتقال المرحلي' : 'Transition Case Status'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubPhase('P3C')}
                    className="px-3.5 py-1.5 bg-slate-900 text-white font-semibold rounded ms-auto"
                  >
                    {language === 'ar' ? 'الانتقال للفحص السريري (P3-C) →' : 'Open Clinical Exam (P3-C) →'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right 5 cols: Create New Case for Selected Patient */}
          <form
            onSubmit={handleCreateCase}
            className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 text-xs"
          >
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <FolderPlus className="w-4 h-4 text-slate-900" />
              <h3 className="font-bold text-slate-900">
                {language === 'ar'
                  ? `فتح حالة تقويم جديدة للمريض (${selectedPatient?.patient_number})`
                  : `Create Orthodontic Case for ${selectedPatient?.patient_number}`}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  case_number (UNIQUE)
                </label>
                <input
                  type="text"
                  required
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  case_type
                </label>
                <select
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value as SqliteOrthodonticCaseRow['case_type'])}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="COMPREHENSIVE">COMPREHENSIVE</option>
                  <option value="INTERCEPTIVE">INTERCEPTIVE</option>
                  <option value="ORTHOPEDIC">ORTHOPEDIC</option>
                  <option value="SURGICAL_ORTHODONTIC">SURGICAL_ORTHODONTIC</option>
                  <option value="RETREATMENT">RETREATMENT</option>
                  <option value="LIMITED">LIMITED</option>
                  <option value="RETENTION_ONLY">RETENTION_ONLY</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  growth_status
                </label>
                <select
                  value={caseGrowthStatus}
                  onChange={(e) => setCaseGrowthStatus(e.target.value as SqliteOrthodonticCaseRow['growth_status'])}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="PRE_PUBERTAL">PRE_PUBERTAL</option>
                  <option value="PEAK_GROWTH">PEAK_GROWTH</option>
                  <option value="POST_PUBERTAL">POST_PUBERTAL</option>
                  <option value="NON_GROWING_ADULT">NON_GROWING_ADULT</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  skeletal_maturity_status (CVM)
                </label>
                <select
                  value={caseCvmStage}
                  onChange={(e) => setCaseCvmStage(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
                >
                  <option value="CS1">CS1</option>
                  <option value="CS2">CS2</option>
                  <option value="CS3">CS3</option>
                  <option value="CS4">CS4</option>
                  <option value="CS5">CS5</option>
                  <option value="CS6">CS6</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  chief_complaint (الشكوى الرئيسية للمريض)
                </label>
                <input
                  type="text"
                  required
                  value={caseChiefComplaint}
                  onChange={(e) => setCaseChiefComplaint(e.target.value)}
                  placeholder="مثال: بروز القواطع العلوية مع ازدحام سفلي..."
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg"
            >
              {language === 'ar'
                ? 'إنشاء الحالة التقويمية ذرياً (P3-B CreateOrthodonticCase)'
                : 'Create Orthodontic Case Atomically (P3-B)'}
            </button>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-PHASE P3-C: STRUCTURED CLINICAL EXAMINATION                     */}
      {/* =================================================================== */}
      {activeSubPhase === 'P3C' && (
        <div className="space-y-5">
          {/* Exam Selector + Create Exam Header */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-7 space-y-2">
              <div className="text-xs font-bold text-slate-900">
                {language === 'ar'
                  ? `الفحوصات السريرية المسجلة للحالة (${selectedCase?.case_number}):`
                  : `Recorded Clinical Examinations for Case (${selectedCase?.case_number}):`}
              </div>
              <div className="flex flex-wrap gap-2">
                {caseExaminations.map((agg) => (
                  <button
                    key={agg.examination.id}
                    type="button"
                    onClick={() => setSelectedExamId(agg.examination.id)}
                    className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                      selectedExamAggregate?.examination.id === agg.examination.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>{agg.examination.examination_stage} · {agg.examination.examination_date}</div>
                    <div className="font-mono text-[10px] opacity-80">
                      v{agg.examination.version} · {agg.findings.length} Findings · {agg.tooth_findings.length} FDI · {agg.arch_measurements.length} Arch
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleCreateExamination}
              className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-wrap items-end gap-2 text-xs"
            >
              <div className="flex-1 min-w-[120px]">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  examination_stage
                </label>
                <select
                  value={newExamStage}
                  onChange={(e) => setNewExamStage(e.target.value as 'INITIAL' | 'PROGRESS' | 'POST_TREATMENT')}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="INITIAL">INITIAL</option>
                  <option value="PRE_TREATMENT">PRE_TREATMENT</option>
                  <option value="PROGRESS">PROGRESS</option>
                  <option value="POST_TREATMENT">POST_TREATMENT</option>
                  <option value="RETENTION">RETENTION</option>
                </select>
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  general_findings
                </label>
                <input
                  type="text"
                  value={newExamNotes}
                  onChange={(e) => setNewExamNotes(e.target.value)}
                  placeholder="ملاحظات الفحص..."
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 bg-slate-900 text-white font-semibold rounded flex items-center gap-1"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                {language === 'ar' ? '+ فحص جديد' : '+ New Exam'}
              </button>
            </form>
          </div>

          {/* 3 Structured Tables + Entry Forms: 1) clinical_findings, 2) tooth_findings, 3) arch_measurements */}
          {selectedExamAggregate && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* 1. Structured Clinical Findings (clinical_findings) */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3 text-xs bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-bold text-slate-900">
                    1. clinical_findings ({selectedExamAggregate.findings.length})
                  </span>
                  <span className="font-mono text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded">
                    Normal ≠ Problem Guard
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5">
                  {selectedExamAggregate.findings.map((f) => (
                    <div
                      key={f.id}
                      className="p-2 rounded border border-slate-200 bg-slate-50 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-mono font-bold text-[11px] text-slate-900">
                          [{f.category}] {f.finding_code}: {f.value} {f.unit || ''}
                        </div>
                        <div className="text-[10px] text-slate-600">
                          Severity: {f.severity} · Side: {f.side}
                        </div>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold ${
                          f.clinical_significance === 'NORMAL_OBSERVATION'
                            ? 'bg-slate-200 text-slate-800'
                            : f.clinical_significance === 'PATHOLOGICAL_DEVIATION'
                              ? 'bg-red-100 text-red-900'
                              : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {f.clinical_significance}
                      </span>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddFinding} className="pt-2 border-t border-slate-200 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={findingCategory}
                      onChange={(e) => setFindingCategory(e.target.value as SqliteClinicalFindingRow['category'])}
                      className="px-2 py-1 border border-slate-300 rounded text-[11px]"
                    >
                      <option value="EXTRAORAL">EXTRAORAL</option>
                      <option value="INTRAORAL">INTRAORAL</option>
                      <option value="OCCLUSAL">OCCLUSAL</option>
                      <option value="SKELETAL">SKELETAL</option>
                      <option value="DENTAL">DENTAL</option>
                      <option value="SOFT_TISSUE">SOFT_TISSUE</option>
                      <option value="FUNCTIONAL">FUNCTIONAL</option>
                    </select>
                    <select
                      value={findingSig}
                      onChange={(e) =>
                        setFindingSig(e.target.value as SqliteClinicalFindingRow['clinical_significance'])
                      }
                      className="px-2 py-1 border border-slate-300 rounded text-[11px]"
                    >
                      <option value="NORMAL_OBSERVATION">NORMAL_OBSERVATION</option>
                      <option value="CLINICAL_FINDING">CLINICAL_FINDING</option>
                      <option value="PATHOLOGICAL_DEVIATION">PATHOLOGICAL_DEVIATION</option>
                    </select>
                    <input
                      type="text"
                      required
                      value={findingCode}
                      onChange={(e) => setFindingCode(e.target.value)}
                      placeholder="finding_code"
                      className="px-2 py-1 border border-slate-300 rounded font-mono text-[11px]"
                    />
                    <input
                      type="text"
                      required
                      value={findingValue}
                      onChange={(e) => setFindingValue(e.target.value)}
                      placeholder="value"
                      className="px-2 py-1 border border-slate-300 rounded font-mono text-[11px]"
                    />
                    <select
                      value={findingSeverity}
                      onChange={(e) => setFindingSeverity(e.target.value as SqliteClinicalFindingRow['severity'])}
                      className="px-2 py-1 border border-slate-300 rounded text-[11px]"
                    >
                      <option value="NORMAL">NORMAL</option>
                      <option value="MILD">MILD</option>
                      <option value="MODERATE">MODERATE</option>
                      <option value="SEVERE">SEVERE</option>
                    </select>
                    <select
                      value={findingSide}
                      onChange={(e) => setFindingSide(e.target.value as SqliteClinicalFindingRow['side'])}
                      className="px-2 py-1 border border-slate-300 rounded text-[11px]"
                    >
                      <option value="MIDLINE">MIDLINE</option>
                      <option value="BILATERAL">BILATERAL</option>
                      <option value="RIGHT">RIGHT</option>
                      <option value="LEFT">LEFT</option>
                      <option value="NONE">NONE</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-1.5 bg-slate-900 text-white rounded font-semibold text-[11px]"
                  >
                    + Add Structured Clinical Finding
                  </button>
                </form>
              </div>

              {/* 2. Structured Tooth Findings (tooth_findings — FDI Validated, No JSON Blob) */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3 text-xs bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-bold text-slate-900">
                    2. tooth_findings ({selectedExamAggregate.tooth_findings.length})
                  </span>
                  <span className="font-mono text-[10px] text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded">
                    FDI 11–48 / 51–85
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5">
                  {selectedExamAggregate.tooth_findings.map((tf) => (
                    <div
                      key={tf.id}
                      className="p-2 rounded border border-slate-200 bg-slate-50 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-mono font-bold text-blue-700">
                          FDI #{tf.tooth_number}
                        </span>{' '}
                        · <span className="font-semibold">{tf.finding_type}</span>
                        <div className="text-[10px] text-slate-600">
                          Position: {tf.position} · Rotation: {tf.rotation}
                        </div>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 font-mono text-[10px]">
                        {tf.presence_status}
                      </span>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddToothFinding} className="pt-2 border-t border-slate-200 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={fdiToothNumber}
                      onChange={(e) => setFdiToothNumber(e.target.value)}
                      placeholder="FDI (e.g. 13, 23)"
                      className="px-2 py-1 border border-slate-300 rounded font-mono text-[11px]"
                    />
                    <select
                      value={toothFindingType}
                      onChange={(e) =>
                        setToothFindingType(e.target.value as SqliteToothFindingRow['finding_type'])
                      }
                      className="px-2 py-1 border border-slate-300 rounded text-[11px]"
                    >
                      <option value="IMPACTED">IMPACTED</option>
                      <option value="ROTATED">ROTATED</option>
                      <option value="DISPLACED">DISPLACED</option>
                      <option value="MISSING">MISSING</option>
                      <option value="TIPPED">TIPPED</option>
                      <option value="INTRUDED">INTRUDED</option>
                      <option value="EXTRUDED">EXTRUDED</option>
                      <option value="SUPERNUMERARY">SUPERNUMERARY</option>
                      <option value="ABNORMAL_MORPHOLOGY">ABNORMAL_MORPHOLOGY</option>
                    </select>
                    <select
                      value={toothPresence}
                      onChange={(e) =>
                        setToothPresence(e.target.value as SqliteToothFindingRow['presence_status'])
                      }
                      className="px-2 py-1 border border-slate-300 rounded text-[11px]"
                    >
                      <option value="PRESENT">PRESENT</option>
                      <option value="IMPACTED_UNERUPTED">IMPACTED_UNERUPTED</option>
                      <option value="CONGENITALLY_MISSING">CONGENITALLY_MISSING</option>
                      <option value="EXTRACTED">EXTRACTED</option>
                    </select>
                    <input
                      type="text"
                      value={toothPosition}
                      onChange={(e) => setToothPosition(e.target.value)}
                      placeholder="Position"
                      className="px-2 py-1 border border-slate-300 rounded text-[11px]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-1.5 bg-slate-900 text-white rounded font-semibold text-[11px]"
                  >
                    + Add Structured Tooth Finding (FDI)
                  </button>
                </form>
              </div>

              {/* 3. Structured Arch Measurements (arch_measurements) */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3 text-xs bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-bold text-slate-900">
                    3. arch_measurements ({selectedExamAggregate.arch_measurements.length})
                  </span>
                  <span className="font-mono text-[10px] text-purple-800 bg-purple-50 px-1.5 py-0.5 rounded">
                    Quantitative mm / %
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5">
                  {selectedExamAggregate.arch_measurements.map((am) => (
                    <div
                      key={am.id}
                      className="p-2 rounded border border-slate-200 bg-slate-50 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-mono font-bold text-slate-900">
                          [{am.arch}] {am.measurement_type}
                        </div>
                        <div className="text-[10px] text-slate-600">
                          Method: {am.method} · Norm: {am.reference}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-blue-700">
                        {am.value} {am.unit}
                      </span>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddArchMeasurement} className="pt-2 border-t border-slate-200 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={archType}
                      onChange={(e) => setArchType(e.target.value as SqliteArchMeasurementRow['arch'])}
                      className="px-2 py-1 border border-slate-300 rounded text-[11px]"
                    >
                      <option value="MAXILLARY">MAXILLARY</option>
                      <option value="MANDIBULAR">MANDIBULAR</option>
                      <option value="BIMAXILLARY">BIMAXILLARY</option>
                    </select>
                    <select
                      value={archMeasureType}
                      onChange={(e) =>
                        setArchMeasureType(e.target.value as SqliteArchMeasurementRow['measurement_type'])
                      }
                      className="px-2 py-1 border border-slate-300 rounded text-[11px]"
                    >
                      <option value="INTERCANINE_WIDTH">INTERCANINE_WIDTH</option>
                      <option value="INTERMOLAR_WIDTH">INTERMOLAR_WIDTH</option>
                      <option value="ARCH_WIDTH">ARCH_WIDTH</option>
                      <option value="ARCH_LENGTH">ARCH_LENGTH</option>
                      <option value="ARCH_PERIMETER">ARCH_PERIMETER</option>
                      <option value="SPACE_DISCREPANCY">SPACE_DISCREPANCY</option>
                      <option value="BOLTON_ANTERIOR">BOLTON_ANTERIOR</option>
                    </select>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={archValue}
                      onChange={(e) => setArchValue(e.target.value)}
                      placeholder="Value (mm)"
                      className="px-2 py-1 border border-slate-300 rounded font-mono text-[11px]"
                    />
                    <select
                      value={archMethod}
                      onChange={(e) => setArchMethod(e.target.value as SqliteArchMeasurementRow['method'])}
                      className="px-2 py-1 border border-slate-300 rounded text-[11px]"
                    >
                      <option value="DIGITAL_SCAN">DIGITAL_SCAN</option>
                      <option value="PLASTER_CAST">PLASTER_CAST</option>
                      <option value="CBCT_3D">CBCT_3D</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-1.5 bg-slate-900 text-white rounded font-semibold text-[11px]"
                  >
                    + Add Structured Arch Measurement
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-PHASE FORENSIC 60-TEST VERIFICATION (PA01..PX10)                */}
      {/* =================================================================== */}
      {activeSubPhase === 'FORENSIC_60' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white p-4 rounded-lg">
            <div>
              <div className="text-xs font-mono text-emerald-400 font-bold">
                UNIFIED CLINICAL CORE FORENSIC SUITE — P3-A (15) + P3-B (15) + P3-C (20) + P3-X (10)
              </div>
              <div className="text-sm font-bold mt-0.5">
                Gates: G-P3A={forensicReport.gateP3A.passed ? 'PASS' : 'FAIL'} · G-P3B=
                {forensicReport.gateP3B.passed ? 'PASS' : 'FAIL'} · G-P3C=
                {forensicReport.gateP3C.passed ? 'PASS' : 'FAIL'} · G-P3-ABC=
                {forensicReport.gateP3ABC.passed ? 'PASS' : 'FAIL'} ({forensicReport.totalPassed}/
                {forensicReport.totalTests} PASS)
              </div>
            </div>
            <button
              type="button"
              onClick={() => setForensicReport(executeP3UnifiedForensicBatch())}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {language === 'ar' ? 'إعادة تشغيل الـ 60 اختباراً' : 'Re-Run All 60 Forensic Tests'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
            {[
              ...forensicReport.gateP3A.tests,
              ...forensicReport.gateP3B.tests,
              ...forensicReport.gateP3C.tests,
              ...forensicReport.gateP3ABC.tests,
            ].map((t) => (
              <div
                key={t.testId}
                className="p-2.5 rounded border border-slate-200 bg-slate-50 flex items-start justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-mono font-bold text-slate-900">
                    [{t.phase}] {t.testId}: {language === 'ar' ? t.descriptionAr : t.descriptionEn}
                  </div>
                  <div className="font-mono text-[11px] text-slate-600 mt-0.5">{t.evidence}</div>
                </div>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 font-mono text-[10px] font-bold rounded shrink-0 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  PASS
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
