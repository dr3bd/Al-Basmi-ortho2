import React from 'react';
import { Camera, FileImage, FilePlus2, Trash2, AlertCircle, HardDrive } from 'lucide-react';
import { TimepointStage } from '../types/orthodontics';

type MediaCategory =
  | 'Extraoral Frontal'
  | 'Extraoral Profile'
  | 'Extraoral Smile'
  | 'Intraoral Frontal'
  | 'Intraoral Right'
  | 'Intraoral Left'
  | 'Upper Occlusal'
  | 'Lower Occlusal'
  | 'Panoramic X-Ray'
  | 'Lateral Ceph'
  | 'CBCT / Other Radiograph'
  | 'Other Clinical Image';

interface StoredCaseMedia {
  id: string;
  caseId: string;
  name: string;
  mimeType: string;
  size: number;
  category: MediaCategory;
  stage: TimepointStage;
  notes: string;
  createdAt: string;
  blob: Blob;
}

const DB_NAME = 'albasmi-orth-case-media';
const STORE_NAME = 'media';
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function openMediaDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser context.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('caseId', 'caseId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local media storage.'));
  });
}

function getCaseMedia(db: IDBDatabase, caseId: string): Promise<StoredCaseMedia[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).index('caseId').getAll(caseId);
    request.onsuccess = () => resolve((request.result || []) as StoredCaseMedia[]);
    request.onerror = () => reject(request.error || new Error('Could not read saved media.'));
  });
}

function putCaseMedia(db: IDBDatabase, item: StoredCaseMedia): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not save the file locally.'));
    tx.onabort = () => reject(tx.error || new Error('Local media save was aborted.'));
  });
}

function deleteCaseMedia(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not delete the file.'));
    tx.onabort = () => reject(tx.error || new Error('Local media deletion was aborted.'));
  });
}

const CATEGORIES: MediaCategory[] = [
  'Extraoral Frontal', 'Extraoral Profile', 'Extraoral Smile',
  'Intraoral Frontal', 'Intraoral Right', 'Intraoral Left',
  'Upper Occlusal', 'Lower Occlusal', 'Panoramic X-Ray', 'Lateral Ceph',
  'CBCT / Other Radiograph', 'Other Clinical Image',
];

const STAGES: { value: TimepointStage; ar: string; en: string }[] = [
  { value: 'T0_Initial', ar: 'قبل العلاج (T0)', en: 'Initial (T0)' },
  { value: 'T1_Progress', ar: 'أثناء العلاج (T1)', en: 'Progress (T1)' },
  { value: 'T2_PreFinishing', ar: 'قبل الإنهاء (T2)', en: 'Pre-finishing (T2)' },
  { value: 'T3_Final', ar: 'النتيجة النهائية (T3)', en: 'Final (T3)' },
  { value: 'T4_Retention', ar: 'مرحلة التثبيت (T4)', en: 'Retention (T4)' },
];

interface CaseMediaUploadProps {
  caseId: string;
  language: 'ar' | 'en';
}

