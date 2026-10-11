import React from 'react';
import {
  AlertTriangle,
  Plus,
  ShieldCheck,
  Camera,
  CalendarPlus,
} from 'lucide-react';
import {
  CephAnalysisSchool,
  ClinicalVisit,
  DomainSection,
  FindingCategory,
  InventoryMaterial,
  LanguageMode,
  OrthodonticCase,
  OutcomeStatus,
  Patient,
  ProblemObjectiveItem,
  TimepointStage,
} from '../types/orthodontics';
import {
  CEPHALOMETRIC_DEFINITIONS,
  ClinicalWarning,
  evaluateCephalometricValue,
} from '../domain/cephalometricEngine';
import {
  formatDomainSection,
  formatFindingCategory,
  formatOutcomeStatus,
  formatPhotoCategory,
  formatProcedure,
  formatSkeletalSagittal,
  formatSkeletalTransverse,
  formatSkeletalVertical,
  formatTimepointStage,
  formatVisitType,
} from '../utils/i18n';
import { CephTracingCanvas, ClinicalRecordIllustration } from './CephTracingCanvas';

interface ClinicalCaseWorkspaceProps {
  orthoCase: OrthodonticCase;
  patient: Patient;
  warnings: ClinicalWarning[];
  inventory: InventoryMaterial[];
  language: LanguageMode;
  activeTab:
    | 'examination'
    | 'diagnosis_problems'
    | 'cephalometrics'
    | 'treatment_plan'
    | 'visits_progress'
    | 'media_comparison';
  onUpdateCase: (updated: OrthodonticCase, auditAction?: string, auditDetails?: string) => void;
  onAddQuickVisit: (visit: ClinicalVisit) => void;
}

