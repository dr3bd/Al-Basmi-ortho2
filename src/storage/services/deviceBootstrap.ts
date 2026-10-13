/**
 * AL-BASMI ORTH — DURABLE DEVICE BOOTSTRAP SERVICE
 * Scope: PHASE 2-C-R3 Controlled Device Bootstrapping
 * 
 * Authorities:
 * - SCHEMA_FREEZE_v1.0 (src/domain/p0SqliteSchema.ts)
 * - PERSISTENCE_ADAPTER_CONTRACT_v1.0 (src/storage/types/storageAdapter.ts)
 * - Cohort 1 Persistence Contract (src/storage/drivers/cohort1PersistenceService.ts)
 * 
 * Rules:
 * 1. Generates and preserves a stable device identity across reloads in localStorage.
 * 2. Checks SQLite physical `devices` table before attempting registration.
 * 3. If device already exists in SQLite, returns existing state with isNewRegistration = false.
 * 4. If device does not exist in SQLite, performs atomic triple-write:
 *    (devices + audit_logs + sync_operations) via Cohort1PersistenceService.registerDevice().
 * 5. Uses strict immutable envelope idempotency. Never creates duplicate rows.
 */

import { P0_PRODUCTION_SQLITE_DDL, SqliteDeviceRow } from '../../domain/p0SqliteSchema.ts';
import {
  Cohort1PersistenceService,
  canonicalizeJsonPayload,
  ImmutableOperationEnvelope,
  SqliteDeviceRepository,
  SqliteUserRepository,
} from '../drivers/cohort1PersistenceService.ts';
import { ISqliteStorageAdapter } from '../types/storageAdapter.ts';

const DEVICE_STORAGE_KEY = 'albasmi_orth_device_id_v1';

export interface DeviceBootstrapResult {
  deviceId: string;
  isNewRegistration: boolean;
  deviceRow: SqliteDeviceRow;
}

/**
 * Ensures all 42 canonical tables and 25 indexes from SCHEMA_FREEZE_v1.0 exist in SQLite,
 * and records baseline migration version 1 in schema_migrations.
 * Safe against interrupted prior initialization.
 */
export async function ensureCanonicalSchemaAndMigrations(
  adapter: ISqliteStorageAdapter
): Promise<{
  tableCount: number;
  tablesCount: number;
  indexesCount: number;
  migrationVersion: number;
  migrationApplied: boolean;
}> {
  const existingTables = await adapter.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';"
  );

  let hasBaselineMigration = false;
  if (existingTables.some((t) => t.name === 'schema_migrations')) {
    const mig = await adapter.queryOne<{ version: number }>(
      'SELECT version FROM schema_migrations WHERE version = 1;'
    );
    hasBaselineMigration = Boolean(mig && mig.version === 1);
  }

  let migrationApplied = false;
  if (existingTables.length < 42 || !hasBaselineMigration) {
    migrationApplied = true;
    const cleanSql = P0_PRODUCTION_SQLITE_DDL
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const statements = cleanSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const rawStmt of statements) {
      // Make CREATE TABLE and CREATE INDEX idempotent without altering frozen P0_PRODUCTION_SQLITE_DDL
      const idempotentStmt = rawStmt
        .replace(/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS\s+)/i, 'CREATE TABLE IF NOT EXISTS ')
        .replace(/^CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS\s+)/i, 'CREATE INDEX IF NOT EXISTS ');
      await adapter.execute(`${idempotentStmt};`);
    }

    await adapter.execute(
      `INSERT OR IGNORE INTO schema_migrations (version, migration_name, applied_at, checksum)
       VALUES (1, '001_initial_p0_clinical_core_schema', ?, 'sha256:4a7d1ed414474e4033ac29ccb8653d9b');`,
      [new Date().toISOString()]
    );
  }

  // Enforce foreign keys pragma on connection
  await adapter.execute('PRAGMA foreign_keys = ON;');

  const finalTables = await adapter.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';"
  );
  const finalIndexes = await adapter.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%';"
  );

  return {
    tableCount: finalTables.length,
    tablesCount: finalTables.length,
    indexesCount: finalIndexes.length,
    migrationVersion: 1,
    migrationApplied,
  };
}

export class DeviceBootstrapService {
  private deviceRepo = new SqliteDeviceRepository();
  private userRepo = new SqliteUserRepository();
  private cachedDeviceId: string | null = null;

  constructor(
    private adapter: ISqliteStorageAdapter,
    private persistenceService: Cohort1PersistenceService
  ) {}

