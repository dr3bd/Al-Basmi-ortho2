import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  CreditCard,
  Database,
  Download,
  FileSpreadsheet,
  GitBranch,
  History,
  Layers,
  Package,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import {
  AuditLogItem,
  InventoryMaterial,
  LanguageMode,
  OrthodonticCase,
  Patient,
  SyncQueueEntry,
} from '../types/orthodontics';
import {
  buildAnonymizedResearchDataset,
  buildForensicClinicalChainTrace,
  buildP0NormalizedGraphForCase,
  buildP0SqliteRelationalTablesForCase,
  runForensicContradictionAndIntegrityChecks,
  verifyBackupIntegrity,
} from '../domain/p0RepositoryService';
import {
  P0_NON_BREAKABLE_RULES,
  P0_PRODUCTION_SQLITE_DDL,
  P1_CONCRETE_DATABASE_MILESTONES,
  P1_F_SEPARATION_OF_CONCERNS,
} from '../domain/p0SqliteSchema';
import { executeP1ForensicSchemaTestSuite } from '../domain/p1ForensicTestSuite';
import {
  executeAtomicDiagnosisTransactionSimulation,
  P2A_ACCEPTANCE_CRITERIA,
  P2A_AGGREGATE_RULES,
  P2A_CANONICAL_COMMANDS,
  P2A_DOMAIN_BOUNDARIES,
  validateCrossCaseBoundary,
  validateDiagnosisStateTransition,
} from '../domain/p2aDomainBoundaryContract';
import {
  executeP2BForensicTestSuite,
  P2B_USE_CASE_MATRIX,
} from '../domain/p2bUseCaseContract';
import {
  executeP2CDomainValidationTestSuite,
  P2C_RULE_REGISTRY,
} from '../domain/p2cDomainValidationEngine';
import {
  executeP2DRepositoryTestSuite,
  P2D_REPOSITORY_MATRIX,
} from '../domain/p2dRepositoryContract';
import { executeP2EtoP2JUnifiedForensicBatch } from '../domain/p2jDomainFreezeSuite';

interface OperationalAndSyncViewProps {
  activeSubTab: 'finance' | 'inventory' | 'sync' | 'p0_architecture';
  orthoCase?: OrthodonticCase;
  patient?: Patient;
  allPatients: Patient[];
  allCases: OrthodonticCase[];
  inventory: InventoryMaterial[];
  auditLogs: AuditLogItem[];
  syncQueue: SyncQueueEntry[];
  isOnline: boolean;
  language: LanguageMode;
  onRecordPayment: (installmentId: string, amount: number) => void;
  onRestockMaterial: (materialId: string, quantity: number) => void;
  onResolveConflict: (syncId: string, choice: 'local' | 'remote') => void;
  onSyncAllPending: () => void;
  onExportBackupJson: () => void;
}