export const CaseMediaUpload: React.FC<CaseMediaUploadProps> = ({ caseId, language }) => {
  const isAr = language === 'ar';
  const [db, setDb] = React.useState<IDBDatabase | null>(null);
  const [items, setItems] = React.useState<StoredCaseMedia[]>([]);
  const [urls, setUrls] = React.useState<Record<string, string>>({});
  const [category, setCategory] = React.useState<MediaCategory>('Panoramic X-Ray');
  const [stage, setStage] = React.useState<TimepointStage>('T0_Initial');
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const reload = React.useCallback(async (database: IDBDatabase) => {
    const records = await getCaseMedia(database, caseId);
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setItems(records);
    setUrls((previous) => {
      Object.values(previous).forEach((url) => URL.revokeObjectURL(url));
      return Object.fromEntries(records.map((record) => [record.id, URL.createObjectURL(record.blob)]));
    });
  }, [caseId]);

  React.useEffect(() => {
    let active = true;
    let database: IDBDatabase | null = null;
    openMediaDatabase()
      .then(async (opened) => {
        database = opened;
        if (!active) {
          opened.close();
          return;
        }
        setDb(opened);
        await reload(opened);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
      database?.close();
      setUrls((previous) => {
        Object.values(previous).forEach((url) => URL.revokeObjectURL(url));
        return {};
      });
    };
  }, [reload]);

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!db || files.length === 0) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      for (const file of files) {
        const isDicom = file.name.toLowerCase().endsWith('.dcm') || file.type === 'application/dicom';
        const isPdf = file.type === 'application/pdf';
        if (!file.type.startsWith('image/') && !isPdf && !isDicom) {
          throw new Error(isAr ? 'نوع الملف غير مدعوم. اختر صورة أو PDF أو ملف DICOM.' : 'Unsupported file. Choose an image, PDF, or DICOM file.');
        }
        if (file.size > MAX_FILE_BYTES) {
          throw new Error(isAr ? `الملف ${file.name} يتجاوز الحد الأقصى 25 MB.` : `${file.name} exceeds the 25 MB per-file limit.`);
        }
        const record: StoredCaseMedia = {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `media-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          caseId,
          name: file.name,
          mimeType: file.type || (isDicom ? 'application/dicom' : 'application/octet-stream'),
          size: file.size,
          category,
          stage,
          notes: notes.trim(),
          createdAt: new Date().toISOString(),
          blob: file,
        };
        await putCaseMedia(db, record);
      }
      await reload(db);
      setNotes('');
      setNotice(isAr ? 'تم حفظ الملف محلياً على هذا الجهاز، ويمكن الوصول إليه دون إنترنت ما دام تخزين المتصفح محفوظاً.' : 'Saved locally on this device. It remains available offline while browser site data is retained.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!db) return;
    const confirmed = typeof window !== 'undefined' && window.confirm(isAr ? 'هل تريد حذف هذا الملف من التخزين المحلي لهذا الجهاز؟' : 'Delete this file from this device’s local storage?');
    if (!confirmed) return;
    try {
      await deleteCaseMedia(db, id);
      await reload(db);
      setNotice(isAr ? 'تم حذف الملف المحلي.' : 'Local file deleted.');
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const stageLabel = (value: TimepointStage) => STAGES.find((entry) => entry.value === value)?.[isAr ? 'ar' : 'en'] || value;
  const categoryLabel = (value: MediaCategory) => {
    if (!isAr) return value;
    const translations: Record<MediaCategory, string> = {
      'Extraoral Frontal': 'صورة وجه أمامية',
      'Extraoral Profile': 'صورة جانبية للوجه',
      'Extraoral Smile': 'صورة الابتسامة',
      'Intraoral Frontal': 'صورة داخل الفم أمامية',
      'Intraoral Right': 'صورة داخل الفم يمين',
      'Intraoral Left': 'صورة داخل الفم يسار',
      'Upper Occlusal': 'صورة إطباقية للفك العلوي',
      'Lower Occlusal': 'صورة إطباقية للفك السفلي',
      'Panoramic X-Ray': 'أشعة بانورامية',
      'Lateral Ceph': 'أشعة سيفالومترية جانبية',
      'CBCT / Other Radiograph': 'CBCT / أشعة أخرى',
      'Other Clinical Image': 'صورة سريرية أخرى',
    };
    return translations[value];
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <div className="flex items-center gap-2 text-slate-900">
            <Camera className="h-5 w-5 text-blue-700" />
            <h2 className="text-base font-bold">{isAr ? 'الصور السريرية والأشعة' : 'Clinical Photos & Radiographs'}</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {isAr ? 'ارفع صور الوجه وداخل الفم والأشعة البانورامية والسيفالومترية وملفات PDF/DICOM، وصنّفها حسب المرحلة العلاجية.' : 'Upload facial/intraoral photographs, panoramic and cephalometric radiographs, and PDF/DICOM files. Classify each by treatment stage.'}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            <HardDrive className="h-3.5 w-3.5" />
            {isAr ? 'التخزين محلي على هذا الجهاز عبر IndexedDB؛ لا يتم رفع الملفات إلى الخادم أو مزامنتها سحابياً في هذه النسخة.' : 'Stored locally on this device in IndexedDB; this version does not upload or cloud-sync files.'}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
          {items.length} {isAr ? 'ملف محفوظ' : items.length === 1 ? 'saved file' : 'saved files'}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-xs font-semibold text-slate-700">
            <span>{isAr ? 'نوع الصورة أو الأشعة' : 'Image / Radiograph Type'}</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as MediaCategory)} className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3">
              {CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-700">
            <span>{isAr ? 'المرحلة العلاجية' : 'Treatment Stage'}</span>
            <select value={stage} onChange={(e) => setStage(e.target.value as TimepointStage)} className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3">
              {STAGES.map((item) => <option key={item.value} value={item.value}>{item[isAr ? 'ar' : 'en']}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-700 md:col-span-2">
            <span>{isAr ? 'ملاحظة (اختياري)' : 'Note (optional)'}</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder={isAr ? 'مثلاً: قبل العلاج، بعد التوسيع، متابعة الجذور...' : 'e.g. Pretreatment, post-expansion, root follow-up...'} className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className={`inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 ${busy || !db ? 'pointer-events-none opacity-60' : ''}`}>
            <FilePlus2 className="h-4 w-4" />
            <span>{busy ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? 'اختيار الصور والأشعة من الجهاز' : 'Choose Photos & Radiographs')}</span>
            <input type="file" className="sr-only" multiple accept="image/*,application/pdf,.pdf,.dcm,application/dicom" onChange={handleFiles} disabled={busy || !db} />
          </label>
          <span className="text-[11px] text-slate-500">{isAr ? 'الحد الأقصى 25 MB لكل ملف' : 'Maximum 25 MB per file'}</span>
        </div>
        {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        {notice && <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</div>}
        {!db && !error && <p className="mt-3 text-xs text-slate-500">{isAr ? 'جارٍ تهيئة التخزين المحلي...' : 'Initializing local storage...'}</p>}
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            <FileImage className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            {isAr ? 'لا توجد صور أو أشعة مرفقة بهذه الحالة بعد.' : 'No photos or radiographs attached to this case yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const isImage = item.mimeType.startsWith('image/');
              const isPdf = item.mimeType === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf');
              return (
                <article key={item.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="flex h-48 items-center justify-center bg-slate-100">
                    {isImage && urls[item.id] ? (
                      <img src={urls[item.id]} alt={item.name} className="h-full w-full object-contain" />
                    ) : (
                      <div className="px-4 text-center text-slate-500">
                        <FileImage className="mx-auto mb-2 h-8 w-8" />
                        <p className="text-xs font-semibold">{isPdf ? 'PDF' : 'DICOM / File'}</p>
                        {urls[item.id] && <a href={urls[item.id]} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-blue-700 underline">{isAr ? 'فتح الملف' : 'Open file'}</a>}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-4">
                    <p className="break-words text-sm font-semibold text-slate-900">{item.name}</p>
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      <span className="rounded bg-blue-50 px-2 py-1 text-blue-800">{categoryLabel(item.category)}</span>
                      <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">{stageLabel(item.stage)}</span>
                      <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">{formatSize(item.size)}</span>
                    </div>
                    {item.notes && <p className="text-xs leading-5 text-slate-600">{item.notes}</p>}
                    <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                      <span>{new Date(item.createdAt).toLocaleString(isAr ? 'ar' : 'en')}</span>
                      <button type="button" onClick={() => void handleDelete(item.id)} className="inline-flex min-h-[36px] items-center gap-1 rounded px-2 text-red-700 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" />{isAr ? 'حذف' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
