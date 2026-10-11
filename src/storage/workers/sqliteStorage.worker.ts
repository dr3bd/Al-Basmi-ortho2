/**
 * AL-BASMI ORTH — DEDICATED SQLITE STORAGE WEB WORKER
 * Purpose: Executes wa-sqlite off the main thread for iPadOS OPFS & IndexedDB VFS.
 */

import { WaSqliteStorageAdapter } from '../drivers/waSqliteAdapter.ts';
import { StorageAdapterConfig, SqliteParams, TransactionIsolationLevel } from '../types/storageAdapter.ts';

let adapter: WaSqliteStorageAdapter | null = null;

export interface WorkerRpcRequest {
  id: string;
  action: 'init' | 'close' | 'execute' | 'query' | 'healthCheck' | 'flush';
  config?: StorageAdapterConfig;
  sql?: string;
  params?: SqliteParams;
  isolation?: TransactionIsolationLevel;
}

export interface WorkerRpcResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
}

self.onmessage = async (event: MessageEvent<WorkerRpcRequest>) => {
  const req = event.data;
  try {
    switch (req.action) {
      case 'init': {
        adapter = new WaSqliteStorageAdapter(req.config || {});
        await adapter.initialize();
        self.postMessage({ id: req.id, success: true, result: { driverId: adapter.driverId } });
        break;
      }
      case 'close': {
        if (adapter) {
          await adapter.close();
          adapter = null;
        }
        self.postMessage({ id: req.id, success: true });
        break;
      }
      case 'execute': {
        if (!adapter) throw new Error('Worker adapter not initialized');
        const res = await adapter.execute(req.sql!, req.params);
        self.postMessage({ id: req.id, success: true, result: res });
        break;
      }
      case 'query': {
        if (!adapter) throw new Error('Worker adapter not initialized');
        const res = await adapter.query(req.sql!, req.params);
        self.postMessage({ id: req.id, success: true, result: res });
        break;
      }
      case 'flush': {
        if (!adapter) throw new Error('Worker adapter not initialized');
        await adapter.flushToDurableStorage();
        self.postMessage({ id: req.id, success: true });
        break;
      }
      case 'healthCheck': {
        if (!adapter) throw new Error('Worker adapter not initialized');
        const res = await adapter.healthCheck();
        self.postMessage({ id: req.id, success: true, result: res });
        break;
      }
      default:
        throw new Error(`Unknown worker RPC action: ${(req as any).action}`);
    }
  } catch (err: unknown) {
    self.postMessage({
      id: req.id,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
