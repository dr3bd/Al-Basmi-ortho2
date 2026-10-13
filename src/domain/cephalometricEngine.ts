import {
  CephMeasurementDefinition,
  CephStageRecord,
  OrthodonticCase,
  ScientificReference,
} from '../types/orthodontics';

export const CEPHALOMETRIC_DEFINITIONS: CephMeasurementDefinition[] = [
  {
    id: 'm_sna',
    code: 'SNA',
    nameEn: 'SNA Angle (Maxillary AP Position)',
    nameAr: 'زاوية SNA (الوضع السهمي للفك العلوي)',
    school: 'Steiner',
    unit: '°',
    normMean: 82.0,
    normSd: 2.0,
    highMeaningEn: 'Maxillary prognathism (protrusive maxilla)',
    lowMeaningEn: 'Maxillary retrognathism (recessive maxilla)',
    highMeaningAr: 'بروز الفك العلوي هيكليًا (Maxillary Prognathism)',
    lowMeaningAr: 'تراجع الفك العلوي هيكليًا (Maxillary Retrognathism)',
  },
  {
    id: 'm_snb',
    code: 'SNB',
    nameEn: 'SNB Angle (Mandibular AP Position)',
    nameAr: 'زاوية SNB (الوضع السهمي للفك السفلي)',
    school: 'Steiner',
    unit: '°',
    normMean: 80.0,
    normSd: 2.0,
    highMeaningEn: 'Mandibular prognathism',
    lowMeaningEn: 'Mandibular retrognathism (recessive mandible)',
    highMeaningAr: 'بروز الفك السفلي هيكليًا (Mandibular Prognathism)',
    lowMeaningAr: 'تراجع الفك السفلي هيكليًا (Mandibular Retrognathism)',
  },
  {
    id: 'm_anb',
    code: 'ANB',
    nameEn: 'ANB Angle (Sagittal Intermaxillary Relation)',
    nameAr: 'زاوية ANB (العلاقة الهيكلية السهمية بين الفكين)',
    school: 'Steiner',
    unit: '°',
    normMean: 2.0,
    normSd: 2.0,
    highMeaningEn: 'Skeletal Class II tendency (>4°)',
    lowMeaningEn: 'Skeletal Class III tendency (<0°)',
    highMeaningAr: 'ميل هيكلي للصنف الثاني (Skeletal Class II)',
    lowMeaningAr: 'ميل هيكلي للصنف الثالث (Skeletal Class III)',
  },
  {
    id: 'm_wits',
    code: 'Wits',
    nameEn: 'Wits Appraisal (AO-BO Occlusal Plane)',
    nameAr: 'تقييم Wits على المستوى الإطباقي',
    school: 'Wits',
    unit: 'mm',
    normMean: 0.0,
    normSd: 2.0,
    highMeaningEn: 'Skeletal Class II discrepancy on occlusal plane',
    lowMeaningEn: 'Skeletal Class III discrepancy on occlusal plane',
    highMeaningAr: 'عدم توافق سهمي من الصنف الثاني',
    lowMeaningAr: 'عدم توافق سهمي من الصنف الثالث',
  },
  {
    id: 'm_snmp',
    code: 'SN-MP',
    nameEn: 'GoGn-SN (Mandibular Plane to Cranial Base)',
    nameAr: 'زاوية المستوى الفكي السفلي إلى قاعدة الجمجمة (SN-MP)',
    school: 'Steiner',
    unit: '°',
    normMean: 32.0,
    normSd: 3.0,
    highMeaningEn: 'Hyperdivergent vertical growth pattern (high angle)',
    lowMeaningEn: 'Hypodivergent vertical growth pattern (low angle)',
    highMeaningAr: 'نمط نمو عمودي متباعد / زاوية عالية (Hyperdivergent)',
    lowMeaningAr: 'نمط نمو عمودي متقارب / زاوية منخفضة (Hypodivergent)',
  },
  {
    id: 'm_fma',
    code: 'FMA',
    nameEn: 'Frankfort-Mandibular Plane Angle (FMA)',
    nameAr: 'زاوية فرانكفورت - المستوى الفكي السفلي (FMA)',
    school: 'Tweed',
    unit: '°',
    normMean: 25.0,
    normSd: 3.0,
    highMeaningEn: 'High-angle skeletal vertical pattern',
    lowMeaningEn: 'Low-angle skeletal deep bite pattern',
    highMeaningAr: 'زيادة البعد العمودي الهيكلي',
    lowMeaningAr: 'نقصان البعد العمودي الهيكلي',
  },
  {
    id: 'm_u1sn',
    code: 'U1-SN',
    nameEn: 'Upper Incisor to SN Plane (U1-SN)',
    nameAr: 'ميلان القاطعة العلوية إلى مستوى قاعدة الجمجمة (U1-SN)',
    school: 'Steiner',
    unit: '°',
    normMean: 103.0,
    normSd: 4.0,
    highMeaningEn: 'Proclined maxillary incisors',
    lowMeaningEn: 'Retroclined maxillary incisors',
    highMeaningAr: 'تقدم ميلان القواطع العلوية (Proclination)',
    lowMeaningAr: 'تراجع ميلان القواطع العلوية (Retroclination)',
  },
  {
    id: 'm_u1na_deg',
    code: 'U1-NA (°)',
    nameEn: 'U1 to NA Angle',
    nameAr: 'زاوية القاطعة العلوية إلى الخط NA',
    school: 'Steiner',
    unit: '°',
    normMean: 22.0,
    normSd: 3.0,
    highMeaningEn: 'Maxillary incisor proclination',
    lowMeaningEn: 'Maxillary incisor retroclination',
    highMeaningAr: 'زيادة ميلان القواطع العلوية للأمام',
    lowMeaningAr: 'تراجع ميلان القواطع العلوية للخلف',
  },
  {
    id: 'm_u1na_mm',
    code: 'U1-NA (mm)',
    nameEn: 'U1 to NA Linear Distance',
    nameAr: 'البعد الخطي للقاطعة العلوية عن الخط NA',
    school: 'Steiner',
    unit: 'mm',
    normMean: 4.0,
    normSd: 2.0,
    highMeaningEn: 'Protrusive maxillary incisors',
    lowMeaningEn: 'Retrusive maxillary incisors',
    highMeaningAr: 'بروز خطي للقواطع العلوية',
    lowMeaningAr: 'تراجع خطي للقواطع العلوية',
  },
  {
    id: 'm_impa',
    code: 'IMPA',
    nameEn: 'Incisor Mandibular Plane Angle (IMPA / L1-MP)',
    nameAr: 'زاوية القاطعة السفلية إلى المستوى الفكي السفلي (IMPA)',
    school: 'Tweed',
    unit: '°',
    normMean: 90.0,
    normSd: 4.0,
    highMeaningEn: 'Proclined mandibular incisors',
    lowMeaningEn: 'Retroclined mandibular incisors',
    highMeaningAr: 'ميلان القواطع السفلية للأمام (Proclined L1)',
    lowMeaningAr: 'ميلان القواطع السفلية للسان (Retroclined L1)',
  },
  {
    id: 'm_l1nb_deg',
    code: 'L1-NB (°)',
    nameEn: 'L1 to NB Angle',
    nameAr: 'زاوية القاطعة السفلية إلى الخط NB',
    school: 'Steiner',
    unit: '°',
    normMean: 25.0,
    normSd: 3.0,
    highMeaningEn: 'Proclined lower incisors relative to NB',
    lowMeaningEn: 'Retroclined lower incisors relative to NB',
    highMeaningAr: 'ميلان القواطع السفلية للأمام نسبة لـ NB',
    lowMeaningAr: 'تراجع ميلان القواطع السفلية نسبة لـ NB',
  },
  {
    id: 'm_iia',
    code: 'U1-L1',
    nameEn: 'Interincisal Angle (U1-L1)',
    nameAr: 'الزاوية بين القواطع العلوية والسفلية (Interincisal Angle)',
    school: 'Downs',
    unit: '°',
    normMean: 131.0,
    normSd: 5.0,
    highMeaningEn: 'Upright / retroclined incisors (bimaxillary retroclination)',
    lowMeaningEn: 'Bimaxillary dentoalveolar proclination',
    highMeaningAr: 'تراجع ميلان القواطع (Upright Incisors)',
    lowMeaningAr: 'بروز وميلان ثنائي للقواطع العلوية والسفلية',
  },
  {
    id: 'm_nasion_perp_a',
    code: 'A-N Perp',
    nameEn: 'Point A to Nasion Perpendicular (McNamara)',
    nameAr: 'المسافة من النقطة A إلى عمود النازيون (McNamara)',
    school: 'McNamara',
    unit: 'mm',
    normMean: 1.0,
    normSd: 2.0,
    highMeaningEn: 'Maxillary skeletal protrusion',
    lowMeaningEn: 'Maxillary skeletal retrusion',
    highMeaningAr: 'تقدم الفك العلوي نسبة لقاعدة الجمجمة',
    lowMeaningAr: 'تراجع الفك العلوي نسبة لقاعدة الجمجمة',
  },
  {
    id: 'm_pog_nperp',
    code: 'Pog-N Perp',
    nameEn: 'Pogonion to Nasion Perpendicular (McNamara)',
    nameAr: 'المسافة من الذقن (Pogonion) إلى عمود النازيون',
    school: 'McNamara',
    unit: 'mm',
    normMean: -2.0,
    normSd: 3.0,
    highMeaningEn: 'Prominent bony chin / prognathic mandible',
    lowMeaningEn: 'Retrusive bony chin / retrognathic mandible',
    highMeaningAr: 'تقدم الذقن العظمي',
    lowMeaningAr: 'تراجع الذقن العظمي',
  },
  {
    id: 'm_jarabak',
    code: 'PFH/AFH',
    nameEn: 'Jarabak Ratio (S-Go / N-Me %)',
    nameAr: 'نسبة جاراباك للارتفاع الخلفي إلى الأمامي للوجه',
    school: 'Jarabak',
    unit: '%',
    normMean: 63.5,
    normSd: 2.5,
    highMeaningEn: 'Counter-clockwise / horizontal growth tendency (>65%)',
    lowMeaningEn: 'Clockwise / vertical hyperdivergent growth tendency (<61%)',
    highMeaningAr: 'نمو أفقي بعكس عقارب الساعة',
    lowMeaningAr: 'نمو عمودي مع عقارب الساعة',
  },
  {
    id: 'm_eline_lower',
    code: 'Lower Lip to E-Line',
    nameEn: 'Lower Lip to Ricketts Esthetic Plane (E-Line)',
    nameAr: 'موقع الشفة السفلية نسبة للخط الجمالي (E-Line)',
    school: 'Ricketts',
    unit: 'mm',
    normMean: -2.0,
    normSd: 2.0,
    highMeaningEn: 'Protrusive lower lip profile',
    lowMeaningEn: 'Retrusive lower lip profile',
    highMeaningAr: 'بروز الشفة السفلية أمام الخط الجمالي',
    lowMeaningAr: 'تراجع الشفة السفلية خلف الخط الجمالي',
  },
];

