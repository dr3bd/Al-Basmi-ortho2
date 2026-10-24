# P0 — Data Safety & Persistence Preflight

Status: **OPEN — DATA-SAFETY GATE NOT YET PASSED**
Scope: documentation-only preflight. This file does not claim that any runtime database was backed up or repaired.

## Why this gate is required

The current repository has multiple persistence paths. The checked-in application initializes clinical SQLite services, while `src/App.tsx` still reads/writes legacy `localStorage` keys (including patient/case and inventory state). The bootstrap routine in `src/storage/services/deviceBootstrap.ts` decides whether to apply the baseline DDL using a table-count threshold and a migration-row check; it does not establish full schema equivalence before proceeding. The baseline DDL and comments elsewhere in the storage layer describe different canonical table/index counts. The server sync endpoint in `server.ts` currently uses process-memory `cloudStore`, which is not a durable backup.

These facts mean **a successful build, a ready storage provider, or a successful sync response is not proof that all clinical data is protected**.

## P0 rules — must hold before schema or data migration

1. **No destructive operation:** do not drop/recreate tables, reset browser storage, clear legacy keys, or run a migration that rewrites existing patient/case data.
2. **Capture a per-device backup before any migration:** export the SQLite database binary where supported, plus an inventory/export of legacy clinical `localStorage` keys and IndexedDB case-media records. Keep exports outside the browser profile and verify that files are non-empty and can be read back.
3. **Do not claim backup completion from GitHub alone:** repository access cannot read the live SQLite/OPFS/IndexedDB/localStorage data on the user's iPad. The backup must be produced on each actual device/profile that contains clinical data.
4. **Record provenance:** timestamp, app version, device identifier, database driver (OPFS/IndexedDB), schema migration rows, table/index inventory, database integrity result, foreign-key check result, and export sizes. Do not put patient-identifiable clinical data into GitHub issues, logs, or this repository.
5. **Preserve all stores during inventory:** SQLite, legacy `localStorage`, IndexedDB media, and pending sync operations must be enumerated independently; do not assume one contains the others.
6. **Fail closed on uncertainty:** if integrity checks fail, schema differs from the declared manifest, or an export cannot be verified, stop migration and preserve the original store for recovery.
7. **No false cloud-backup claim:** `server.ts` `cloudStore` is process memory; it must not be treated as a durable backup or source of truth.

## P0 execution checklist

- [ ] On each device, export SQLite and verify a successful read-back.
- [ ] Export/list legacy clinical localStorage keys without deleting or overwriting them.
- [ ] Inventory IndexedDB databases and export case-media blobs/metadata.
- [ ] Record pending outbox/sync operation counts and preserve their payloads.
- [ ] Run SQLite `PRAGMA integrity_check` and `PRAGMA foreign_key_check` without modifying the database.
- [ ] Compare actual table names, column definitions, indexes, foreign keys, and migration rows against one reviewed manifest; counts alone are insufficient.
- [ ] Store backups outside the app's browser storage and verify the recovery procedure on a copy.
- [ ] Only after every item is evidenced, authorize a separate P1 repair/migration PR.

## Current known blockers

- Legacy `localStorage` clinical paths remain in `src/App.tsx`.
- Bootstrap uses a count-based schema guard rather than exact schema verification.
- Schema documentation/counts are inconsistent across schema/bootstrap/context.
- Server sync data is held in process memory, not durable cloud storage.
- This GitHub workflow cannot access the user's live iPad browser storage; no device backup has been performed by this PR.

## Exit criteria

P0 is **PASSED only when** device-specific backup artifacts exist outside browser storage, read-back is verified, and the read-only integrity/schema inventory is attached as a redacted report. Until then, the database must not be migrated, re-created, or re-frozen.
