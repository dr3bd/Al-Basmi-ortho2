import React, { useState } from 'react';
import { X, UserPlus, AlertCircle, Calendar, Phone, User, Shield, CheckCircle2 } from 'lucide-react';
import { Cohort2PatientPersistenceService } from '../../storage/drivers/cohort2PatientPersistenceService';
import { Patient, LanguageMode } from '../../types/orthodontics';
import { StorageEngineMode } from '../../storage/types/storageAdapter';

export interface NewPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientCreated: (newPatient: Patient) => void;
  language: LanguageMode;
  cohort2PatientService: Cohort2PatientPersistenceService | null;
  deviceId: string;
  isDurable: boolean;
  storageMode: StorageEngineMode;
}

export const NewPatientModal: React.FC<NewPatientModalProps> = ({
  isOpen,
  onClose,
  onPatientCreated,
  language,
  cohort2PatientService,
  deviceId,
  isDurable,
  storageMode,
}) => {
  const isAr = language === 'ar';

  const [firstNameAr, setFirstNameAr] = useState('');
  const [lastNameAr, setLastNameAr] = useState('');
  const [firstNameEn, setFirstNameEn] = useState('');
  const [lastNameEn, setLastNameEn] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('2012-05-15');
  const [sex, setSex] = useState<'FEMALE' | 'MALE'>('FEMALE');
  const [phone, setPhone] = useState('+966 50 ');
  const [guardianName, setGuardianName] = useState('');
  const [medicalAlert, setMedicalAlert] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validation
    const effectiveFirst = (firstNameEn.trim() || firstNameAr.trim());
    const effectiveLast = (lastNameEn.trim() || lastNameAr.trim());

    if (!effectiveFirst || effectiveFirst.length < 2) {
      setErrorMessage(isAr ? 'يرجى إدخال الاسم الأول بشكل صحيح (حرفين على الأقل).' : 'First name must be at least 2 characters.');
      return;
    }
    if (!effectiveLast || effectiveLast.length < 2) {
      setErrorMessage(isAr ? 'يرجى إدخال اسم العائلة بشكل صحيح (حرفين على الأقل).' : 'Last name must be at least 2 characters.');
      return;
    }
    if (!dateOfBirth) {
      setErrorMessage(isAr ? 'يرجى تحديد تاريخ الميلاد.' : 'Date of birth is required.');
      return;
    }
    if (!phone || phone.trim().length < 7) {
      setErrorMessage(isAr ? 'يرجى إدخال رقم هاتف صحيح.' : 'A valid phone number is required.');
      return;
    }

    if (!cohort2PatientService) {
      setErrorMessage(isAr ? 'محرك التخزين السريري SQLite غير جاهز حالياً.' : 'SQLite clinical persistence service is unavailable.');
      return;
    }

    if (storageMode === 'CLINICAL' && !isDurable) {
      setErrorMessage(
        isAr
          ? 'خطأ أمني: التخزين الدائم غير متوفر في الوضع السريري. تم منع حفظ السجل.'
          : 'Security Violation: Durable persistent storage is unavailable in Clinical Mode. Write blocked.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const nowIso = new Date().toISOString();
      const patSeq = Date.now().toString().slice(-4);
      const patientNumber = `PAT-2026-${patSeq}`;
      const patientId = `pat-${Date.now()}`;

      const nameAr = `${firstNameAr.trim()} ${lastNameAr.trim()}`.trim();
      const nameEn = `${firstNameEn.trim()} ${lastNameEn.trim()}`.trim();

      // 1. Authoritative SQLite persistence (Atomic: patients + audit_logs + sync_operations)
      const patientResult = await cohort2PatientService.createPatient({
        id: patientId,
        patientNumber,
        firstName: firstNameEn.trim() || firstNameAr.trim(),
        lastName: lastNameEn.trim() || lastNameAr.trim(),
        dateOfBirth,
        sex,
        phone: phone.trim(),
        guardianName: guardianName.trim() || null,
        medicalAlert: medicalAlert.trim() || null,
        generalNotes: generalNotes.trim() || null,
        userId: 'usr-dr-albasmi',
        userRole: 'ORTHODONTIST',
        deviceId: deviceId || 'dev-browser-client',
        timestamp: nowIso,
      });

      // 2. Post-write verification gate: Confirm patient exists authoritatively in SQLite
      const verifiedPatient = await cohort2PatientService.getPatientById(patientResult.patient.id);
      if (!verifiedPatient) {
        throw new Error('Post-write verification failed: Patient row was not found in SQLite after commit.');
      }

      // 3. Map to UI presentation model
      const newUiPatient: Patient = {
        id: verifiedPatient.id,
        fullNameAr: nameAr || nameEn,
        fullNameEn: nameEn || nameAr,
        gender: verifiedPatient.sex === 'FEMALE' ? 'Female' : 'Male',
        dob: verifiedPatient.date_of_birth,
        phone: verifiedPatient.phone,
        guardianName: verifiedPatient.guardian_name || undefined,
        medicalHistory: verifiedPatient.medical_alert || 'No systemic contraindications.',
        dentalHistory: 'Initial orthodontic consultation.',
        allergies: 'None',
        notes: verifiedPatient.general_notes || '',
        createdAt: verifiedPatient.created_at ? verifiedPatient.created_at.slice(0, 10) : nowIso.slice(0, 10),
        isDemo: false, // Authoritative SQLite patient
      };

      onPatientCreated(newUiPatient);
      onClose();
    } catch (err: unknown) {
      console.error('Patient creation failed (transaction rolled back):', err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 px-6 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isAr ? 'تسجيل مريض جديد (قاعدة بيانات SQLite)' : 'Register New Patient (Authoritative SQLite)'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isAr
                  ? 'يتم حفظ السجل بشكل دائم وموثق في قاعدة البيانات المحلية.'
                  : 'Record is committed atomically with audit logs and sync queue.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold">{isAr ? 'فشل حفظ المريض:' : 'Persistence Error:'}</span>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Bilingual Names Grid */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-800">
              {isAr ? 'الاسم باللغة العربية' : 'Arabic Name (Recommended)'}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder={isAr ? 'الاسم الأول (مثال: سارة)' : 'First Name (Arabic)'}
                value={firstNameAr}
                onChange={(e) => setFirstNameAr(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 min-h-[42px]"
              />
              <input
                type="text"
                placeholder={isAr ? 'اسم العائلة (مثال: الحربي)' : 'Last Name (Arabic)'}
                value={lastNameAr}
                onChange={(e) => setLastNameAr(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 min-h-[42px]"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-800">
              {isAr ? 'الاسم باللغة الإنجليزية' : 'English Name'}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="First Name (e.g., Sarah)"
                value={firstNameEn}
                onChange={(e) => setFirstNameEn(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 min-h-[42px]"
              />
              <input
                type="text"
                placeholder="Last Name (e.g., Al-Harbi)"
                value={lastNameEn}
                onChange={(e) => setLastNameEn(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 min-h-[42px]"
              />
            </div>
          </div>

          {/* Demographics: DOB, Sex, Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isAr ? 'تاريخ الميلاد' : 'Date of Birth'} *
              </label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono tabular-nums min-h-[42px]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isAr ? 'الجنس' : 'Sex'} *
              </label>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value as 'FEMALE' | 'MALE')}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 min-h-[42px]"
              >
                <option value="FEMALE">{isAr ? 'أنثى' : 'Female'}</option>
                <option value="MALE">{isAr ? 'ذكر' : 'Male'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isAr ? 'رقم الهاتف' : 'Phone Number'} *
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono tabular-nums min-h-[42px]"
              />
            </div>
          </div>

          {/* Guardian Name */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isAr ? 'اسم ولي الأمر (في حال كان المريض قاصراً)' : 'Guardian Name (If Minor)'}
            </label>
            <input
              type="text"
              placeholder={isAr ? 'اسم الأب أو الأم أو الوصي' : 'Parent / Legal Guardian'}
              value={guardianName}
              onChange={(e) => setGuardianName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 min-h-[42px]"
            />
          </div>

          {/* Medical Alert */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isAr ? 'تنبيه طبي / أمراض جهازية / تحسس' : 'Medical Alert / Systemic Conditions'}
            </label>
            <input
              type="text"
              placeholder={isAr ? 'مثال: ربو، تحسس من اللاتكس، سكري، أو اتركه فارغاً' : 'e.g., Asthma, Latex Allergy, Diabetes, or leave empty'}
              value={medicalAlert}
              onChange={(e) => setMedicalAlert(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 min-h-[42px]"
            />
          </div>

          {/* General Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isAr ? 'ملاحظات عامة' : 'General Clinical Notes'}
            </label>
            <textarea
              rows={2}
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder={isAr ? 'أي ملاحظات أولية حول المريض...' : 'Initial observations, referral source, etc.'}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600 min-h-[60px]"
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors min-h-[44px]"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors min-h-[44px]"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {isSubmitting
                  ? isAr
                    ? 'جارٍ الحفظ في SQLite...'
                    : 'Saving to SQLite...'
                  : isAr
                  ? 'حفظ المريض واعتماده'
                  : 'Commit Patient Record'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
