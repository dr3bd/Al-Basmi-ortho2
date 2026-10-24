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

## Additional code-level blocker found during adapter review

A read-only review of `src/storage/drivers/waSqliteAdapter.ts` found that `restoreDatabaseBinary()` verifies the incoming backup in a temporary database, but the pre-restore snapshot of the live database is treated as best-effort:

- `liveRollbackBytes` starts as `null`.
- Failure to checkpoint/read the live database is only logged with `console.warn`.
- Restoration then continues: the live handle is closed, sidecar files are deleted, and the live database file is overwritten.
- If reopening the restored database fails while `liveRollbackBytes` is still `null`, the automatic rollback branch has no prior bytes to restore.

This contradicts the intended fail-safe restoration guarantee. It is a **P0 blocker**: restore must abort before closing the live handle or deleting/overwriting any live files unless a complete, independently validated rollback snapshot has been captured. The failure path must preserve the original database and return a typed error. A test must simulate snapshot-read failure and prove the live database remains unchanged.

Additional adapter contract concern: `restoreDatabaseBinary()` exists on `WaSqliteStorageAdapter` but is not declared in the frozen `ISqliteStorageAdapter` interface. Do not modify the frozen interface casually; first decide and document whether restore belongs in a separate backup/restore capability interface or in a separately reviewed future contract version.

## Required isolated restore test cases before enabling restore in the UI

- [ ] Valid export → restore into an isolated test database → verify sentinel rows, integrity, foreign keys, and schema inventory.
- [ ] Invalid header / undersized payload → reject before touching live storage.
- [ ] Backup integrity failure / foreign-key violation / incompatible schema → reject before touching live storage.
- [ ] Live pre-restore snapshot failure → abort without closing or overwriting the live database.
- [ ] Failure after live replacement → restore the prior snapshot and verify the prior sentinel rows.
- [ ] Successful restore → verify reopened connection, integrity, foreign keys, and sentinel rows after closing/reopening the adapter.
- [ ] All tests run against disposable test databases only; no live iPad/browser profile is accessed by CI.



## Verification update — 2026-10-24

### Read-only schema diagnostics PR #13

- The diagnostics parser now strips SQL line comments only outside quoted strings/identifiers; the comment newline handling was corrected in follow-up commits.
- GitHub Actions run [#73](https://github.com/dr3bd/Al-Basmi-ortho2/actions/runs/40104189817) completed successfully for commit `69333e0d264943579b29fd2c0781bc08c9bbc3ed`.
- The log reports DBF-06 passed, including the negative missing-column simulation, 45 expected/actual tables, 32 expected/actual indexes, no missing/unexpected columns, `integrity=ok`, and zero foreign-key violations. The isolated backup/restore suite reports 5/5 passing.
- PR #13 remains a draft and is not merged. These results are CI evidence only; they do not validate an existing device database or compare full column types, defaults, nullability, constraints, index expressions, or foreign-key actions.

### Restore rollback blocker status

- The fail-closed rollback-snapshot fix is available separately in [PR #12](https://github.com/dr3bd/Al-Basmi-ortho2/pull/12), with its own successful CI run previously recorded. It is not evidence that the fix is present on `main` unless that PR is merged.
- Therefore, treat the restore blocker as **still present on the base branch until the fix is reviewed and merged**. Keep restore disabled for live user data until the full required restore test matrix above is evidenced.

### Gate remains open

No live iPad/browser storage was accessed by these CI runs. No device-specific backup, external read-back verification, or recovery drill has been performed. The split persistence paths, count-based bootstrap guard, and process-memory-only `cloudStore` remain unresolved. Do not authorize schema migration or legacy-store deletion based on these test results.
