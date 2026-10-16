import React from 'react';
import {
  FolderPlus,
  AlertTriangle,
  Calendar,
  Phone,
  User,
  Shield,
  FileText,
  ChevronRight,
  Sparkles,
  Clock,
  Activity,
} from 'lucide-react';
import { Patient, OrthodonticCase, LanguageMode } from '../../types/orthodontics';
import { formatCaseStatus, formatSkeletalSagittal } from '../../utils/i18n';

export interface PatientDetailViewProps {
  patient: Patient | null;
  cases: OrthodonticCase[];
  activeCaseId: string | null;
  onSelectCase: (caseId: string) => void;
  onOpenNewCaseModal: () => void;
  language: LanguageMode;
  isStorageReady: boolean;
}

export const PatientDetailView: React.FC<PatientDetailViewProps> = ({
  patient,
  cases,
  activeCaseId,
  onSelectCase,
  onOpenNewCaseModal,
  language,
  isStorageReady,
}) => {
  const isAr = language === 'ar';

  if (!patient) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white min-h-[400px]">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
          <User className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">
          {isAr ? 'لم يتم تحديد مريض' : 'No Patient Selected'}
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          {isAr
            ? 'يرجى اختيار مريض من القائمة الجانبية أو تسجيل مريض جديد لعرض بياناته والملفات التقويمية المرتبطة.'
            : 'Select a patient from the list on the left, or register a new patient to view profile details and linked orthodontic cases.'}
        </p>
      </div>
    );
  }

  // Calculate age from DOB
  let ageString = '';
  if (patient.dob) {
    const birthYear = new Date(patient.dob).getFullYear();
    const currentYear = new Date().getFullYear();
    const age = currentYear - birthYear;
    if (!isNaN(age) && age > 0) {
      ageString = isAr ? `${age} سنة` : `${age} years`;
    }
  }

  const hasMedicalAlert =
    patient.medicalHistory &&
    patient.medicalHistory !== 'None' &&
    !patient.medicalHistory.toLowerCase().includes('no systemic');

  const linkedCases = cases.filter((c) => c.patientId === patient.id);

  return (
    <div className="flex-1 overflow-y-auto p-5 lg:p-6 space-y-6 bg-slate-50/40">
      {/* 1. PATIENT HEADER RIBBON */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-mono tabular-nums font-bold text-blue-700">{patient.id}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{patient.dob}</span>
            {ageString && (
              <>
                <span aria-hidden="true">·</span>
                <span>{ageString}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{isAr ? (patient.gender === 'Female' ? 'أنثى' : 'ذكر') : patient.gender}</span>
          </div>

          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {isAr ? patient.fullNameAr || patient.fullNameEn : patient.fullNameEn || patient.fullNameAr}
            </h1>
            {patient.isDemo ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                {isAr ? 'بيانات تجريبية (Demo)' : 'Demo Record'}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                {isAr ? 'سجل سريري' : 'Clinical Record'}
              </span>
            )}
          </div>
        </div>

        {/* Primary Manual Action: New Orthodontic Case */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenNewCaseModal}
            disabled={!isStorageReady}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-black disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors whitespace-nowrap min-h-[44px]"
          >
            <FolderPlus className="w-4 h-4 text-cyan-400" />
            <span>{isAr ? '+ فتح حالة تقويمية جديدة' : '+ New Orthodontic Case'}</span>
          </button>
        </div>
      </div>

      {/* 2. MEDICAL ALERT BANNER (IF APPLICABLE) */}
      {hasMedicalAlert && (
        <div className="bg-red-50/80 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-red-900">
              {isAr ? 'تنبيه طبي سريري مسجل للمريض' : 'Clinical Medical Alert Recorded'}
            </h4>
            <p className="text-xs text-red-700 font-medium">{patient.medicalHistory}</p>
          </div>
        </div>
      )}

      {/* 3. PATIENT DEMOGRAPHICS & CLINICAL NOTES GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Contact Info Card */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 pb-2 border-b border-slate-100">
            <Phone className="w-3.5 h-3.5 text-blue-600" />
            <span>{isAr ? 'بيانات الاتصال والتواصل' : 'Contact Information'}</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">{isAr ? 'رقم الهاتف' : 'Phone'}:</span>
              <span className="font-mono tabular-nums font-semibold text-slate-800">{patient.phone}</span>
            </div>
            {patient.guardianName && (
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? 'ولي الأمر' : 'Guardian'}:</span>
                <span className="font-semibold text-slate-800">{patient.guardianName}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">{isAr ? 'تاريخ التسجيل' : 'Registered'}:</span>
              <span className="font-mono tabular-nums text-slate-700">{patient.createdAt}</span>
            </div>
          </div>
        </div>

        {/* Dental & Medical History Card */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 pb-2 border-b border-slate-100">
            <Shield className="w-3.5 h-3.5 text-blue-600" />
            <span>{isAr ? 'السيرة السريرية والتحسس' : 'Clinical History'}</span>
          </div>
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-slate-500 block text-[11px]">{isAr ? 'السوابق السنية' : 'Dental History'}:</span>
              <span className="text-slate-800">{patient.dentalHistory || (isAr ? 'لا توجد ملاحظات' : 'None reported')}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">{isAr ? 'التحسس' : 'Allergies'}:</span>
              <span className="text-slate-800">{patient.allergies || (isAr ? 'سليم' : 'None')}</span>
            </div>
          </div>
        </div>

        {/* General Notes Card */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 pb-2 border-b border-slate-100">
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span>{isAr ? 'ملاحظات عامة' : 'General Notes'}</span>
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">
            {patient.notes || (isAr ? 'لا توجد ملاحظات عامة مسجلة.' : 'No general notes recorded for this patient.')}
          </p>
        </div>
      </div>

      {/* 4. LINKED ORTHODONTIC CASES ROSTER */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-bold text-slate-900">
              {isAr ? 'الملفات التقويمية للمريض' : 'Orthodontic Cases Roster'}
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              {linkedCases.length} {isAr ? 'ملف' : linkedCases.length === 1 ? 'Case' : 'Cases'}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenNewCaseModal}
            disabled={!isStorageReady}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1 min-h-[44px]"
          >
            <span>{isAr ? '+ إضافة حالة أخرى' : '+ Add Another Case'}</span>
          </button>
        </div>

        {linkedCases.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-300 rounded-lg text-center space-y-3 bg-slate-50/50">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center mx-auto">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-800">
                {isAr ? 'لا توجد حالات تقويمية مسجلة بعد لهذا المريض' : 'No Orthodontic Cases Registered Yet'}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {isAr
                  ? 'تم تسجيل المريض بنجاح في قاعدة البيانات. يمكنك الآن البدء بإنشاء أول حالة تقويمية لتسجيل الشكوى الرئيسية، الفحوصات والتشخيص.'
                  : 'Patient registered successfully in SQLite. Click below to initiate the first orthodontic case for clinical examination, diagnosis, and treatment planning.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenNewCaseModal}
              disabled={!isStorageReady}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors min-h-[44px]"
            >
              <FolderPlus className="w-4 h-4" />
              <span>{isAr ? '+ إنشاء حالة تقويمية جديدة الآن' : '+ Create Orthodontic Case Now'}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {linkedCases.map((c) => {
              const isActive = c.id === activeCaseId;
              return (
                <div
                  key={c.id}
                  className={`p-4 rounded-lg border transition-all flex flex-col justify-between gap-3 ${
                    isActive
                      ? 'border-blue-600 bg-blue-50/30 ring-1 ring-blue-600/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono tabular-nums font-bold text-blue-700">{c.id}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {formatCaseStatus(language, c.status)}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-slate-900">{c.caseType}</div>

                    <p className="text-xs text-slate-600 line-clamp-2">
                      <span className="text-slate-400 font-medium">{isAr ? 'الشكوى:' : 'Complaint:'} </span>
                      {isAr ? c.chiefComplaintAr || c.chiefComplaintEn : c.chiefComplaintEn || c.chiefComplaintAr}
                    </p>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono tabular-nums pt-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{isAr ? `تاريخ البدء: ${c.startDate}` : `Started: ${c.startDate}`}</span>
                      <span aria-hidden="true">·</span>
                      <span>{c.visits.length} {isAr ? 'زيارات' : 'visits'}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onSelectCase(c.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 min-h-[38px] ${
                        isActive
                          ? 'bg-blue-700 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                      }`}
                    >
                      <span>{isActive ? (isAr ? 'الحالة المعروضة حالياً' : 'Current Active Case') : (isAr ? 'عرض الحالة والتشخيص' : 'Open Workspace')}</span>
                      <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