  /**
   * Instance method wrapper for idempotent canonical schema and migration verification.
   */
  public async ensureCanonicalSchemaAndMigrations() {
    return ensureCanonicalSchemaAndMigrations(this.adapter);
  }

  /**
   * Resolves or generates a durable device ID that survives browser page reloads.
   */
  public getOrGenerateDeviceId(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = window.localStorage.getItem(DEVICE_STORAGE_KEY);
        if (stored && stored.trim().length > 0) {
          this.cachedDeviceId = stored.trim();
          return this.cachedDeviceId;
        }
      } catch {
        // Fall back to generation if localStorage is inaccessible
      }
    }

    if (this.cachedDeviceId) {
      return this.cachedDeviceId;
    }

    // Generate deterministic offline UUIDv4-style string
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    this.cachedDeviceId = generated;

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(DEVICE_STORAGE_KEY, generated);
      } catch {
        // Ignore quota / sandbox errors
      }
    }

    return generated;
  }

  /**
   * Detects device type based on user agent string without leaking internal details.
   */
  private detectDeviceType(): 'IPAD' | 'ANDROID_TABLET' | 'WINDOWS' | 'MACOS' | 'WEB' | 'OTHER' {
    if (typeof navigator === 'undefined') return 'WEB';
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('ipad') || (ua.includes('macintosh') && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1)) {
      return 'IPAD';
    }
    if (ua.includes('android')) {
      return 'ANDROID_TABLET';
    }
    if (ua.includes('windows')) {
      return 'WINDOWS';
    }
    if (ua.includes('macintosh')) {
      return 'MACOS';
    }
    return 'WEB';
  }

  /**
   * Idempotently seeds canonical orthodontic reference definitions and default clinician user
   * so all foreign keys (users, cephalometric definitions, tooth numbering systems) are valid.
   */
  public async ensureCanonicalReferenceData(deviceId: string): Promise<void> {
    const now = new Date().toISOString();

    // 1. Ensure primary clinician user exists in users table
    const existingProvider = await this.userRepo.getById(this.adapter, 'usr-dr-albasmi');
    if (!existingProvider) {
      const userPayload = canonicalizeJsonPayload({
        username: 'dr.albasmi',
        display_name: 'Dr. Al-Basmi (Orthodontic Specialist)',
        status: 'ACTIVE',
      });
      await this.persistenceService.createUser({
        envelope: {
          operation_id: `op-usr-bootstrap-dr-albasmi`,
          device_id: deviceId,
          entity_type: 'users',
          entity_id: 'usr-dr-albasmi',
          operation_type: 'CREATE',
          base_version: 0,
          payload: userPayload,
        },
        userId: 'system-bootstrapper',
        auditId: 'aud-usr-bootstrap-dr-albasmi',
        timestamp: now,
        reasonCode: 'PROVIDER_BOOTSTRAP',
        userData: {
          username: 'dr.albasmi',
          display_name: 'Dr. Al-Basmi (Orthodontic Specialist)',
          status: 'ACTIVE',
        },
      });
    }

    // 2. Ensure tooth numbering systems reference rows exist
    await this.adapter.execute(
      `INSERT OR IGNORE INTO tooth_numbering_systems (code, name, is_default, version) VALUES
       ('FDI', 'FDI World Dental Federation Two-Digit Notation', 1, 1),
       ('UNIVERSAL', 'Universal Numbering System', 0, 1),
       ('PALMER', 'Palmer Notation Method', 0, 1);`
    );

    // 3. Ensure cephalometric analysis definitions exist
    await this.adapter.execute(
      `INSERT OR IGNORE INTO cephalometric_analysis_definitions (analysis_code, name_en, name_ar, version, active) VALUES
       ('STEINER', 'Steiner Analysis', 'تحليل شتاينر', 1, 1),
       ('MCNAMARA', 'McNamara Analysis', 'تحليل ماكنمارا', 1, 1),
       ('TWEED', 'Tweed Triangle Analysis', 'تحليل تويد', 1, 1),
       ('RICKETTS', 'Ricketts Bioprogressive Analysis', 'تحليل ريكيتس', 1, 1),
       ('WITS', 'Wits Appraisal', 'تقييم ويتس', 1, 1);`
    );

    // 4. Ensure cephalometric landmark definitions exist
    await this.adapter.execute(
      `INSERT OR IGNORE INTO cephalometric_landmark_definitions (landmark_code, name_en, name_ar, anatomical_definition, active) VALUES
       ('S', 'Sella', 'السرج التركي (Sella)', 'Geometric center of the pituitary fossa', 1),
       ('N', 'Nasion', 'النقطة الأنفية الجبهية (Nasion)', 'Most anterior point of the frontonasal suture', 1),
       ('A', 'Subspinale (Point A)', 'النقطة A العلوية', 'Deepest midline point on the anterior maxilla', 1),
       ('B', 'Supramentale (Point B)', 'النقطة B السفلية', 'Deepest midline point on the anterior mandible', 1),
       ('Pog', 'Pogonion', 'الذقن العظمي (Pogonion)', 'Most anterior point of the bony chin', 1),
       ('Me', 'Menton', 'أسفل الذقن (Menton)', 'Most inferior point on the mandibular symphysis', 1),
       ('Go', 'Gonion', 'زاوية الفك (Gonion)', 'Most posterior-inferior point of the mandibular angle', 1);`
    );

    // 5. Ensure cephalometric measurement definitions exist
    await this.adapter.execute(
      `INSERT OR IGNORE INTO cephalometric_measurement_definitions (id, analysis_code, measurement_code, unit, norm_mean, norm_sd) VALUES
       ('cmd-steiner-sna', 'STEINER', 'SNA', 'deg', 82.0, 2.0),
       ('cmd-steiner-snb', 'STEINER', 'SNB', 'deg', 80.0, 2.0),
       ('cmd-steiner-anb', 'STEINER', 'ANB', 'deg', 2.0, 2.0),
       ('cmd-tweed-fma', 'TWEED', 'FMA', 'deg', 25.0, 3.0),
       ('cmd-tweed-impa', 'TWEED', 'IMPA', 'deg', 90.0, 3.5),
       ('cmd-wits-ao-bo', 'WITS', 'Wits', 'mm', 0.0, 2.0);`
    );
  }

  /**
   * Bootstraps device registration safely into SQLite.
   * - Checks whether the device is already in SQLite.
   * - If found, returns immediately with isNewRegistration = false.
   * - If not found, calls registerDevice atomically.
   */
  public async bootstrapDevice(options?: {
    forcedDeviceId?: string;
    deviceName?: string;
    appVersion?: string;
    schemaVersion?: string;
    seedReferenceData?: boolean;
  }): Promise<DeviceBootstrapResult> {
    const deviceId = options?.forcedDeviceId || this.getOrGenerateDeviceId();

    // 1. Check if device is already registered in SQLite physical table
    const existing = await this.deviceRepo.getById(this.adapter, deviceId);
    if (existing) {
      if (options?.seedReferenceData) {
        await this.ensureCanonicalReferenceData(deviceId);
      }
      return {
        deviceId,
        isNewRegistration: false,
        deviceRow: existing,
      };
    }

    // 2. Prepare registration parameters
    const timestamp = new Date().toISOString();
    const deviceType = this.detectDeviceType();
    const deviceName = options?.deviceName || `Al-Basmi Station (${deviceType})`;
    const appVersion = options?.appVersion || '1.0.0';
    const schemaVersion = options?.schemaVersion || '1.0.0';

    const payload = canonicalizeJsonPayload({
      device_name: deviceName,
      device_type: deviceType,
      app_version: appVersion,
      schema_version: schemaVersion,
    });

    const envelope: ImmutableOperationEnvelope = {
      operation_id: `op-reg-${deviceId}`,
      device_id: deviceId,
      entity_type: 'devices',
      entity_id: deviceId,
      operation_type: 'CREATE',
      base_version: 0,
      payload,
    };

    // 3. Execute atomic registration via Cohort1PersistenceService
    await this.persistenceService.registerDevice({
      envelope,
      userId: 'system-bootstrapper',
      auditId: `aud-reg-${deviceId}`,
      timestamp,
      reasonCode: 'DEVICE_BOOTSTRAP',
      deviceData: {
        device_name: deviceName,
        device_type: deviceType,
        app_version: appVersion,
        schema_version: schemaVersion,
        last_sync_at: null,
        status: 'ACTIVE',
      },
    });

    if (options?.seedReferenceData) {
      await this.ensureCanonicalReferenceData(deviceId);
    }

    // 4. Fetch the confirmed persisted record
    const created = await this.deviceRepo.getById(this.adapter, deviceId);
    if (!created) {
      throw new Error(`Failed to retrieve newly registered device: ${deviceId}`);
    }

    return {
      deviceId,
      isNewRegistration: true,
      deviceRow: created,
    };
  }
}
