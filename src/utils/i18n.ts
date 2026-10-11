import { LanguageMode } from '../types/orthodontics';

/**
 * Translates clinical status, stages, classifications, and orthodontic parameters
 * so that in Arabic mode ('ar'), ~85% of the interface and content is natural clinical Arabic
 * with only key orthodontic terms in parentheses where helpful, and in English mode ('en')
 * 100% is pure English.
 */

export function tr(lang: LanguageMode, arText: string, enText: string): string {
  return lang === 'ar' ? arText : enText;
}

export function formatCaseStatus(lang: LanguageMode, status: string): string {
  if (lang === 'en') return status;
  const map: Record<string, string> = {
    New: 'حالة جديدة',
    Consultation: 'استشارة أولية',
    Records: 'جمع السجلات التشخيصية',
    Diagnosis: 'مرحلة التشخيص',
    'Treatment Planning': 'تخطيط العلاج',
    'Active Treatment': 'علاج تقويمي نشط',
    Finishing: 'مرحلة الإنهاء (Finishing)',
    Debond: 'فك الجهاز (Debond)',
    Retention: 'مرحلة التثبيت (Retention)',
    Completed: 'مكتملة',
    'Follow-up': 'متابعة دورية',
    Archived: 'مؤرشفة',
  };
  return map[status] || status;
}

export function formatTimepointStage(lang: LanguageMode, stage: string): string {
  if (lang === 'en') return stage.replace('_', ' ');
  const map: Record<string, string> = {
    T0_Initial: 'قبل العلاج (T0)',
    T1_Progress: 'أثناء العلاج (T1)',
    T2_PreFinishing: 'قبل الإنهاء (T2)',
    T3_Final: 'النتيجة النهائية (T3)',
    T4_Retention: 'مرحلة التثبيت (T4)',
  };
  return map[stage] || stage;
}

export function formatDomainSection(lang: LanguageMode, domain: string): string {
  if (lang === 'en') return domain;
  const map: Record<string, string> = {
    Extraoral: 'خارج الفم (Extraoral)',
    Intraoral: 'داخل الفم (Intraoral)',
    Occlusal: 'الإطباق (Occlusal)',
    Skeletal: 'الهيكلي (Skeletal)',
    Dental: 'السني (Dental)',
    'Soft Tissue': 'الأنسجة الرخوة (Soft Tissue)',
    'CBCT / Radiographic': 'الأشعة والـ (CBCT)',
  };
  return map[domain] || domain;
}

export function formatFindingCategory(lang: LanguageMode, cat: string): string {
  if (lang === 'en') return cat;
  const map: Record<string, string> = {
    'Normal Finding': 'معيار طبيعي (لا يتطلب تدخلاً)',
    'Clinical Finding': 'ملاحظة سريرية',
    'Actual Problem': 'مشكلة تقويمية (Problem)',
    'Risk / Concern': 'عامل خطورة (Risk)',
    'Missing Information': 'بيانات ناقصة',
  };
  return map[cat] || cat;
}

export function formatOutcomeStatus(lang: LanguageMode, status: string): string {
  if (lang === 'en') return status;
  const map: Record<string, string> = {
    Achieved: 'تم تحقيق الهدف بالكامل',
    'Partially Achieved': 'تحقق جزئيًا',
    'In Progress': 'قيد العلاج والمتابعة',
    'Not Achieved': 'لم يتحقق',
    'Not Assessed': 'غير مقيّم بعد',
  };
  return map[status] || status;
}

export function formatSkeletalSagittal(lang: LanguageMode, val: string): string {
  if (lang === 'en') return val;
  const map: Record<string, string> = {
    'Skeletal Class I': 'صنف أول هيكلي (Skeletal Class I)',
    'Skeletal Class II (Mandibular Retrognathism)':
      'صنف ثانٍ هيكلي بتراجع الفك السفلي (Class II)',
    'Skeletal Class II (Maxillary Prognathism)':
      'صنف ثانٍ هيكلي ببروز الفك العلوي (Class II)',
    'Skeletal Class III': 'صنف ثالث هيكلي (Skeletal Class III)',
  };
  return map[val] || val;
}

export function formatSkeletalVertical(lang: LanguageMode, val: string): string {
  if (lang === 'en') return val;
  const map: Record<string, string> = {
    Normodivergent: 'نمط عمودي متوازن (Normodivergent)',
    'Hyperdivergent (High Angle)': 'نمط عمودي متباعد / زاوية عالية (Hyperdivergent)',
    'Hypodivergent (Low Angle)': 'نمط عمودي متقارب / زاوية منخفضة (Hypodivergent)',
  };
  return map[val] || val;
}

