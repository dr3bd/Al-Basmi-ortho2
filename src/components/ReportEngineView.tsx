import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Presentation,
  Printer,
  ShieldCheck,
  EyeOff,
  Eye,
  BookOpen,
} from 'lucide-react';
import {
  LanguageMode,
  OrthodonticCase,
  Patient,
  ScientificReference,
} from '../types/orthodontics';
import {
  CEPHALOMETRIC_DEFINITIONS,
  ClinicalWarning,
  evaluateCephalometricValue,
} from '../domain/cephalometricEngine';
import {
  formatCaseStatus,
  formatDomainSection,
  formatFindingCategory,
  formatOutcomeStatus,
  formatPhotoCategory,
  formatSkeletalSagittal,
  formatSkeletalTransverse,
  formatSkeletalVertical,
  formatTimepointStage,
} from '../utils/i18n';
import { CephTracingCanvas, ClinicalRecordIllustration } from './CephTracingCanvas';

export type ReportTemplatePreset =
  | 'Comprehensive Case Report'
  | 'Orthodontic Diagnostic Report'
  | 'Cephalometric & Superimposition Report'
  | 'Treatment Plan & Alternatives Report'
  | 'Progress & Longitudinal Report'
  | 'Outcome & Residual Problems Report'
  | 'Scientific Conference Presentation';

interface ReportEngineViewProps {
  orthoCase?: OrthodonticCase;
  patient?: Patient;
  warnings: ClinicalWarning[];
  references: ScientificReference[];
  language: LanguageMode;
}

const ALL_REPORT_SECTIONS = [
  { id: 'patient_info', labelEn: '1. Patient & Case Identification', labelAr: '1. بيانات المريض ومعرّف الحالة' },
  { id: 'chief_history', labelEn: '2. Chief Complaint & History', labelAr: '2. الشكوى الرئيسية والتاريخ الطبي/السني' },
  { id: 'extraoral', labelEn: '3. Extraoral Facial & Smile Analysis', labelAr: '3. الفحص الخارجي وتحليل الوجه والابتسامة' },
  { id: 'intraoral_occlusal', labelEn: '4. Intraoral & Occlusal Analysis', labelAr: '4. الفحص داخل الفموي والتحليل الإطباقي' },
  { id: 'cbct_rad', labelEn: '5. Panoramic & CBCT 3D Assessment', labelAr: '5. التحليل الشعاعي والـ (CBCT) ثلاثي الأبعاد' },
  { id: 'cephalometrics', labelEn: '6. Longitudinal Cephalometric Analysis (T0/T1/T3)', labelAr: '6. التحليل السيفالومتري المقارن عبر المراحل' },
  { id: 'superimposition', labelEn: '7. Cephalometric Superimposition', labelAr: '7. المطابقة السيفالومترية (Superimposition)' },
  { id: 'problem_list', labelEn: '8. Problem List → Objectives → Strategy Chain', labelAr: '8. قائمة المشاكل والأهداف والاستراتيجية العلاجية' },
  { id: 'diagnosis', labelEn: '9. Structured Orthodontic Diagnosis', labelAr: '9. التشخيص التقويمي المعتمد (الهيكلي/السني/الأنسجة)' },
  { id: 'treatment_plan', labelEn: '10. Treatment Alternatives & Selected Plan', labelAr: '10. الخيارات العلاجية والخطة المعتمدة' },
  { id: 'progress_timeline', labelEn: '11. Treatment Progress & Biomechanics Sequence', labelAr: '11. تسلسل الجلسات والميكانيكا الحيوية' },
  { id: 'before_after', labelEn: '12. Before / Progress / Final Visual & Parameter Comparison', labelAr: '12. المقارنة السريرية والصور (قبل / أثناء / بعد)' },
  { id: 'outcome_residual', labelEn: '13. Outcome Assessment, Residual Problems & Retention', labelAr: '13. تقييم النتيجة النهائية والمشاكل المتبقية والتثبيت' },
  { id: 'references', labelEn: '14. Evidence-Based References (APA / Vancouver)', labelAr: '14. المراجع العلمية الموثقة' },
];

const PRESET_TITLES_AR: Record<ReportTemplatePreset, string> = {
  'Comprehensive Case Report': 'التقرير السريري والعلمي الشامل للحالة التقويمية',
  'Orthodontic Diagnostic Report': 'تقرير التشخيص التقويمي المفصل',
  'Cephalometric & Superimposition Report': 'تقرير التحليل السيفالومتري والمطابقة الزمنية (Superimposition)',
  'Treatment Plan & Alternatives Report': 'تقرير البدائل والخطة العلاجية المعتمدة',
  'Progress & Longitudinal Report': 'تقرير متابعة تطور ومراحل العلاج',
  'Outcome & Residual Problems Report': 'تقرير تقييم النتيجة النهائية والمشاكل المتبقية والتثبيت',
  'Scientific Conference Presentation': 'العرض العلمي للحالة في المؤتمرات',
};

