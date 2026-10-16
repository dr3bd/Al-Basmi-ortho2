import React, { useMemo, useState } from 'react';
import { Search, UserPlus, AlertCircle, Users, FolderOpen } from 'lucide-react';
import { Patient, LanguageMode } from '../../types/orthodontics';

export interface PatientMasterListProps {
  patients: Patient[];
  selectedPatientId: string | null;
  onSelectPatient: (patientId: string) => void;
  onOpenNewPatientModal: () => void;
  language: LanguageMode;
  caseCountsByPatientId: Record<string, number>;
  isStorageReady: boolean;
  isClinicalMode: boolean;
}

export const PatientMasterList: React.FC<PatientMasterListProps> = ({
  patients,
  selectedPatientId,
  onSelectPatient,
  onOpenNewPatientModal,
  language,
  caseCountsByPatientId,
  isStorageReady,
  isClinicalMode,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const isAr = language === 'ar';

  const filteredPatients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => {
      const matchNameAr = p.fullNameAr?.toLowerCase().includes(q);
      const matchNameEn = p.fullNameEn?.toLowerCase().includes(q);
      const matchId = p.id?.toLowerCase().includes(q);
      const matchPhone = p.phone?.toLowerCase().includes(q);
      return matchNameAr || matchNameEn || matchId || matchPhone;
    });
  }, [patients, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 select-none">
      {/* List Header & Action Bar */}
      <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-slate-50/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-blue-700" />
            <h2 className="text-xs font-bold text-slate-900 tracking-tight">
              {isAr ? 'سجل المرضى' : 'Patient Registry'}
            </h2>
            <span className="text-[11px] font-mono tabular-nums text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded">
              {filteredPatients.length}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenNewPatientModal}
            disabled={!isStorageReady}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 active:bg-blue-900 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors whitespace-nowrap min-h-[44px]"
            aria-label={isAr ? 'تسجيل مريض جديد' : 'Register New Patient'}
          >
            <UserPlus className="w-3.5 h-3.5 shrink-0" />
            <span>{isAr ? '+ مريض جديد' : '+ New Patient'}</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute top-3 left-3 rtl:left-auto rtl:right-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? 'بحث بالاسم، رقم الملف أو الهاتف...' : 'Search by name, patient ID, phone...'}
            className="w-full pl-8 pr-3 rtl:pl-3 rtl:pr-8 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-all min-h-[38px]"
          />
        </div>
      </div>

      {/* Patient Cards Stream */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
        {filteredPatients.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <Users className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-800">
                {searchQuery
                  ? isAr
                    ? 'لم يتم العثور على نتائج للبحث'
                    : 'No matching patients found'
                  : isAr
                  ? 'لا يوجد مرضى مسجلون في قاعدة البيانات'
                  : 'No patients registered in SQLite'}
              </p>
              <p className="text-[11px] text-slate-500 max-w-[220px]">
                {searchQuery
                  ? isAr
                    ? 'جرب البحث برقم آخر أو باسم مختلف'
                    : 'Try adjusting your search criteria'
                  : isAr
                  ? 'انقر على زر "+ مريض جديد" لإضافة أول مريض معتمد سريرياً.'
                  : 'Click "+ New Patient" to register the first patient record.'}
              </p>
            </div>
            {!searchQuery && (
              <button
                type="button"
                onClick={onOpenNewPatientModal}
                disabled={!isStorageReady}
                className="px-3.5 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors min-h-[44px]"
              >
                {isAr ? 'إضافة مريض جديد الآن' : 'Register First Patient'}
              </button>
            )}
          </div>
        ) : (
          filteredPatients.map((p) => {
            const isSelected = p.id === selectedPatientId;
            const casesCount = caseCountsByPatientId[p.id] || 0;
            const hasAlert = Boolean(p.medicalHistory && p.medicalHistory !== 'None' && !p.medicalHistory.toLowerCase().includes('no systemic'));

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPatient(p.id)}
                className={`w-full text-start p-3 rounded-lg border transition-all min-h-[64px] flex flex-col justify-between gap-1.5 ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/70'
                }`}
                aria-selected={isSelected}
              >
                {/* Top Line: ID & Case Count Badge */}
                <div className="flex items-center justify-between text-[11px] w-full">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`font-mono tabular-nums font-semibold ${
                        isSelected ? 'text-blue-300' : 'text-blue-700'
                      }`}
                    >
                      {p.id}
                    </span>
                    {p.isDemo ? (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                        DEMO
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        {isAr ? 'سريري' : 'CLINICAL'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <span
                      className={`text-[10px] font-mono tabular-nums flex items-center gap-1 ${
                        isSelected ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      <FolderOpen className="w-3 h-3" />
                      {isAr ? `${casesCount} حالة` : `${casesCount} ${casesCount === 1 ? 'Case' : 'Cases'}`}
                    </span>
                    {hasAlert && (
                      <span title={isAr ? 'تنبيه طبي مسجل' : 'Medical Alert Recorded'}>
                        <AlertCircle className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-300' : 'text-red-500'}`} />
                      </span>
                    )}
                  </div>
                </div>

                {/* Middle Line: Full Name */}
                <div className="text-xs font-bold truncate w-full">
                  {isAr ? p.fullNameAr || p.fullNameEn : p.fullNameEn || p.fullNameAr}
                </div>

                {/* Bottom Line: Demographics & Phone */}
                <div
                  className={`flex items-center gap-2 text-[11px] font-mono tabular-nums truncate ${
                    isSelected ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  <span>{isAr ? (p.gender === 'Female' ? 'أنثى' : 'ذكر') : p.gender}</span>
                  <span aria-hidden="true">·</span>
                  <span>{p.dob}</span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{p.phone}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer Status */}
      <div className="p-2.5 border-t border-slate-200 bg-slate-50 text-[10px] text-slate-500 flex items-center justify-between">
        <span>{isClinicalMode ? (isAr ? 'الوضع السريري (SQLite فقط)' : 'Clinical Mode (SQLite Only)') : (isAr ? 'الوضع التجريبي' : 'Demo Mode')}</span>
        <span className="font-mono tabular-nums">
          {patients.filter((p) => !p.isDemo).length} {isAr ? 'معتمد' : 'Authoritative'}
        </span>
      </div>
    </div>
  );
};