export interface CephDeviationEvaluation {
  definition: CephMeasurementDefinition;
  value: number;
  diffFromNorm: number;
  zScore: number;
  status: 'Within Normal Limits' | 'Mild Deviation' | 'Significant Deviation';
  direction: 'Normal' | 'High' | 'Low';
  interpretationEn: string;
  interpretationAr: string;
}

export function evaluateCephalometricValue(
  def: CephMeasurementDefinition,
  value: number
): CephDeviationEvaluation {
  const diff = Number((value - def.normMean).toFixed(1));
  const zScore = Number((diff / def.normSd).toFixed(2));
  const absZ = Math.abs(zScore);

  let status: CephDeviationEvaluation['status'] = 'Within Normal Limits';
  let direction: CephDeviationEvaluation['direction'] = 'Normal';

  if (absZ > 2.0) {
    status = 'Significant Deviation';
    direction = diff > 0 ? 'High' : 'Low';
  } else if (absZ > 1.0) {
    status = 'Mild Deviation';
    direction = diff > 0 ? 'High' : 'Low';
  }

  const interpretationEn =
    direction === 'Normal'
      ? `Within normal range (${def.normMean} ± ${def.normSd}${def.unit})`
      : direction === 'High'
      ? `${def.highMeaningEn} (+${diff}${def.unit})`
      : `${def.lowMeaningEn} (${diff}${def.unit})`;

  const interpretationAr =
    direction === 'Normal'
      ? `ضمن الحدود الطبيعية (${def.normMean} ± ${def.normSd}${def.unit})`
      : direction === 'High'
      ? `${def.highMeaningAr} (+${diff}${def.unit})`
      : `${def.lowMeaningAr} (${diff}${def.unit})`;

  return {
    definition: def,
    value,
    diffFromNorm: diff,
    zScore,
    status,
    direction,
    interpretationEn,
    interpretationAr,
  };
}