export const ReportEngineView: React.FC<ReportEngineViewProps> = ({
  orthoCase,
  patient,
  warnings,
  references,
  language,
}) => {
  const [preset, setPreset] = React.useState<ReportTemplatePreset>('Comprehensive Case Report');
  const [selectedSections, setSelectedSections] = React.useState<string[]>(
    ALL_REPORT_SECTIONS.map((s) => s.id)
  );
  const [anonymizeForConference, setAnonymizeForConference] = React.useState<boolean>(false);
  const [citationFormat, setCitationFormat] = React.useState<'APA' | 'Vancouver'>('APA');
  const [slideIndex, setSlideIndex] = React.useState<number>(0);

  if (!orthoCase || !patient) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
        <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">
          {language === 'ar' ? 'لم يتم تحديد حالة لإصدار التقرير' : 'No Active Case Selected for Reporting'}
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          {language === 'ar'
            ? 'يرجى اختيار حالة تقويمية محددة من القائمة الجانبية لإصدار التقرير العلمي.'
            : 'Please select an active case from the sidebar to generate scientific reports.'}
        </p>
      </div>
    );
  }

  const applyPreset = (newPreset: ReportTemplatePreset) => {
    setPreset(newPreset);
    if (newPreset === 'Comprehensive Case Report') {
      setSelectedSections(ALL_REPORT_SECTIONS.map((s) => s.id));
      setAnonymizeForConference(false);
    } else if (newPreset === 'Orthodontic Diagnostic Report') {
      setSelectedSections([
        'patient_info',
        'chief_history',
        'extraoral',
        'intraoral_occlusal',
        'cbct_rad',
        'cephalometrics',
        'problem_list',
        'diagnosis',
        'references',
      ]);
    } else if (newPreset === 'Cephalometric & Superimposition Report') {
      setSelectedSections(['patient_info', 'cephalometrics', 'superimposition', 'diagnosis', 'references']);
    } else if (newPreset === 'Treatment Plan & Alternatives Report') {
      setSelectedSections(['patient_info', 'problem_list', 'diagnosis', 'treatment_plan', 'references']);
    } else if (newPreset === 'Progress & Longitudinal Report') {
      setSelectedSections(['patient_info', 'progress_timeline', 'before_after', 'cephalometrics']);
    } else if (newPreset === 'Outcome & Residual Problems Report') {
      setSelectedSections([
        'patient_info',
        'problem_list',
        'before_after',
        'superimposition',
        'outcome_residual',
        'references',
      ]);
    } else if (newPreset === 'Scientific Conference Presentation') {
      setSelectedSections(ALL_REPORT_SECTIONS.map((s) => s.id));
      setAnonymizeForConference(true);
      setSlideIndex(0);
    }
  };

  const toggleSection = (id: string) => {
    setSelectedSections((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const t0Ceph = orthoCase.cephRecords.find((r) => r.stage === 'T0_Initial');
  const t1Ceph = orthoCase.cephRecords.find((r) => r.stage === 'T1_Progress');
  const t3Ceph = orthoCase.cephRecords.find((r) => r.stage === 'T3_Final');
  const caseReferences = references.filter((r) => orthoCase.referencesIds.includes(r.id));

  const displayPatientName = anonymizeForConference
    ? language === 'ar'
      ? `حالة علمية مغفلة الهوية [${orthoCase.id}]`
      : `Anonymized Scientific Case [${orthoCase.id}]`
    : language === 'ar'
    ? patient.fullNameAr
    : patient.fullNameEn;

  return (
    <div className="space-y-6">
      {/* Control Panel (Hidden in Print) */}
      <div className="no-print bg-white border border-slate-200 rounded-lg p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {language === 'ar'
                ? 'محرك التقارير العلمية والسريرية (يعمل بالكامل بدون إنترنت)'
                : 'Scientific & Clinical Report Builder (Works 100% Offline)'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {language === 'ar'
                ? 'أدخل البيانات مرة واحدة ← راجعها واعتمدها ← استخدمها فوراً في 7 تقارير تقويمية وعلمية متخصصة.'
                : 'Enter Once → Validate → Doctor Approves → Reuse Across 7 Specialized Orthodontic Report Formats'}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setAnonymizeForConference(!anonymizeForConference)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                anonymizeForConference
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {anonymizeForConference ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {anonymizeForConference
                ? language === 'ar'
                  ? 'إخفاء هوية المريض للمؤتمرات (نشط)'
                  : 'De-Identified (Conference Mode ON)'
                : language === 'ar'
                ? 'إظهار اسم المريض في التقرير'
                : 'Include Patient Identity'}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              {language === 'ar' ? 'طباعة وتصدير التقرير (A4 PDF)' : 'Print / Export A4 PDF'}
            </button>
          </div>
        </div>

        {/* Template Presets */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-600">
            {language === 'ar' ? 'اختر نوع التقرير السريري أو العلمي:' : 'Select Orthodontic Report Template:'}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                {
                  id: 'Comprehensive Case Report',
                  ar: 'التقرير الشامل للحالة',
                },
                {
                  id: 'Orthodontic Diagnostic Report',
                  ar: 'تقرير التشخيص التقويمي',
                },
                {
                  id: 'Cephalometric & Superimposition Report',
                  ar: 'تقرير السيفالومتري والمطابقة',
                },
                {
                  id: 'Treatment Plan & Alternatives Report',
                  ar: 'تقرير الخطة العلاجية والبدائل',
                },
                {
                  id: 'Progress & Longitudinal Report',
                  ar: 'تقرير تطور ومراحل العلاج',
                },
                {
                  id: 'Outcome & Residual Problems Report',
                  ar: 'تقرير النتيجة النهائية والتثبيت',
                },
                {
                  id: 'Scientific Conference Presentation',
                  ar: 'العرض العلمي للمؤتمرات',
                },
              ] as { id: ReportTemplatePreset; ar: string }[]
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => applyPreset(item.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  preset === item.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {language === 'ar' ? item.ar : item.id}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Section Checkboxes */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">
              {language === 'ar' ? 'تخصيص الأقسام المشمولة في التقرير:' : 'Customize Included Report Sections:'}
            </span>
            <div className="flex items-center gap-3 text-xs">
              <button
                onClick={() => setSelectedSections(ALL_REPORT_SECTIONS.map((s) => s.id))}
                className="text-blue-600 hover:underline font-medium"
              >
                {language === 'ar' ? 'تحديد جميع الأقسام' : 'Select All'}
              </button>
              <span className="text-slate-300">·</span>
              <button
                onClick={() => setCitationFormat(citationFormat === 'APA' ? 'Vancouver' : 'APA')}
                className="text-slate-700 hover:underline font-mono"
              >
                {language === 'ar'
                  ? `نمط توثيق المراجع: ${citationFormat}`
                  : `Citation Style: ${citationFormat}`}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {ALL_REPORT_SECTIONS.map((sec) => {
              const checked = selectedSections.includes(sec.id);
              return (
                <label
                  key={sec.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded border text-xs cursor-pointer transition-colors ${
                    checked
                      ? 'bg-blue-50/50 border-blue-200 text-slate-900 font-medium'
                      : 'bg-white border-slate-200 text-slate-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSection(sec.id)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="truncate">{language === 'ar' ? sec.labelAr : sec.labelEn}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Pre-Export Report Quality & Clinical Consistency Gate */}
        <div className="pt-3 border-t border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <FileCheck2 className="w-4 h-4 text-blue-600" />
              {language === 'ar'
                ? 'فحص جودة التقرير والاتساق السريري قبل التصدير'
                : 'Pre-Export Report Quality & Clinical Consistency Audit'}
            </span>
            <span className="text-xs text-slate-500">
              {warnings.length === 0
                ? language === 'ar'
                  ? '● 0 تنبيهات (التقرير مكتمل وجاهز للطباعة)'
                  : '● 0 Warnings (Ready for Publication)'
                : language === 'ar'
                ? `▲ ${warnings.length} ملاحظات للمراجعة`
                : `▲ ${warnings.length} Advisory Notices`}
            </span>
          </div>
          {warnings.length === 0 ? (
            <div className="px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {language === 'ar'
                  ? 'جميع المشاكل التقويمية مرتبطة بأهداف علاجية، وقياسات السيفالومتري متسقة مع التشخيص الهيكلي والسجلات النهائية.'
                  : 'All problems map to treatment objectives, cephalometric values align with skeletal classification, and longitudinal records are verified.'}
              </span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {warnings.map((w) => (
                <div
                  key={w.id}
                  className="px-3.5 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-950 flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">
                      {language === 'ar' ? w.titleAr : w.titleEn}
                    </div>
                    <div className="text-amber-800 mt-0.5">
                      {language === 'ar' ? w.detailAr : w.detailEn}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scientific Conference Slide Mode vs Printable Document Mode */}
      {preset === 'Scientific Conference Presentation' ? (
        <div className="bg-slate-900 text-white rounded-lg border border-slate-800 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <Presentation className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="text-base font-semibold">
                  {language === 'ar'
                    ? `عرض حالة علمي للمؤتمرات — ${orthoCase.id}`
                    : `Scientific Conference Case Presentation — ${orthoCase.id}`}
                </h3>
                <p className="text-xs text-slate-400">
                  {language === 'ar'
                    ? 'شرائح عرض أكاديمية مع إخفاء البيانات الشخصية للمريض'
                    : `De-Identified Academic Slide Deck · ${orthoCase.caseType}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {[0, 1, 2, 3, 4].map((idx) => (
                <button
                  key={idx}
                  onClick={() => setSlideIndex(idx)}
                  className={`px-3 py-1 rounded text-xs ${
                    slideIndex === idx ? 'bg-cyan-500 text-slate-950 font-semibold' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {language === 'ar' ? `شريحة ${idx + 1}` : `Slide ${idx + 1}`}
                </button>
              ))}
            </div>
          </div>

          {slideIndex === 0 && (
            <div className="space-y-4 py-4">
              <div className="text-xs text-cyan-400 font-semibold">
                {language === 'ar'
                  ? 'الشريحة 01 · تعريف الحالة والتشخيص الشامل'
                  : 'SLIDE 01 · CASE IDENTIFICATION & INITIAL PRESENTATION'}
              </div>
              <h2 className="text-xl font-bold leading-relaxed">
                {language === 'ar'
                  ? orthoCase.diagnosis.comprehensiveStatementAr
                  : orthoCase.diagnosis.comprehensiveStatementEn}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                <div className="p-4 bg-slate-800/70 rounded border border-slate-700">
                  <div className="text-xs text-slate-400">
                    {language === 'ar' ? 'رمز الحالة والنضج العظمي' : 'Case ID & Demographics'}
                  </div>
                  <div className="text-sm font-mono font-semibold mt-1">
                    {orthoCase.id} · CVM: {orthoCase.cbctAndRadiographs.cvmStage}
                  </div>
                </div>
                <div className="p-4 bg-slate-800/70 rounded border border-slate-700">
                  <div className="text-xs text-slate-400">
                    {language === 'ar' ? 'الشكوى الرئيسية' : 'Chief Complaint'}
                  </div>
                  <div className="text-sm mt-1">
                    {language === 'ar' ? orthoCase.chiefComplaintAr : orthoCase.chiefComplaintEn}
                  </div>
                </div>
                <div className="p-4 bg-slate-800/70 rounded border border-slate-700">
                  <div className="text-xs text-slate-400">
                    {language === 'ar' ? 'الخطة الميكانيكية المختارة' : 'Selected Biomechanics'}
                  </div>
                  <div className="text-sm mt-1">
                    {language === 'ar'
                      ? orthoCase.treatmentOptions.find((o) => o.isSelected)?.titleAr
                      : orthoCase.treatmentOptions.find((o) => o.isSelected)?.titleEn}
                  </div>
                </div>
              </div>
            </div>
          )}

          {slideIndex === 1 && (
            <div className="space-y-4">
              <div className="text-xs text-cyan-400 font-semibold">
                {language === 'ar'
                  ? 'الشريحة 02 · مصفوفة المشاكل والأهداف والميكانيكا والنتيجة'
                  : 'SLIDE 02 · PROBLEM LIST → OBJECTIVES → BIOMECHANICS MATRIX'}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-start border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="py-2.5 px-3">{language === 'ar' ? 'النطاق' : 'Domain'}</th>
                      <th className="py-2.5 px-3">{language === 'ar' ? 'المشكلة المؤكدة' : 'Problem'}</th>
                      <th className="py-2.5 px-3">{language === 'ar' ? 'الهدف العلاجي' : 'Objective'}</th>
                      <th className="py-2.5 px-3">{language === 'ar' ? 'الميكانيكا' : 'Biomechanics'}</th>
                      <th className="py-2.5 px-3">{language === 'ar' ? 'النتيجة' : 'Outcome'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {orthoCase.problemList
                      .filter((p) => p.classification === 'Actual Problem')
                      .map((prob) => (
                        <tr key={prob.id}>
                          <td className="py-3 px-3 text-cyan-400">
                            {formatDomainSection(language, prob.domain)}
                          </td>
                          <td className="py-3 px-3 text-slate-200">
                            {language === 'ar' ? prob.findingAr : prob.findingEn}
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {language === 'ar' ? prob.objectiveAr : prob.objectiveEn}
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {language === 'ar' ? prob.strategyMechanicsAr : prob.strategyMechanicsEn}
                          </td>
                          <td className="py-3 px-3 text-emerald-400">
                            {language === 'ar' ? prob.outcomeResultAr : prob.outcomeResultEn}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {slideIndex === 2 && (
            <div className="space-y-4">
              <div className="text-xs text-cyan-400 font-semibold">
                {language === 'ar'
                  ? 'الشريحة 03 · المطابقة السيفالومترية والتغيرات الرقمية (Superimposition)'
                  : 'SLIDE 03 · CEPHALOMETRIC SUPERIMPOSITION & QUANTITATIVE CHANGES'}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <CephTracingCanvas
                  records={orthoCase.cephRecords}
                  activeStage="T3_Final"
                  showSuperimposition={true}
                  superimpositionPlane="Cranial Base (S-N at S)"
                />
                <div className="space-y-3">
                  <div className="p-3.5 bg-slate-800/80 rounded border border-slate-700 text-xs leading-relaxed">
                    <div className="font-semibold text-cyan-400 mb-1">
                      {language === 'ar' ? 'تحليل المطابقة السيفالومترية:' : 'Superimposition Synthesis:'}
                    </div>
                    <p>
                      {language === 'ar'
                        ? t3Ceph?.superimpositionNotesAr || t0Ceph?.superimpositionNotesAr
                        : t3Ceph?.superimpositionNotesEn || t0Ceph?.superimpositionNotesEn}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {slideIndex === 3 && (
            <div className="space-y-4">
              <div className="text-xs text-cyan-400 font-semibold">
                {language === 'ar'
                  ? 'الشريحة 04 · مقارنة السجلات والصور عبر مراحل العلاج'
                  : 'SLIDE 04 · LONGITUDINAL PHOTOGRAPHIC & OCCLUSAL COMPARISON'}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {orthoCase.photos.map((ph) => (
                  <div key={ph.id} className="bg-slate-800/70 border border-slate-700 rounded p-3 space-y-2">
                    <ClinicalRecordIllustration
                      svgType={ph.svgType}
                      stage={ph.stage}
                      category={ph.category}
                    />
                    <div className="text-xs text-cyan-400">
                      {formatTimepointStage(language, ph.stage)} · {formatPhotoCategory(language, ph.category)}
                    </div>
                    <p className="text-xs text-slate-300">
                      {language === 'ar' ? ph.captionAr : ph.captionEn}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {slideIndex === 4 && (
            <div className="space-y-4">
              <div className="text-xs text-cyan-400 font-semibold">
                {language === 'ar'
                  ? 'الشريحة 05 · المناقشة النقدية والمحددات الحيوية وبروتوكول التثبيت'
                  : 'SLIDE 05 · CRITICAL DISCUSSION, LIMITATIONS, RETENTION & EVIDENCE'}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-800/70 border border-slate-700 rounded space-y-2">
                  <h4 className="text-sm font-semibold text-amber-400">
                    {language === 'ar'
                      ? 'المشاكل المتبقية والمحددات السريرية'
                      : 'Residual Problems & Honest Clinical Limitations'}
                  </h4>
                  <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                    {(language === 'ar'
                      ? orthoCase.retentionAndResidual.residualProblemsAr
                      : orthoCase.retentionAndResidual.residualProblemsEn
                    ).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                    {(language === 'ar'
                      ? orthoCase.retentionAndResidual.treatmentLimitationsAr
                      : orthoCase.retentionAndResidual.treatmentLimitationsEn
                    ).map((item, i) => (
                      <li key={`lim_${i}`}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-4 bg-slate-800/70 border border-slate-700 rounded space-y-2">
                  <h4 className="text-sm font-semibold text-emerald-400">
                    {language === 'ar' ? 'بروتوكول التثبيت والمراجع العلمية' : 'Retention Protocol & Literature'}
                  </h4>
                  <p className="text-xs text-slate-300">{orthoCase.retentionAndResidual.wearProtocol}</p>
                  <div className="pt-2 border-t border-slate-700 space-y-1" dir="ltr">
                    {caseReferences.map((ref, idx) => (
                      <div key={ref.id} className="text-[11px] text-slate-400 font-mono">
                        [{idx + 1}] {citationFormat === 'APA' ? ref.apaCitation : ref.vancouverCitation}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Printable A4 Scientific & Clinical Document */}
      <div className="bg-white border border-slate-200 rounded-lg p-8 space-y-8 shadow-xs">
        {/* Document Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-5">
          <div>
            <div className="text-xs uppercase tracking-wider text-blue-700 font-semibold">
              {language === 'ar'
                ? 'منصة البسمي لتقويم الأسنان (Al-Basmi Orth) · التوثيق السريري والعلمي'
                : 'AL-BASMI ORTH · ORTHODONTIC CLINICAL & SCIENTIFIC DOCUMENTATION'}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">
              {language === 'ar' ? PRESET_TITLES_AR[preset] : preset}
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              {language === 'ar'
                ? `الطبيب المعالج: ${orthoCase.treatingDoctor} · مرحلة الحالة: ${formatCaseStatus('ar', orthoCase.status)}`
                : `Treating Specialist: ${orthoCase.treatingDoctor} · Status: ${orthoCase.status}`}
            </p>
          </div>
          <div className="text-end font-mono text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-900">
              {language === 'ar' ? `رقم الحالة: ${orthoCase.id}` : `CASE ID: ${orthoCase.id}`}
            </div>
            <div>
              {language === 'ar'
                ? `تاريخ البدء: ${orthoCase.startDate}`
                : `Start Date: ${orthoCase.startDate}`}
            </div>
            <div>
              {language === 'ar'
                ? `إصدار التشخيص: v${orthoCase.diagnosis.version} (معتمد من الطبيب)`
                : `Diagnosis Version: v${orthoCase.diagnosis.version} (Doctor-Approved)`}
            </div>
          </div>
        </div>

        {/* 1. Patient & Case Identification */}
        {selectedSections.includes('patient_info') && (
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              {language === 'ar'
                ? '01. بيانات المريض وتعريف الحالة التقويمية'
                : '01. Patient & Orthodontic Case Identification'}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <div className="text-slate-500">{language === 'ar' ? 'اسم المريض' : 'Patient'}</div>
                <div className="font-semibold text-slate-900 mt-0.5">{displayPatientName}</div>
              </div>
              <div>
                <div className="text-slate-500">
                  {language === 'ar' ? 'الجنس وتاريخ الميلاد' : 'Gender & DOB'}
                </div>
                <div className="font-mono text-slate-900 mt-0.5">
                  {language === 'ar'
                    ? `${patient.gender === 'Female' ? 'أنثى' : 'ذكر'} · ${
                        anonymizeForConference ? 'مخفي للمؤتمر' : patient.dob
                      }`
                    : `${patient.gender} · ${anonymizeForConference ? 'DOB Redacted' : patient.dob}`}
                </div>
              </div>
              <div>
                <div className="text-slate-500">
                  {language === 'ar' ? 'التصنيف العام للحالة' : 'Case Classification'}
                </div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {formatSkeletalSagittal(language, orthoCase.diagnosis.skeletalSagittal)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">
                  {language === 'ar' ? 'النضج العظمي الفقري (CVM)' : 'Skeletal Maturation'}
                </div>
                <div className="font-mono text-slate-900 mt-0.5">
                  {orthoCase.cbctAndRadiographs.cvmStage}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 2. Chief Complaint & History */}
        {selectedSections.includes('chief_history') && (
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              {language === 'ar'
                ? '02. الشكوى الرئيسية والتاريخ الطبي والسني'
                : '02. Chief Complaint & Medical/Dental History'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded border border-slate-200 space-y-1">
                <div className="font-semibold text-slate-800">
                  {language === 'ar' ? 'الشكوى الرئيسية للمريض:' : 'Chief Complaint:'}
                </div>
                <p className="text-slate-700 leading-relaxed">
                  {language === 'ar' ? orthoCase.chiefComplaintAr : orthoCase.chiefComplaintEn}
                </p>
              </div>
              <div className="p-3.5 bg-slate-50 rounded border border-slate-200 space-y-1">
                <div className="font-semibold text-slate-800">
                  {language === 'ar' ? 'التاريخ الطبي والسني:' : 'Medical & Dental History:'}
                </div>
                <p className="text-slate-700">
                  {language === 'ar'
                    ? `التاريخ الطبي: ${patient.medicalHistory}`
                    : `Medical: ${patient.medicalHistory}`}
                </p>
                <p className="text-slate-700">
                  {language === 'ar'
                    ? `التاريخ السني: ${patient.dentalHistory}`
                    : `Dental: ${patient.dentalHistory}`}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 3 & 4. Extraoral, Intraoral & Occlusal Examination */}
        {(selectedSections.includes('extraoral') || selectedSections.includes('intraoral_occlusal')) && (
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              {language === 'ar'
                ? '03. الفحص السريري الشامل (خارج الفم، داخل الفم، والعلاقات الإطباقية)'
                : '03. Clinical Examination (Extraoral, Intraoral & Occlusal Parameters)'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 border border-slate-200 rounded space-y-1.5">
                <div className="font-semibold text-slate-900">
                  {language === 'ar'
                    ? 'الفحص خارج الفموي والأنسجة الرخوة'
                    : 'Extraoral & Soft Tissue'}
                </div>
                <div>
                  {language === 'ar'
                    ? `التناظر الوجهي: ${orthoCase.extraoral.facialSymmetry}`
                    : `Symmetry: ${orthoCase.extraoral.facialSymmetry}`}
                </div>
                <div>
                  {language === 'ar'
                    ? `النمط الوجهي: ${orthoCase.extraoral.facialType}`
                    : `Facial Pattern: ${orthoCase.extraoral.facialType}`}
                </div>
                <div>
                  {language === 'ar'
                    ? `المرتسم الجانبي (Profile): ${orthoCase.extraoral.profile}`
                    : `Profile: ${orthoCase.extraoral.profile}`}
                </div>
                <div>
                  {language === 'ar'
                    ? `كفاءة الشفاه: ${orthoCase.extraoral.lipCompetence}`
                    : `Lip Competence: ${orthoCase.extraoral.lipCompetence}`}
                </div>
                <div>
                  {language === 'ar'
                    ? `الزاوية الأنفية الشفوية: ${orthoCase.extraoral.nasolabialAngle}`
                    : `Nasolabial Angle: ${orthoCase.extraoral.nasolabialAngle}`}
                </div>
                <div>
                  {language === 'ar'
                    ? `قوس الابتسامة: ${orthoCase.extraoral.smileArc} (ظهور اللثة ${orthoCase.extraoral.gingivalDisplayOnSmileMm} ملم)`
                    : `Smile Arc: ${orthoCase.extraoral.smileArc} (${orthoCase.extraoral.gingivalDisplayOnSmileMm}mm gingival display)`}
                </div>
              </div>
              <div className="p-3.5 border border-slate-200 rounded space-y-1.5">
                <div className="font-semibold text-slate-900">
                  {language === 'ar'
                    ? 'الفحص داخل الفموي وتحليل القوسين'
                    : 'Intraoral & Arch Analysis'}
                </div>
                <div>
                  {language === 'ar'
                    ? `العناية الفموية والنمط اللثوي: ${orthoCase.intraoral.oralHygiene} (${orthoCase.intraoral.gingivalBiotype})`
                    : `Oral Hygiene: ${orthoCase.intraoral.oralHygiene} (${orthoCase.intraoral.gingivalBiotype} biotype)`}
                </div>
                <div>
                  {language === 'ar'
                    ? `شكل القوسين (علوي / سفلي): ${orthoCase.intraoral.maxillaryArchForm} / ${orthoCase.intraoral.mandibularArchForm}`
                    : `Arch Form (U/L): ${orthoCase.intraoral.maxillaryArchForm} / ${orthoCase.intraoral.mandibularArchForm}`}
                </div>
                <div>
                  {language === 'ar'
                    ? `ازدحام القوس العلوية (Crowding): ${orthoCase.intraoral.maxillaryCrowdingMm} ملم`
                    : `Maxillary Crowding: ${orthoCase.intraoral.maxillaryCrowdingMm} mm`}
                </div>
                <div>
                  {language === 'ar'
                    ? `ازدحام القوس السفلية (Crowding): ${orthoCase.intraoral.mandibularCrowdingMm} ملم`
                    : `Mandibular Crowding: ${orthoCase.intraoral.mandibularCrowdingMm} mm`}
                </div>
                <div>
                  {language === 'ar'
                    ? `الانفتالات السنية: ${orthoCase.intraoral.rotationsSummary}`
                    : `Rotations: ${orthoCase.intraoral.rotationsSummary}`}
                </div>
              </div>
              <div className="p-3.5 border border-slate-200 rounded space-y-1.5">
                <div className="font-semibold text-slate-900">
                  {language === 'ar'
                    ? 'العلاقات الإطباقية (Occlusal Relationships)'
                    : 'Occlusal Relationships'}
                </div>
                <div>
                  {language === 'ar'
                    ? `العلاقة الرحوية (يمين/يسار): ${orthoCase.occlusal.molarRight} / ${orthoCase.occlusal.molarLeft}`
                    : `Molars (R/L): ${orthoCase.occlusal.molarRight} / ${orthoCase.occlusal.molarLeft}`}
                </div>
                <div>
                  {language === 'ar'
                    ? `العلاقة النابية (يمين/يسار): ${orthoCase.occlusal.canineRight} / ${orthoCase.occlusal.canineLeft}`
                    : `Canines (R/L): ${orthoCase.occlusal.canineRight} / ${orthoCase.occlusal.canineLeft}`}
                </div>
                <div>
                  {language === 'ar'
                    ? `البروز السهمي (Overjet): ${orthoCase.occlusal.overjetInitialMm} ملم ← ${orthoCase.occlusal.overjetCurrentMm} ملم`
                    : `Overjet: ${orthoCase.occlusal.overjetInitialMm}mm → ${orthoCase.occlusal.overjetCurrentMm}mm`}
                </div>
                <div>
                  {language === 'ar'
                    ? `التغطية العمودية (Overbite): ${orthoCase.occlusal.overbiteInitialMm} ملم ← ${orthoCase.occlusal.overbiteCurrentMm} ملم`
                    : `Overbite: ${orthoCase.occlusal.overbiteInitialMm}mm → ${orthoCase.occlusal.overbiteCurrentMm}mm`}
                </div>
                <div>
                  {language === 'ar'
                    ? `العضة المعكوسة: ${orthoCase.occlusal.crossbite} · قوس سبي: ${orthoCase.occlusal.curveOfSpeeMm} ملم`
                    : `Crossbite: ${orthoCase.occlusal.crossbite} · Curve of Spee: ${orthoCase.occlusal.curveOfSpeeMm}mm`}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 5. CBCT & Radiographic */}
        {selectedSections.includes('cbct_rad') && (
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              {language === 'ar'
                ? '04. التقييم الشعاعي البانورامي والمقطعي ثلاثي الأبعاد (CBCT)'
                : '04. Radiographic & CBCT 3D Orthodontic Assessment'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                <div>
                  <span className="font-semibold">
                    {language === 'ar' ? 'معطيات البانوراما: ' : 'Panoramic Findings: '}
                  </span>
                  {orthoCase.cbctAndRadiographs.panoramicSummary}
                </div>
                <div>
                  <span className="font-semibold">
                    {language === 'ar' ? 'الصفائح العظمية القشرية: ' : 'Alveolar Cortical Bone: '}
                  </span>
                  {orthoCase.cbctAndRadiographs.alveolarBoneStatus}
                </div>
                <div>
                  <span className="font-semibold">
                    {language === 'ar' ? 'فحص امتصاص الجذور: ' : 'Root Resorption Screening: '}
                  </span>
                  {orthoCase.cbctAndRadiographs.rootResorptionStatus}
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                <div>
                  <span className="font-semibold">
                    {language === 'ar' ? 'المجرى الهوائي والمفصل الفكي (TMJ): ' : 'Airway & TMJ: '}
                  </span>
                  {orthoCase.cbctAndRadiographs.airwayAssessment} · {orthoCase.cbctAndRadiographs.tmjStatus}
                </div>
                <div>
                  <span className="font-semibold">
                    {language === 'ar' ? 'المناطق الآمنة للزرعات (TADs): ' : 'TAD / Miniscrew Safe Zones: '}
                  </span>
                  {orthoCase.cbctAndRadiographs.tadSafeZonesNotes}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 6. Cephalometric Longitudinal Table */}
        {selectedSections.includes('cephalometrics') && (
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              {language === 'ar'
                ? '05. التحليل السيفالومتري المقارن عبر مراحل العلاج (T0 أولي ← T1 مرحلي ← T3 نهائي)'
                : '05. Longitudinal Cephalometric Analysis (Initial T0 vs Progress T1 vs Final T3)'}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="py-2 px-3 text-start border border-slate-200">
                      {language === 'ar' ? 'القياس السيفالومتري' : 'Measurement'}
                    </th>
                    <th className="py-2 px-3 text-start border border-slate-200">
                      {language === 'ar' ? 'التحليل' : 'School'}
                    </th>
                    <th className="py-2 px-3 text-end border border-slate-200 font-mono">
                      {language === 'ar' ? 'المعدل الطبيعي' : 'Norm ± SD'}
                    </th>
                    <th className="py-2 px-3 text-end border border-slate-200 font-mono">
                      {language === 'ar' ? 'أولي T0' : 'T0 Initial'}
                    </th>
                    <th className="py-2 px-3 text-end border border-slate-200 font-mono">
                      {language === 'ar' ? 'مرحلي T1' : 'T1 Progress'}
                    </th>
                    <th className="py-2 px-3 text-end border border-slate-200 font-mono">
                      {language === 'ar' ? 'نهائي T3' : 'T3 Final'}
                    </th>
                    <th className="py-2 px-3 text-end border border-slate-200 font-mono">
                      {language === 'ar' ? 'التغير Δ' : 'Δ Change'}
                    </th>
                    <th className="py-2 px-3 text-start border border-slate-200">
                      {language === 'ar' ? 'التفسير السريري' : 'Clinical Interpretation (T0)'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {CEPHALOMETRIC_DEFINITIONS.map((def) => {
                    const v0 = t0Ceph?.values[def.code];
                    const v1 = t1Ceph?.values[def.code];
                    const v3 = t3Ceph?.values[def.code];
                    const eval0 = v0 !== undefined ? evaluateCephalometricValue(def, v0) : null;
                    const delta = v0 !== undefined && v3 !== undefined ? (v3 - v0).toFixed(1) : '—';
                    return (
                      <tr key={def.id} className="border-b border-slate-200">
                        <td className="py-1.5 px-3 font-medium text-slate-900">
                          {language === 'ar' ? `${def.nameAr} (${def.code})` : def.nameEn}
                        </td>
                        <td className="py-1.5 px-3 text-slate-500">{def.school}</td>
                        <td className="py-1.5 px-3 text-end font-mono text-slate-600">
                          {def.normMean} ± {def.normSd}
                          {def.unit}
                        </td>
                        <td className="py-1.5 px-3 text-end font-mono font-semibold text-slate-900">
                          {v0 !== undefined ? `${v0}${def.unit}` : '—'}
                        </td>
                        <td className="py-1.5 px-3 text-end font-mono text-blue-700">
                          {v1 !== undefined ? `${v1}${def.unit}` : '—'}
                        </td>
                        <td className="py-1.5 px-3 text-end font-mono text-emerald-700 font-semibold">
                          {v3 !== undefined ? `${v3}${def.unit}` : '—'}
                        </td>
                        <td className="py-1.5 px-3 text-end font-mono">
                          {delta !== '—' ? `${Number(delta) > 0 ? '+' : ''}${delta}${def.unit}` : '—'}
                        </td>
                        <td className="py-1.5 px-3 text-slate-600">
                          {eval0
                            ? language === 'ar'
                              ? eval0.interpretationAr
                              : eval0.interpretationEn
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 7. Superimposition */}
        {selectedSections.includes('superimposition') && (
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              {language === 'ar'
                ? '06. المطابقة السيفالومترية عبر مراحل العلاج (Superimposition T0 → T1 → T3)'
                : '06. Cephalometric Superimposition (T0 → T1 → T3)'}
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <CephTracingCanvas
                records={orthoCase.cephRecords}
                activeStage="T3_Final"
                showSuperimposition={true}
                superimpositionPlane="Cranial Base (S-N at S)"
              />
              <div className="space-y-2 text-xs">
                <div className="font-semibold text-slate-900">
                  {language === 'ar'
                    ? 'ملخص المطابقة على قاعدة القحف والفكين العلوي والسفلي:'
                    : 'Cranial Base, Maxillary & Mandibular Superimposition Summary:'}
                </div>
                <p className="text-slate-700 leading-relaxed">
                  {language === 'ar'
                    ? t3Ceph?.superimpositionNotesAr || t0Ceph?.superimpositionNotesAr
                    : t3Ceph?.superimpositionNotesEn || t0Ceph?.superimpositionNotesEn}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 8. Problem List -> Objectives -> Strategy -> Outcome */}
        {selectedSections.includes('problem_list') && (
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              {language === 'ar'
                ? '07. مصفوفة المشاكل السريرية والأهداف العلاجية والميكانيكا والنتيجة'
                : '07. Problem List → Treatment Objectives → Biomechanical Strategy → Outcome Matrix'}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="py-2 px-3 text-start border border-slate-200">
                      {language === 'ar' ? 'النطاق والتصنيف' : 'Domain & Type'}
                    </th>
                    <th className="py-2 px-3 text-start border border-slate-200">
                      {language === 'ar' ? 'الملاحظة أو المشكلة السريرية' : 'Clinical Finding / Problem'}
                    </th>
                    <th className="py-2 px-3 text-start border border-slate-200">
                      {language === 'ar' ? 'الهدف العلاجي المرتبط' : 'Linked Treatment Objective'}
                    </th>
                    <th className="py-2 px-3 text-start border border-slate-200">
                      {language === 'ar' ? 'الميكانيكا المختارة' : 'Selected Biomechanics'}
                    </th>
                    <th className="py-2 px-3 text-start border border-slate-200">
                      {language === 'ar' ? 'تقييم النتيجة' : 'Outcome Evaluation'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orthoCase.problemList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 px-3 text-center text-slate-500 italic">
                        {language === 'ar'
                          ? 'لا توجد مشاكل أو أهداف مسجلة لهذه الحالة بعد'
                          : 'No clinical problems or objectives documented yet'}
                      </td>
                    </tr>
                  ) : (
                    orthoCase.problemList.map((item) => (
                      <tr key={item.id} className="border-b border-slate-200">
                        <td className="py-2 px-3 font-medium text-slate-900">
                          <div>{formatDomainSection(language, item.domain)}</div>
                          <div className="text-[11px] text-slate-500">
                            {formatFindingCategory(language, item.classification)}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-slate-800">
                          {language === 'ar' ? item.findingAr : item.findingEn}
                        </td>
                        <td className="py-2 px-3 text-slate-800">
                          {item.classification === 'Normal Finding' ? (
                            <span className="text-slate-400 italic">
                              {language === 'ar'
                                ? 'معيار طبيعي — لا يتطلب تدخلاً'
                                : 'Normal Finding — No intervention required'}
                            </span>
                          ) : language === 'ar' ? (
                            item.objectiveAr
                          ) : (
                            item.objectiveEn
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {(language === 'ar' ? item.strategyMechanicsAr : item.strategyMechanicsEn) ||
                            '—'}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-slate-900">
                            {formatOutcomeStatus(language, item.outcomeStatus)}
                          </div>
                          <div className="text-slate-600 mt-0.5">
                            {language === 'ar' ? item.outcomeResultAr : item.outcomeResultEn}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 9. Diagnosis */}
        {selectedSections.includes('diagnosis') && (
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              {language === 'ar'
                ? `08. التشخيص التقويمي الشامل المعتمد (الإصدار v${orthoCase.diagnosis.version})`
                : `08. Comprehensive Orthodontic Diagnosis (Doctor-Approved v${orthoCase.diagnosis.version})`}
            </h3>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded space-y-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {language === 'ar'
                    ? `معتمد بواسطة ${orthoCase.diagnosis.approvedBy || '—'} (${orthoCase.diagnosis.updatedAt || '—'})`
                    : `Approved by ${orthoCase.diagnosis.approvedBy || '—'} (${orthoCase.diagnosis.updatedAt || '—'})`}
                </span>
              </div>
              <p className="text-slate-900 font-medium leading-relaxed">
                {(language === 'ar'
                  ? orthoCase.diagnosis.comprehensiveStatementAr
                  : orthoCase.diagnosis.comprehensiveStatementEn) ||
                  (language === 'ar'
                    ? 'لم يتم تسجيل ملخص التشخيص المعتمد لهذه الحالة بعد.'
                    : 'No approved diagnosis statement recorded for this case yet.')}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <span className="font-semibold">
                    {language === 'ar' ? 'العلاقة السهمية: ' : 'Sagittal: '}
                  </span>
                  {formatSkeletalSagittal(language, orthoCase.diagnosis.skeletalSagittal)}
                </div>
                <div>
                  <span className="font-semibold">
                    {language === 'ar' ? 'النمط العمودي: ' : 'Vertical: '}
                  </span>
                  {formatSkeletalVertical(language, orthoCase.diagnosis.skeletalVertical)}
                </div>
                <div>
                  <span className="font-semibold">
                    {language === 'ar' ? 'العلاقة العرضية: ' : 'Transverse: '}
                  </span>
                  {formatSkeletalTransverse(language, orthoCase.diagnosis.skeletalTransverse)}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 10. Treatment Plan */}
        {selectedSections.includes('treatment_plan') && (
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              {language === 'ar'
                ? '09. البدائل العلاجية والخطة المعتمدة من الطبيب'
                : '09. Treatment Alternatives & Doctor-Selected Plan'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {orthoCase.treatmentOptions.length === 0 ? (
                <div className="col-span-full p-6 text-center text-slate-500 bg-slate-50 border border-slate-200 rounded italic">
                  {language === 'ar'
                    ? 'لم يتم تحديد بدائل علاجية أو اعتماد خطة علاجية بعد'
                    : 'No treatment plan alternatives or approved plans documented yet'}
                </div>
              ) : (
                orthoCase.treatmentOptions.map((opt) => (
                  <div
                    key={opt.id}
                    className={`p-3.5 rounded border space-y-1.5 ${
                      opt.isSelected ? 'border-blue-600 bg-blue-50/30' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-900">
                      <span>
                        {opt.label}: {opt.approachType}
                      </span>
                      {opt.isSelected && (
                        <span className="text-blue-700 text-[11px]">
                          {language === 'ar' ? '★ الخطة المعتمدة' : '★ SELECTED PLAN'}
                        </span>
                      )}
                    </div>
                    <div className="font-medium text-slate-800 leading-relaxed">
                      {language === 'ar' ? opt.titleAr : opt.titleEn}
                    </div>
                    <div>
                      <span className="font-semibold">
                        {language === 'ar' ? 'خطة الخلع: ' : 'Extractions: '}
                      </span>
                      {opt.extractionTeeth}
                    </div>
                    <div>
                      <span className="font-semibold">
                        {language === 'ar' ? 'الإرساء (Anchorage): ' : 'Anchorage: '}
                      </span>
                      {opt.anchoragePlan}
                    </div>
                    <div>
                      <span className="font-semibold">
                        {language === 'ar' ? 'الجهاز والميكانيكا: ' : 'Appliance: '}
                      </span>
                      {opt.applianceSystem}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* 12. Before / Progress / After Visual & Parameter Comparison */}
        {selectedSections.includes('before_after') && (
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              {language === 'ar'
                ? '10. المقارنة الزمنية للصور والسجلات عبر مراحل العلاج (قبل / أثناء / بعد)'
                : '10. Longitudinal Before / Progress / Final Comparison'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {orthoCase.photos.length === 0 ? (
                <div className="col-span-full p-6 text-center text-slate-500 bg-slate-50 border border-slate-200 rounded italic">
                  {language === 'ar'
                    ? 'لا توجد صور سريرية مسجلة لهذه الحالة'
                    : 'No clinical photographs attached to this case'}
                </div>
              ) : (
                orthoCase.photos.map((ph) => (
                <div key={ph.id} className="border border-slate-200 rounded p-3 space-y-2 text-xs">
                  <ClinicalRecordIllustration
                    svgType={ph.svgType}
                    stage={ph.stage}
                    category={ph.category}
                  />
                  <div className="font-semibold text-slate-800">
                    {formatTimepointStage(language, ph.stage)} ({ph.date}) ·{' '}
                    {formatPhotoCategory(language, ph.category)}
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    {language === 'ar' ? ph.captionAr : ph.captionEn}
                  </p>
                </div>
              ))
            )}
            </div>
          </section>
        )}

        {/* 13. Outcome Assessment, Residual Problems & Retention */}
        {selectedSections.includes('outcome_residual') && (
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              {language === 'ar'
                ? '11. تقييم النتيجة النهائية والمشاكل المتبقية وبروتوكول التثبيت (Retention)'
                : '11. Final Outcome, Residual Problems, Limitations & Retention Protocol'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 border border-slate-200 rounded space-y-1.5">
                <div className="font-semibold text-slate-900">
                  {language === 'ar'
                    ? 'المشاكل المتبقية والمحددات السريرية والحيوية'
                    : 'Residual Problems & Clinical Limitations'}
                </div>
                <ul className="list-disc list-inside text-slate-700 space-y-1">
                  {(language === 'ar'
                    ? orthoCase.retentionAndResidual.residualProblemsAr
                    : orthoCase.retentionAndResidual.residualProblemsEn
                  ).map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
                <div className="font-semibold text-slate-900 pt-2">
                  {language === 'ar'
                    ? 'المحددات البيولوجية والهيكلية:'
                    : 'Biological & Skeletal Limitations:'}
                </div>
                <ul className="list-disc list-inside text-slate-700 space-y-1">
                  {(language === 'ar'
                    ? orthoCase.retentionAndResidual.treatmentLimitationsAr
                    : orthoCase.retentionAndResidual.treatmentLimitationsEn
                  ).map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
              <div className="p-3.5 border border-slate-200 rounded space-y-1.5">
                <div className="font-semibold text-slate-900">
                  {language === 'ar'
                    ? 'بروتوكول التثبيت وتقييم خطر النكس (Retention & Stability)'
                    : 'Retention Regimen & Stability Assessment'}
                </div>
                <div>
                  <span className="font-semibold">
                    {language === 'ar' ? 'مثبت الفك العلوي: ' : 'Maxillary Retainer: '}
                  </span>
                  {orthoCase.retentionAndResidual.upperRetainer}
                </div>
                <div>
                  <span className="font-semibold">
                    {language === 'ar' ? 'مثبت الفك السفلي: ' : 'Mandibular Retainer: '}
                  </span>
                  {orthoCase.retentionAndResidual.lowerRetainer}
                </div>
                <div>
                  <span className="font-semibold">
                    {language === 'ar' ? 'تعليمات الارتداء والمتابعة: ' : 'Protocol: '}
                  </span>
                  {orthoCase.retentionAndResidual.wearProtocol}
                </div>
                <div>
                  <span className="font-semibold">
                    {language === 'ar' ? 'تقييم خطر النكس (Relapse Risk): ' : 'Relapse Risk Assessment: '}
                  </span>
                  {orthoCase.retentionAndResidual.relapseRiskLevel}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 14. Evidence-Based References */}
        {selectedSections.includes('references') && (
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <span>
                {language === 'ar'
                  ? `12. المراجع العلمية المعتمدة (${citationFormat})`
                  : `12. Traceable Orthodontic Literature & Evidence (${citationFormat} Format)`}
              </span>
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-700 font-mono" dir="ltr">
              {caseReferences.map((ref) => (
                <li key={ref.id}>
                  {citationFormat === 'APA' ? ref.apaCitation : ref.vancouverCitation}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
};
