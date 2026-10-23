export interface ClinicalListCatalog {
  archwires: string[];
  elastics: string[];
  procedures: string[];
}

export const DEFAULT_CLINICAL_LISTS: ClinicalListCatalog = {
  archwires: [
    '0.012 NiTi',
    '0.014 NiTi',
    '0.016 NiTi',
    '0.018 NiTi',
    '0.016×0.022 NiTi',
    '0.017×0.025 NiTi',
    '0.019×0.025 NiTi',
    '0.016 SS',
    '0.016×0.022 SS',
    '0.017×0.025 SS',
    '0.019×0.025" SS',
    '0.017×0.025 TMA',
  ],
  elastics: [
    'None',
    'Class II 3/16" 4.5oz Bilateral',
    'Class II 1/4" 4.5oz Bilateral',
    'Class III 3/16" 4.5oz Bilateral',
    'Vertical 3/16" 4.5oz Bilateral',
    'Triangle elastics',
    'Box elastics',
    'Custom elastics',
  ],
  procedures: [
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
  ],
};

export const CLINICAL_LISTS_STORAGE_KEY = 'albasmi_orth_clinical_lists_v1';

export function normalizeClinicalLists(value: unknown): ClinicalListCatalog {
  if (!value || typeof value !== 'object') return DEFAULT_CLINICAL_LISTS;
  const candidate = value as Partial<Record<keyof ClinicalListCatalog, unknown>>;
  const normalize = (input: unknown, fallback: string[]) =>
    Array.isArray(input)
      ? [...new Set(input.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
      : fallback;
  return {
    archwires: normalize(candidate.archwires, DEFAULT_CLINICAL_LISTS.archwires),
    elastics: normalize(candidate.elastics, DEFAULT_CLINICAL_LISTS.elastics),
    procedures: normalize(candidate.procedures, DEFAULT_CLINICAL_LISTS.procedures),
  };
}
