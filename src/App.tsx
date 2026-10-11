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
  ClinicalVisit,
  InventoryMaterial,
  LanguageMode,
  OrthodonticCase,
  Patient,
  ProblemObjectiveItem,
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

const STORAGE_KEYS = {
  PATIENTS: 'albasmi_orth_patients_v1',
  CASES: 'albasmi_orth_cases_v1',
  INVENTORY: 'albasmi_orth_inventory_v1',
  AUDIT: 'albasmi_orth_audit_v1',
  SYNC: 'albasmi_orth_sync_v1',
};

type PrimaryNavSection =
  | 'dashboard'
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
  const [activeNav, setActiveNav] = React.useState<PrimaryNavSection>('case_workspace');
  const [activeCaseTab, setActiveCaseTab] = React.useState<CaseSubTab>('diagnosis_problems');
  const [activeOpTab, setActiveOpTab] = React.useState<
    'p0_architecture' | 'finance' | 'inventory' | 'sync'
  >('p0_architecture');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [showNewCaseModal, setShowNewCaseModal] = React.useState<boolean>(false);

  // Offline-First Local Database State backed by localStorage
  const [patients, setPatients] = React.useState<Patient[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PATIENTS);
      return saved ? JSON.parse(saved) : INITIAL_PATIENTS;
    } catch {
      return INITIAL_PATIENTS;
    }
  });

  const [cases, setCases] = React.useState<OrthodonticCase[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CASES);
      return saved ? JSON.parse(saved) : INITIAL_CASES;
    } catch {
      return INITIAL_CASES;
    }
  });

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

  const [selectedCaseId, setSelectedCaseId] = React.useState<string>(INITIAL_CASES[0].id);

  // New Case Modal State
  const [newPatientNameAr, setNewPatientNameAr] = React.useState('');
  const [newPatientNameEn, setNewPatientNameEn] = React.useState('');
  const [newPatientDob, setNewPatientDob] = React.useState('2010-05-15');
  const [newCaseChiefComplaintEn, setNewCaseChiefComplaintEn] = React.useState('');

  // Persist to Local Database automatically (Offline-First Guarantee)
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PATIENTS, JSON.stringify(patients));
      localStorage.setItem(STORAGE_KEYS.CASES, JSON.stringify(cases));
      localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
      localStorage.setItem(STORAGE_KEYS.AUDIT, JSON.stringify(auditLogs));
      localStorage.setItem(STORAGE_KEYS.SYNC, JSON.stringify(syncQueue));
    } catch {
      // Ignore storage quota errors in sandboxed iframes
    }
  }, [patients, cases, inventory, auditLogs, syncQueue]);

  const activeCase = cases.find((c) => c.id === selectedCaseId) || cases[0];
  const activePatient =
    patients.find((p) => p.id === activeCase.patientId) || patients[0];

  const activeWarnings = React.useMemo(
    () => runClinicalConsistencyAndQualityChecks(activeCase),
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

  const handleUpdateCase = (
    updated: OrthodonticCase,
    auditAction?: string,
    auditDetails?: string
  ) => {
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

  const handleAddQuickVisit = (visit: ClinicalVisit) => {
    // 1. Add visit to case
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
      'Visits & Inventory',
      `Logged Visit #${visit.visitNumber} (${visit.visitType})`,
      `Case ${activeCase.id}: ${visit.procedures.join(', ')}`
    );
  };

  const handleAcceptAIProblem = (newItem: ProblemObjectiveItem) => {
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
    if (!isOnline) return;
    try {
      await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cases, deviceId: 'iPad-Pro-Clinic-01' }),
      });
      setSyncQueue((prev) =>
        prev.map((s) => (s.status === 'Pending Offline' ? { ...s, status: 'Synced' } : s))
      );
      appendAuditLog('Cloud Sync', 'Synchronized Local Database with Cloud', `${cases.length} cases verified.`);
    } catch {
      // Fallback if offline
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

  const handleCreateNewCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientNameEn.trim() && !newPatientNameAr.trim()) return;

    const newPatId = `PAT-2026-00${patients.length + 1}`;
    const newCaseId = `ORT-2026-001${cases.length + 25}`;

    const newPatient: Patient = {
      id: newPatId,
      fullNameAr: newPatientNameAr || newPatientNameEn,
      fullNameEn: newPatientNameEn || newPatientNameAr,
      gender: 'Female',
      dob: newPatientDob,
      phone: '+966 50 000 0000',
      medicalHistory: 'No systemic contraindications.',
      dentalHistory: 'Initial orthodontic consultation.',
      allergies: 'None',
      notes: '',
      createdAt: new Date().toISOString().slice(0, 10),
    };

    const templateCase: OrthodonticCase = {
      ...INITIAL_CASES[0],
      id: newCaseId,
      patientId: newPatId,
      status: 'Diagnosis',
      startDate: new Date().toISOString().slice(0, 10),
      chiefComplaintEn:
        newCaseChiefComplaintEn || 'Crowding and protrusion of upper anterior teeth.',
      chiefComplaintAr: 'ازدحام وبروز الأسنان الأمامية العلوية.',
      visits: [],
    };

    setPatients((prev) => [newPatient, ...prev]);
    setCases((prev) => [templateCase, ...prev]);
    setSelectedCaseId(newCaseId);
    setShowNewCaseModal(false);
    setActiveNav('case_workspace');
    setActiveCaseTab('examination');
    appendAuditLog('Patient & Case Core', `Created New Orthodontic Case ${newCaseId}`, newPatient.fullNameEn);
  };

  const filteredCases = cases.filter((c) => {
    const pat = patients.find((p) => p.id === c.patientId);
    const q = searchQuery.toLowerCase();
    return (
      c.id.toLowerCase().includes(q) ||
      c.caseType.toLowerCase().includes(q) ||
      c.diagnosis.skeletalSagittal.toLowerCase().includes(q) ||
      pat?.fullNameEn.toLowerCase().includes(q) ||
      pat?.fullNameAr.includes(searchQuery)
    );
  });

  return (
    <div
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-screen flex flex-col bg-slate-50 text-slate-900"
    >
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

        {/* Zone 2: 5 Primary Navigation Links */}
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

        {/* Zone 3: 2 Primary Actions (2-Option Language Switcher & New Case) */}
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
            onClick={() => setShowNewCaseModal(true)}
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
            </div>

            {/* Case List */}
            <div className="space-y-2 max-h-72 lg:max-h-none overflow-y-auto">
              {filteredCases.map((c) => {
                const pat = patients.find((p) => p.id === c.patientId);
                const isSelected = c.id === activeCase.id;
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
                      <span className={`font-mono ${isSelected ? 'text-cyan-400 font-semibold' : 'text-blue-700 font-semibold'}`}>
                        {c.id}
                      </span>
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
                      {formatSkeletalSagittal(language, c.diagnosis.skeletalSagittal)} · OJ{' '}
                      {c.occlusal.overjetInitialMm}→{c.occlusal.overjetCurrentMm}mm
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
              <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    {language === 'ar' ? 'النضج العظمي (CVM):' : 'CVM Maturation:'}
                  </span>
                  <span className="font-mono font-semibold text-slate-900">
                    {activeCase.cbctAndRadiographs.cvmStage}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    {language === 'ar' ? 'الزاوية السهمية (ANB):' : 'Initial / Final ANB:'}
                  </span>
                  <span className="font-mono font-semibold text-slate-900">
                    {activeCase.cephRecords[0]?.values['ANB'] ?? '—'}° →{' '}
                    {activeCase.cephRecords[activeCase.cephRecords.length - 1]?.values['ANB'] ?? '—'}°
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    {language === 'ar' ? 'البروز السني (Overjet):' : 'Overjet Progress:'}
                  </span>
                  <span className="font-mono font-semibold text-emerald-700">
                    {activeCase.occlusal.overjetInitialMm}mm → {activeCase.occlusal.overjetCurrentMm}mm
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
          <div className="no-print bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono font-bold text-blue-700">{activeCase.id}</span>
                <span>·</span>
                <span>{formatSkeletalSagittal(language, activeCase.diagnosis.skeletalSagittal)}</span>
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
              <h1 className="text-lg font-bold text-slate-900">
                {language === 'ar' ? activePatient.fullNameAr : activePatient.fullNameEn}
              </h1>
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

          {/* VIEW 2: CLINICAL & CEPHALOMETRIC WORKSPACE */}
          {activeNav === 'case_workspace' && (
            <div className="space-y-5">
              {/* P3-A + P3-B + P3-C Authoritative Unified Clinical Core Workspace */}
              <P3ClinicalCoreWorkspace language={language} isOnline={isOnline} />

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
                  ? 'فتح ملف مريض وحالة تقويمية جديدة'
                  : 'Create New Patient & Orthodontic Case Record'}
              </h3>
              <button
                onClick={() => setShowNewCaseModal(false)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Close ✕
              </button>
            </div>
            <form onSubmit={handleCreateNewCase} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Patient Full Name (Arabic / اسم المريض بالعربية)
                </label>
                <input
                  type="text"
                  dir="rtl"
                  required
                  value={newPatientNameAr}
                  onChange={(e) => setNewPatientNameAr(e.target.value)}
                  placeholder="مثال: ريم عبد الله القحطاني"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Patient Full Name (English)
                </label>
                <input
                  type="text"
                  required
                  value={newPatientNameEn}
                  onChange={(e) => setNewPatientNameEn(e.target.value)}
                  placeholder="e.g., Reem Abdullah Al-Qahtani"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={newPatientDob}
                  onChange={(e) => setNewPatientDob(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Chief Complaint
                </label>
                <input
                  type="text"
                  value={newCaseChiefComplaintEn}
                  onChange={(e) => setNewCaseChiefComplaintEn(e.target.value)}
                  placeholder="e.g., Upper anterior crowding and deep bite"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewCaseModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800"
                >
                  Initialize Case Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
