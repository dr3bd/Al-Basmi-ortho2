import React from 'react';
import {
  AlertCircle,
  BookOpen,
  BrainCircuit,
  Check,
  ShieldAlert,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import {
  LanguageMode,
  OrthodonticCase,
  ProblemObjectiveItem,
} from '../types/orthodontics';
import { formatDomainSection } from '../utils/i18n';

interface AIDecisionSupportViewProps {
  orthoCase?: OrthodonticCase;
  isOnline: boolean;
  language: LanguageMode;
  onAcceptSuggestedProblem: (newItem: ProblemObjectiveItem) => void;
  onApproveAIDiagnosisDraft: (summaryEn: string) => void;
}

type ConsultMode =
  | 'Diagnostic Discussion'
  | 'Problem List & Objectives Review'
  | 'Treatment Options & Biomechanics'
  | 'Critique Doctor Treatment Plan'
  | 'Evidence & Literature Discussion';

interface AIConsultResponse {
  summary: string;
  summaryAr?: string;
  certaintyBreakdown: {
    statement: string;
    statementAr?: string;
    level: 'CONFIRMED' | 'LIKELY' | 'POSSIBLE' | 'INSUFFICIENT_DATA';
    evidenceFromRecord: string;
    evidenceAr?: string;
  }[];
  suggestedProblems: {
    category: 'Skeletal' | 'Dental' | 'Occlusal' | 'Soft Tissue';
    problemEn: string;
    problemAr: string;
    objectiveEn: string;
    objectiveAr: string;
    strategyEn: string;
  }[];
  critiqueWarnings: string[];
  critiqueWarningsAr?: string[];
  treatmentOptionsDiscussion: string;
  treatmentOptionsDiscussionAr?: string;
  evidenceReferences: {
    citation: string;
    relevance: string;
    relevanceAr?: string;
  }[];
}

const DEMO_SARA_AI_RESPONSE: AIConsultResponse = {
  summary:
    'Case ORT-2026-00104 presents a well-documented Class II Div 1 malocclusion on a mild Class II hyperdivergent skeletal base (ANB 5.5°, SN-MP 36°). The selected 4-premolar extraction plan with bilateral maxillary TADs directly addresses both the 6.5mm upper crowding and 7.5mm overjet while maintaining vertical control.',
  summaryAr:
    'تُظهر الحالة (ORT-2026-00104) سوء إطباق صنف ثانٍ قسم أول على قاعدة هيكلية من الصنف الثاني مع نمط عمودي متباعد (ANB = 5.5°، SN-MP = 36°). الخطة المختارة بخلع الضواحك الأربعة مع زرعات الإرساء الهيكلي العلوية (TADs) تعالج الازدحام العلوي الشديد (6.5 ملم) والبروز السهمي (Overjet 7.5mm) بكفاءة مع الحفاظ على البعد العمودي.',
  certaintyBreakdown: [
    {
      statement: 'Skeletal Class II sagittal discrepancy with mild hyperdivergent pattern',
      statementAr: 'سوء علاقة هيكلية سهمية من الصنف الثاني (Class II) مع نمط عمودي متباعد',
      level: 'CONFIRMED',
      evidenceFromRecord: 'T0 Cephalometrics: ANB = 5.5° (Norm 2°±2°), Wits = +3.5mm, GoGn-SN = 36.0°.',
      evidenceAr: 'قياسات السيفالومتري الأولية (T0): زاوية ANB = 5.5°، تقييم Wits = +3.5 ملم، زاوية GoGn-SN = 36.0°.',
    },
    {
      statement: 'Bimaxillary dentoalveolar proclination and severe upper arch length deficiency',
      statementAr: 'ميلان دهليزي للقواطع العلوية والسفلية مع نقص شديد في طول القوس العلوية',
      level: 'CONFIRMED',
      evidenceFromRecord: 'U1-SN = 112.0°, IMPA = 96.5°, U1-L1 = 115.0°, Upper crowding = 6.5mm, Lower crowding = 5.0mm.',
      evidenceAr: 'ميلان القواطع العلوية (U1-SN = 112°)، والسفلية (IMPA = 96.5°)، والازدحام العلوي 6.5 ملم والسفلي 5.0 ملم.',
    },
    {
      statement: 'Risk of labial alveolar bone dehiscence if treated non-extraction',
      statementAr: 'خطر انكشاف الصفيحة العظمية الدهليزية (Dehiscence) في حال العلاج بدون خلع',
      level: 'LIKELY',
      evidenceFromRecord: 'CBCT assessment notes "Thin Labial Cortical Plate" combined with IMPA already at 96.5°.',
      evidenceAr: 'فحص الأشعة المقطعية (CBCT) يُظهر رقة الصفيحة القشرية الدهليزية مع ميلان قواطع سفلية مرتفع (IMPA = 96.5°).',
    },
    {
      statement: 'Long-term post-retention stability of 6.5mm incisor retraction',
      statementAr: 'ثبات طويل الأمد لإرجاع القواطع العلوية مسافة 6.5 ملم بعد التثبيت',
      level: 'POSSIBLE',
      evidenceFromRecord: 'Requires verification of passive lip seal and strict dual retention (Fixed 3-3 + nighttime Essix).',
      evidenceAr: 'يتطلب التحقق من كفاءة إطباق الشفاه السلبية والالتزام بالتثبيت المزدوج (مثبت لساني ثابت + قالب شفاف ليلي).',
    },
  ],
  suggestedProblems: [
    {
      category: 'Dental',
      problemEn: 'Apical root resorption risk on maxillary central incisors during 6.5mm bodily retraction',
      problemAr: 'خطر امتصاص ذروة الجذور في القواطع المركزية العلوية أثناء الإرجاع الجسمي لمسافة 6.5 ملم',
      objectiveEn: 'Limit light continuous retraction forces to 150g per side and take 6-month progress periapical/panoramic radiographs',
      objectiveAr: 'تطبيق قوى مستمرة خفيفة (150 غرام لكل جهة) مع مراقبة شعاعية دورية كل 6 أشهر لجذور القواطع',
      strategyEn: '150g NiTi closed coil springs on 0.019×0.025 SS wire with controlled lingual root torque',
    },
  ],
  critiqueWarnings: [
    'Every documented Actual Problem in this case has a corresponding Treatment Objective and Biomechanical Strategy.',
    'Caution: CBCT records show a thin labial cortical plate and mild apical blunting; avoid excessive labial root torque during finishing.',
    'Minor 0.5mm lower midline discrepancy at T3 Final is within clinically acceptable aesthetic thresholds (<2.0mm).',
  ],
  critiqueWarningsAr: [
    'جميع المشاكل التقويمية الفعلية المسجلة في هذه الحالة مرتبطة بأهداف علاجية وميكانيكا حيوية واضحة.',
    'تنبيه سريري: يُظهر فحص (CBCT) رقة في الصفيحة الدهليزية وتسطحاً ذروياً طفيفاً؛ يُنصح بتجنب العزم الجذري المفرط أثناء مرحلة الإنهاء (Finishing).',
    'انحراف خط الوسط السفلي المتبقي (0.5 ملم) في المرحلة النهائية يقع ضمن الحدود التجميلية والوظيفية المقبولة سريرياً.',
  ],
  treatmentOptionsDiscussion:
    'Comparison of Options A, B, and C: Option A (4-premolar extraction + TADs) is biomechanically superior to Option B (IZC Distalization) because resolving 6.5mm upper crowding + 7.5mm overjet requires ~10.2mm per side of space. Distalizing upper molars >4mm in a hyperdivergent patient (SN-MP 36°) risks clockwise mandibular rotation and worsening chin retrusion.',
  treatmentOptionsDiscussionAr:
    'مقارنة البدائل العلاجية (أ، ب، ج): الخيار الأول (خلع الضواحك الأربعة مع زرعات الإرساء الهيكلي TADs) يتفوق ميكانيكياً على الخيار الثاني (الإرجاع الكلي بدون خلع عبر زرعات العرف الوجني IZC)، لأن حل ازدحام علوي بمقدار 6.5 ملم مع إنقاص بروز سهمي 7.5 ملم يتطلب مسافة تقارب 10.2 ملم في كل جهة، كما أن إرجاع الأرحاء في مريض ذي زاوية عمودية عالية (SN-MP = 36°) قد يؤدي لدوران الفك السفلي مع عقارب الساعة وزيادة تراجع الذقن.',
  evidenceReferences: [
    {
      citation: 'Proffit WR, Fields HW, Larson BE, Sarver DM. Contemporary Orthodontics (6th ed., 2019).',
      relevance: 'Biomechanics of en-masse space closure using skeletal anchorage in Class II Div 1 camouflage.',
      relevanceAr: 'الميكانيكا الحيوية لإغلاق المسافات الكتلي باستخدام الإرساء الهيكلي في حالات التمويه التقويمي للصنف الثاني.',
    },
    {
      citation: 'McNamara JA Jr. A method of cephalometric evaluation. Am J Orthod. 1984;86(6):449-469.',
      relevance: 'Sagittal evaluation of Point A and Pogonion to Nasion Perpendicular.',
      relevanceAr: 'التقييم السيفالومتري السهمي لموقع الفك العلوي والذقن بالنسبة للعمود النازل من النقطة الأنفية (Nasion Perpendicular).',
    },
  ],
};

export const AIDecisionSupportView: React.FC<AIDecisionSupportViewProps> = ({
  orthoCase,
  isOnline,
  language,
  onAcceptSuggestedProblem,
  onApproveAIDiagnosisDraft,
}) => {
  const [mode, setMode] = React.useState<ConsultMode>('Critique Doctor Treatment Plan');
  const [userQuestion, setUserQuestion] = React.useState<string>('');
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [acceptedIndices, setAcceptedIndices] = React.useState<number[]>([]);

  const [result, setResult] = React.useState<AIConsultResponse | null>(() => {
    return orthoCase?.isDemo && orthoCase?.id === 'ORT-2026-00104' ? DEMO_SARA_AI_RESPONSE : null;
  });

  React.useEffect(() => {
    if (orthoCase?.isDemo && orthoCase?.id === 'ORT-2026-00104') {
      setResult(DEMO_SARA_AI_RESPONSE);
    } else {
      setResult(null);
    }
    setAcceptedIndices([]);
    setError(null);
  }, [orthoCase?.id, orthoCase?.isDemo]);

  if (!orthoCase) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
        <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">
          {language === 'ar' ? 'لم يتم تحديد حالة للاستشارة الذكية' : 'No Active Case Selected for AI Co-Pilot'}
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          {language === 'ar'
            ? 'يرجى اختيار حالة تقويمية محددة من القائمة الجانبية لتشغيل تحليل ودعم القرار بالذكاء الاصطناعي.'
            : 'Please select an active orthodontic case from the sidebar to consult AI decision support.'}
        </p>
      </div>
    );
  }

  const runAIConsultation = async () => {
    if (!isOnline) {
      setError(
        language === 'ar'
          ? 'التطبيق يعمل حالياً في الوضع المحلي بدون إنترنت. القواعد التشخيصية المحلية نشطة، بينما يتطلب الاتصال بالسحابة توفر الإنترنت.'
          : 'System is in Offline Clinical Mode. AI Cloud requires connectivity; local rules remain active.'
      );
      return;
    }
    if (!orthoCase) return;
    setLoading(true);
    setError(null);

    try {
      const deIdentifiedContext = {
        caseId: orthoCase.id,
        caseType: orthoCase.caseType,
        status: orthoCase.status,
        cvmStage: orthoCase.cbctAndRadiographs.cvmStage,
        chiefComplaintEn: orthoCase.chiefComplaintEn,
        extraoral: orthoCase.extraoral,
        intraoral: orthoCase.intraoral,
        occlusal: orthoCase.occlusal,
        cbctAndRadiographs: orthoCase.cbctAndRadiographs,
        diagnosis: orthoCase.diagnosis,
        problemList: orthoCase.problemList,
        treatmentOptions: orthoCase.treatmentOptions,
        cephalometrics: orthoCase.cephRecords.map((r) => ({
          stage: r.stage,
          values: r.values,
        })),
      };

      const res = await fetch('/api/ai/orthodontic-consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          caseContext: deIdentifiedContext,
          userQuestion,
          language,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to run AI orthodontic consultation');
      }
      setResult(data);
      setAcceptedIndices([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error communicating with AI server.');
    } finally {
      setLoading(false);
    }
  };

  const formatCertaintyLevel = (level: string) => {
    if (language === 'en') return `[${level}]`;
    const map: Record<string, string> = {
      CONFIRMED: 'مؤكد بالقياسات (Confirmed)',
      LIKELY: 'مرجح سريرياً (Likely)',
      POSSIBLE: 'احتمال وارد (Possible)',
      INSUFFICIENT_DATA: 'بيانات غير كافية',
    };
    return map[level] || level;
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white rounded-lg p-5 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
            <BrainCircuit className="w-4 h-4" />
            <span>
              {language === 'ar'
                ? 'نظام دعم القرار السريري بالذكاء الاصطناعي — خاضع لاعتماد الطبيب'
                : 'AI-ASSISTED · DOCTOR-CONTROLLED CLINICAL DECISION SUPPORT'}
            </span>
          </div>
          <h2 className="text-base font-semibold">
            {language === 'ar'
              ? 'المساعد التقويمي الذكي (يحلل ويناقش وينقد الخطة دون تعديل السجل السريري تلقائياً)'
              : 'Orthodontic AI Co-Pilot — Analyzes, Critiques & Suggests (Never Overwrites Clinical Record)'}
          </h2>
          <p className="text-xs text-slate-400">
            {language === 'ar'
              ? `طبقة حماية الخصوصية نشطة: يتم إزالة اسم المريض وبيانات الاتصال والاكتفاء بالمعرّف (${orthoCase.id}) قبل التحليل.`
              : `De-Identification Safety Layer Active: Patient name (${orthoCase.id}) and personal contact data are stripped prior to AI context transmission.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <span className="px-3 py-1.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs">
              {language === 'ar'
                ? '● المساعد السحابي متصل ونشط'
                : '● AI CLOUD ONLINE (Gemini 3.8 Flash)'}
            </span>
          ) : (
            <span className="px-3 py-1.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-1.5">
              <WifiOff className="w-3.5 h-3.5" />
              {language === 'ar'
                ? 'وضع العمل السريري اليدوي (بدون إنترنت)'
                : 'MANUAL CLINICAL FALLBACK MODE'}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              {
                id: 'Diagnostic Discussion',
                ar: 'مناقشة التشخيص التقويمي',
              },
              {
                id: 'Problem List & Objectives Review',
                ar: 'مراجعة المشاكل والأهداف العلاجية',
              },
              {
                id: 'Treatment Options & Biomechanics',
                ar: 'مناقشة خيارات العلاج والميكانيكا',
              },
              {
                id: 'Critique Doctor Treatment Plan',
                ar: 'نقد ومراجعة خطة الطبيب',
              },
              {
                id: 'Evidence & Literature Discussion',
                ar: 'مناقشة الأدلة والمراجع العلمية',
              },
            ] as { id: ConsultMode; ar: string }[]
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                mode === m.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {language === 'ar' ? m.ar : m.id}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={userQuestion}
            onChange={(e) => setUserQuestion(e.target.value)}
            placeholder={
              language === 'ar'
                ? 'اسأل المساعد التقويمي (مثال: ما تأثير خلع الضواحك على المرتسم الوجهي؟ أو راجع خطتي العلاجية)...'
                : 'Ask specific clinical question (e.g., What if we treat non-extraction with IZC TADs? Critique my anchorage plan)...'
            }
            className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
          />
          <button
            onClick={runAIConsultation}
            disabled={loading || !isOnline}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            {loading
              ? language === 'ar'
                ? 'جاري تحليل معطيات الحالة...'
                : 'Analyzing Clinical Context...'
              : language === 'ar'
              ? 'تشغيل التحليل والمناقشة'
              : 'Run AI Clinical Analysis'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span>{language === 'ar' ? 'أسئلة سريرية سريعة:' : 'Quick clinical prompts:'}</span>
          {(language === 'ar'
            ? [
                'لماذا يتفوق الخيار أ (خلع الضواحك مع TADs) على العلاج بدون خلع في هذه الحالة ذات الزاوية العالية؟',
                'هل توجد أي مشاكل سريرية غير مغطاة بهدف علاجي أو مخاطر على الإرساء في خطتي؟',
                'ما الدليل العلمي لاستخدام الموسع الهيكلي (MARPE) في مرحلة النضج العظمي CS6؟',
              ]
            : [
                'Why is Option A superior to non-extraction distalization in this hyperdivergent case?',
                'Are there any unaddressed problems or anchorage risks in my plan?',
                'What is the evidence for MARPE vs SARPE in CS6 young adults?',
              ]
          ).map((q) => (
            <button
              key={q}
              onClick={() => setUserQuestion(q)}
              className="text-blue-600 hover:underline text-start"
            >
              &ldquo;{q}&rdquo;
            </button>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {!result ? (
        <div className="p-10 text-center bg-white border border-slate-200 rounded-lg space-y-3">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
            <BrainCircuit className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">
            {language === 'ar'
              ? 'لا توجد مراجعة ذكية مسجلة بعد لهذه الحالة السريرية'
              : 'No AI Clinical Analysis Run Yet for this Case'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {language === 'ar'
              ? 'اختر نمط المناقشة المطلوبة وانقر على "تشغيل التحليل والمناقشة" لمعالجة سجلات الحالة الحالية ومقارنتها مع القواعد السريرية والأدلة الطبية.'
              : 'Select a consultation topic and click "Run AI Clinical Analysis" to review current case records against clinical rules and evidence-based literature.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold">
                {language === 'ar'
                  ? 'التحليل المقترح من الذكاء الاصطناعي (يتطلب اعتماد الطبيب)'
                  : 'AI SUGGESTED INTERPRETATION (REQUIRES DOCTOR APPROVAL)'}
              </span>
              <button
                onClick={() => onApproveAIDiagnosisDraft(result.summary)}
                className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                {language === 'ar' ? 'اعتماد وإلحاق بالتشخيص' : 'Approve & Append to Diagnosis'}
              </button>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed">
              {language === 'ar' ? result.summaryAr || result.summary : result.summary}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {language === 'ar'
                ? 'تصنيف مستوى اليقين السريري والأدلة الداعمة من السجل'
                : 'Clinical Certainty & Evidence Stratification'}
            </h3>
            <div className="divide-y divide-slate-200">
              {result.certaintyBreakdown.map((item, idx) => (
                <div key={idx} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-slate-900">
                      {language === 'ar' ? item.statementAr || item.statement : item.statement}
                    </div>
                    <div className="text-slate-600 text-[11px]">
                      {language === 'ar'
                        ? `الدليل من السجل: ${item.evidenceAr || item.evidenceFromRecord}`
                        : `Supporting Record: ${item.evidenceFromRecord}`}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-semibold shrink-0 ${
                      item.level === 'CONFIRMED'
                        ? 'text-emerald-700'
                        : item.level === 'LIKELY'
                        ? 'text-blue-700'
                        : item.level === 'POSSIBLE'
                        ? 'text-amber-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {formatCertaintyLevel(item.level)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">
              {language === 'ar'
                ? 'مناقشة الخيارات العلاجية والميكانيكا الحيوية (Biomechanics)'
                : 'Treatment Planning & Biomechanical Analysis'}
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
              {language === 'ar'
                ? result.treatmentOptionsDiscussionAr || result.treatmentOptionsDiscussion
                : result.treatmentOptionsDiscussion}
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {language === 'ar'
                ? 'مقترحات إضافة لقائمة المشاكل (بموافقة الطبيب فقط)'
                : 'AI-Suggested Problem List Items (Doctor Gate)'}
            </h3>
            {result.suggestedProblems.map((sp, idx) => {
              const isAccepted = acceptedIndices.includes(idx);
              return (
                <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-2 text-xs">
                  <div className="text-[11px] text-blue-700 font-semibold">
                    {formatDomainSection(language, sp.category)} ·{' '}
                    {language === 'ar' ? 'مقترح ذكي' : 'AI Suggestion'}
                  </div>
                  <div className="font-semibold text-slate-900 leading-relaxed">
                    {language === 'ar' ? sp.problemAr : sp.problemEn}
                  </div>
                  <div className="text-slate-600 leading-relaxed">
                    <span className="font-semibold">
                      {language === 'ar' ? 'الهدف العلاجي المقترح: ' : 'Objective: '}
                    </span>
                    {language === 'ar' ? sp.objectiveAr : sp.objectiveEn}
                  </div>
                  <button
                    disabled={isAccepted}
                    onClick={() => {
                      onAcceptSuggestedProblem({
                        id: `prob_ai_${Date.now()}_${idx}`,
                        domain: sp.category,
                        classification: 'Risk / Concern',
                        findingEn: sp.problemEn,
                        findingAr: sp.problemAr,
                        objectiveEn: sp.objectiveEn,
                        objectiveAr: sp.objectiveAr,
                        strategyMechanicsEn: sp.strategyEn,
                        strategyMechanicsAr: sp.strategyEn,
                        outcomeResultEn: 'Monitoring in progress',
                        outcomeResultAr: 'تحت المتابعة السريرية',
                        outcomeStatus: 'In Progress',
                        origin: 'Doctor-Approved',
                        approvedByDoctor: true,
                      });
                      setAcceptedIndices((prev) => [...prev, idx]);
                    }}
                    className={`w-full py-1.5 px-3 rounded text-xs font-semibold transition-colors ${
                      isAccepted
                        ? 'bg-emerald-100 text-emerald-800 cursor-default'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {isAccepted
                      ? language === 'ar'
                        ? '✓ تم الاعتماد والإضافة لقائمة المشاكل'
                        : '✓ Approved & Added to Case Problem List'
                      : language === 'ar'
                      ? 'اعتماد وإضافة لقائمة المشاكل'
                      : 'Accept & Add to Problem List'}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span>
                {language === 'ar'
                  ? 'مراجعة ونقد الخطة وتنبيهات الاتساق'
                  : 'AI Plan Critique & Consistency Alerts'}
              </span>
            </h3>
            <ul className="space-y-2 text-xs text-slate-700">
              {(language === 'ar'
                ? result.critiqueWarningsAr || result.critiqueWarnings
                : result.critiqueWarnings
              ).map((w, i) => (
                <li key={i} className="p-2.5 bg-amber-50/70 border border-amber-200 rounded leading-relaxed">
                  {w}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <span>
                {language === 'ar'
                  ? 'المراجع العلمية الموثقة المرتبطة بالحالة'
                  : 'Traceable Orthodontic Literature'}
              </span>
            </h3>
            <div className="space-y-2 text-xs">
              {result.evidenceReferences.map((ref, i) => (
                <div key={i} className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                  <div className="font-mono font-semibold text-slate-900" dir="ltr">
                    {ref.citation}
                  </div>
                  <div className="text-slate-600 mt-1">
                    {language === 'ar' ? ref.relevanceAr || ref.relevance : ref.relevance}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
