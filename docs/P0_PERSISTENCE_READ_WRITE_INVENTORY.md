# P0 — Persistence Read/Write Inventory

Status: **SOURCE INVENTORY — NOT A DATA-SAFETY PASS**
Audited ref: `main` at `37da9a20a631e13c543b09ad24dc8e1c845db6dd`
Scope: source-code paths only. No live device storage was accessed.

## 1. Browser localStorage keys found in `src/App.tsx`

| Key | Current observed behavior | Notes |
|---|---|---|
| `albasmi_orth_patients_v1` | Declared as `LEGACY_PATIENTS`; comment says no longer written. | Preserve and inventory before any cleanup; do not assume it is empty on existing devices. |
| `albasmi_orth_cases_v1` | Read during initial React state initialization; later writes only `cases.filter(c => c.isDemo)`. | Legacy/demo-only write behavior does not prove old clinical records are absent from existing profiles. |
| `albasmi_orth_inventory_v1` | Read at startup and written from React state. | Inventory is still localStorage-backed in this path, not shown as SQLite-backed here. |
| `albasmi_orth_audit_v1` | Read at startup and written from React state. | UI audit log state is localStorage-backed in this path; this is distinct from SQLite `audit_logs`. |
| `albasmi_orth_sync_v1` | Read at startup and written from React state. | UI sync queue is localStorage-backed in this path; it must not be assumed equivalent to SQLite `sync_operations`. |
| `albasmi_orth_clinical_lists_v1` | Read and written by the clinical-list settings state/effect. | Local user-managed reference lists; include in export inventory, but classify separately from patient clinical records. |
| `albasmi_orth_device_id_v1` | Read/written by `DeviceBootstrapService.getOrGenerateDeviceId()`. | Device identity; do not clear during backup or migration. |

## 2. SQLite clinical read paths observed in `src/App.tsx`

- Patients: `cohort2PatientService.listActivePatients()`.
- Cases: `cohort2CaseService.listActiveCases()`.
- Visits and visit procedures: `cohort2VisitService.listVisitsByCaseId()` and `listVisitProceduresByVisitId()`.
- Examinations and findings: `listExaminationsByCaseId()`, `listFindingsByExaminationId()`.
- Problems and diagnoses: `cohort2ProblemDiagnosisService.listProblemsByCaseId()`, `listDiagnosisVersionsByCaseId()`, `listDiagnosisItemsByVersionId()`.

The case loader catches errors for several related collections and continues loading the case projection. Before claiming a complete clinical restore, the app needs explicit diagnostics that distinguish a complete case load from a partial projection.

## 3. SQLite write-path evidence observed

- Patient creation/update operations are implemented through `Cohort2PatientPersistenceService`.
- Case creation and metadata updates use `Cohort2CasePersistenceService`.
- Visits, visit procedures, examinations, findings, visit updates/deletes use `Cohort2VisitPersistenceService`.
- Problem/diagnosis writes use `Cohort2ProblemDiagnosisPersistenceService`.
- These services document transactional writes with audit/outbox records; each actual handler and service operation still needs method-by-method coverage mapping before any legacy write is removed.

## 4. Separate media store

Previously added case-media functionality uses IndexedDB database `albasmi-orth-case-media` for media blobs and metadata. It is separate from both SQLite and localStorage and must be exported independently. No current-device enumeration or export has been performed by this source inventory.

## 5. Sync distinction

There are at least two separate representations to inspect independently:
- UI/localStorage key `albasmi_orth_sync_v1`.
- SQLite outbox table `sync_operations` (used by persistence services).

Neither should be deleted or declared reconciled until payloads have been inventoried and a deterministic reconciliation plan is tested on copies.

## 6. Required follow-up

1. Add a user-triggered, read-only storage diagnostics/export flow that reports store names, counts, byte sizes and errors without showing patient-identifiable content in logs.
2. Export all listed localStorage keys, SQLite database, IndexedDB media records, and pending sync payloads as separate labeled artifacts; verify read-back and hashes.
3. Add a test proving the export includes empty and non-empty stores and fails clearly when any store cannot be read.
4. Add exact schema-manifest tests in isolated test databases.
5. Only after device backup evidence and reviewed tests, propose a separate implementation PR. Do not delete legacy keys as part of the inventory/export implementation.

## Not claimed

- The list is a source-code inventory, not a measurement of actual device contents.
- No backup, read-back, integrity check or restore drill was run on the user's iPad.
- No runtime code or frozen contract was changed.