export interface ClinicalWarning {
  id: string;
  type: 'Consistency Conflict' | 'Report Quality Gap' | 'Biomechanics Alert';
  severity: 'High' | 'Medium' | 'Advisory';
  titleEn: string;
  titleAr: string;
  detailEn: string;
  detailAr: string;
  sectionRef: string;
}

export function runClinicalConsistencyAndQualityChecks(orthoCase: OrthodonticCase): ClinicalWarning[] {
  const warnings: ClinicalWarning[] = [];
  const t0Ceph: CephStageRecord | undefined = orthoCase.cephRecords.find((r) => r.stage === 'T0_Initial');

  // 1. Check ANB vs Entered Skeletal Sagittal Diagnosis
  if (t0Ceph && t0Ceph.values['ANB'] !== undefined) {
    const anb = t0Ceph.values['ANB'];
    const diagSag = orthoCase.diagnosis.skeletalSagittal;

    if (diagSag === 'Skeletal Class I' && (anb > 4.5 || anb < 0)) {
      warnings.push({
        id: 'warn_anb_class1',
        type: 'Consistency Conflict',
        severity: 'High',
        titleEn: 'Skeletal Class I vs Recorded ANB Discrepancy',
        titleAr: 'تعارض سريري: تشخيص الصنف الأول الهيكلي لا يتطابق مع قيمة زاوية ANB',
        detailEn: `The doctor recorded "${diagSag}", whereas initial cephalometric ANB is ${anb}° (Norm: 2° ± 2°). Please verify Wits appraisal or skeletal classification.`,
        detailAr: `تم تسجيل التشخيص كـ (${diagSag}) بينما زاوية ANB الأولية تساوي ${anb}° (المعدل الطبيعي 2° ± 2°). يرجى مراجعة تقييم Wits أو التصنيف الهيكلي دون تعديل آلي.`,
        sectionRef: 'Diagnosis / Cephalometrics',
      });
    }

    if (diagSag.includes('Class II') && anb < 2.0) {
      warnings.push({
        id: 'warn_anb_class2',
        type: 'Consistency Conflict',
        severity: 'High',
        titleEn: 'Skeletal Class II vs Low ANB Angle',
        titleAr: 'تعارض سريري: تشخيص الصنف الثاني الهيكلي مع زاوية ANB منخفضة',
        detailEn: `Recorded "${diagSag}" but ANB is ${anb}°. Confirm whether clockwise rotation or Wits appraisal explains this discrepancy.`,
        detailAr: `تم اختيار تشخيص الصنف الثاني الهيكلي ولكن زاوية ANB المسجلة هي ${anb}°. يرجى التحقق من القياسات.`,
        sectionRef: 'Diagnosis / Cephalometrics',
      });
    }
  }

  // 2. Check SN-MP vs Vertical Diagnosis
  if (t0Ceph && t0Ceph.values['SN-MP'] !== undefined) {
    const snmp = t0Ceph.values['SN-MP'];
    const diagVert = orthoCase.diagnosis.skeletalVertical;
    if (diagVert === 'Normodivergent' && (snmp > 36 || snmp < 27)) {
      warnings.push({
        id: 'warn_vert_snmp',
        type: 'Consistency Conflict',
        severity: 'Medium',
        titleEn: 'Vertical Skeletal Classification vs SN-MP Angle',
        titleAr: 'تنبيه اتساق: النمط العمودي المسجل يتعارض مع زاوية SN-MP',
        detailEn: `Vertical diagnosis is set to Normodivergent while GoGn-SN (SN-MP) is ${snmp}° (Norm: 32° ± 3°).`,
        detailAr: `التشخيص العمودي مسجل كـ Normodivergent بينما زاوية SN-MP تساوي ${snmp}°.`,
        sectionRef: 'Diagnosis / Vertical',
      });
    }
  }

  // 3. Check Actual Problems without Treatment Objectives
  const actualProblems = orthoCase.problemList.filter((p) => p.classification === 'Actual Problem');
  actualProblems.forEach((prob, idx) => {
    if (!prob.objectiveEn.trim() && !prob.objectiveAr.trim()) {
      warnings.push({
        id: `warn_prob_no_obj_${prob.id}`,
        type: 'Report Quality Gap',
        severity: 'High',
        titleEn: `Problem #${idx + 1} Lacks a Linked Treatment Objective`,
        titleAr: `المشكلة رقم #${idx + 1} في قائمة المشاكل لا يقابلها هدف علاجي (Treatment Objective)`,
        detailEn: `"${prob.findingEn}" is classified as an Actual Problem but has no documented Treatment Objective.`,
        detailAr: `المشكلة "${prob.findingAr || prob.findingEn}" مصنفة كمشكلة فعلية ولكن لم يُحدد لها هدف علاجي مقابل.`,
        sectionRef: 'Problem List & Objectives',
      });
    }
  });

  // 4. Check Selected Treatment Option
  const selectedOptions = orthoCase.treatmentOptions.filter((o) => o.isSelected);
  if (orthoCase.treatmentOptions.length > 0 && selectedOptions.length === 0) {
    warnings.push({
      id: 'warn_no_selected_plan',
      type: 'Report Quality Gap',
      severity: 'High',
      titleEn: 'No Approved Treatment Plan Option Selected',
      titleAr: 'لم يتم اعتماد خيار علاجي نهائي (Selected Treatment Option)',
      detailEn: 'Multiple treatment alternatives exist, but none is marked as the Doctor-Selected Plan.',
      detailAr: 'توجد بدائل علاجية مطروحة، ولكن لم يتم تحديد الخطة المعتمدة للتنفيذ.',
      sectionRef: 'Treatment Plan',
    });
  }

  // 5. Check Final Records if Status is Debond / Retention / Completed
  if (['Debond', 'Retention', 'Completed'].includes(orthoCase.status)) {
    const hasFinalCeph = orthoCase.cephRecords.some((r) => r.stage === 'T3_Final');
    if (!hasFinalCeph) {
      warnings.push({
        id: 'warn_missing_final_ceph',
        type: 'Report Quality Gap',
        severity: 'Medium',
        titleEn: 'Missing Final (T3) Cephalometric Records for Completed/Retention Case',
        titleAr: 'نقص في السجلات النهائية: لم يتم إدخال التحليل السيفالومتري النهائي (T3 Final)',
        detailEn: 'Longitudinal superimposition and final cephalometric table require T3 Final measurements.',
        detailAr: 'يتطلب التقرير المقارن والمطابقة السيفالومترية إدخال قياسات المرحلة النهائية T3.',
        sectionRef: 'Cephalometrics',
      });
    }
  }

  // 6. Check Thin Cortical Plate + Non-Extraction Proclination Risk
  if (
    orthoCase.cbctAndRadiographs.alveolarBoneStatus !== 'Adequate' &&
    selectedOptions[0]?.approachType === 'Non-Extraction' &&
    orthoCase.intraoral.mandibularCrowdingMm >= 5
  ) {
    warnings.push({
      id: 'warn_cbct_proclination_dehiscence',
      type: 'Biomechanics Alert',
      severity: 'High',
      titleEn: 'Periodontal Fenestration Risk: Non-Extraction with Thin Labial Bone & Crowding',
      titleAr: 'تحذير بيوميكانيكي: خطر انحسار لثوي أو دهليزي عند رصف الازدحام بدون خلع مع رقة الصفيحة العظمية',
      detailEn: `CBCT indicates "${orthoCase.cbctAndRadiographs.alveolarBoneStatus}" with ${orthoCase.intraoral.mandibularCrowdingMm}mm lower crowding. Resolving crowding via proclination carries gingival recession risk.`,
      detailAr: `فحص الـ CBCT يظهر (${orthoCase.cbctAndRadiographs.alveolarBoneStatus}) مع ازدحام سفلي ${orthoCase.intraoral.mandibularCrowdingMm} ملم. الرصف بدون خلع أو IPR قد يؤدي لبروز القواطع وانكشاف الجذور.`,
      sectionRef: 'CBCT / Treatment Plan',
    });
  }

  return warnings;
}

