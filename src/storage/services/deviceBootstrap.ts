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

import { SqliteDeviceRow } from '../../domain/p0SqliteSchema.ts';
import {
  Cohort1PersistenceService,
  canonicalizeJsonPayload,
  ImmutableOperationEnvelope,
  SqliteDeviceRepository,
} from '../drivers/cohort1PersistenceService.ts';
import { ISqliteStorageAdapter } from '../types/storageAdapter.ts';

const DEVICE_STORAGE_KEY = 'albasmi_orth_device_id_v1';

export interface DeviceBootstrapResult {
  deviceId: string;
  isNewRegistration: boolean;
  deviceRow: SqliteDeviceRow;
}

export class DeviceBootstrapService {
  private deviceRepo = new SqliteDeviceRepository();

  constructor(
    private adapter: ISqliteStorageAdapter,
    private persistenceService: Cohort1PersistenceService
  ) {}

  /**
   * Resolves or generates a durable device ID that survives browser page reloads.
   */
  public getOrGenerateDeviceId(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = window.localStorage.getItem(DEVICE_STORAGE_KEY);
        if (stored && stored.trim().length > 0) {
          return stored.trim();
        }
      } catch {
        // Fall back to generation if localStorage is inaccessible
      }
    }

    // Generate deterministic offline UUIDv4-style string
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
   * Bootstraps device registration safely into SQLite.
   * - Checks whether the device is already in SQLite.
   * - If found, updates last_sync_at (if requested) and returns immediately.
   * - If not found, calls registerDevice atomically.
   */
  public async bootstrapDevice(options?: {
    forcedDeviceId?: string;
    deviceName?: string;
    appVersion?: string;
    schemaVersion?: string;
  }): Promise<DeviceBootstrapResult> {
    const deviceId = options?.forcedDeviceId || this.getOrGenerateDeviceId();

    // 1. Check if device is already registered in SQLite physical table
    const existing = await this.deviceRepo.getById(this.adapter, deviceId);
    if (existing) {
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