export const ClinicalCaseWorkspace: React.FC<ClinicalCaseWorkspaceProps> = ({
  orthoCase,
  patient,
  warnings,
  inventory,
  language,
  activeTab,
  onUpdateCase,
  onAddQuickVisit,
}) => {
  // Cephalometric local state
  const [activeCephStage, setActiveCephStage] = React.useState<TimepointStage>('T0_Initial');
  const [selectedSchool, setSelectedSchool] = React.useState<CephAnalysisSchool | 'All'>('All');
  const [showSuperimposition, setShowSuperimposition] = React.useState<boolean>(false);
  const [superimpositionPlane, setSuperimpositionPlane] = React.useState<
    'Cranial Base (S-N at S)' | 'Maxillary (ANS-PNS)' | 'Mandibular (Go-Me)'
  >('Cranial Base (S-N at S)');

  // Problem list new entry state
  const [newProbDomain, setNewProbDomain] = React.useState<DomainSection>('Occlusal');
  const [newProbClass, setNewProbClass] = React.useState<FindingCategory>('Actual Problem');
  const [newFindingText, setNewFindingText] = React.useState('');
  const [newObjectiveText, setNewObjectiveText] = React.useState('');
  const [newStrategyText, setNewStrategyText] = React.useState('');

  // Quick Visit Entry state (iPad 10-second chairside entry)
  const [visitType, setVisitType] = React.useState<ClinicalVisit['visitType']>('Wire Change');
  const [visitStage, setVisitStage] = React.useState<TimepointStage>('T1_Progress');
  const [selectedProcedures, setSelectedProcedures] = React.useState<string[]>([
    'Wire Change',
    'Power Chain',
  ]);
  const [upperWire, setUpperWire] = React.useState('0.019×0.025" SS');
  const [lowerWire, setLowerWire] = React.useState('0.019×0.025" SS');
  const [elastics, setElastics] = React.useState('Class II 3/16" 4.5oz Bilateral');
  const [selectedMaterialId, setSelectedMaterialId] = React.useState<string>(inventory[2]?.id || 'mat_3');
  const [visitNotesText, setVisitNotesText] = React.useState('');
  const [nextPlan, setNextPlan] = React.useState(
    'متابعة إغلاق المسافات ومراقبة العزم الجذري (Root Torque).'
  );

  const toggleProcedure = (proc: string) => {
    setSelectedProcedures((prev) =>
      prev.includes(proc) ? prev.filter((p) => p !== proc) : [...prev, proc]
    );
  };

  const handleSaveQuickVisit = () => {
    const mat = inventory.find((m) => m.id === selectedMaterialId);
    const procsAr = selectedProcedures.map((p) => formatProcedure('ar', p)).join(' + ');
    const newVisit: ClinicalVisit = {
      id: `vis_${Date.now()}`,
      visitNumber: orthoCase.visits.length + 1,
      date: new Date().toISOString().slice(0, 10),
      stage: visitStage,
      visitType,
      procedures: selectedProcedures,
      upperArchwire: upperWire,
      lowerArchwire: lowerWire,
      elasticsConfig: elastics,
      materialsIssuedIds: mat
        ? [{ materialId: mat.id, materialName: mat.name, quantity: 1, unitCost: mat.unitCost }]
        : [],
      clinicalNotesEn:
        visitNotesText ||
        `Completed ${selectedProcedures.join(', ')}. Upper wire: ${upperWire}, Lower wire: ${lowerWire}.`,
      clinicalNotesAr:
        visitNotesText ||
        `تم إجراء: ${procsAr}، السلك العلوي (${upperWire}) والسلك السفلي (${lowerWire}).`,
      nextPlan,
      nextAppointmentDate: '2026-11-15',
    };
    onAddQuickVisit(newVisit);
    setVisitNotesText('');
  };

  const handleAddProblemRow = () => {
    if (!newFindingText.trim()) return;
    const item: ProblemObjectiveItem = {
      id: `prob_${Date.now()}`,
      domain: newProbDomain,
      classification: newProbClass,
      findingEn: newFindingText,
      findingAr: newFindingText,
      objectiveEn: newProbClass === 'Normal Finding' ? '' : newObjectiveText,
      objectiveAr: newProbClass === 'Normal Finding' ? '' : newObjectiveText,
      strategyMechanicsEn: newStrategyText,
      strategyMechanicsAr: newStrategyText,
      outcomeResultEn: 'In active treatment',
      outcomeResultAr: 'قيد المتابعة السريرية',
      outcomeStatus: 'In Progress',
      origin: 'Doctor-Approved',
      approvedByDoctor: true,
    };
    onUpdateCase(
      {
        ...orthoCase,
        problemList: [...orthoCase.problemList, item],
      },
      'Added Problem/Finding to Case',
      `${item.classification}: ${item.findingAr}`
    );
    setNewFindingText('');
    setNewObjectiveText('');
    setNewStrategyText('');
  };

  // 1. CLINICAL EXAMINATION & CBCT TAB
  if (activeTab === 'examination') {
    return (
      <div className="space-y-6">
        {/* Chief Complaint & Patient Expectations */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="text-base font-semibold text-slate-900">
              {language === 'ar'
                ? 'السجل السريري والشكوى الرئيسية والفحص الشامل'
                : 'Clinical Examination: Extraoral, Intraoral, Occlusal & 3D CBCT'}
            </h2>
            <span className="font-mono text-xs text-slate-500">
              {language === 'ar'
                ? `المريض: ${patient.fullNameAr} · ${orthoCase.id}`
                : `Patient: ${patient.fullNameEn} · ${orthoCase.id}`}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 block">
                {language === 'ar'
                  ? 'الشكوى الرئيسية للمريض (Chief Complaint)'
                  : 'Chief Complaint'}
              </label>
              {language === 'ar' ? (
                <input
                  type="text"
                  dir="rtl"
                  value={orthoCase.chiefComplaintAr}
                  onChange={(e) =>
                    onUpdateCase({ ...orthoCase, chiefComplaintAr: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                />
              ) : (
                <input
                  type="text"
                  value={orthoCase.chiefComplaintEn}
                  onChange={(e) =>
                    onUpdateCase({ ...orthoCase, chiefComplaintEn: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 block">
                {language === 'ar'
                  ? 'توقعات المريض والتاريخ الطبي والسني'
                  : 'Patient Expectations & Medical/Dental History'}
              </label>
              <input
                type="text"
                value={orthoCase.patientExpectations}
                onChange={(e) =>
                  onUpdateCase({ ...orthoCase, patientExpectations: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-blue-600"
              />
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-slate-600">
                {language === 'ar'
                  ? `التاريخ الطبي: ${patient.medicalHistory} · الحساسية الدوائية: ${patient.allergies}`
                  : `Medical: ${patient.medicalHistory} · Allergies: ${patient.allergies}`}
              </div>
            </div>
          </div>
        </div>

        {/* 3-Column Examination Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Extraoral */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">
              {language === 'ar'
                ? '1. الفحص خارج الفموي والأنسجة الرخوة (Extraoral)'
                : '1. Extraoral & Soft Tissue Examination'}
            </h3>
            <div className="space-y-2.5">
              <div>
                <label className="text-slate-600 font-medium block mb-1">
                  {language === 'ar' ? 'النمط الوجهي (Facial Pattern)' : 'Facial Pattern'}
                </label>
                <select
                  value={orthoCase.extraoral.facialType}
                  onChange={(e) =>
                    onUpdateCase({
                      ...orthoCase,
                      extraoral: {
                        ...orthoCase.extraoral,
                        facialType: e.target.value as OrthodonticCase['extraoral']['facialType'],
                      },
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="Mesofacial">
                    {language === 'ar' ? 'وجه متوازن (Mesofacial)' : 'Mesofacial'}
                  </option>
                  <option value="Dolichofacial">
                    {language === 'ar' ? 'وجه طويل (Dolichofacial)' : 'Dolichofacial (Long Face)'}
                  </option>
                  <option value="Brachyfacial">
                    {language === 'ar' ? 'وجه قصير عريض (Brachyfacial)' : 'Brachyfacial (Short Face)'}
                  </option>
                </select>
              </div>

              <div>
                <label className="text-slate-600 font-medium block mb-1">
                  {language === 'ar' ? 'المرتسم الجانبي (Facial Profile)' : 'Facial Profile'}
                </label>
                <select
                  value={orthoCase.extraoral.profile}
                  onChange={(e) =>
                    onUpdateCase({
                      ...orthoCase,
                      extraoral: {
                        ...orthoCase.extraoral,
                        profile: e.target.value as OrthodonticCase['extraoral']['profile'],
                      },
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="Straight">
                    {language === 'ar' ? 'مستقيم متوازن (Straight)' : 'Straight (Orthognathic)'}
                  </option>
                  <option value="Convex">
                    {language === 'ar' ? 'محدب (Convex)' : 'Convex (Class II Pattern)'}
                  </option>
                  <option value="Concave">
                    {language === 'ar' ? 'مقعر (Concave)' : 'Concave (Class III Pattern)'}
                  </option>
                </select>
              </div>

              <div>
                <label className="text-slate-600 font-medium block mb-1">
                  {language === 'ar' ? 'كفاءة إطباق الشفاه (Lip Competence)' : 'Lip Competence'}
                </label>
                <select
                  value={orthoCase.extraoral.lipCompetence}
                  onChange={(e) =>
                    onUpdateCase({
                      ...orthoCase,
                      extraoral: {
                        ...orthoCase.extraoral,
                        lipCompetence: e.target.value as OrthodonticCase['extraoral']['lipCompetence'],
                      },
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="Competent">
                    {language === 'ar' ? 'شفاه كفؤة في وضع الراحة (Competent)' : 'Competent'}
                  </option>
                  <option value="Incompetent">
                    {language === 'ar'
                      ? 'قصور شفوي / فرجة بين الشفاه (Incompetent)'
                      : 'Incompetent (Interlabial Gap >3mm)'}
                  </option>
                  <option value="Potentially Competent">
                    {language === 'ar'
                      ? 'كفؤة كامنة مع إجهاد ذقني (Potentially Competent)'
                      : 'Potentially Competent'}
                  </option>
                </select>
              </div>

              <div>
                <label className="text-slate-600 font-medium block mb-1">
                  {language === 'ar'
                    ? 'الزاوية الأنفية الشفوية (Nasolabial Angle)'
                    : 'Nasolabial Angle'}
                </label>
                <select
                  value={orthoCase.extraoral.nasolabialAngle}
                  onChange={(e) =>
                    onUpdateCase({
                      ...orthoCase,
                      extraoral: {
                        ...orthoCase.extraoral,
                        nasolabialAngle: e.target.value as OrthodonticCase['extraoral']['nasolabialAngle'],
                      },
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="Normal (90-110°)">
                    {language === 'ar' ? 'طبيعية (90-110°)' : 'Normal (90-110°)'}
                  </option>
                  <option value="Acute (<90°)">
                    {language === 'ar' ? 'حادة بسبب بروز القواطع (<90°)' : 'Acute (<90°)'}
                  </option>
                  <option value="Obtuse (>110°)">
                    {language === 'ar' ? 'منفرجة (>110°)' : 'Obtuse (>110°)'}
                  </option>
                </select>
              </div>

              <div>
                <label className="text-slate-600 font-medium block mb-1">
                  {language === 'ar' ? 'قوس الابتسامة (Smile Arc)' : 'Smile Arc'}
                </label>
                <select
                  value={orthoCase.extraoral.smileArc}
                  onChange={(e) =>
                    onUpdateCase({
                      ...orthoCase,
                      extraoral: {
                        ...orthoCase.extraoral,
                        smileArc: e.target.value as OrthodonticCase['extraoral']['smileArc'],
                      },
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="Consonant">
                    {language === 'ar' ? 'متناغم مع الشفة السفلية (Consonant)' : 'Consonant'}
                  </option>
                  <option value="Flat">
                    {language === 'ar' ? 'مسطح (Flat)' : 'Flat'}
                  </option>
                  <option value="Reverse">
                    {language === 'ar' ? 'معكوس (Reverse)' : 'Reverse'}
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* Intraoral */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">
              {language === 'ar'
                ? '2. الفحص داخل الفموي وازدحام القوسين (Intraoral)'
                : '2. Intraoral & Arch Length Discrepancy'}
            </h3>
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-600 font-medium block mb-1">
                    {language === 'ar' ? 'ازدحام العلوي (Crowding mm)' : 'Upper Crowding (mm)'}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={orthoCase.intraoral.maxillaryCrowdingMm}
                    onChange={(e) =>
                      onUpdateCase({
                        ...orthoCase,
                        intraoral: {
                          ...orthoCase.intraoral,
                          maxillaryCrowdingMm: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-600 font-medium block mb-1">
                    {language === 'ar' ? 'ازدحام السفلي (Crowding mm)' : 'Lower Crowding (mm)'}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={orthoCase.intraoral.mandibularCrowdingMm}
                    onChange={(e) =>
                      onUpdateCase({
                        ...orthoCase,
                        intraoral: {
                          ...orthoCase.intraoral,
                          mandibularCrowdingMm: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-600 font-medium block mb-1">
                  {language === 'ar' ? 'شكل القوس السنية العلوية (Arch Form)' : 'Maxillary Arch Form'}
                </label>
                <select
                  value={orthoCase.intraoral.maxillaryArchForm}
                  onChange={(e) =>
                    onUpdateCase({
                      ...orthoCase,
                      intraoral: {
                        ...orthoCase.intraoral,
                        maxillaryArchForm: e.target.value as OrthodonticCase['intraoral']['maxillaryArchForm'],
                      },
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="Ovoid">
                    {language === 'ar' ? 'بيضوي متناظر (Ovoid)' : 'Ovoid'}
                  </option>
                  <option value="Tapered">
                    {language === 'ar' ? 'مستدق الأمام (Tapered)' : 'Tapered'}
                  </option>
                  <option value="Square">
                    {language === 'ar' ? 'مربع (Square)' : 'Square'}
                  </option>
                  <option value="Constricted">
                    {language === 'ar' ? 'متضيق بشكل V (Constricted)' : 'Constricted (V-Shaped)'}
                  </option>
                </select>
              </div>

              <div>
                <label className="text-slate-600 font-medium block mb-1">
                  {language === 'ar'
                    ? 'النمط الحيوي للثة والأنسجة الداعمة (Gingival Biotype)'
                    : 'Gingival Biotype & Periodontium'}
                </label>
                <select
                  value={orthoCase.intraoral.gingivalBiotype}
                  onChange={(e) =>
                    onUpdateCase({
                      ...orthoCase,
                      intraoral: {
                        ...orthoCase.intraoral,
                        gingivalBiotype: e.target.value as OrthodonticCase['intraoral']['gingivalBiotype'],
                      },
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="Thick">
                    {language === 'ar' ? 'نمط لثوي سميك (Thick)' : 'Thick Biotype'}
                  </option>
                  <option value="Normal">
                    {language === 'ar' ? 'نمط لثوي طبيعي (Normal)' : 'Normal Biotype'}
                  </option>
                  <option value="Thin / Fragile">
                    {language === 'ar'
                      ? 'نمط لثوي رقيق / خطر انحسار (Thin Biotype)'
                      : 'Thin / Fragile (Recession Risk)'}
                  </option>
                </select>
              </div>

              <div>
                <label className="text-slate-600 font-medium block mb-1">
                  {language === 'ar'
                    ? 'الأسنان المنفتلة والمنطمرة (Rotations & Ectopic)'
                    : 'Rotations & Ectopic Findings'}
                </label>
                <textarea
                  rows={2}
                  value={orthoCase.intraoral.rotationsSummary}
                  onChange={(e) =>
                    onUpdateCase({
                      ...orthoCase,
                      intraoral: { ...orthoCase.intraoral, rotationsSummary: e.target.value },
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </div>
            </div>
          </div>

          {/* Occlusal */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">
              {language === 'ar'
                ? '3. الفحص الإطباقي والعلاقات السنية (Occlusion)'
                : '3. Occlusal Examination'}
            </h3>
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-600 font-medium block mb-1">
                    {language === 'ar' ? 'البروز الأولي (Overjet mm)' : 'Initial Overjet (mm)'}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={orthoCase.occlusal.overjetInitialMm}
                    onChange={(e) =>
                      onUpdateCase({
                        ...orthoCase,
                        occlusal: { ...orthoCase.occlusal, overjetInitialMm: Number(e.target.value) },
                      })
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-600 font-medium block mb-1">
                    {language === 'ar' ? 'البروز الحالي (Overjet mm)' : 'Current Overjet (mm)'}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={orthoCase.occlusal.overjetCurrentMm}
                    onChange={(e) =>
                      onUpdateCase({
                        ...orthoCase,
                        occlusal: { ...orthoCase.occlusal, overjetCurrentMm: Number(e.target.value) },
                      })
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-600 font-medium block mb-1">
                    {language === 'ar' ? 'العلاقة الرحوية (Molar)' : 'Molar Right'}
                  </label>
                  <select
                    value={orthoCase.occlusal.molarRight}
                    onChange={(e) =>
                      onUpdateCase({
                        ...orthoCase,
                        occlusal: {
                          ...orthoCase.occlusal,
                          molarRight: e.target.value as OrthodonticCase['occlusal']['molarRight'],
                        },
                      })
                    }
                    className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                  >
                    <option value="Class I">
                      {language === 'ar' ? 'صنف أول (Class I)' : 'Class I'}
                    </option>
                    <option value="Class II Half-Cusp">
                      {language === 'ar' ? 'صنف ثانٍ نصف حدبة (Class II 1/2)' : 'Class II Half-Cusp'}
                    </option>
                    <option value="Class II Full">
                      {language === 'ar' ? 'صنف ثانٍ كامل (Class II Full)' : 'Class II Full'}
                    </option>
                    <option value="Class III">
                      {language === 'ar' ? 'صنف ثالث (Class III)' : 'Class III'}
                    </option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-600 font-medium block mb-1">
                    {language === 'ar' ? 'العلاقة النابية (Canine)' : 'Canine Right'}
                  </label>
                  <select
                    value={orthoCase.occlusal.canineRight}
                    onChange={(e) =>
                      onUpdateCase({
                        ...orthoCase,
                        occlusal: {
                          ...orthoCase.occlusal,
                          canineRight: e.target.value as OrthodonticCase['occlusal']['canineRight'],
                        },
                      })
                    }
                    className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                  >
                    <option value="Class I">
                      {language === 'ar' ? 'صنف أول (Class I)' : 'Class I'}
                    </option>
                    <option value="Class II">
                      {language === 'ar' ? 'صنف ثانٍ (Class II)' : 'Class II'}
                    </option>
                    <option value="Class III">
                      {language === 'ar' ? 'صنف ثالث (Class III)' : 'Class III'}
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-600 font-medium block mb-1">
                  {language === 'ar' ? 'العضة المعكوسة (Crossbite)' : 'Crossbite Status'}
                </label>
                <select
                  value={orthoCase.occlusal.crossbite}
                  onChange={(e) =>
                    onUpdateCase({
                      ...orthoCase,
                      occlusal: {
                        ...orthoCase.occlusal,
                        crossbite: e.target.value as OrthodonticCase['occlusal']['crossbite'],
                      },
                    })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="None">
                    {language === 'ar' ? 'لا يوجد (None)' : 'None'}
                  </option>
                  <option value="Anterior">
                    {language === 'ar' ? 'عضة معكوسة أمامية (Anterior)' : 'Anterior Crossbite'}
                  </option>
                  <option value="Unilateral Posterior Right">
                    {language === 'ar' ? 'خلفية أحادية يمنى (Posterior Right)' : 'Unilateral Posterior Right'}
                  </option>
                  <option value="Unilateral Posterior Left">
                    {language === 'ar' ? 'خلفية أحادية يسرى (Posterior Left)' : 'Unilateral Posterior Left'}
                  </option>
                  <option value="Bilateral Posterior">
                    {language === 'ar' ? 'خلفية ثنائية الجانب (Bilateral Posterior)' : 'Bilateral Posterior Crossbite'}
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-600 font-medium block mb-1">
                    {language === 'ar' ? 'قوس سبي (Curve of Spee)' : 'Curve of Spee (mm)'}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={orthoCase.occlusal.curveOfSpeeMm}
                    onChange={(e) =>
                      onUpdateCase({
                        ...orthoCase,
                        occlusal: { ...orthoCase.occlusal, curveOfSpeeMm: Number(e.target.value) },
                      })
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-600 font-medium block mb-1">
                    {language === 'ar' ? 'نسبة بولتون الأمامية (Bolton %)' : 'Bolton Ant. (%)'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={orthoCase.occlusal.boltonAnteriorRatio}
                    onChange={(e) =>
                      onUpdateCase({
                        ...orthoCase,
                        occlusal: {
                          ...orthoCase.occlusal,
                          boltonAnteriorRatio: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. CBCT & Radiographic Module */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 text-xs">
          <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2">
            {language === 'ar'
              ? '4. التقييم الشعاعي البانورامي والمقطعي ثلاثي الأبعاد (CBCT & Panoramic)'
              : '4. CBCT 3D & Panoramic Radiographic Assessment (Cortical Plates, Airway, TMJ, TAD Sites)'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {language === 'ar' ? 'النضج الفقري العظمي (CVM Stage)' : 'CVM Skeletal Maturation'}
              </label>
              <select
                value={orthoCase.cbctAndRadiographs.cvmStage}
                onChange={(e) =>
                  onUpdateCase({
                    ...orthoCase,
                    cbctAndRadiographs: {
                      ...orthoCase.cbctAndRadiographs,
                      cvmStage: e.target.value as OrthodonticCase['cbctAndRadiographs']['cvmStage'],
                    },
                  })
                }
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
              >
                <option value="CS1">
                  {language === 'ar' ? 'المرحلة الأولى قبل الطفرة (CS1)' : 'CS1 (Pre-peak)'}
                </option>
                <option value="CS2">CS2</option>
                <option value="CS3 (Peak)">
                  {language === 'ar' ? 'ذروة طفرة النمو البلوغي (CS3)' : 'CS3 (Pubertal Peak)'}
                </option>
                <option value="CS4">CS4</option>
                <option value="CS5">
                  {language === 'ar' ? 'بعد الذروة (CS5)' : 'CS5 (Post-peak)'}
                </option>
                <option value="CS6 (Mature)">
                  {language === 'ar' ? 'نضج عظمي مكتمل (CS6)' : 'CS6 (Adult Mature)'}
                </option>
              </select>
            </div>

            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {language === 'ar'
                  ? 'حالة الصفائح القشرية السنخية (Cortical Plates)'
                  : 'Alveolar Cortical Plates (CBCT)'}
              </label>
              <select
                value={orthoCase.cbctAndRadiographs.alveolarBoneStatus}
                onChange={(e) =>
                  onUpdateCase({
                    ...orthoCase,
                    cbctAndRadiographs: {
                      ...orthoCase.cbctAndRadiographs,
                      alveolarBoneStatus: e.target
                        .value as OrthodonticCase['cbctAndRadiographs']['alveolarBoneStatus'],
                    },
                  })
                }
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="Adequate">
                  {language === 'ar' ? 'سماكة عظمية كافية (Adequate)' : 'Adequate Labial/Lingual Plates'}
                </option>
                <option value="Thin Labial Cortical Plate">
                  {language === 'ar'
                    ? 'صفيحة دهليزية رقيقة (Thin Labial Plate)'
                    : 'Thin Labial Cortical Plate'}
                </option>
                <option value="Dehiscence / Fenestration Risk">
                  {language === 'ar'
                    ? 'خطر انكشاف أو تفزر عظمي (Dehiscence Risk)'
                    : 'Dehiscence / Fenestration Risk'}
                </option>
              </select>
            </div>

            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {language === 'ar'
                  ? 'حالة امتصاص الجذور (Root Resorption)'
                  : 'Root Resorption Status'}
              </label>
              <select
                value={orthoCase.cbctAndRadiographs.rootResorptionStatus}
                onChange={(e) =>
                  onUpdateCase({
                    ...orthoCase,
                    cbctAndRadiographs: {
                      ...orthoCase.cbctAndRadiographs,
                      rootResorptionStatus: e.target
                        .value as OrthodonticCase['cbctAndRadiographs']['rootResorptionStatus'],
                    },
                  })
                }
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="None">
                  {language === 'ar' ? 'لا يوجد امتصاص جذري (None)' : 'None'}
                </option>
                <option value="Mild Apical Blunting">
                  {language === 'ar'
                    ? 'تسطح ذروي طفيف أقل من 1 ملم (Mild Blunting)'
                    : 'Mild Apical Blunting (<1mm)'}
                </option>
                <option value="Moderate Resorption">
                  {language === 'ar' ? 'امتصاص جذري متوسط (Moderate)' : 'Moderate Resorption'}
                </option>
              </select>
            </div>

            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {language === 'ar'
                  ? 'مواضع الزرعات وسماكة قبة الحنك (TAD / MARPE Sites)'
                  : 'TAD / MARPE Bone Thickness Notes'}
              </label>
              <input
                type="text"
                value={orthoCase.cbctAndRadiographs.tadSafeZonesNotes}
                onChange={(e) =>
                  onUpdateCase({
                    ...orthoCase,
                    cbctAndRadiographs: {
                      ...orthoCase.cbctAndRadiographs,
                      tadSafeZonesNotes: e.target.value,
                    },
                  })
                }
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. DIAGNOSIS & PROBLEM LIST TAB
  if (activeTab === 'diagnosis_problems') {
    return (
      <div className="space-y-6">
        {/* Consistency Warnings Banner if any */}
        {warnings.filter((w) => w.type === 'Consistency Conflict').map((w) => (
          <div
            key={w.id}
            className="p-4 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-950 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">
                {language === 'ar'
                  ? 'تنبيه الاتساق السريري (يتطلب مراجعة الطبيب — النظام لا يعدل السجل تلقائيًا):'
                  : 'Clinical Consistency Warning (Doctor Review Required — System Does Not Auto-Overwrite):'}
              </div>
              <div className="mt-0.5 font-semibold">{language === 'ar' ? w.titleAr : w.titleEn}</div>
              <div className="mt-0.5 text-amber-800">{language === 'ar' ? w.detailAr : w.detailEn}</div>
            </div>
          </div>
        ))}

        {/* Structured Orthodontic Diagnosis (Skeletal / Dental / Occlusal / Soft Tissue) */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {language === 'ar'
                  ? 'التشخيص التقويمي المعتمد من الطبيب (الهيكلي والسني والإطباقي)'
                  : 'Doctor-Approved Structured Diagnosis (Versioned Record)'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'ar'
                  ? 'جرّب تغيير العلاقة السهمية إلى "صنف أول هيكلي" مع بقاء زاوية (ANB = 5.5°) لاختبار محرك فحص التناقضات السريرية الفوري.'
                  : 'Try changing Sagittal Classification to "Skeletal Class I" while ANB is 5.5° to test the real-time Clinical Consistency Engine.'}
              </p>
            </div>
            <span className="font-mono text-xs text-emerald-700 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-4 h-4" />
              {language === 'ar'
                ? `الإصدار المعتمد v${orthoCase.diagnosis.version}`
                : `Version v${orthoCase.diagnosis.version} · ${orthoCase.diagnosis.origin}`}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                {language === 'ar'
                  ? 'العلاقة الهيكلية السهمية (Skeletal Sagittal)'
                  : 'Skeletal Sagittal'}
              </label>
              <select
                value={orthoCase.diagnosis.skeletalSagittal}
                onChange={(e) =>
                  onUpdateCase(
                    {
                      ...orthoCase,
                      diagnosis: {
                        ...orthoCase.diagnosis,
                        version: orthoCase.diagnosis.version + 1,
                        updatedAt: new Date().toISOString().slice(0, 10),
                        skeletalSagittal: e.target
                          .value as OrthodonticCase['diagnosis']['skeletalSagittal'],
                      },
                    },
                    'Updated Skeletal Sagittal Diagnosis',
                    `Set to ${e.target.value}`
                  )
                }
                className="w-full px-3 py-2 border border-slate-300 rounded bg-white font-medium"
              >
                <option value="Skeletal Class I">
                  {formatSkeletalSagittal(language, 'Skeletal Class I')}
                </option>
                <option value="Skeletal Class II (Mandibular Retrognathism)">
                  {formatSkeletalSagittal(
                    language,
                    'Skeletal Class II (Mandibular Retrognathism)'
                  )}
                </option>
                <option value="Skeletal Class II (Maxillary Prognathism)">
                  {formatSkeletalSagittal(language, 'Skeletal Class II (Maxillary Prognathism)')}
                </option>
                <option value="Skeletal Class III">
                  {formatSkeletalSagittal(language, 'Skeletal Class III')}
                </option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                {language === 'ar'
                  ? 'النمط الهيكلي العمودي (Skeletal Vertical)'
                  : 'Skeletal Vertical'}
              </label>
              <select
                value={orthoCase.diagnosis.skeletalVertical}
                onChange={(e) =>
                  onUpdateCase({
                    ...orthoCase,
                    diagnosis: {
                      ...orthoCase.diagnosis,
                      skeletalVertical: e.target
                        .value as OrthodonticCase['diagnosis']['skeletalVertical'],
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded bg-white font-medium"
              >
                <option value="Normodivergent">
                  {formatSkeletalVertical(language, 'Normodivergent')}
                </option>
                <option value="Hyperdivergent (High Angle)">
                  {formatSkeletalVertical(language, 'Hyperdivergent (High Angle)')}
                </option>
                <option value="Hypodivergent (Low Angle)">
                  {formatSkeletalVertical(language, 'Hypodivergent (Low Angle)')}
                </option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                {language === 'ar'
                  ? 'العلاقة الهيكلية العرضية (Skeletal Transverse)'
                  : 'Skeletal Transverse'}
              </label>
              <select
                value={orthoCase.diagnosis.skeletalTransverse}
                onChange={(e) =>
                  onUpdateCase({
                    ...orthoCase,
                    diagnosis: {
                      ...orthoCase.diagnosis,
                      skeletalTransverse: e.target
                        .value as OrthodonticCase['diagnosis']['skeletalTransverse'],
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded bg-white font-medium"
              >
                <option value="Normal Transverse Maxillo-Mandibular Width">
                  {formatSkeletalTransverse(
                    language,
                    'Normal Transverse Maxillo-Mandibular Width'
                  )}
                </option>
                <option value="Maxillary Transverse Deficiency">
                  {formatSkeletalTransverse(language, 'Maxillary Transverse Deficiency')}
                </option>
                <option value="Asymmetric Transverse">
                  {formatSkeletalTransverse(language, 'Asymmetric Transverse')}
                </option>
              </select>
            </div>
          </div>

          <div className="text-xs">
            <label className="font-semibold text-slate-700 block mb-1">
              {language === 'ar'
                ? 'الصياغة التشخيصية الشاملة المعتمدة'
                : 'Comprehensive Diagnostic Synthesis'}
            </label>
            {language === 'ar' ? (
              <textarea
                rows={3}
                dir="rtl"
                value={orthoCase.diagnosis.comprehensiveStatementAr}
                onChange={(e) =>
                  onUpdateCase({
                    ...orthoCase,
                    diagnosis: {
                      ...orthoCase.diagnosis,
                      comprehensiveStatementAr: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded leading-relaxed"
              />
            ) : (
              <textarea
                rows={3}
                value={orthoCase.diagnosis.comprehensiveStatementEn}
                onChange={(e) =>
                  onUpdateCase({
                    ...orthoCase,
                    diagnosis: {
                      ...orthoCase.diagnosis,
                      comprehensiveStatementEn: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded leading-relaxed"
              />
            )}
          </div>
        </div>

        {/* Problem List -> Objective -> Strategy -> Outcome Matrix */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="text-base font-semibold text-slate-900">
              {language === 'ar'
                ? 'قائمة المشاكل السريرية وربطها بالأهداف العلاجية والنتيجة النهائية'
                : 'Problem List → Treatment Objectives → Biomechanical Strategy → Outcome Matrix'}
            </h3>
            <p className="text-xs text-slate-500">
              {language === 'ar'
                ? 'يفصل النظام بين "المعيار الطبيعي" الذي لا يتطلب علاجاً وبين "المشكلة التقويمية الفعلية" التي يجب ربطها بهدف علاجي وميكانيكا محددة.'
                : 'Separates "Normal Findings" (which do not require treatment) from "Actual Problems" (which must map to a specific Treatment Objective).'}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 text-start">
                    {language === 'ar' ? 'النطاق والتصنيف' : 'Domain & Classification'}
                  </th>
                  <th className="py-2 text-start">
                    {language === 'ar' ? 'الملاحظة أو المشكلة السريرية' : 'Finding / Problem'}
                  </th>
                  <th className="py-2 text-start">
                    {language === 'ar' ? 'الهدف العلاجي المرتبط (Objective)' : 'Treatment Objective'}
                  </th>
                  <th className="py-2 text-start">
                    {language === 'ar' ? 'الميكانيكا العلاجية' : 'Biomechanical Strategy'}
                  </th>
                  <th className="py-2 text-start">
                    {language === 'ar' ? 'تقييم النتيجة' : 'Outcome Status'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {orthoCase.problemList.map((prob) => (
                  <tr key={prob.id} className="align-top">
                    <td className="py-3 pe-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">
                        {formatDomainSection(language, prob.domain)}
                      </div>
                      <div
                        className={`text-[11px] mt-0.5 ${
                          prob.classification === 'Actual Problem'
                            ? 'text-rose-700 font-semibold'
                            : prob.classification === 'Normal Finding'
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {formatFindingCategory(language, prob.classification)}
                      </div>
                    </td>
                    <td className="py-3 pe-3">
                      <div className="font-medium text-slate-900 leading-relaxed">
                        {language === 'ar' ? prob.findingAr : prob.findingEn}
                      </div>
                    </td>
                    <td className="py-3 pe-3">
                      {prob.classification === 'Normal Finding' ? (
                        <span className="text-slate-400 italic">
                          {language === 'ar'
                            ? 'ضمن الحدود الطبيعية — لا يتطلب تدخلاً علاجياً'
                            : 'Normal parameter — No intervention needed'}
                        </span>
                      ) : (
                        <input
                          type="text"
                          value={language === 'ar' ? prob.objectiveAr : prob.objectiveEn}
                          onChange={(e) => {
                            const updatedList = orthoCase.problemList.map((item) =>
                              item.id === prob.id
                                ? language === 'ar'
                                  ? { ...item, objectiveAr: e.target.value }
                                  : { ...item, objectiveEn: e.target.value }
                                : item
                            );
                            onUpdateCase({ ...orthoCase, problemList: updatedList });
                          }}
                          placeholder={
                            language === 'ar'
                              ? 'أدخل الهدف العلاجي المرتبط بهذه المشكلة...'
                              : 'Enter linked Treatment Objective...'
                          }
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-slate-50 focus:bg-white"
                        />
                      )}
                    </td>
                    <td className="py-3 pe-3 text-slate-700 leading-relaxed">
                      {(language === 'ar' ? prob.strategyMechanicsAr : prob.strategyMechanicsEn) ||
                        '—'}
                    </td>
                    <td className="py-3">
                      <select
                        value={prob.outcomeStatus}
                        onChange={(e) => {
                          const updatedList = orthoCase.problemList.map((item) =>
                            item.id === prob.id
                              ? { ...item, outcomeStatus: e.target.value as OutcomeStatus }
                              : item
                          );
                          onUpdateCase({ ...orthoCase, problemList: updatedList });
                        }}
                        className="px-2 py-1 border border-slate-300 rounded text-[11px] bg-white"
                      >
                        <option value="Achieved">
                          {formatOutcomeStatus(language, 'Achieved')}
                        </option>
                        <option value="Partially Achieved">
                          {formatOutcomeStatus(language, 'Partially Achieved')}
                        </option>
                        <option value="In Progress">
                          {formatOutcomeStatus(language, 'In Progress')}
                        </option>
                        <option value="Not Achieved">
                          {formatOutcomeStatus(language, 'Not Achieved')}
                        </option>
                      </select>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {language === 'ar' ? prob.outcomeResultAr : prob.outcomeResultEn}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Finding / Problem Bar */}
          <div className="pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-6 gap-2.5 text-xs">
            <select
              value={newProbDomain}
              onChange={(e) => setNewProbDomain(e.target.value as DomainSection)}
              className="px-2.5 py-2 border border-slate-300 rounded bg-white"
            >
              <option value="Skeletal">{formatDomainSection(language, 'Skeletal')}</option>
              <option value="Dental">{formatDomainSection(language, 'Dental')}</option>
              <option value="Occlusal">{formatDomainSection(language, 'Occlusal')}</option>
              <option value="Soft Tissue">{formatDomainSection(language, 'Soft Tissue')}</option>
              <option value="CBCT / Radiographic">
                {formatDomainSection(language, 'CBCT / Radiographic')}
              </option>
            </select>
            <select
              value={newProbClass}
              onChange={(e) => setNewProbClass(e.target.value as FindingCategory)}
              className="px-2.5 py-2 border border-slate-300 rounded bg-white font-medium"
            >
              <option value="Actual Problem">
                {formatFindingCategory(language, 'Actual Problem')}
              </option>
              <option value="Normal Finding">
                {formatFindingCategory(language, 'Normal Finding')}
              </option>
              <option value="Risk / Concern">
                {formatFindingCategory(language, 'Risk / Concern')}
              </option>
            </select>
            <input
              type="text"
              placeholder={
                language === 'ar'
                  ? 'وصف المشكلة أو الملاحظة السريرية...'
                  : 'Finding / Problem description...'
              }
              value={newFindingText}
              onChange={(e) => setNewFindingText(e.target.value)}
              className="px-2.5 py-2 border border-slate-300 rounded md:col-span-2"
            />
            <input
              type="text"
              placeholder={
                language === 'ar'
                  ? 'الهدف العلاجي المطلوب...'
                  : 'Treatment Objective (if Problem)...'
              }
              value={newObjectiveText}
              onChange={(e) => setNewObjectiveText(e.target.value)}
              disabled={newProbClass === 'Normal Finding'}
              className="px-2.5 py-2 border border-slate-300 rounded disabled:bg-slate-100"
            />
            <button
              onClick={handleAddProblemRow}
              className="px-3 py-2 bg-slate-900 text-white rounded font-semibold hover:bg-slate-800 flex items-center justify-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              {language === 'ar' ? 'إضافة للسجل' : 'Add Entry'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. CEPHALOMETRICS & SUPERIMPOSITION TAB
  if (activeTab === 'cephalometrics') {
    const currentCeph =
      orthoCase.cephRecords.find((r) => r.stage === activeCephStage) || orthoCase.cephRecords[0];
    const t0Ceph = orthoCase.cephRecords.find((r) => r.stage === 'T0_Initial');
    const t1Ceph = orthoCase.cephRecords.find((r) => r.stage === 'T1_Progress');
    const t3Ceph = orthoCase.cephRecords.find((r) => r.stage === 'T3_Final');

    const filteredDefs =
      selectedSchool === 'All'
        ? CEPHALOMETRIC_DEFINITIONS
        : CEPHALOMETRIC_DEFINITIONS.filter((d) => d.school === selectedSchool);

    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {language === 'ar'
                  ? 'وحدة التحليل السيفالومتري والمطابقة الزمنية (Steiner / Tweed / McNamara / Downs / Jarabak)'
                  : 'Multi-School Cephalometric Module & Longitudinal Superimposition (T0 → T1 → T3)'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'ar'
                  ? 'تحقق تفاعلي من النقاط التشريحية مع حساب فوري للانحرافات والتفسير السريري عبر مراحل العلاج.'
                  : 'Interactive landmark verification + live deviation Z-score engine across multiple cephalometric analyses.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSuperimposition(false)}
                className={`px-3 py-1.5 rounded text-xs font-medium ${
                  !showSuperimposition ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {language === 'ar' ? 'مخطط مرحلة مفردة' : 'Single Stage Tracing'}
              </button>
              <button
                onClick={() => setShowSuperimposition(true)}
                className={`px-3 py-1.5 rounded text-xs font-medium ${
                  showSuperimposition ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {language === 'ar'
                  ? 'المطابقة السيفالومترية (Superimposition T0/T1/T3)'
                  : 'Longitudinal Superimposition (T0 / T1 / T3)'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 5 cols: Interactive Tracing & Superimposition Canvas */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                  {(['T0_Initial', 'T1_Progress', 'T3_Final'] as TimepointStage[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => {
                        setActiveCephStage(st);
                        setShowSuperimposition(false);
                      }}
                      className={`px-2.5 py-1 rounded text-xs font-medium ${
                        activeCephStage === st && !showSuperimposition
                          ? 'bg-white text-slate-900 shadow-xs font-semibold'
                          : 'text-slate-600'
                      }`}
                    >
                      {formatTimepointStage(language, st)}
                    </button>
                  ))}
                </div>
                {showSuperimposition && (
                  <select
                    value={superimpositionPlane}
                    onChange={(e) =>
                      setSuperimpositionPlane(
                        e.target.value as
                          | 'Cranial Base (S-N at S)'
                          | 'Maxillary (ANS-PNS)'
                          | 'Mandibular (Go-Me)'
                      )
                    }
                    className="px-2.5 py-1 border border-slate-300 rounded text-xs bg-white"
                  >
                    <option value="Cranial Base (S-N at S)">
                      {language === 'ar'
                        ? 'قاعدة القحف (Cranial Base S-N)'
                        : 'Cranial Base (S-N at S)'}
                    </option>
                    <option value="Maxillary (ANS-PNS)">
                      {language === 'ar'
                        ? 'المستوى الفكي العلوي (ANS-PNS)'
                        : 'Maxillary Regional (ANS-PNS)'}
                    </option>
                    <option value="Mandibular (Go-Me)">
                      {language === 'ar'
                        ? 'المستوى الفكي السفلي (Go-Me)'
                        : 'Mandibular Internal (Go-Me)'}
                    </option>
                  </select>
                )}
              </div>

              <CephTracingCanvas
                records={orthoCase.cephRecords}
                activeStage={activeCephStage}
                showSuperimposition={showSuperimposition}
                superimpositionPlane={superimpositionPlane}
                onUpdateLandmark={(code, x, y) => {
                  if (!currentCeph) return;
                  const updatedRecords = orthoCase.cephRecords.map((rec) => {
                    if (rec.stage !== currentCeph.stage) return rec;
                    return {
                      ...rec,
                      landmarks: rec.landmarks.map((lm) =>
                        lm.code === code ? { ...lm, x, y } : lm
                      ),
                    };
                  });
                  onUpdateCase({ ...orthoCase, cephRecords: updatedRecords });
                }}
              />

              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
                <div className="font-semibold text-slate-800">
                  {language === 'ar'
                    ? 'خلاصة المطابقة السيفالومترية (Superimposition):'
                    : 'Superimposition Interpretation:'}
                </div>
                <p className="text-slate-600 leading-relaxed">
                  {language === 'ar'
                    ? currentCeph?.superimpositionNotesAr
                    : currentCeph?.superimpositionNotesEn}
                </p>
              </div>
            </div>

            {/* Right 7 cols: Multi-School Quantitative Table */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    ['All', 'Steiner', 'Tweed', 'McNamara', 'Downs', 'Jarabak', 'Ricketts', 'Wits'] as const
                  ).map((sch) => (
                    <button
                      key={sch}
                      onClick={() => setSelectedSchool(sch)}
                      className={`px-2.5 py-1 rounded text-xs font-medium ${
                        selectedSchool === sch
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {sch === 'All' && language === 'ar' ? 'جميع التحاليل (All)' : sch}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                      <th className="py-2 px-3 text-start">
                        {language === 'ar' ? 'القياس (Parameter)' : 'Parameter'}
                      </th>
                      <th className="py-2 px-2 text-end font-mono">
                        {language === 'ar' ? 'المرجع' : 'Norm'}
                      </th>
                      <th className="py-2 px-2 text-end font-mono">
                        {language === 'ar' ? 'أولي T0' : 'T0 Initial'}
                      </th>
                      <th className="py-2 px-2 text-end font-mono">
                        {language === 'ar' ? 'مرحلي T1' : 'T1 Prog'}
                      </th>
                      <th className="py-2 px-2 text-end font-mono">
                        {language === 'ar' ? 'نهائي T3' : 'T3 Final'}
                      </th>
                      <th className="py-2 px-2 text-end font-mono">Δ</th>
                      <th className="py-2 px-3 text-start">
                        {language === 'ar' ? 'الدلالة التشخيصية' : 'Diagnostic Meaning'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredDefs.map((def) => {
                      const valActive = currentCeph?.values[def.code] ?? def.normMean;
                      const evalActive = evaluateCephalometricValue(def, valActive);
                      const v0 = t0Ceph?.values[def.code];
                      const v1 = t1Ceph?.values[def.code];
                      const v3 = t3Ceph?.values[def.code];
                      const delta =
                        v0 !== undefined && v3 !== undefined ? (v3 - v0).toFixed(1) : '—';

                      return (
                        <tr key={def.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-900">
                              {language === 'ar' ? `${def.nameAr} (${def.code})` : def.code}
                            </div>
                            {language === 'en' && (
                              <div className="text-[11px] text-slate-500">{def.nameEn}</div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-end font-mono text-slate-500 whitespace-nowrap">
                            {def.normMean}±{def.normSd}
                            {def.unit}
                          </td>
                          <td className="py-2 px-2 text-end font-mono">
                            <input
                              type="number"
                              step="0.5"
                              value={v0 ?? ''}
                              onChange={(e) => {
                                const num = Number(e.target.value);
                                const updated = orthoCase.cephRecords.map((r) =>
                                  r.stage === 'T0_Initial'
                                    ? { ...r, values: { ...r.values, [def.code]: num } }
                                    : r
                                );
                                onUpdateCase({ ...orthoCase, cephRecords: updated });
                              }}
                              className="w-16 px-1.5 py-0.5 text-end border border-slate-300 rounded font-mono bg-white"
                            />
                          </td>
                          <td className="py-2 px-2 text-end font-mono text-blue-700">
                            {v1 !== undefined ? `${v1}${def.unit}` : '—'}
                          </td>
                          <td className="py-2 px-2 text-end font-mono text-emerald-700 font-semibold">
                            {v3 !== undefined ? `${v3}${def.unit}` : '—'}
                          </td>
                          <td className="py-2 px-2 text-end font-mono font-semibold">
                            {delta !== '—' ? `${Number(delta) > 0 ? '+' : ''}${delta}` : '—'}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={
                                evalActive.status === 'Significant Deviation'
                                  ? 'text-rose-700 font-medium'
                                  : evalActive.status === 'Mild Deviation'
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                              }
                            >
                              {language === 'ar'
                                ? evalActive.interpretationAr
                                : evalActive.interpretationEn}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. TREATMENT PLAN & ALTERNATIVES TAB
  if (activeTab === 'treatment_plan') {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-base font-semibold text-slate-900">
              {language === 'ar'
                ? 'مقارنة البدائل العلاجية واعتماد الخطة المختارة (Option A / Option B / Option C)'
                : 'Treatment Plan Alternatives, Anchorage Requirements & Doctor Selection'}
            </h2>
            <p className="text-xs text-slate-500">
              {language === 'ar'
                ? 'مقارنة علمية بين خيارات العلاج بدون خلع، أو بالخلع الانتقائي، أو بالإرساء الهيكلي (TADs / MARPE)، أو التقويم الجراحي.'
                : 'Compare non-extraction, premolar extraction, skeletal anchorage (TADs/MARPE), and surgical-orthodontic options side-by-side.'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {orthoCase.treatmentOptions.map((opt) => (
              <div
                key={opt.id}
                className={`rounded-lg border p-5 flex flex-col justify-between space-y-4 ${
                  opt.isSelected
                    ? 'border-blue-600 bg-blue-50/20'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {opt.label} · {opt.approachType}
                    </span>
                    {opt.isSelected && (
                      <span className="text-blue-700 font-semibold text-[11px]">
                        {language === 'ar' ? '★ الخطة المعتمدة' : '★ DOCTOR-SELECTED'}
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-slate-900 text-sm leading-relaxed">
                    {language === 'ar' ? opt.titleAr : opt.titleEn}
                  </div>

                  <div className="pt-2 border-t border-slate-200 space-y-1.5">
                    <div>
                      <span className="font-semibold text-slate-700">
                        {language === 'ar' ? 'خطة الخلع (Extractions): ' : 'Extraction Plan: '}
                      </span>
                      <span className="font-mono text-slate-900">{opt.extractionTeeth}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">
                        {language === 'ar' ? 'خطة الإرساء (Anchorage): ' : 'Anchorage Requirement: '}
                      </span>
                      <span className="font-mono text-slate-900">{opt.anchoragePlan}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">
                        {language === 'ar' ? 'الجهاز والميكانيكا (Appliance): ' : 'Appliance / Mechanics: '}
                      </span>
                      <span>{opt.applianceSystem}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-emerald-800">
                        {language === 'ar' ? 'المزايا السريرية: ' : 'Advantages: '}
                      </span>
                      <span>{opt.advantagesEn}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-amber-800">
                        {language === 'ar' ? 'العيوب والقيود: ' : 'Disadvantages: '}
                      </span>
                      <span>{opt.disadvantagesEn}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-rose-800">
                        {language === 'ar' ? 'المخاطر المحتملة: ' : 'Risks & Limitations: '}
                      </span>
                      <span>{opt.risksAndLimitationsEn}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">
                        {language === 'ar' ? 'التأثير على المرتسم الوجهي: ' : 'Soft-Tissue Effect: '}
                      </span>
                      <span>{opt.expectedProfileEffect}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const updatedOptions = orthoCase.treatmentOptions.map((o) => ({
                      ...o,
                      isSelected: o.id === opt.id,
                    }));
                    onUpdateCase(
                      { ...orthoCase, treatmentOptions: updatedOptions },
                      'Changed Selected Treatment Option',
                      `Selected ${opt.label}: ${opt.titleEn}`
                    );
                  }}
                  className={`w-full py-2 px-4 rounded-lg text-xs font-semibold transition-colors ${
                    opt.isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {opt.isSelected
                    ? language === 'ar'
                      ? '✓ الخطة العلاجية المعتمدة والنشطة'
                      : '✓ Approved & Active Treatment Plan'
                    : language === 'ar'
                    ? `اعتماد (${opt.label}) كخطة علاجية`
                    : `Select ${opt.label} as Approved Plan`}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 5. VISITS & LONGITUDINAL TIMELINE TAB
  if (activeTab === 'visits_progress') {
    const COMMON_PROCEDURES = [
      'Wire Change',
      'Ligature Tie',
      'Power Chain',
      'Intermaxillary Elastics',
      'IPR (Interproximal Reduction)',
      'NiTi Open/Closed Coil',
      'Bracket Reposition',
      'TAD Placement / Activation',
      'MARPE Activation',
      'Debond & Retainer Delivery',
    ];

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 5 cols: iPad Touch-First Quick Visit Entry */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <CalendarPlus className="w-4 h-4 text-blue-600" />
              <span>
                {language === 'ar'
                  ? 'إدخال الجلسة السريع باللمس'
                  : 'Quick Chairside Visit Entry (Tablet Touch-First)'}
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              {language === 'ar'
                ? 'اختر الإجراءات والأسلاك والمواد المستهلكة باللمس لتسجيل الجلسة وخصم المواد من المخزن في ثوانٍ.'
                : 'Tap procedures, wires, and materials used to log visit and deduct inventory in seconds.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {language === 'ar' ? 'نوع الجلسة' : 'Visit Type'}
              </label>
              <select
                value={visitType}
                onChange={(e) => setVisitType(e.target.value as ClinicalVisit['visitType'])}
                className="w-full px-2.5 py-2 border border-slate-300 rounded bg-white"
              >
                <option value="Bonding">{formatVisitType(language, 'Bonding')}</option>
                <option value="Wire Change">{formatVisitType(language, 'Wire Change')}</option>
                <option value="Adjustment">{formatVisitType(language, 'Adjustment')}</option>
                <option value="Space Closure">{formatVisitType(language, 'Space Closure')}</option>
                <option value="TAD Placement">{formatVisitType(language, 'TAD Placement')}</option>
                <option value="MARPE Activation">
                  {formatVisitType(language, 'MARPE Activation')}
                </option>
                <option value="Debond">{formatVisitType(language, 'Debond')}</option>
                <option value="Retention Check">
                  {formatVisitType(language, 'Retention Check')}
                </option>
              </select>
            </div>
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {language === 'ar' ? 'مرحلة العلاج' : 'Treatment Stage'}
              </label>
              <select
                value={visitStage}
                onChange={(e) => setVisitStage(e.target.value as TimepointStage)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded bg-white"
              >
                <option value="T0_Initial">{formatTimepointStage(language, 'T0_Initial')}</option>
                <option value="T1_Progress">{formatTimepointStage(language, 'T1_Progress')}</option>
                <option value="T2_PreFinishing">
                  {formatTimepointStage(language, 'T2_PreFinishing')}
                </option>
                <option value="T3_Final">{formatTimepointStage(language, 'T3_Final')}</option>
                <option value="T4_Retention">
                  {formatTimepointStage(language, 'T4_Retention')}
                </option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <label className="text-slate-600 font-medium block">
              {language === 'ar'
                ? 'الإجراءات المنفذة في جلسة اليوم:'
                : "Today's Procedures (Touch Selection):"}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_PROCEDURES.map((proc) => {
                const active = selectedProcedures.includes(proc);
                return (
                  <button
                    key={proc}
                    type="button"
                    onClick={() => toggleProcedure(proc)}
                    className={`px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {active ? '☑ ' : '☐ '}
                    {formatProcedure(language, proc)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {language === 'ar' ? 'السلك العلوي (Upper Archwire)' : 'Upper Archwire'}
              </label>
              <input
                type="text"
                value={upperWire}
                onChange={(e) => setUpperWire(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded font-mono"
              />
            </div>
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {language === 'ar' ? 'السلك السفلي (Lower Archwire)' : 'Lower Archwire'}
              </label>
              <input
                type="text"
                value={lowerWire}
                onChange={(e) => setLowerWire(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded font-mono"
              />
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {language === 'ar'
                  ? 'المادة المصروفة من المخزن (تُضاف تلقائياً لتكلفة الحالة):'
                  : 'Material Consumed from Clinic Inventory (Auto-Links to Case Cost):'}
              </label>
              <select
                value={selectedMaterialId}
                onChange={(e) => setSelectedMaterialId(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded bg-white"
              >
                {inventory.map((m) => (
                  <option key={m.id} value={m.id}>
                    {language === 'ar'
                      ? `${m.name} — التكلفة: ${m.unitCost} ريال (المتوفر: ${m.stockQuantity})`
                      : `${m.name} — Cost: ${m.unitCost} SAR (In Stock: ${m.stockQuantity})`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {language === 'ar' ? 'الملاحظات السريرية للجلسة' : 'Clinical Notes'}
              </label>
              <textarea
                rows={2}
                value={visitNotesText}
                onChange={(e) => setVisitNotesText(e.target.value)}
                placeholder={
                  language === 'ar'
                    ? 'ملاحظات الطبيب، مقدار القوة (غرام)، التزام المريض بالمطاط...'
                    : 'Chairside observations, force levels (g), hygiene...'
                }
                className="w-full px-2.5 py-2 border border-slate-300 rounded"
              />
            </div>
          </div>

          <button
            onClick={handleSaveQuickVisit}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            {language === 'ar'
              ? 'حفظ الجلسة وتحديث السجل الزمني والمخزن'
              : 'Save Visit & Deduct Material from Inventory'}
          </button>
        </div>

        {/* Right 7 cols: Longitudinal Treatment Timeline */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              {language === 'ar'
                ? 'الخط الزمني لمراحل العلاج والجلسات المسجلة'
                : 'Longitudinal Treatment Progress & Mechanics Log'}
            </h3>
            <span className="font-mono text-xs text-slate-500">
              {language === 'ar'
                ? `إجمالي الجلسات: ${orthoCase.visits.length}`
                : `Total Visits Logged: ${orthoCase.visits.length}`}
            </span>
          </div>

          <div className="space-y-4">
            {orthoCase.visits.map((v) => (
              <div
                key={v.id}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-slate-900">
                    {language === 'ar'
                      ? `الجلسة #${v.visitNumber} · ${v.date} · ${formatVisitType('ar', v.visitType)}`
                      : `Visit #${v.visitNumber} · ${v.date} · ${v.visitType}`}
                  </div>
                  <span className="text-blue-700 font-semibold">
                    {formatTimepointStage(language, v.stage)}
                  </span>
                </div>
                <div className="text-slate-700 font-medium">
                  {language === 'ar'
                    ? `الإجراءات: ${v.procedures.map((p) => formatProcedure('ar', p)).join(' · ')}`
                    : `Procedures: ${v.procedures.join(' · ')}`}
                </div>
                <div className="font-mono text-slate-600 text-[11px]">
                  {language === 'ar'
                    ? `السلك العلوي: ${v.upperArchwire} | السلك السفلي: ${v.lowerArchwire} | المطاط: ${v.elasticsConfig}`
                    : `Upper Wire: ${v.upperArchwire} | Lower Wire: ${v.lowerArchwire} | Elastics: ${v.elasticsConfig}`}
                </div>
                <p className="text-slate-800 leading-relaxed">
                  {language === 'ar' ? v.clinicalNotesAr : v.clinicalNotesEn}
                </p>
                {v.materialsIssuedIds.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500">
                    {language === 'ar' ? 'المواد المصروفة: ' : 'Consumed Materials: '}
                    {v.materialsIssuedIds
                      .map((m) => `${m.materialName} (${m.quantity * m.unitCost} SAR)`)
                      .join(' ، ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 6. MEDIA & BEFORE / PROGRESS / FINAL COMPARISON TAB
  const t0Ceph = orthoCase.cephRecords.find((r) => r.stage === 'T0_Initial');
  const t3Ceph = orthoCase.cephRecords.find((r) => r.stage === 'T3_Final');

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="border-b border-slate-200 pb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Camera className="w-4 h-4 text-blue-600" />
              <span>
                {language === 'ar'
                  ? 'المقارنة السريرية والصور عبر مراحل العلاج (قبل T0 ← أثناء T1 ← بعد T3)'
                  : 'Longitudinal Clinical Photography & Parameter Comparison (T0 → T1 → T3)'}
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              {language === 'ar'
                ? 'كل صورة أو أشعة مرتبطة بمعرّف المريض والحالة والمرحلة الزمنية ونوع اللقطة القياسية.'
                : 'Every image is tagged by Patient, Case ID, Stage, and Standardized Orthodontic View.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {orthoCase.photos.map((ph) => (
            <div
              key={ph.id}
              className="border border-slate-200 rounded-lg p-3.5 space-y-2.5 bg-slate-50/50 text-xs"
            >
              <ClinicalRecordIllustration
                svgType={ph.svgType}
                stage={ph.stage}
                category={ph.category}
              />
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-semibold text-slate-900">
                  {formatTimepointStage(language, ph.stage)}
                </span>
                <span className="font-mono">{ph.date}</span>
              </div>
              <div className="font-semibold text-slate-900">
                {formatPhotoCategory(language, ph.category)}
              </div>
              <p className="text-slate-600 leading-relaxed">
                {language === 'ar' ? ph.captionAr : ph.captionEn}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Quantitative Before vs After Clinical Parameter Table */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">
          {language === 'ar'
            ? 'جدول المقارنة الرقمية للمعايير السريرية والسيفالومترية (قبل وبعد العلاج)'
            : 'Quantitative Clinical & Cephalometric Parameter Improvement Table'}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 text-start">
                  {language === 'ar'
                    ? 'المعيار السريري / السيفالومتري'
                    : 'Clinical / Cephalometric Parameter'}
                </th>
                <th className="py-2 text-end font-mono">
                  {language === 'ar' ? 'قبل العلاج (T0)' : 'T0 Initial'}
                </th>
                <th className="py-2 text-end font-mono">
                  {language === 'ar' ? 'الحالي / النهائي (T3)' : 'Current / T3 Final'}
                </th>
                <th className="py-2 text-end font-mono">
                  {language === 'ar' ? 'مقدار التغير' : 'Net Change'}
                </th>
                <th className="py-2 text-start ps-4">
                  {language === 'ar' ? 'التقييم السريري للنتيجة' : 'Clinical Evaluation'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              <tr>
                <td className="py-2.5 font-sans font-medium text-slate-900">
                  {language === 'ar' ? 'البروز السني السهمي (Overjet)' : 'Overjet (mm)'}
                </td>
                <td className="py-2.5 text-end">{orthoCase.occlusal.overjetInitialMm} mm</td>
                <td className="py-2.5 text-end text-emerald-700 font-semibold">
                  {orthoCase.occlusal.overjetCurrentMm} mm
                </td>
                <td className="py-2.5 text-end">
                  {(orthoCase.occlusal.overjetCurrentMm - orthoCase.occlusal.overjetInitialMm).toFixed(1)} mm
                </td>
                <td className="py-2.5 ps-4 font-sans text-emerald-700">
                  {language === 'ar'
                    ? '✓ عاد إلى المعدل الطبيعي لصنف أول مثالي'
                    : '✓ Normalized to Class I ideal'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 font-sans font-medium text-slate-900">
                  {language === 'ar' ? 'التغطية العمودية (Overbite)' : 'Overbite (mm)'}
                </td>
                <td className="py-2.5 text-end">{orthoCase.occlusal.overbiteInitialMm} mm</td>
                <td className="py-2.5 text-end text-emerald-700 font-semibold">
                  {orthoCase.occlusal.overbiteCurrentMm} mm
                </td>
                <td className="py-2.5 text-end">
                  {(orthoCase.occlusal.overbiteCurrentMm - orthoCase.occlusal.overbiteInitialMm).toFixed(1)} mm
                </td>
                <td className="py-2.5 ps-4 font-sans text-emerald-700">
                  {language === 'ar'
                    ? '✓ تم تسطيح قوس سبي (Curve of Spee) بنجاح'
                    : '✓ Curve of Spee leveled'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 font-sans font-medium text-slate-900">
                  {language === 'ar' ? 'الزاوية السهمية الفكية (ANB)' : 'ANB Angle (°)'}
                </td>
                <td className="py-2.5 text-end">{t0Ceph?.values['ANB'] ?? '—'}°</td>
                <td className="py-2.5 text-end text-emerald-700 font-semibold">
                  {t3Ceph?.values['ANB'] ?? '—'}°
                </td>
                <td className="py-2.5 text-end">
                  {t0Ceph?.values['ANB'] !== undefined && t3Ceph?.values['ANB'] !== undefined
                    ? `${(t3Ceph.values['ANB'] - t0Ceph.values['ANB']).toFixed(1)}°`
                    : '—'}
                </td>
                <td className="py-2.5 ps-4 font-sans text-emerald-700">
                  {language === 'ar'
                    ? '✓ تحسن العلاقة السهمية للقاعدة القمية'
                    : '✓ Sagittal apical base improvement'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 font-sans font-medium text-slate-900">
                  {language === 'ar' ? 'ميلان القواطع العلوية (U1-SN)' : 'U1-SN Inclination (°)'}
                </td>
                <td className="py-2.5 text-end">{t0Ceph?.values['U1-SN'] ?? '—'}°</td>
                <td className="py-2.5 text-end text-emerald-700 font-semibold">
                  {t3Ceph?.values['U1-SN'] ?? '—'}°
                </td>
                <td className="py-2.5 text-end">
                  {t0Ceph?.values['U1-SN'] !== undefined && t3Ceph?.values['U1-SN'] !== undefined
                    ? `${(t3Ceph.values['U1-SN'] - t0Ceph.values['U1-SN']).toFixed(1)}°`
                    : '—'}
                </td>
                <td className="py-2.5 ps-4 font-sans text-emerald-700">
                  {language === 'ar'
                    ? '✓ إرجاع جسمي مضبوط العزم الجذري (Root Torque)'
                    : '✓ Controlled bodily retraction with torque'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