export const ORTHODONTIC_EVIDENCE_LIBRARY: ScientificReference[] = [
  {
    id: 'ref_proffit_6ed',
    authors: 'Proffit WR, Fields HW, Larson BE, Sarver DM',
    year: 2019,
    title: 'Contemporary Orthodontics (6th Edition)',
    journalOrBook: 'Elsevier Health Sciences, St. Louis',
    volumePages: 'pp. 140–248',
    domainTag: 'Biomechanics',
    apaCitation: 'Proffit, W. R., Fields, H. W., Larson, B. E., & Sarver, D. M. (2019). Contemporary Orthodontics (6th ed.). Elsevier.',
    vancouverCitation: 'Proffit WR, Fields HW, Larson BE, Sarver DM. Contemporary Orthodontics. 6th ed. St. Louis: Elsevier; 2019.',
  },
  {
    id: 'ref_steiner_1953',
    authors: 'Steiner CC',
    year: 1953,
    title: 'Cephalometrics for you and me',
    journalOrBook: 'American Journal of Orthodontics',
    volumePages: '39(10):729–755',
    domainTag: 'Cephalometrics',
    apaCitation: 'Steiner, C. C. (1953). Cephalometrics for you and me. American Journal of Orthodontics, 39(10), 729-755.',
    vancouverCitation: 'Steiner CC. Cephalometrics for you and me. Am J Orthod. 1953;39(10):729-55.',
  },
  {
    id: 'ref_mcnamara_1984',
    authors: 'McNamara JA Jr',
    year: 1984,
    title: 'A method of cephalometric evaluation',
    journalOrBook: 'American Journal of Orthodontics',
    volumePages: '86(6):449–469',
    domainTag: 'Cephalometrics',
    apaCitation: 'McNamara, J. A., Jr. (1984). A method of cephalometric evaluation. American Journal of Orthodontics, 86(6), 449-469.',
    vancouverCitation: 'McNamara JA Jr. A method of cephalometric evaluation. Am J Orthod. 1984;86(6):449-69.',
  },
  {
    id: 'ref_tweed_1954',
    authors: 'Tweed CH',
    year: 1954,
    title: 'The Frankfort-mandibular incisor angle (FMIA) in orthodontic diagnosis, treatment planning and prognosis',
    journalOrBook: 'The Angle Orthodontist',
    volumePages: '24(3):121–169',
    domainTag: 'Cephalometrics',
    apaCitation: 'Tweed, C. H. (1954). The Frankfort-mandibular incisor angle (FMIA) in orthodontic diagnosis, treatment planning and prognosis. The Angle Orthodontist, 24(3), 121-169.',
    vancouverCitation: 'Tweed CH. The Frankfort-mandibular incisor angle (FMIA) in orthodontic diagnosis, treatment planning and prognosis. Angle Orthod. 1954;24(3):121-69.',
  },
  {
    id: 'ref_baccetti_2005',
    authors: 'Baccetti T, Franchi L, McNamara JA Jr',
    year: 2005,
    title: 'The Cervical Vertebral Maturation (CVM) method for the assessment of optimal treatment timing in dentofacial orthopedics',
    journalOrBook: 'Seminars in Orthodontics',
    volumePages: '11(3):119–129',
    domainTag: 'Class II',
    apaCitation: 'Baccetti, T., Franchi, L., & McNamara, J. A., Jr. (2005). The Cervical Vertebral Maturation (CVM) method for the assessment of optimal treatment timing in dentofacial orthopedics. Seminars in Orthodontics, 11(3), 119-129.',
    vancouverCitation: 'Baccetti T, Franchi L, McNamara JA Jr. The Cervical Vertebral Maturation (CVM) method for the assessment of optimal treatment timing in dentofacial orthopedics. Semin Orthod. 2005;11(3):119-29.',
  },
  {
    id: 'ref_carlson_marpe_2016',
    authors: 'Carlson C, Sung J, McComb RW, Machado AW, Moon W',
    year: 2016,
    title: 'Microimplant-assisted rapid palatal expansion appliance to orthopedically correct transverse maxillary deficiency in an adult',
    journalOrBook: 'American Journal of Orthodontics and Dentofacial Orthopedics',
    volumePages: '149(5):716–728',
    domainTag: 'MARPE & TADs',
    apaCitation: 'Carlson, C., Sung, J., McComb, R. W., Machado, A. W., & Moon, W. (2016). Microimplant-assisted rapid palatal expansion appliance to orthopedically correct transverse maxillary deficiency in an adult. AJODO, 149(5), 716-728.',
    vancouverCitation: 'Carlson C, Sung J, McComb RW, Machado AW, Moon W. Microimplant-assisted rapid palatal expansion appliance to orthopedically correct transverse maxillary deficiency in an adult. Am J Orthod Dentofacial Orthop. 2016;149(5):716-28.',
  },
  {
    id: 'ref_little_stability_1988',
    authors: 'Little RM, Riedel RA, Artun J',
    year: 1988,
    title: 'An evaluation of changes in mandibular anterior alignment from 10 to 20 years postretention',
    journalOrBook: 'American Journal of Orthodontics and Dentofacial Orthopedics',
    volumePages: '93(5):423–428',
    domainTag: 'Retention & Stability',
    apaCitation: 'Little, R. M., Riedel, R. A., & Artun, J. (1988). An evaluation of changes in mandibular anterior alignment from 10 to 20 years postretention. AJODO, 93(5), 423-428.',
    vancouverCitation: 'Little RM, Riedel RA, Artun J. An evaluation of changes in mandibular anterior alignment from 10 to 20 years postretention. Am J Orthod Dentofacial Orthop. 1988;93(5):423-8.',
  },
];