export function formatSkeletalTransverse(lang: LanguageMode, val: string): string {
  if (lang === 'en') return val;
  const map: Record<string, string> = {
    'Normal Transverse Maxillo-Mandibular Width': 'عرض فكي مستعرض طبيعي ومتناسق',
    'Maxillary Transverse Deficiency': 'تضيق عرضي في الفك العلوي (Maxillary Deficiency)',
    'Asymmetric Transverse': 'عدم تناظر عرضي',
  };
  return map[val] || val;
}

export function formatProcedure(lang: LanguageMode, proc: string): string {
  if (lang === 'en') return proc;
  const map: Record<string, string> = {
    'Wire Change': 'تغيير السلك (Archwire)',
    'Ligature Tie': 'ربط السلك (Ligature)',
    'Power Chain': 'سلسلة مطاطية (Power Chain)',
    'Intermaxillary Elastics': 'مطاط بين فكي (Elastics)',
    'IPR (Interproximal Reduction)': 'برد تلاصقي (IPR)',
    'NiTi Open/Closed Coil': 'نابض معدني (Coil Spring)',
    'Bracket Reposition': 'إعادة لصق حاصرة (Bracket)',
    'TAD Placement / Activation': 'تفعيل زرعة تقويمية (TAD)',
    'MARPE Activation': 'تفعيل موسع هيكلي (MARPE)',
    'Debond & Retainer Delivery': 'فك التقويم وتسليم المثبت (Debond)',
    'Bonding 0.022" MBT': 'تركيب الحاصرات (Bonding 0.022" MBT)',
    'Initial Alignment Wire': 'سلك الرصف الأولي (Alignment Wire)',
    'Bilateral Maxillary TADs': 'زرعات عظمية علوية ثنائية (TADs)',
    'En-Masse Space Closure (150g NiTi Coils)': 'إغلاق المسافات الكتلي بنوابض (NiTi Coils)',
    'Debond': 'فك جهاز التقويم (Debond)',
    'Fixed + Essix Retainers': 'تثبيت مزدوج ثابت وشفاف (Retainers)',
    'MSE-II MARPE Placement': 'تركيب موسع الفك العلوي الهيكلي (MARPE)',
    '4 Bicortical TADs': '4 زرعات ثنائية القشرة (Bicortical TADs)',
  };
  return map[proc] || proc;
}

export function formatVisitType(lang: LanguageMode, vt: string): string {
  if (lang === 'en') return vt;
  const map: Record<string, string> = {
    Consultation: 'استشارة تقويمية',
    Records: 'أخذ السجلات والصور',
    Bonding: 'تركيب الحاصرات (Bonding)',
    Adjustment: 'جلسة تنشيط وضبط',
    'Wire Change': 'تغيير السلك (Wire Change)',
    'Space Closure': 'إغلاق المسافات (Space Closure)',
    'TAD Placement': 'وضع زرعة مؤقتة (TAD)',
    'MARPE Activation': 'تفعيل الموسع (MARPE)',
    Debond: 'فك الجهاز (Debond)',
    'Retention Check': 'متابعة التثبيت (Retention)',
    Emergency: 'زيارة طوارئ',
  };
  return map[vt] || vt;
}

export function formatPhotoCategory(lang: LanguageMode, cat: string): string {
  if (lang === 'en') return cat;
  const map: Record<string, string> = {
    'Extraoral Frontal': 'صورة وجهية أمامية',
    'Extraoral Profile': 'صورة المرتسم الجانبي (Profile)',
    'Extraoral Smile': 'صورة الابتسامة خارج الفموية',
    'Intraoral Frontal': 'صورة داخل فموية أمامية',
    'Intraoral Right Buccal': 'صورة الإطباق الجانبي الأيمن',
    'Intraoral Left Buccal': 'صورة الإطباق الجانبي الأيسر',
    'Maxillary Occlusal': 'صورة القوس العلوي الإطباقية',
    'Mandibular Occlusal': 'صورة القوس السفلي الإطباقية',
    'Panoramic Radiograph': 'أشعة بانوراما (OPG)',
    'Lateral Cephalogram': 'أشعة سيفالومترية جانبية (Lateral Ceph)',
    'CBCT 3D Slice': 'مقطع ثلاثي الأبعاد (CBCT)',
  };
  return map[cat] || cat;
}
