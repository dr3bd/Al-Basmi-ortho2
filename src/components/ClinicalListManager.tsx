import React from 'react';
import { ClinicalListCatalog, DEFAULT_CLINICAL_LISTS } from '../domain/clinicalListCatalog';

interface ClinicalListManagerProps {
  catalog: ClinicalListCatalog;
  onChange: (catalog: ClinicalListCatalog) => void;
  language: 'ar' | 'en';
}

type ListKey = keyof ClinicalListCatalog;

export const ClinicalListManager: React.FC<ClinicalListManagerProps> = ({ catalog, onChange, language }) => {
  const [activeList, setActiveList] = React.useState<ListKey>('archwires');
  const [newOption, setNewOption] = React.useState('');
  const labels: Record<ListKey, { ar: string; en: string }> = {
    archwires: { ar: 'أنواع الأسلاك', en: 'Archwire types' },
    elastics: { ar: 'المطاطات', en: 'Elastics' },
    procedures: { ar: 'إجراءات الزيارة', en: 'Visit procedures' },
  };

  const addOption = () => {
    const value = newOption.trim();
    if (!value || catalog[activeList].some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    onChange({ ...catalog, [activeList]: [...catalog[activeList], value] });
    setNewOption('');
  };

  const removeOption = (value: string) => {
    if (catalog[activeList].length <= 1) return;
    onChange({ ...catalog, [activeList]: catalog[activeList].filter((item) => item !== value) });
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 md:p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{language === 'ar' ? 'إدارة القوائم السريرية' : 'Clinical List Manager'}</h2>
        <p className="text-sm text-slate-600 mt-1">
          {language === 'ar'
            ? 'أضف الخيارات التي تستخدمها في العيادة أو احذف الخيارات غير المطلوبة. تُحفظ هذه القوائم على هذا الجهاز وتعمل دون إنترنت.'
            : 'Add options used in your clinic or remove unwanted options. These lists are saved on this device and work offline.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(labels) as ListKey[]).map((key) => (
          <button key={key} type="button" onClick={() => setActiveList(key)}
            className={`px-3 py-2 rounded-lg border text-sm font-semibold ${activeList === key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}>
            {labels[key][language]}
          </button>
        ))}
      </div>
      <form className="flex flex-col sm:flex-row gap-2" onSubmit={(event) => { event.preventDefault(); addOption(); }}>
        <input value={newOption} onChange={(event) => setNewOption(event.target.value)}
          placeholder={language === 'ar' ? 'اكتب خيارًا جديدًا...' : 'Type a new option...'}
          className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-lg" />
        <button type="submit" className="px-4 py-2 rounded-lg bg-blue-700 text-white font-semibold">
          {language === 'ar' ? 'إضافة الخيار' : 'Add option'}
        </button>
      </form>
      <div className="space-y-2">
        <div className="text-xs text-slate-500">{language === 'ar' ? `عدد الخيارات: ${catalog[activeList].length}` : `Options: ${catalog[activeList].length}`}</div>
        {catalog[activeList].map((item) => (
          <div key={item} className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2">
            <span className="flex-1 text-sm break-words">{item}</span>
            <button type="button" onClick={() => removeOption(item)} disabled={catalog[activeList].length <= 1}
              className="px-2.5 py-1.5 text-sm rounded-md border border-red-200 text-red-700 disabled:opacity-40"
              aria-label={language === 'ar' ? `حذف ${item}` : `Remove ${item}`}>
              {language === 'ar' ? 'حذف' : 'Remove'}
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <p className="text-xs text-slate-500">
          {language === 'ar' ? 'القوائم محفوظة محليًا على هذا الجهاز فقط؛ لم تُفعّل مزامنتها مع الأجهزة الأخرى.' : 'Lists are stored locally on this device only; cross-device sync is not enabled.'}
        </p>
        <button type="button" onClick={() => onChange({ ...catalog, [activeList]: [...DEFAULT_CLINICAL_LISTS[activeList]] })}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm">
          {language === 'ar' ? 'استعادة الخيارات الافتراضية لهذا القسم' : 'Restore defaults for this list'}
        </button>
      </div>
    </section>
  );
};