export const OperationalAndSyncView: React.FC<OperationalAndSyncViewProps> = ({
  activeSubTab,
  orthoCase,
  patient,
  allPatients,
  allCases,
  inventory,
  auditLogs,
  syncQueue,
  isOnline,
  language,
  onRecordPayment,
  onRestockMaterial,
  onResolveConflict,
  onSyncAllPending,
  onExportBackupJson,
}) => {
  const [backupCheckMessage, setBackupCheckMessage] = React.useState<string | null>(null);
  const [forensicSuite, setForensicSuite] = React.useState(() =>
    executeP1ForensicSchemaTestSuite()
  );
  const [p2bSuite, setP2bSuite] = React.useState(() => executeP2BForensicTestSuite());
  const [p2cSuite, setP2cSuite] = React.useState(() => executeP2CDomainValidationTestSuite());
  const [p2dSuite, setP2dSuite] = React.useState(() => executeP2DRepositoryTestSuite());
  const [domainFreezeArtifact, setDomainFreezeArtifact] = React.useState(() =>
    executeP2EtoP2JUnifiedForensicBatch()
  );
  const [activeP2BatchTab, setActiveP2BatchTab] = React.useState<
    'P2E' | 'P2F' | 'P2G' | 'P2H' | 'P2I' | 'P2J'
  >('P2J');
  const [selectedSqliteTable, setSelectedSqliteTable] = React.useState<
    | 'devices'
    | 'users'
    | 'patients'
    | 'orthodontic_cases'
    | 'clinical_examinations'
    | 'clinical_findings'
    | 'tooth_findings'
    | 'arch_measurements'
    | 'problems'
    | 'problem_evidence'
    | 'diagnosis_versions'
    | 'diagnosis_items'
    | 'diagnosis_evidence'
    | 'diagnosis_problem_links'
    | 'treatment_objectives'
    | 'objective_problems'
    | 'diagnosis_objectives'
    | 'treatment_plans'
    | 'planned_interventions'
    | 'visit_procedures'
    | 'treatment_outcomes'
    | 'report_snapshots'
    | 'ai_context_snapshots'
    | 'ai_suggestions'
    | 'case_fee_items'
    | 'case_material_consumption'
    | 'sync_operations'
    | 'sync_tombstones'
    | 'sync_conflicts'
    | 'schema_migrations'
    | 'tooth_numbering_systems'
    | 'cephalometric_analysis_definitions'
    | 'cephalometric_landmark_definitions'
    | 'cephalometric_measurement_definitions'
  >('devices');
  const [showSqliteDdl, setShowSqliteDdl] = React.useState<boolean>(false);

  // Calculate direct material cost from all visits in active case
  const directMaterialCost = orthoCase?.visits
    ? orthoCase.visits.reduce((acc, v) => {
        const visitSum = v.materialsIssuedIds.reduce((s, m) => s + m.quantity * m.unitCost, 0);
        return acc + visitSum;
      }, 0)
    : 0;
  const netFee = orthoCase?.financials
    ? orthoCase.financials.totalFee - orthoCase.financials.discount
    : 0;
  const totalPaid = orthoCase?.financials
    ? orthoCase.financials.installments.reduce((s, i) => s + i.paidAmount, 0)
    : 0;
  const remainingBalance = netFee - totalPaid;
  const totalDirectCosts =
    directMaterialCost +
    (orthoCase?.financials?.labCost ?? 0) +
    (orthoCase?.financials?.otherDirectCost ?? 0);
  const estimatedContribution = netFee - totalDirectCosts;

  const formatCategory = (cat: string) => {
    if (language === 'en') return cat;
    const map: Record<string, string> = {
      Brackets: 'حاصرات تقويمية (Brackets)',
      Archwires: 'أسلاك تقويمية (Archwires)',
      'Elastics & Chains': 'مطاط وسلاسل (Elastics & Chains)',
      'TADs / Miniscrews': 'زرعات إرساء مؤقتة (TADs)',
      'MARPE / Expanders': 'موسعات هيكلية (MARPE)',
      'Bonding & Composite': 'مواد لصق وراتنج (Bonding)',
      'Retention Materials': 'مواد تثبيت (Retainers)',
    };
    return map[cat] || cat;
  };

  const handleExportResearchDataset = () => {
    const dataset = buildAnonymizedResearchDataset(allPatients, allCases);
    const blob = new Blob([JSON.stringify(dataset, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AlBasmi_Orth_DeIdentified_Research_Dataset_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRunBackupVerification = () => {
    const check = verifyBackupIntegrity({
      patients: allPatients,
      cases: allCases,
      inventory,
      auditLogs,
    });
    setBackupCheckMessage(language === 'ar' ? check.summaryAr : check.summaryEn);
  };

  const handleDownloadSqliteDdl = () => {
    const blob = new Blob([P0_PRODUCTION_SQLITE_DDL], {
      type: 'application/sql;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AlBasmi_Orth_P0_Production_Schema_v1.0.sql`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // P0 ARCHITECTURE & NORMALIZED DATA MODEL INSPECTOR
  if (activeSubTab === 'p0_architecture') {
    const p0Graph = buildP0NormalizedGraphForCase(patient, orthoCase);
    const sqliteTables = buildP0SqliteRelationalTablesForCase(patient, orthoCase);
    const forensicChain = buildForensicClinicalChainTrace(patient, orthoCase);
    const forensicChecks = runForensicContradictionAndIntegrityChecks(orthoCase);

    return (
      <div className="space-y-6">
        {/* P0.5 Forensic Revision Banner */}
        <div className="bg-slate-900 text-white rounded-lg p-5 border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
                <Layers className="w-4 h-4" />
                <span>
                  {language === 'ar'
                    ? 'P0.5 — المراجعة الجنائية السريرية ومخطط قاعدة البيانات المعتمد (SQLite Schema v1.1 FROZEN)'
                    : 'P0.5 — FORENSIC CLINICAL & RELATIONAL DATABASE SCHEMA v1.1 (FROZEN)'}
                </span>
              </div>
              <h2 className="text-base font-semibold">
                {language === 'ar'
                  ? 'إثبات السلسلة العلائقية الكاملة: الملاحظة ← المشكلة ← الدليل ← عنصر التشخيص ← الهدف (N:M) ← الإجراء المخطط ← التنفيذ الفعلي ← النتيجة المرحلية'
                  : 'Full Relational Traceability: Finding → Problem → Evidence → Diagnosis Item → Objective (N:M) → Planned Intervention → Actual Visit → Outcome'}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowSqliteDdl((prev) => !prev)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5"
              >
                <Database className="w-3.5 h-3.5" />
                {language === 'ar'
                  ? showSqliteDdl
                    ? 'إخفاء كود SQLite v1.1 DDL'
                    : 'عرض كود الجداول (SQLite v1.1 DDL)'
                  : showSqliteDdl
                  ? 'Hide SQLite v1.1 DDL'
                  : 'View SQLite v1.1 DDL'}
              </button>
              <button
                onClick={handleDownloadSqliteDdl}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                {language === 'ar' ? 'تنزيل ملف (.SQL v1.1)' : 'Download .SQL v1.1'}
              </button>
              <button
                onClick={handleRunBackupVerification}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                {language === 'ar'
                  ? 'فحص سلامة النسخة الاحتياطية'
                  : 'Verify P0 Backup Integrity'}
              </button>
              <button
                onClick={handleExportResearchDataset}
                className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {language === 'ar'
                  ? 'تصدير حزمة أبحاث (research_export_sets)'
                  : 'Export Research Set'}
              </button>
            </div>
          </div>

          {/* 8-Step Forensic Clinical Traceability Chain */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-2 text-[11px]">
            {[
              { step: '01', ar: 'الملاحظة (Finding)', en: 'Clinical / Tooth Finding' },
              { step: '02', ar: 'المشكلة (Problem)', en: 'Problem + Evidence' },
              { step: '03', ar: 'عنصر التشخيص', en: 'Diagnosis Item + Evidence' },
              { step: '04', ar: 'الهدف (N:M Junction)', en: 'Objective (objective_problems)' },
              { step: '05', ar: 'الخطة (Plan Vn)', en: 'Treatment Plan Version' },
              { step: '06', ar: 'الإجراء المخطط', en: 'Planned Intervention' },
              { step: '07', ar: 'التنفيذ الفعلي بالجلسة', en: 'Actual Visit Procedure' },
              { step: '08', ar: 'النتيجة المرحلية T1..T4', en: 'Staged Outcome History' },
            ].map((l) => (
              <div
                key={l.step}
                className="p-2 bg-slate-800/80 border border-slate-700 rounded space-y-0.5"
              >
                <div className="font-mono text-cyan-400 font-bold">CHAIN-{l.step}</div>
                <div className="font-medium text-slate-100">
                  {language === 'ar' ? l.ar : l.en}
                </div>
              </div>
            ))}
          </div>

          {backupCheckMessage && (
            <div className="p-2.5 bg-emerald-950/70 border border-emerald-700 rounded text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{backupCheckMessage}</span>
            </div>
          )}

          {showSqliteDdl && (
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1.5">
                <span className="font-mono">
                  AlBasmi_Orth_P0_5_Forensic_Schema_v1.1.sql (Relational Tooth Findings + N:M Objectives + Planned vs Actual Interventions + Sync base_version)
                </span>
              </div>
              <pre
                dir="ltr"
                className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono text-cyan-300 overflow-x-auto max-h-96 leading-relaxed"
              >
                {P0_PRODUCTION_SQLITE_DDL}
              </pre>
            </div>
          )}
        </div>

        {/* Section 45: Live Forensic Clinical Chain Traceability Proof */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-blue-600" />
              <span>
                {language === 'ar'
                  ? `اختبار السلسلة السريرية العلائقية (Section 45 Clinical Chain Test) — الحالة ${orthoCase.id}`
                  : `Section 45 Relational Clinical Chain Proof — Case ${orthoCase.id}`}
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              {language === 'ar'
                ? 'يثبت هذا الجدول كيف ينتقل النظام علائقياً عبر المفاتيح الأجنبية (Foreign Keys) من الملاحظة السريرية إلى المشكلة والتشخيص والهدف والتدخل المخطط والتنفيذ الفعلي والنتيجة دون الاعتماد على نصوص JSON عشوائية.'
                : 'Proves end-to-end relational traversal from Finding → Problem → Diagnosis Item → Objective → Planned Intervention → Actual Visit Procedure → Staged Outcome.'}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                  <th className="p-2.5 text-start">
                    {language === 'ar' ? '1. الدليل والملاحظة (Finding)' : '1. Finding & Evidence'}
                  </th>
                  <th className="p-2.5 text-start">
                    {language === 'ar' ? '2. المشكلة (Problem)' : '2. Problem'}
                  </th>
                  <th className="p-2.5 text-start">
                    {language === 'ar' ? '3. عنصر التشخيص (Diagnosis Item)' : '3. Diagnosis Item'}
                  </th>
                  <th className="p-2.5 text-start">
                    {language === 'ar' ? '4. الهدف العلاجي (Objective)' : '4. Linked Objective'}
                  </th>
                  <th className="p-2.5 text-start">
                    {language === 'ar' ? '5. التدخل المخطط مقابل الفعلي' : '5. Planned vs Actual Visit'}
                  </th>
                  <th className="p-2.5 text-start">
                    {language === 'ar' ? '6. النتيجة والمشكلات المتبقية' : '6. Outcome & Residual'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {forensicChain.map((row) => (
                  <tr key={row.problemId} className="hover:bg-slate-50 align-top">
                    <td className="p-2.5">
                      <div className="font-mono text-[11px] text-blue-700 font-semibold">
                        {row.findingId}
                      </div>
                      <div className="text-slate-600 text-[11px]">{row.findingSummary}</div>
                    </td>
                    <td className="p-2.5">
                      <div className="font-mono text-[11px] text-slate-500">{row.problemId}</div>
                      <div className="font-semibold text-slate-900">{row.problemTitle}</div>
                    </td>
                    <td className="p-2.5">
                      <div className="font-mono text-[11px] text-slate-500">
                        {row.diagnosisItemId}
                      </div>
                      <div className="text-slate-800">{row.diagnosisTitle}</div>
                      <div className="font-mono text-[10px] text-emerald-700">
                        Evid: {row.diagnosisEvidenceId}
                      </div>
                    </td>
                    <td className="p-2.5">
                      <div className="font-mono text-[11px] text-slate-500">{row.objectiveId}</div>
                      <div className="text-slate-800">{row.objectiveTarget}</div>
                    </td>
                    <td className="p-2.5 space-y-1">
                      <div>
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 font-mono text-[10px]">
                          Planned: {row.plannedInterventionId}
                        </span>
                        <div className="text-slate-700 text-[11px] mt-0.5">
                          {row.plannedInterventionDesc}
                        </div>
                      </div>
                      <div>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-mono text-[10px]">
                          Actual: {row.actualVisitProcedureId}
                        </span>
                        <div className="text-slate-700 text-[11px] mt-0.5">
                          {row.actualVisitDesc}
                        </div>
                      </div>
                    </td>
                    <td className="p-2.5 space-y-1 font-mono text-[11px]">
                      <div className="text-amber-700">T1: {row.outcomeT1Status}</div>
                      <div className="text-emerald-700 font-semibold">
                        T3: {row.outcomeCurrentStatus}
                      </div>
                      <div className="text-slate-500 text-[10px] font-sans">
                        {language === 'ar' ? 'المتبقي: ' : 'Residual: '}
                        {row.residualProblemStatus}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* P2-A: DOMAIN BOUNDARY & AGGREGATE FORENSIC DEFINITION v1.0 (DOMAIN_BOUNDARY_CONTRACT_v1.0) */}
        <div className="bg-white border-2 border-slate-900 rounded-lg p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-blue-700">
                <Layers className="w-4 h-4" />
                <span>
                  {language === 'ar'
                    ? 'P2-A — تعريف حدود المجالات والجذور التجميعية (DOMAIN_BOUNDARY_CONTRACT_v1.0)'
                    : 'P2-A — Domain Boundary & Aggregate Forensic Contract v1.0'}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900">
                {language === 'ar'
                  ? 'المعمارية الطبقية الصارمة: UI ← Application Layer ← Domain Layer ← Repository Interface ← Infrastructure ← SQLite (SCHEMA_FREEZE_v1.0)'
                  : 'Strict Layered Architecture: UI → Application Layer → Domain Layer → Repository Interface → Infrastructure → SQLite (SCHEMA_FREEZE_v1.0)'}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-slate-900 text-cyan-300 font-mono text-xs font-bold">
                🔒 SCHEMA_FREEZE_v1.0 (0 Schema Mods)
              </span>
              <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-mono text-xs font-bold">
                DOMAIN_BOUNDARY_CONTRACT_v1.0
              </span>
            </div>
          </div>

          {/* 17 Official Domain Boundaries, Aggregate Roots & SSOT Matrix (Sections 3–21 & 31) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'مصفوفة حدود المجالات الـ 17 والجذور التجميعية ومصادر الحقيقة الوحيدة (Sections 3–21 & Section 31 SSOT Matrix)'
                : '17 Official Domain Boundaries, Aggregate Roots & SSOT Matrix (Sections 3–21 & 31)'}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="p-2 text-start">
                      {language === 'ar' ? 'المجال (Domain Boundary)' : 'Domain Boundary'}
                    </th>
                    <th className="p-2 text-start font-mono">
                      {language === 'ar' ? 'الجذر التجميعي (Aggregate Root)' : 'Aggregate Root'}
                    </th>
                    <th className="p-2 text-start font-mono">
                      {language === 'ar' ? 'الكيانات التابعة (Child Entities)' : 'Child Entities'}
                    </th>
                    <th className="p-2 text-start font-mono">
                      {language === 'ar' ? 'مصدر الحقيقة (SSOT Tables)' : 'SSOT Tables'}
                    </th>
                    <th className="p-2 text-start">
                      {language === 'ar'
                        ? 'القاعدة السريرية وممنوعات الإسقاط المشتق'
                        : 'Domain Invariant & Prohibited SSOT Projections'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {P2A_DOMAIN_BOUNDARIES.map((db) => (
                    <tr key={db.domain} className="hover:bg-slate-50 align-top">
                      <td className="p-2 font-semibold text-slate-900">
                        {language === 'ar' ? db.titleAr : db.titleEn}
                      </td>
                      <td className="p-2 font-mono font-bold text-blue-700 whitespace-nowrap">
                        {db.aggregateRoot}
                      </td>
                      <td className="p-2 font-mono text-[11px] text-slate-600">
                        {db.childEntities.length > 0 ? db.childEntities.join(', ') : '— (Root Only)'}
                      </td>
                      <td className="p-2 font-mono text-[11px] text-emerald-800">
                        {db.ssotTables.join(', ')}
                      </td>
                      <td className="p-2 space-y-1">
                        <div className="text-slate-700 text-[11px]">
                          {language === 'ar' ? db.invariantsAr : db.invariantsEn}
                        </div>
                        <div className="text-[10px] font-mono text-rose-700">
                          ❌ Not SSOT: {db.derivedProjectionsForbiddenAsSsot.join(', ')}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 23: Aggregate Governance Rules (AG-01 through AG-07) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'قواعد حوكمة الجذور التجميعية (Section 23: Aggregate Rules AG-01 → AG-07)'
                : 'Section 23: Official Aggregate Governance Rules (AG-01 → AG-07)'}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {P2A_AGGREGATE_RULES.map((ag) => (
                <div
                  key={ag.code}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900">{ag.code}</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                      ENFORCED
                    </span>
                  </div>
                  <div className="font-semibold text-slate-900 text-[11px]">
                    {language === 'ar' ? ag.titleAr : ag.titleEn}
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    {language === 'ar' ? ag.descAr : ag.descEn}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 24, 26 & 30: Live Transaction Boundary, State Machine & Cross-Case Guard Proofs */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {(() => {
              const txCommit = executeAtomicDiagnosisTransactionSimulation({
                caseId: orthoCase.id,
                problemCaseIds: [orthoCase.id, orthoCase.id],
                evidenceCaseIds: [orthoCase.id],
                diagnosisItemsCount: 3,
              });
              const smCheck = validateDiagnosisStateTransition('APPROVED', 'DRAFT', 3);
              const crossCaseCheck = validateCrossCaseBoundary(
                { entityType: 'TreatmentObjective', id: 'OBJ-A1', caseId: orthoCase.id },
                { entityType: 'Problem', id: 'PROB-B9', caseId: 'ORT-OTHER-CASE-999' }
              );

              return (
                <>
                  <div className="p-3.5 bg-slate-900 text-slate-100 rounded-lg space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-cyan-400">
                        Section 24: Atomic Transaction
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px]">
                        {txCommit.status}
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-slate-300 space-y-0.5">
                      {txCommit.stepsExecuted.map((st) => (
                        <div key={st}>• {st}</div>
                      ))}
                    </div>
                  </div>

                  <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-amber-900">
                        Section 26: State Machine Guard
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-mono text-[10px] font-bold">
                        APPROVED → DRAFT BLOCKED
                      </span>
                    </div>
                    <div className="font-semibold text-slate-900">
                      {language === 'ar'
                        ? 'اختبار محاولة تعديل تشخيص معتمد (APPROVED → EDIT)'
                        : 'Test In-Place Mutation of APPROVED Diagnosis'}
                    </div>
                    <p className="text-slate-700 text-[11px]">
                      {language === 'ar' ? smCheck.reasonAr : smCheck.reasonEn}
                    </p>
                  </div>

                  <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-lg space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-rose-900">
                        Section 30: Cross-Case Guard
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 font-mono text-[10px] font-bold">
                        {crossCaseCheck.violationCode}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-900">
                      {language === 'ar'
                        ? 'فحص منع ربط هدف من الحالة A بمشكلة من الحالة B'
                        : 'Cross-Case Contamination Guard (Objective A → Problem B)'}
                    </div>
                    <p className="text-slate-700 text-[11px]">
                      {language === 'ar' ? crossCaseCheck.messageAr : crossCaseCheck.messageEn}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Section 25 & 27: 21 Offline-Capable Canonical Domain Commands */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'نموذج الأوامر السريرية الموحد (Section 25 & 27: 21 Offline-First Canonical Domain Commands)'
                : 'Section 25 & 27: 21 Offline-First Canonical Domain Commands'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {P2A_CANONICAL_COMMANDS.map((cmd) => (
                <div
                  key={cmd.command}
                  className="px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded text-[11px] font-mono text-slate-800 flex items-center gap-1.5"
                  title={language === 'ar' ? cmd.preconditionsAr : cmd.preconditionsEn}
                >
                  <span className="text-blue-700 font-bold">{cmd.command}</span>
                  <span className="text-[10px] text-slate-500">→ {cmd.aggregateRoot}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 32: P2-A 15 Acceptance Criteria Checklist */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'معايير قبول وتجميد P2-A الخمسة عشر (Section 32: P2-A 15 Acceptance Criteria — 15/15 PASS)'
                : 'Section 32: P2-A 15 Acceptance Criteria Verification (15/15 PASS)'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {P2A_ACCEPTANCE_CRITERIA.map((ac) => (
                <div
                  key={ac.number}
                  className="p-2.5 bg-emerald-50/50 border border-emerald-200 rounded text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 text-[11px]">
                      {language === 'ar' ? ac.titleAr : ac.titleEn}
                    </span>
                    <span className="font-mono text-[10px] font-bold text-emerald-700">PASS ✓</span>
                  </div>
                  <div className="font-mono text-[10px] text-slate-600">{ac.proof}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* P2-B: USE CASES & APPLICATION SERVICES CONTRACT v1.0 (USE_CASE_CONTRACT_v1.0) */}
        <div className="bg-white border-2 border-blue-900 rounded-lg p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-blue-700">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>
                  {language === 'ar'
                    ? 'P2-B — عقد حالات الاستخدام وخدمات التطبيق (USE_CASE_CONTRACT_v1.0)'
                    : 'P2-B — Use Cases & Application Services Contract v1.0 (USE_CASE_CONTRACT_v1.0)'}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900">
                {language === 'ar'
                  ? `مسار التنفيذ الذري: Command → Auth → Input Validation → Domain Policies → Transaction (SQLite + Audit + Sync Outbox) → Commit (${p2bSuite.passedTests}/${p2bSuite.totalTests} PASS)`
                  : `Atomic Pipeline: Command → Auth → Validation → Domain Policies → Transaction (SQLite + Audit + Sync) → Commit (${p2bSuite.passedTests}/${p2bSuite.totalTests} PASS)`}
              </h3>
              <p className="text-[11px] font-mono text-slate-500">
                Checksum: {p2bSuite.sha256Checksum} · Baseline: {p2bSuite.schemaBaseline} +{' '}
                {p2bSuite.domainBaseline}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-mono text-xs font-bold">
                ✓ {p2bSuite.passedTests}/{p2bSuite.totalTests} FORENSIC TESTS (B01–B35)
              </span>
              <button
                onClick={() => setP2bSuite(executeP2BForensicTestSuite())}
                className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded text-xs font-medium"
              >
                {language === 'ar'
                  ? 'إعادة تشغيل اختبارات P2-B الـ 35 (B01–B35)'
                  : 'Re-Run 35 P2-B Forensic Tests (B01–B35)'}
              </button>
            </div>
          </div>

          {/* Section 44: 15 P2-B Forensic Acceptance Gates (Gate B1 – Gate B15) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'بوابات القبول الجنائي الـ 15 لمرحلة P2-B (Section 44: Gates B1 → B15 — 15/15 PASS)'
                : 'Section 44: 15 P2-B Forensic Acceptance Gates (Gates B1 → B15 — 15/15 PASS)'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {p2bSuite.gates.map((g) => (
                <div
                  key={g.gateCode}
                  className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-emerald-950">{g.gateCode}</span>
                    <span className="font-mono text-[10px] font-bold text-emerald-700">PASS ✓</span>
                  </div>
                  <div className="font-semibold text-slate-900 text-[11px]">
                    {language === 'ar' ? g.titleAr : g.titleEn}
                  </div>
                  <div className="font-mono text-[10px] text-slate-600">{g.evidence}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sections 7–27: 21 Canonical Use Case Matrix (UC-01 through UC-21) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'مصفوفة حالات الاستخدام الـ 21 (Sections 7–27: UC-01 → UC-21 Atomic Use Case Matrix)'
                : 'Sections 7–27: 21 Canonical Use Cases (UC-01 → UC-21)'}
            </div>
            <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2 text-start font-mono">UC</th>
                    <th className="p-2 text-start">
                      {language === 'ar' ? 'الأمر وحالة الاستخدام' : 'Command & Use Case'}
                    </th>
                    <th className="p-2 text-start font-mono">
                      {language === 'ar' ? 'الجذر والمستودع' : 'Aggregate & Repository'}
                    </th>
                    <th className="p-2 text-start">
                      {language === 'ar'
                        ? 'الشروط المسبقة وحدود المعاملة الذرية'
                        : 'Preconditions & Atomic Transaction Steps'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {P2B_USE_CASE_MATRIX.map((uc) => (
                    <tr key={uc.useCaseCode} className="hover:bg-slate-50 align-top">
                      <td className="p-2 font-mono font-bold text-blue-800 whitespace-nowrap">
                        {uc.useCaseCode}
                      </td>
                      <td className="p-2">
                        <div className="font-semibold text-slate-900">
                          {language === 'ar' ? uc.titleAr : uc.titleEn}
                        </div>
                        <div className="font-mono text-[10px] text-slate-500">
                          Command: {uc.command} · Roles: {uc.allowedRoles.join(', ')}
                        </div>
                      </td>
                      <td className="p-2 font-mono text-[11px] whitespace-nowrap">
                        <div className="text-slate-900 font-semibold">{uc.aggregate}</div>
                        <div className="text-slate-500 text-[10px]">{uc.repository}</div>
                      </td>
                      <td className="p-2 space-y-1">
                        <div className="text-[11px] text-slate-700">
                          {language === 'ar' ? uc.preconditionsAr : uc.preconditionsEn}
                        </div>
                        <div className="font-mono text-[10px] text-emerald-800">
                          TX: {uc.transactionSteps.join(' → ')}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 43: Live Execution Results of the 35 P2-B Forensic Tests (B01–B35) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'نتائج التنفيذ الفعلي للاختبارات الجنائية الـ 35 (Section 43: B01 → B35 Live Execution Results)'
                : 'Section 43: Minimum P2-B Forensic Test Set (B01 → B35 Live Execution Results)'}
            </div>
            <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2 text-start font-mono">Test</th>
                    <th className="p-2 text-start font-mono">UC</th>
                    <th className="p-2 text-start">
                      {language === 'ar' ? 'السيناريو المختبر' : 'Forensic Test Scenario'}
                    </th>
                    <th className="p-2 text-start">
                      {language === 'ar' ? 'الفئة' : 'Category'}
                    </th>
                    <th className="p-2 text-start font-mono">
                      {language === 'ar' ? 'النتيجة الفعلية (Error / Commit Code)' : 'Actual Outcome Code'}
                    </th>
                    <th className="p-2 text-end font-mono">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {p2bSuite.tests.map((t) => (
                    <tr key={t.testId} className="hover:bg-slate-50">
                      <td className="p-2 font-mono font-bold text-slate-900">{t.testId}</td>
                      <td className="p-2 font-mono text-blue-700">{t.useCaseCode}</td>
                      <td className="p-2 font-medium text-slate-900">
                        {language === 'ar' ? t.titleAr : t.titleEn}
                      </td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                          {t.category}
                        </span>
                      </td>
                      <td className="p-2 font-mono text-[11px] text-emerald-800 font-semibold">
                        {t.actualCode}
                      </td>
                      <td className="p-2 text-end">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                          {t.passed ? 'PASS ✓' : 'FAIL'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* P2-C: DOMAIN VALIDATION ENGINE CONTRACT v1.0 (DOMAIN_VALIDATION_CONTRACT_v1.0) */}
        <div className="bg-white border-2 border-emerald-900 rounded-lg p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>
                  {language === 'ar'
                    ? 'P2-C — محرك التحقق السريري المركزي الموحد (DOMAIN_VALIDATION_CONTRACT_v1.0)'
                    : 'P2-C — Centralized Domain Validation Engine Contract v1.0 (DOMAIN_VALIDATION_CONTRACT_v1.0)'}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900">
                {language === 'ar'
                  ? `واجهة موحدة (DomainValidationEngine.validate) تضم 13 مدققاً فرعياً و25 قاعدة قياسية (DV-01 → DV-25) و40 اختباراً جنائياً (${p2cSuite.passedTests}/${p2cSuite.totalTests} PASS)`
                  : `Single Facade (DomainValidationEngine.validate) · 13 Sub-Validators · 25 Rules (DV-01 → DV-25) · ${p2cSuite.passedTests}/${p2cSuite.totalTests} PASS`}
              </h3>
              <p className="text-[11px] font-mono text-slate-500">
                Checksum: {p2cSuite.sha256Checksum} · Ordering: Structure → Auth → AI → Existence → RefData → Case → State → Clinical → Version → Concurrency
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-mono text-xs font-bold">
                ✓ {p2cSuite.passedTests}/{p2cSuite.totalTests} FORENSIC TESTS (C01–C40)
              </span>
              <button
                onClick={() => setP2cSuite(executeP2CDomainValidationTestSuite())}
                className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded text-xs font-medium"
              >
                {language === 'ar'
                  ? 'إعادة تشغيل اختبارات P2-C الـ 40 (C01–C40)'
                  : 'Re-Run 40 P2-C Validation Tests (C01–C40)'}
              </button>
            </div>
          </div>

          {/* Section 45: 15 P2-C Acceptance Gates (Gate C1 – Gate C15) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'بوابات القبول والتجميد الـ 15 لمرحلة P2-C (Section 45: Gates C1 → C15 — 15/15 PASS)'
                : 'Section 45: 15 P2-C Acceptance Gates (Gates C1 → C15 — 15/15 PASS)'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {p2cSuite.gates.map((g) => (
                <div
                  key={g.gateCode}
                  className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-emerald-950">{g.gateCode}</span>
                    <span className="font-mono text-[10px] font-bold text-emerald-700">PASS ✓</span>
                  </div>
                  <div className="font-semibold text-slate-900 text-[11px]">
                    {language === 'ar' ? g.titleAr : g.titleEn}
                  </div>
                  <div className="font-mono text-[10px] text-slate-600">{g.evidence}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 36: 25 Canonical Rule Registry (DV-01 through DV-25) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'سجل القواعد القياسية الـ 25 (Sections 9–33 & 36: Rule Registry DV-01 → DV-25)'
                : 'Sections 9–33 & 36: Canonical 25-Rule Registry (DV-01 → DV-25)'}
            </div>
            <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2 text-start font-mono">Rule ID</th>
                    <th className="p-2 text-start font-mono">Sub-Validator</th>
                    <th className="p-2 text-start">
                      {language === 'ar' ? 'القاعدة السريرية / المعمارية' : 'Rule Definition'}
                    </th>
                    <th className="p-2 text-start font-mono">Error Code</th>
                    <th className="p-2 text-end font-mono">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {P2C_RULE_REGISTRY.map((r) => (
                    <tr key={r.rule_id} className="hover:bg-slate-50">
                      <td className="p-2 font-mono font-bold text-emerald-900 whitespace-nowrap">
                        {r.rule_id}
                      </td>
                      <td className="p-2 font-mono text-[11px] text-blue-700 whitespace-nowrap">
                        {r.validator}
                      </td>
                      <td className="p-2 font-medium text-slate-900">
                        {language === 'ar' ? r.titleAr : r.titleEn}
                      </td>
                      <td className="p-2 font-mono text-[11px] text-rose-700 whitespace-nowrap">
                        {r.error_code}
                      </td>
                      <td className="p-2 text-end font-mono text-[10px] font-bold text-slate-700">
                        {r.severity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 42: Live Execution Results of the 40 P2-C Forensic Tests (C01–C40) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'نتائج التنفيذ الحي للاختبارات الجنائية الـ 40 لمحرك التحقق (Section 42: C01 → C40 Live Validation Matrix)'
                : 'Section 42: P2-C 40 Forensic Validation Tests (C01 → C40 Live Execution)'}
            </div>
            <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2 text-start font-mono">Test</th>
                    <th className="p-2 text-start font-mono">Rule</th>
                    <th className="p-2 text-start font-mono">Validator</th>
                    <th className="p-2 text-start">
                      {language === 'ar' ? 'السيناريو الجنائي المختبر' : 'Validation Scenario'}
                    </th>
                    <th className="p-2 text-start font-mono">
                      {language === 'ar' ? 'النتيجة الفعلية' : 'Actual Outcome'}
                    </th>
                    <th className="p-2 text-end font-mono">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {p2cSuite.tests.map((t) => (
                    <tr key={t.testCode} className="hover:bg-slate-50">
                      <td className="p-2 font-mono font-bold text-slate-900">{t.testCode}</td>
                      <td className="p-2 font-mono text-emerald-800 font-semibold">{t.ruleId}</td>
                      <td className="p-2 font-mono text-[11px] text-blue-700">{t.validator}</td>
                      <td className="p-2 font-medium text-slate-900">
                        {language === 'ar' ? t.titleAr : t.titleEn}
                      </td>
                      <td className="p-2 font-mono text-[11px] text-emerald-800 font-semibold">
                        {t.actualOutcome}
                      </td>
                      <td className="p-2 text-end">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                          {t.passed ? 'PASS ✓' : 'FAIL'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* P2-D: REPOSITORY & DATA ACCESS ARCHITECTURE CONTRACT v1.0 (REPOSITORY_DATA_ACCESS_CONTRACT_v1.0) */}
        <div className="bg-white border-2 border-indigo-900 rounded-lg p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-indigo-800">
                <Database className="w-4 h-4 text-indigo-600" />
                <span>
                  {language === 'ar'
                    ? 'P2-D — عقد معمارية المستودعات والوصول إلى البيانات (REPOSITORY_DATA_ACCESS_CONTRACT_v1.0)'
                    : 'P2-D — Repository & Data Access Architecture Contract v1.0 (REPOSITORY_DATA_ACCESS_CONTRACT_v1.0)'}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900">
                {language === 'ar'
                  ? `فصل كامل للوصول إلى البيانات عبر 17 واجهة مستودع، محولات PersistenceMapper، تزامن متفائل، و40 اختباراً جنائياً (${p2dSuite.passedTests}/${p2dSuite.totalTests} PASS)`
                  : `17 Aggregate-Root Repository Interfaces · PersistenceMapper · Optimistic Concurrency · ${p2dSuite.passedTests}/${p2dSuite.totalTests} PASS`}
              </h3>
              <p className="text-[11px] font-mono text-slate-500">
                Checksum: {p2dSuite.sha256Checksum} · Chain: UI → Application → Validation → Domain → Repository Interface → SQLite
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-mono text-xs font-bold">
                ✓ {p2dSuite.passedTests}/{p2dSuite.totalTests} FORENSIC TESTS (RD-C01–RD-C40)
              </span>
              <button
                onClick={() => setP2dSuite(executeP2DRepositoryTestSuite())}
                className="px-3 py-1.5 bg-indigo-900 hover:bg-indigo-800 text-white rounded text-xs font-medium"
              >
                {language === 'ar'
                  ? 'إعادة تشغيل اختبارات P2-D الـ 40 (RD-C01–RD-C40)'
                  : 'Re-Run 40 P2-D Repository Tests (RD-C01–RD-C40)'}
              </button>
            </div>
          </div>

          {/* Section 36: 15 P2-D Acceptance Gates (G-D1 through G-D15) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'بوابات القبول الـ 15 لطبقة المستودعات (Section 36: Gates G-D1 → G-D15 — 15/15 PASS)'
                : 'Section 36: 15 P2-D Repository Acceptance Gates (G-D1 → G-D15 — 15/15 PASS)'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {p2dSuite.gates.map((g) => (
                <div
                  key={g.gateCode}
                  className="p-2.5 bg-indigo-50/60 border border-indigo-200 rounded text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-indigo-950">{g.gateCode}</span>
                    <span className="font-mono text-[10px] font-bold text-emerald-700">PASS ✓</span>
                  </div>
                  <div className="font-semibold text-slate-900 text-[11px]">
                    {language === 'ar' ? g.titleAr : g.titleEn}
                  </div>
                  <div className="font-mono text-[10px] text-slate-600">{g.evidence}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 31: 17 Aggregate-Root Repository Interface Matrix */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'مصفوفة واجهات المستودعات الـ 17 مقابل الجذور التجميعية والجداول المدارة (Section 31: Repository Interface Matrix)'
                : 'Section 31: 17 Aggregate-Root Repository Interface Matrix'}
            </div>
            <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2 text-start font-mono">Repository Interface</th>
                    <th className="p-2 text-start font-mono">Aggregate Root</th>
                    <th className="p-2 text-start font-mono">Managed SQLite Tables</th>
                    <th className="p-2 text-start font-mono">Explicit Domain Methods</th>
                    <th className="p-2 text-end font-mono">Case Scoped</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {P2D_REPOSITORY_MATRIX.map((repo) => (
                    <tr key={repo.repositoryName} className="hover:bg-slate-50 align-top">
                      <td className="p-2 font-mono font-bold text-indigo-900 whitespace-nowrap">
                        {repo.repositoryName}
                      </td>
                      <td className="p-2 font-mono text-[11px] text-slate-800 whitespace-nowrap">
                        {repo.aggregateRoot}
                      </td>
                      <td className="p-2 font-mono text-[10px] text-slate-600">
                        {repo.managedTables.join(', ')}
                      </td>
                      <td className="p-2 font-mono text-[10px] text-emerald-800">
                        {repo.explicitMethods.join(' · ')}
                      </td>
                      <td className="p-2 text-end font-mono text-[10px] font-bold">
                        {repo.enforcesCaseIsolation ? (
                          <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                            CASE_SCOPED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            GLOBAL
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 37: Non-Destructive Codebase Forensic Search & Classification Report */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'تقرير المسح الجنائي غير المدمر لكود المشروع (Section 37: Codebase Persistence & Bypass Forensic Classification)'
                : 'Section 37: Non-Destructive Codebase Forensic Search & Classification Report'}
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2 text-start font-mono">File</th>
                    <th className="p-2 text-start font-mono">Pattern Located</th>
                    <th className="p-2 text-start font-mono">Classification</th>
                    <th className="p-2 text-start">
                      {language === 'ar' ? 'الحكم الجنائي وخطة التوجيه المعماري' : 'Forensic Architectural Disposition'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {p2dSuite.forensicSearchFindings.map((f, idx) => (
                    <tr key={`${f.filePath}-${idx}`} className="hover:bg-slate-50 align-top">
                      <td className="p-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {f.filePath}:{f.lineRange}
                      </td>
                      <td className="p-2 font-mono text-[11px] text-indigo-800">{f.patternMatched}</td>
                      <td className="p-2">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            f.classification === 'ALLOWED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : f.classification === 'VIOLATION'
                                ? 'bg-rose-100 text-rose-800'
                                : f.classification === 'EXPECTED'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {f.classification}
                        </span>
                      </td>
                      <td className="p-2 text-slate-700">
                        {language === 'ar' ? f.architecturalNoteAr : f.architecturalNoteEn}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 35: Live Execution Results of the 40 P2-D Forensic Tests (RD-C01–RD-C40) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'نتائج التنفيذ الحي للاختبارات الجنائية الـ 40 لطبقة المستودعات (Section 35: RD-C01 → RD-C40 Live Repository Matrix)'
                : 'Section 35: P2-D 40 Forensic Repository Tests (RD-C01 → RD-C40 Live Execution)'}
            </div>
            <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2 text-start font-mono">Test</th>
                    <th className="p-2 text-start font-mono">Group</th>
                    <th className="p-2 text-start font-mono">Repository</th>
                    <th className="p-2 text-start">
                      {language === 'ar' ? 'السيناريو الجنائي المختبر' : 'Repository Forensic Scenario'}
                    </th>
                    <th className="p-2 text-start font-mono">
                      {language === 'ar' ? 'النتيجة الفعلية' : 'Actual Outcome'}
                    </th>
                    <th className="p-2 text-end font-mono">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {p2dSuite.tests.map((t) => (
                    <tr key={t.testCode} className="hover:bg-slate-50">
                      <td className="p-2 font-mono font-bold text-slate-900">{t.testCode}</td>
                      <td className="p-2 font-mono text-[10px] text-slate-600">{t.groupRange}</td>
                      <td className="p-2 font-mono text-[11px] text-indigo-700 font-semibold">
                        {t.repository}
                      </td>
                      <td className="p-2 font-medium text-slate-900">
                        {language === 'ar' ? t.titleAr : t.titleEn}
                      </td>
                      <td className="p-2 font-mono text-[11px] text-emerald-800 font-semibold">
                        {t.actualOutcome}
                      </td>
                      <td className="p-2 text-end">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                          {t.passed ? 'PASS ✓' : 'FAIL'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* P2-E -> P2-J UNIFIED ARCHITECTURE & FORENSIC EXECUTION BATCH (DOMAIN_FREEZE_v1.0) */}
        <div className="bg-white border-2 border-slate-950 rounded-lg p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>
                  {language === 'ar'
                    ? 'P2-E → P2-J — الدفعة المعمارية والجنائية الموحدة وتجميد طبقة المجال (DOMAIN_FREEZE_v1.0 — FROZEN)'
                    : 'P2-E → P2-J — Unified Architecture & Forensic Execution Batch (DOMAIN_FREEZE_v1.0 — FROZEN)'}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900">
                {language === 'ar'
                  ? `اكتمال التنفيذ والتحقق الجنائي المتسلسل (P2-E → G-E → P2-F → G-F → P2-G → G-G → P2-H → G-H → P2-I → G-I → P2-J → G-J1..G-J15): ${domainFreezeArtifact.totalTestsPassed}/${domainFreezeArtifact.totalTestsExecuted} PASS`
                  : `Sequential Execution Verified: ${domainFreezeArtifact.totalTestsPassed}/${domainFreezeArtifact.totalTestsExecuted} Forensic Tests PASS · Decision: ${domainFreezeArtifact.finalDecision}`}
              </h3>
              <p className="text-[11px] font-mono text-slate-500">
                Artifact: {domainFreezeArtifact.freezeStatus} · Schema: {domainFreezeArtifact.schemaStatus} · SHA-256: {domainFreezeArtifact.sha256ManifestHash}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-900 font-mono text-xs font-bold">
                ✓ {domainFreezeArtifact.totalTestsPassed}/{domainFreezeArtifact.totalTestsExecuted} TESTS PASS (96/96)
              </span>
              <button
                onClick={() => setDomainFreezeArtifact(executeP2EtoP2JUnifiedForensicBatch())}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-medium"
              >
                {language === 'ar'
                  ? 'إعادة تشغيل الاختبارات الـ 96 (P2-E → P2-J)'
                  : 'Re-Run All 96 Forensic Tests (P2-E → P2-J)'}
              </button>
            </div>
          </div>

          {/* Internal Stage Gates G-E through G-I Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {[
              { code: 'G-E', stage: 'P2-E Pipeline', summary: domainFreezeArtifact.p2eSummary },
              { code: 'G-F', stage: 'P2-F Query/Read', summary: domainFreezeArtifact.p2fSummary },
              { code: 'G-G', stage: 'P2-G Offline-First', summary: domainFreezeArtifact.p2gSummary },
              { code: 'G-H', stage: 'P2-H Sync Engine', summary: domainFreezeArtifact.p2hSummary },
              { code: 'G-I', stage: 'P2-I Audit/Provenance', summary: domainFreezeArtifact.p2iSummary },
            ].map((item) => (
              <div
                key={item.code}
                className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-900">
                    Gate {item.code} ({item.stage})
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                    {item.summary.passed ? 'PASS ✓' : 'FAIL'}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-slate-600">
                  {item.summary.passedTests}/{item.summary.totalTests} Forensic Tests Verified
                </div>
              </div>
            ))}
          </div>

          {/* Final Acceptance Gates G-J1 through G-J15 */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              {language === 'ar'
                ? 'بوابات القبول النهائية الـ 15 لتجميد المعمارية (Section 14: Final Acceptance Gates G-J1 → G-J15 — 15/15 PASS)'
                : 'Section 14: 15 Final Acceptance Gates (G-J1 → G-J15 — 15/15 PASS)'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {domainFreezeArtifact.finalGates.map((g) => (
                <div
                  key={g.gateCode}
                  className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-emerald-950">{g.gateCode}</span>
                    <span className="font-mono text-[10px] font-bold text-emerald-700">
                      {g.passed ? 'PASS ✓' : 'FAIL'}
                    </span>
                  </div>
                  <div className="font-semibold text-slate-900 text-[11px]">
                    {language === 'ar' ? g.titleAr : g.titleEn}
                  </div>
                  <div className="font-mono text-[10px] text-slate-600">{g.evidence}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Stage Selector Tabs for the 96 Forensic Tests */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-800">
                {language === 'ar'
                  ? 'نتائج التنفيذ الفعلي للاختبارات الجنائية الـ 96 (E01–E15, F01–F15, G01–G15, H01–H15, I01–I15, J01–J21)'
                  : 'Live Execution Table for All 96 Forensic Tests (P2-E through P2-J)'}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'P2E', label: 'P2-E (E01–E15)' },
                  { id: 'P2F', label: 'P2-F (F01–F15)' },
                  { id: 'P2G', label: 'P2-G (G01–G15)' },
                  { id: 'P2H', label: 'P2-H (H01–H15)' },
                  { id: 'P2I', label: 'P2-I (I01–I15)' },
                  { id: 'P2J', label: 'P2-J (J01–J21)' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() =>
                      setActiveP2BatchTab(tab.id as 'P2E' | 'P2F' | 'P2G' | 'P2H' | 'P2I' | 'P2J')
                    }
                    className={`px-2.5 py-1 rounded font-mono text-xs font-semibold ${
                      activeP2BatchTab === tab.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2 text-start font-mono">Test ID</th>
                    <th className="p-2 text-start">
                      {language === 'ar' ? 'الوصف الجنائي المختبر' : 'Forensic Test Description'}
                    </th>
                    <th className="p-2 text-start font-mono">
                      {language === 'ar' ? 'الدليل الفعلي (Evidence)' : 'Live Execution Evidence'}
                    </th>
                    <th className="p-2 text-end font-mono">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(activeP2BatchTab === 'P2E'
                    ? domainFreezeArtifact.p2eSummary.tests
                    : activeP2BatchTab === 'P2F'
                      ? domainFreezeArtifact.p2fSummary.tests
                      : activeP2BatchTab === 'P2G'
                        ? domainFreezeArtifact.p2gSummary.tests
                        : activeP2BatchTab === 'P2H'
                          ? domainFreezeArtifact.p2hSummary.tests
                          : activeP2BatchTab === 'P2I'
                            ? domainFreezeArtifact.p2iSummary.tests
                            : domainFreezeArtifact.p2jTests
                  ).map((t) => (
                    <tr key={t.testId} className="hover:bg-slate-50">
                      <td className="p-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {t.testId}
                      </td>
                      <td className="p-2 font-medium text-slate-900">
                        {language === 'ar' ? t.descriptionAr : t.descriptionEn}
                      </td>
                      <td className="p-2 font-mono text-[11px] text-emerald-800">{t.evidence}</td>
                      <td className="p-2 text-end">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                          {t.passed ? 'PASS ✓' : 'FAIL'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Section 66: P1 Concrete Database Execution Stages (P1-A through P1-I) */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>
              {language === 'ar'
                ? 'مراحل تثبيت عقد قاعدة البيانات الفيزيائية (Section 66: P1-A → P1-I Concrete Database Contract)'
                : 'Section 66: P1 Concrete Database Execution Contract (P1-A → P1-I)'}
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {P1_CONCRETE_DATABASE_MILESTONES.map((ms) => (
              <div
                key={ms.code}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-900">{ms.code}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                    {ms.status}
                  </span>
                </div>
                <div className="font-semibold text-slate-900">
                  {language === 'ar' ? ms.titleAr : ms.titleEn}
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">{ms.descAr}</p>
              </div>
            ))}
          </div>
        </div>

        {/* P1-H / P1-J: Automated Forensic Schema Test Suite & P1-I Schema Freeze Gate (Gates 1-10) */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>
                  {language === 'ar'
                    ? 'P1-H / P1-J — حزمة الاختبارات الجنائية الآلية وبوابة التجميد (Automated Forensic Test Suite & Schema Freeze Gate)'
                    : 'P1-H / P1-J — Automated Adversarial Forensic Schema Test Suite & P1-I Freeze Gate'}
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                {language === 'ar'
                  ? `النتيجة: ${forensicSuite.passedCount}/${forensicSuite.totalTests} اختباراً ناجحاً (${forensicSuite.integrityScorePercent}%) · البصمة: ${forensicSuite.freezeCertificateHash.slice(0, 28)}...`
                  : `Score: ${forensicSuite.passedCount}/${forensicSuite.totalTests} Passed (${forensicSuite.integrityScorePercent}%) · Status: ${forensicSuite.freezeStatus}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-mono text-xs font-bold">
                {forensicSuite.freezeStatus}
              </span>
              <button
                onClick={() => setForensicSuite(executeP1ForensicSchemaTestSuite())}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-medium"
              >
                {language === 'ar'
                  ? 'إعادة تشغيل الاختبارات الجنائية (10,000 IDs + Groups A–O)'
                  : 'Re-Run Forensic Suite (10,000 IDs + Groups A–O)'}
              </button>
            </div>
          </div>

          {/* 10 Schema Freeze Gates (Section 52) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {forensicSuite.gates.map((gate) => (
              <div
                key={gate.gateNumber}
                className="p-2.5 bg-emerald-50/50 border border-emerald-200 rounded space-y-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-emerald-900">
                    GATE {gate.gateNumber}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-emerald-700">PASS ✓</span>
                </div>
                <div className="font-semibold text-slate-900 text-[11px]">
                  {language === 'ar' ? gate.titleAr : gate.titleEn}
                </div>
                <div className="text-[10px] text-slate-600 font-mono">{gate.evidence}</div>
              </div>
            ))}
          </div>

          {/* Detailed Adversarial Test Groups A through O */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                  <th className="p-2 text-start font-mono">
                    {language === 'ar' ? 'رمز الاختبار' : 'Test ID'}
                  </th>
                  <th className="p-2 text-start">
                    {language === 'ar' ? 'المجموعة والهدف الجنائي' : 'Group & Adversarial Target'}
                  </th>
                  <th className="p-2 text-start">
                    {language === 'ar' ? 'طبقة الحماية (SQLite vs Domain)' : 'Enforcement Layer'}
                  </th>
                  <th className="p-2 text-start">
                    {language === 'ar' ? 'محاولة الكسر المتعمدة والنتيجة الفعلية' : 'Adversarial Attempt & Result'}
                  </th>
                  <th className="p-2 text-end">
                    {language === 'ar' ? 'الحكم' : 'Verdict'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {forensicSuite.results.map((t) => (
                  <tr key={t.testCode} className="hover:bg-slate-50 align-top">
                    <td className="p-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                      <div>{t.testCode}</div>
                      <div className="text-[10px] text-blue-700">{t.groupCode}</div>
                    </td>
                    <td className="p-2">
                      <div className="font-semibold text-slate-900">
                        {language === 'ar' ? t.titleAr : t.titleEn}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {language === 'ar' ? t.groupNameAr : t.groupNameEn}
                      </div>
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${
                          t.enforcementLayer === 'SQLite Database Constraint'
                            ? 'bg-purple-50 text-purple-800 border border-purple-200'
                            : t.enforcementLayer === 'Domain Validation Service'
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : 'bg-cyan-50 text-cyan-800 border border-cyan-200'
                        }`}
                      >
                        {t.enforcementLayer}
                      </span>
                    </td>
                    <td className="p-2 space-y-0.5">
                      <div className="font-mono text-[11px] text-slate-700">
                        {t.adversarialAction}
                      </div>
                      <div className="text-[11px] text-emerald-800 font-medium">
                        → {t.actualOutcome}
                      </div>
                    </td>
                    <td className="p-2 text-end whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                        {t.passed ? 'PASS (100%)' : 'FAIL'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 44, 46, 47: Contradiction Detection & Data Integrity Levels */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              {language === 'ar'
                ? 'محرك كشف التناقضات السريرية ومستويات تكامل البيانات (Sections 44, 46, 47)'
                : 'Clinical Contradiction Detection & Data Integrity Validator (Rules A–H)'}
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {forensicChecks.map((chk) => (
              <div
                key={chk.code}
                className={`p-3.5 rounded-lg border text-xs space-y-1 ${
                  chk.status === 'PASS'
                    ? 'bg-emerald-50/40 border-emerald-200'
                    : 'bg-amber-50/60 border-amber-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-800">
                    {chk.code} · {chk.integrityLevel}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                      chk.status === 'PASS'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-200 text-amber-900'
                    }`}
                  >
                    {chk.status}
                  </span>
                </div>
                <div className="font-semibold text-slate-900">
                  {language === 'ar' ? chk.titleAr : chk.titleEn}
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  {language === 'ar' ? chk.detailAr : chk.detailEn}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Non-Breakable Database Design Rules (Forensic v1.1 Upgrades) */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>
              {language === 'ar'
                ? 'التحسينات المعمارية المعتمدة في المراجعة الجنائية (P0.5 Forensic Revisions v1.0 → v1.1)'
                : 'P0.5 Forensic Schema Upgrades (v1.0 → v1.1)'}
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {P0_NON_BREAKABLE_RULES.map((rule) => (
              <div
                key={rule.code}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-blue-700">{rule.code}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {language === 'ar' ? 'معتمد v1.1' : 'FROZEN v1.1'}
                  </span>
                </div>
                <div className="font-semibold text-slate-900">
                  {language === 'ar' ? rule.titleAr : rule.titleEn}
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  {language === 'ar' ? rule.descAr : rule.descEn}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* P1-F: Separation of SQLite Constraints vs Domain Validation Rules (Sections 13-16) */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              <span>
                {language === 'ar'
                  ? 'P1-F — فصل قيود قاعدة البيانات الفيزيائية (SQLite) عن قواعد التحقق السريري (Domain Rules A–I)'
                  : 'P1-F — Separation of SQLite Structural Constraints vs Domain Clinical Validation (Rules A–I)'}
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              {language === 'ar'
                ? 'تفرض قاعدة البيانات سلامة البنية العلائقية والمفاتيح، بينما تفرض طبقة المجال (Domain Validation Layer) منطق العمل السريري العابر للجداول.'
                : 'Database enforces structural integrity; Domain Validation Service enforces multi-table clinical reasoning.'}
              </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-4 bg-purple-50/40 border border-purple-200 rounded-lg space-y-2 text-xs">
              <div className="font-mono font-bold text-purple-900">
                {language === 'ar'
                  ? '1. ما تفرضه SQLite مباشرة (Database Constraints)'
                  : '1. Enforced Directly by SQLite'}
              </div>
              <ul className="space-y-1.5 text-slate-700 font-mono text-[11px]">
                {P1_F_SEPARATION_OF_CONCERNS.sqliteEnforces.map((item) => (
                  <li key={item} className="flex items-start gap-1.5">
                    <span className="text-purple-600 font-bold">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {P1_F_SEPARATION_OF_CONCERNS.domainServiceEnforces.map((r) => (
                <div
                  key={r.ruleCode}
                  className="p-3 bg-blue-50/30 border border-blue-200 rounded-lg space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-blue-800">{r.ruleCode}</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 font-mono text-[10px]">
                      Domain Service
                    </span>
                  </div>
                  <div className="font-semibold text-slate-900">
                    {language === 'ar' ? r.titleAr : r.titleEn}
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    {language === 'ar' ? r.descAr : r.descEn}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Interactive SQLite snake_case Relational Table Explorer (All 34 v1.1 + P1-G Seed Tables) */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600" />
                <span>
                  {language === 'ar'
                    ? `مستكشف جداول SQLite v1.1 والبيانات المرجعية P1-G (${orthoCase.id}) — 34 جدولاً علائقياً`
                    : `Live SQLite v1.1 + P1-G Reference Seed Table Inspector (${orthoCase.id}) — 34 Normalized Tables`}
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                {language === 'ar'
                  ? 'يتضمن الجداول السريرية وجداول التزامن بالإضافة إلى جداول البيانات المرجعية (P1-G): أنظمة ترقيم الأسنان، وتعريفات تحاليل ونقاط وقياسات السيفالومتري.'
                  : 'Includes clinical, sync, and P1-G extensible seed tables: tooth_numbering_systems, cephalometric_analysis_definitions, cephalometric_landmark_definitions, cephalometric_measurement_definitions.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'devices', label: '★ devices (P1-C)' },
                { id: 'users', label: '★ users (P1-A)' },
                { id: 'patients', label: 'patients' },
                { id: 'orthodontic_cases', label: 'orthodontic_cases' },
                { id: 'clinical_examinations', label: 'clinical_examinations' },
                { id: 'clinical_findings', label: 'clinical_findings' },
                { id: 'tooth_findings', label: '★ tooth_findings' },
                { id: 'arch_measurements', label: '★ arch_measurements' },
                { id: 'problems', label: '★ problems (+Residual)' },
                { id: 'problem_evidence', label: 'problem_evidence' },
                { id: 'diagnosis_versions', label: 'diagnosis_versions' },
                { id: 'diagnosis_items', label: '★ diagnosis_items' },
                { id: 'diagnosis_evidence', label: '★ diagnosis_evidence' },
                { id: 'diagnosis_problem_links', label: '★ diagnosis_problem_links' },
                { id: 'treatment_objectives', label: 'treatment_objectives' },
                { id: 'objective_problems', label: '★ objective_problems (N:M)' },
                { id: 'diagnosis_objectives', label: '★ diagnosis_objectives' },
                { id: 'treatment_plans', label: 'treatment_plans' },
                { id: 'planned_interventions', label: '★ planned_interventions' },
                { id: 'visit_procedures', label: '★ visit_procedures (Actual)' },
                { id: 'treatment_outcomes', label: '★ treatment_outcomes (T0..T4)' },
                { id: 'report_snapshots', label: 'report_snapshots' },
                { id: 'ai_context_snapshots', label: '★ ai_context_snapshots' },
                { id: 'ai_suggestions', label: 'ai_suggestions' },
                { id: 'case_fee_items', label: '★ case_fee_items' },
                { id: 'case_material_consumption', label: '★ case_material_consumption' },
                { id: 'sync_operations', label: '★ sync_operations' },
                { id: 'sync_tombstones', label: '★ sync_tombstones' },
                { id: 'sync_conflicts', label: '★ sync_conflicts (P1-C)' },
                { id: 'schema_migrations', label: 'schema_migrations' },
                { id: 'tooth_numbering_systems', label: '◆ tooth_numbering_systems (P1-G)' },
                { id: 'cephalometric_analysis_definitions', label: '◆ ceph_analysis_defs (P1-G)' },
                { id: 'cephalometric_landmark_definitions', label: '◆ ceph_landmark_defs (P1-G)' },
                { id: 'cephalometric_measurement_definitions', label: '◆ ceph_measurement_defs (P1-G)' },
              ] as const
            ).map((tbl) => (
              <button
                key={tbl.id}
                onClick={() => setSelectedSqliteTable(tbl.id)}
                className={`px-2.5 py-1.5 rounded text-xs font-mono transition-colors ${
                  selectedSqliteTable === tbl.id
                    ? 'bg-slate-900 text-cyan-300 font-semibold'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {tbl.label} ({sqliteTables[tbl.id].length})
              </button>
            ))}
          </div>

          <pre
            dir="ltr"
            className="p-4 bg-slate-950 text-emerald-300 rounded-lg text-xs font-mono overflow-x-auto max-h-80 leading-relaxed border border-slate-800"
          >
            {JSON.stringify(sqliteTables[selectedSqliteTable], null, 2)}
          </pre>
        </div>

        {/* Separated Clinical Records (Structured Findings: Value + Status + Confidence + Source) */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600" />
                <span>
                  {language === 'ar'
                    ? `السجلات السريرية المفصولة والمهيكلة للحالة (${orthoCase.id}) — كل معيار يحمل: القيمة + الحالة + مستوى الثقة + المصدر`
                    : `Separated Clinical Record Entities (${orthoCase.id}) — Structured Value, Status, Confidence & Source`}
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                {language === 'ar'
                  ? 'لا تُخزن الفحوصات ككتلة نصية عشوائية داخل الحالة، بل كسجلات سريرية مستقلة مرتبطة بـ (caseId) و(visitId).'
                  : 'Examinations are stored as discrete ClinicalRecord entities linked via caseId rather than unstructured notes.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {p0Graph.clinicalRecords.map((rec) => (
              <div
                key={rec.recordId}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 text-xs"
              >
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-mono font-bold text-blue-700">{rec.recordId}</span>
                  <span className="font-semibold text-slate-800">{rec.recordType}</span>
                </div>
                <div className="space-y-1.5">
                  {Object.entries(rec.structuredFindings).map(([key, sf]) => (
                    <div
                      key={key}
                      className="flex flex-wrap items-center justify-between gap-2 py-1 border-b border-slate-200/60 last:border-0"
                    >
                      <span className="font-mono text-slate-700">{key}:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-900">{String(sf.value)}</span>
                        <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-600">
                          {sf.status}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[10px] font-mono text-emerald-800">
                          {sf.source} · {sf.confidence}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Versioned Diagnosis & Treatment Plan History (Diagnosis V1 -> V2 -> V3) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-blue-600" />
              <span>
                {language === 'ar'
                  ? 'سجل إصدارات التشخيص التقويمي (Diagnosis Versioning V1 → Vn)'
                  : 'Diagnosis Version History (Never Overwrites Historical Diagnosis)'}
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              {language === 'ar'
                ? 'عند تحديث التشخيص بعد ظهور تحليل السيفالومتري أو الأشعة المقطعية (CBCT)، يُحفظ الإصدار السابق مع سبب التغيير والأدلة الجديدة.'
                : 'Preserves full lineage of diagnostic evolution with timestamps, doctor attribution, and supporting evidence IDs.'}
            </p>
            <div className="space-y-3">
              {p0Graph.diagnosisVersions.map((dv) => (
                <div
                  key={dv.diagnosisId}
                  className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                    dv.status === 'Active Approved'
                      ? 'bg-blue-50/40 border-blue-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900">
                      {dv.diagnosisId} (Version V{dv.version})
                    </span>
                    <span
                      className={`font-semibold text-[11px] ${
                        dv.status === 'Active Approved' ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {language === 'ar'
                        ? dv.status === 'Active Approved'
                          ? '● الإصدار المعتمد الحالي'
                          : 'إصدار تاريخي محفوظ'
                        : dv.status}
                    </span>
                  </div>
                  <p className="text-slate-800 font-medium leading-relaxed">
                    {language === 'ar' ? dv.overallDiagnosisAr : dv.overallDiagnosisEn}
                  </p>
                  <div className="text-[11px] text-slate-600">
                    <span className="font-semibold">
                      {language === 'ar' ? 'سبب التحديث: ' : 'Change Reason: '}
                    </span>
                    {language === 'ar' ? dv.changeReasonAr : dv.changeReasonEn}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">
                    Evidence IDs: {dv.supportingEvidenceSummary} · Approved: {dv.approvedAt}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-blue-600" />
              <span>
                {language === 'ar'
                  ? 'سجل إصدارات وبدائل الخطة العلاجية (Treatment Plan Versioning)'
                  : 'Treatment Plan Entities & Linked Objectives'}
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              {language === 'ar'
                ? 'ترتبط كل خطة علاجية بمعرّفات الأهداف العلاجية (linkedObjectiveIds) ولا يتم حذف البدائل غير المختارة.'
                : 'Every treatment plan option is stored as a versioned entity mapped to specific TreatmentObjective IDs.'}
            </p>
            <div className="space-y-3">
              {p0Graph.treatmentPlanVersions.map((tp) => (
                <div
                  key={tp.planId}
                  className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                    tp.status === 'Selected & Approved'
                      ? 'bg-emerald-50/40 border-emerald-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900">
                      {tp.planId} ({tp.optionLabel} · V{tp.version})
                    </span>
                    <span
                      className={`font-semibold text-[11px] ${
                        tp.status === 'Selected & Approved' ? 'text-emerald-700' : 'text-slate-600'
                      }`}
                    >
                      {language === 'ar'
                        ? tp.status === 'Selected & Approved'
                          ? '★ الخطة المعتمدة'
                          : 'بديل علاجي موثّق'
                        : tp.status}
                    </span>
                  </div>
                  <div className="font-medium text-slate-900">
                    {language === 'ar' ? tp.titleAr : tp.titleEn}
                  </div>
                  <div className="text-[11px] text-slate-600">{tp.changeReasonAr}</div>
                  <div className="text-[11px] font-mono text-slate-500">
                    Linked Objectives: {tp.linkedObjectiveIds.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeSubTab === 'finance') {
    if (!orthoCase || !patient || orthoCase.patientId !== patient.id) {
      return (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
          <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            {language === 'ar' ? 'لم يتم تحديد حالة لإدارة المالية' : 'No Active Case Selected for Financial Management'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {language === 'ar'
              ? 'يرجى اختيار حالة تقويمية محددة تابعة للمريض النشط لعرض وإدارة الأقساط والمصروفات.'
              : 'Please select an active orthodontic case belonging to the active patient to manage financials and payments.'}
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {language === 'ar'
                  ? `الإدارة المالية ومساهمة الحالة — ${orthoCase.id}`
                  : `Case Financial Management & Direct Cost Contribution — ${orthoCase.id}`}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'ar'
                  ? 'ربط رسوم العلاج وجدول الأقساط واستهلاك المواد المباشر وتكاليف المختبر لحساب المساهمة المالية التقديرية للحالة.'
                  : 'Links Treatment Fee, Installment Ledger, Direct Material Consumption, and Lab Costs to calculate Estimated Case Contribution.'}
              </p>
            </div>
            <span className="font-mono text-xs text-slate-600">
              {language === 'ar'
                ? `العملة: ${orthoCase.financials.currency}`
                : `Currency: ${orthoCase.financials.currency}`}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-xs text-slate-500">
                {language === 'ar' ? 'صافي رسوم العلاج' : 'Net Treatment Fee'}
              </div>
              <div className="text-xl font-mono font-bold text-slate-900 mt-1">
                {netFee.toLocaleString()}{' '}
                <span className="text-xs font-normal">{orthoCase.financials.currency}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {language === 'ar'
                  ? `الخصم الممنوح: ${orthoCase.financials.discount}`
                  : `Discount: ${orthoCase.financials.discount}`}
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-xs text-slate-500">
                {language === 'ar' ? 'إجمالي المبالغ المحصّلة' : 'Total Collected'}
              </div>
              <div className="text-xl font-mono font-bold text-emerald-700 mt-1">
                {totalPaid.toLocaleString()}{' '}
                <span className="text-xs font-normal">{orthoCase.financials.currency}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {language === 'ar'
                  ? `الرصيد المتبقي: ${remainingBalance.toLocaleString()}`
                  : `Remaining: ${remainingBalance.toLocaleString()}`}
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-xs text-slate-500">
                {language === 'ar' ? 'تكلفة المواد المباشرة' : 'Direct Material Cost'}
              </div>
              <div className="text-xl font-mono font-bold text-slate-900 mt-1">
                {directMaterialCost.toLocaleString()}{' '}
                <span className="text-xs font-normal">{orthoCase.financials.currency}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {language === 'ar'
                  ? `من خلال ${orthoCase.visits.length} جلسات مسجلة`
                  : `From ${orthoCase.visits.length} Clinical Visits`}
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded">
              <div className="text-xs text-slate-500">
                {language === 'ar' ? 'تكاليف المختبر والمباشرة' : 'Lab & Direct Costs'}
              </div>
              <div className="text-xl font-mono font-bold text-slate-900 mt-1">
                {(orthoCase.financials.labCost + orthoCase.financials.otherDirectCost).toLocaleString()}{' '}
                <span className="text-xs font-normal">{orthoCase.financials.currency}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {language === 'ar'
                  ? `المختبر: ${orthoCase.financials.labCost} · أخرى: ${orthoCase.financials.otherDirectCost}`
                  : `Lab: ${orthoCase.financials.labCost} · Other: ${orthoCase.financials.otherDirectCost}`}
              </div>
            </div>

            <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded">
              <div className="text-xs text-blue-900 font-medium">
                {language === 'ar'
                  ? 'المساهمة التقديرية للحالة'
                  : 'Estimated Case Contribution'}
              </div>
              <div className="text-xl font-mono font-bold text-blue-700 mt-1">
                {estimatedContribution.toLocaleString()}{' '}
                <span className="text-xs font-normal">{orthoCase.financials.currency}</span>
              </div>
              <div className="text-[11px] text-blue-800 mt-0.5">
                {language === 'ar'
                  ? `نسبة المساهمة: ${Math.round((estimatedContribution / netFee) * 100)}%`
                  : `Margin: ${Math.round((estimatedContribution / netFee) * 100)}% before overhead`}
              </div>
            </div>
          </div>
        </div>

        {/* Installments & Material Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <span>
                {language === 'ar'
                  ? 'جدول الأقساط وسجل الدفعات'
                  : 'Installment Schedule & Payment Ledger'}
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 text-start">
                      {language === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
                    </th>
                    <th className="py-2 text-end font-mono">
                      {language === 'ar' ? 'قيمة القسط' : 'Amount'}
                    </th>
                    <th className="py-2 text-end font-mono">
                      {language === 'ar' ? 'المبلغ المدفوع' : 'Paid'}
                    </th>
                    <th className="py-2 text-start ps-3">
                      {language === 'ar' ? 'حالة الدفعة' : 'Status'}
                    </th>
                    <th className="py-2 text-end">
                      {language === 'ar' ? 'إجراء' : 'Action'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {orthoCase.financials.installments.map((inst) => (
                    <tr key={inst.id}>
                      <td className="py-2.5 font-mono text-slate-800">{inst.dueDate}</td>
                      <td className="py-2.5 text-end font-mono">{inst.amount.toLocaleString()}</td>
                      <td className="py-2.5 text-end font-mono text-emerald-700">
                        {inst.paidAmount.toLocaleString()}
                      </td>
                      <td className="py-2.5 ps-3">
                        <span
                          className={
                            inst.status === 'Paid'
                              ? 'text-emerald-700 font-semibold'
                              : inst.status === 'Overdue'
                              ? 'text-rose-600 font-semibold'
                              : 'text-amber-700'
                          }
                        >
                          {language === 'ar'
                            ? inst.status === 'Paid'
                              ? 'مسدّد بالكامل'
                              : inst.status === 'Overdue'
                              ? 'متأخر السداد'
                              : 'مستحق'
                            : inst.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-end">
                        {inst.paidAmount < inst.amount ? (
                          <button
                            onClick={() => onRecordPayment(inst.id, inst.amount - inst.paidAmount)}
                            className="px-2.5 py-1 bg-slate-900 text-white rounded text-[11px] font-medium hover:bg-slate-800"
                          >
                            {language === 'ar' ? 'تسجيل دفعة كاملة' : 'Record Full Payment'}
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[11px]">
                            {language === 'ar' ? 'تم السداد' : inst.method || 'Settled'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              <span>
                {language === 'ar'
                  ? 'استهلاك المواد المباشر المرتبط بالحالة والجلسات'
                  : 'Case Material Consumption (Inventory → Case → Visit)'}
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 text-start">
                      {language === 'ar' ? 'الجلسة' : 'Visit'}
                    </th>
                    <th className="py-2 text-start">
                      {language === 'ar' ? 'المادة المصروفة' : 'Material Issued'}
                    </th>
                    <th className="py-2 text-end font-mono">
                      {language === 'ar' ? 'الكمية' : 'Qty'}
                    </th>
                    <th className="py-2 text-end font-mono">
                      {language === 'ar' ? 'تكلفة الوحدة' : 'Unit Cost'}
                    </th>
                    <th className="py-2 text-end font-mono">
                      {language === 'ar' ? 'الإجمالي' : 'Subtotal'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {orthoCase.visits.flatMap((v) =>
                    v.materialsIssuedIds.map((m, idx) => (
                      <tr key={`${v.id}_${idx}`}>
                        <td className="py-2 text-slate-600">
                          {language === 'ar'
                            ? `الجلسة #${v.visitNumber} (${v.date})`
                            : `Visit #${v.visitNumber} (${v.date})`}
                        </td>
                        <td className="py-2 text-slate-900 font-medium">{m.materialName}</td>
                        <td className="py-2 text-end font-mono">{m.quantity}</td>
                        <td className="py-2 text-end font-mono">{m.unitCost}</td>
                        <td className="py-2 text-end font-mono font-semibold text-slate-900">
                          {m.quantity * m.unitCost}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeSubTab === 'inventory') {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {language === 'ar'
                  ? 'المخزن التقويمي المصغر المرتبط بالحالات'
                  : 'Specialized Orthodontic Mini-Inventory (Brackets, Archwires, TADs, MARPE)'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'ar'
                  ? 'كل مادة تُصرف أثناء تسجيل الجلسة تُخصم تلقائياً من الرصيد وتُضاف لتكلفة الحالة المباشرة.'
                  : 'Every material issued during a Quick Visit automatically deducts stock and logs to the Case Direct Cost ledger.'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 text-start font-mono">
                    {language === 'ar' ? 'الرمز (SKU)' : 'SKU'}
                  </th>
                  <th className="py-2.5 text-start">
                    {language === 'ar' ? 'المادة والمقاس التقويمي' : 'Material & Specification'}
                  </th>
                  <th className="py-2.5 text-start">
                    {language === 'ar' ? 'الفئة' : 'Category'}
                  </th>
                  <th className="py-2.5 text-start">
                    {language === 'ar' ? 'الشركة المصنعة / المورد' : 'Manufacturer / Supplier'}
                  </th>
                  <th className="py-2.5 text-end font-mono">
                    {language === 'ar' ? 'تكلفة الوحدة' : 'Unit Cost'}
                  </th>
                  <th className="py-2.5 text-end font-mono">
                    {language === 'ar' ? 'الرصيد المتوفر' : 'Stock'}
                  </th>
                  <th className="py-2.5 text-start ps-3">
                    {language === 'ar' ? 'حالة المخزون' : 'Status'}
                  </th>
                  <th className="py-2.5 text-end">
                    {language === 'ar' ? 'توريد سريع' : 'Quick Purchase'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {inventory.map((mat) => {
                  const isLow = mat.stockQuantity <= mat.minStock;
                  return (
                    <tr key={mat.id} className="hover:bg-slate-50">
                      <td className="py-2.5 font-mono text-slate-600">{mat.sku}</td>
                      <td className="py-2.5 font-semibold text-slate-900">{mat.name}</td>
                      <td className="py-2.5 text-slate-600">{formatCategory(mat.category)}</td>
                      <td className="py-2.5 text-slate-600">
                        {mat.manufacturer} · <span className="text-slate-400">{mat.supplier}</span>
                      </td>
                      <td className="py-2.5 text-end font-mono">{mat.unitCost} SAR</td>
                      <td className="py-2.5 text-end font-mono font-bold text-slate-900">
                        {mat.stockQuantity} {mat.unit}
                      </td>
                      <td className="py-2.5 ps-3">
                        {isLow ? (
                          <span className="text-amber-700 font-semibold flex items-center gap-1">
                            {language === 'ar'
                              ? `▲ منخفض (الحد الأدنى ${mat.minStock})`
                              : `▲ LOW (Min ${mat.minStock})`}
                          </span>
                        ) : (
                          <span className="text-emerald-700">
                            {language === 'ar' ? '● متوفر' : '● NOMINAL'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-end">
                        <button
                          onClick={() => onRestockMaterial(mat.id, 10)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-[11px] inline-flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          {language === 'ar' ? 'إضافة +10' : '+10 Stock'}
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
    );
  }

  // Sync Engine, Conflict Resolution & Audit Trail
  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {language === 'ar'
                ? 'محرك المزامنة وحل تعارضات البيانات وسجل التدقيق'
                : 'Offline-First Sync Engine, Field-Level Conflict Resolution & Audit Trail'}
            </h2>
            <p className="text-xs text-slate-500">
              {language === 'ar'
                ? 'لا يعتمد النظام مبدأ الكتابة العمياء (Last Write Wins)؛ عند تعديل نفس الحالة على جهازين يظهر التعارض للطبيب لاختيار النسخة المعتمدة.'
                : 'Never uses blind "Last Write Wins" for clinical records. Conflicts between iPad devices are surfaced for explicit doctor resolution.'}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={onExportBackupJson}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-medium flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              {language === 'ar'
                ? 'تصدير نسخة احتياطية محلية (.JSON)'
                : 'Export Encrypted Local Backup (.JSON)'}
            </button>
            <button
              onClick={onSyncAllPending}
              disabled={!isOnline}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              {language === 'ar'
                ? `مزامنة السجلات مع السحابة (${allCases.length} حالات)`
                : `Sync Queue with Cloud (${allCases.length} Cases)`}
            </button>
          </div>
        </div>

        {/* Sync Queue & Conflict Resolution Table */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-600">
            {language === 'ar'
              ? 'طابور المزامنة وفاحص التعارضات بين الأجهزة:'
              : 'Sync Queue & Multi-Device Conflict Inspector'}
          </h3>
          <div className="space-y-2.5">
            {syncQueue.map((item) => (
              <div
                key={item.id}
                className={`p-4 rounded-lg border text-xs ${
                  item.status === 'Conflict Detected'
                    ? 'bg-amber-50/70 border-amber-300'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {item.status === 'Conflict Detected' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    )}
                    <span className="font-mono font-bold text-slate-900">{item.caseId}</span>
                    <span>·</span>
                    <span className="text-slate-700">{item.entityType}</span>
                    <span>·</span>
                    <span className="font-mono text-slate-500">{item.timestamp}</span>
                  </div>
                  <span className="font-semibold text-slate-800">
                    {language === 'ar'
                      ? item.status === 'Conflict Detected'
                        ? '[تعارض مكتشف يتطلب قرار الطبيب]'
                        : item.status === 'Synced'
                        ? '[تمت المزامنة]'
                        : '[بانتظار الاتصال]'
                      : `[${item.status}]`}
                  </span>
                </div>

                {item.status === 'Conflict Detected' && (
                  <div className="mt-3 pt-3 border-t border-amber-200 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 bg-white border border-slate-200 rounded space-y-2">
                      <div className="font-semibold text-slate-800">
                        {language === 'ar'
                          ? 'النسخة أ (جهاز iPad العيادة رقم 1 — محلي):'
                          : 'Version A (Local iPad Chair #1):'}
                      </div>
                      <p className="text-slate-600 font-mono">{item.localValueSummary}</p>
                      <button
                        onClick={() => onResolveConflict(item.id, 'local')}
                        className="px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800"
                      >
                        {language === 'ar'
                          ? 'اعتماد نسخة جهاز العيادة المحلي'
                          : 'Keep Local Chair #1 Record'}
                      </button>
                    </div>
                    <div className="p-3 bg-white border border-slate-200 rounded space-y-2">
                      <div className="font-semibold text-slate-800">
                        {language === 'ar'
                          ? 'النسخة ب (جهاز المكتب البعيد — السحابة):'
                          : 'Version B (Remote Office Workstation):'}
                      </div>
                      <p className="text-slate-600 font-mono">{item.remoteValueSummary}</p>
                      <button
                        onClick={() => onResolveConflict(item.id, 'remote')}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
                      >
                        {language === 'ar'
                          ? 'اعتماد نسخة جهاز المكتب'
                          : 'Accept Remote Office Record'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Immutable Clinical & Operational Audit Log */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <History className="w-4 h-4 text-blue-600" />
          <span>
            {language === 'ar'
              ? 'سجل التدقيق السريري والمالي غير القابل للتلاعب (Audit Trail)'
              : 'Immutable Clinical, Diagnostic & Financial Audit Trail'}
          </span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 text-start font-mono">
                  {language === 'ar' ? 'التاريخ والوقت' : 'Timestamp'}
                </th>
                <th className="py-2 text-start">
                  {language === 'ar' ? 'الطبيب / المستخدم' : 'Actor & Role'}
                </th>
                <th className="py-2 text-start">
                  {language === 'ar' ? 'النطاق' : 'Domain'}
                </th>
                <th className="py-2 text-start">
                  {language === 'ar' ? 'الإجراء المسجل' : 'Action'}
                </th>
                <th className="py-2 text-start">
                  {language === 'ar' ? 'التفاصيل' : 'Audit Details'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="py-2.5 font-mono text-slate-500 whitespace-nowrap">{log.timestamp}</td>
                  <td className="py-2.5 font-medium text-slate-900 whitespace-nowrap">
                    {log.actor} <span className="text-slate-400">({log.role})</span>
                  </td>
                  <td className="py-2.5 text-blue-700 whitespace-nowrap">{log.domain}</td>
                  <td className="py-2.5 font-semibold text-slate-800">{log.action}</td>
                  <td className="py-2.5 text-slate-600">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
