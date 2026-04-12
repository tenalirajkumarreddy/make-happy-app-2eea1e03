/**
 * Offline queue: stores pending sales/transactions in IndexedDB
 * and syncs them when the app comes back online.
 * Includes retry logic, deduplication, and failure tracking.
 */

const DB_NAME = "aquaprime_offline";
const DB_VERSION = 3;
const STORE_NAME = "pending_actions";
const FILE_STORE_NAME = "pending_files";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // Exponential backoff

export interface PendingAction {
  id: string;
  type: "sale" | "transaction" | "visit" | "customer" | "store" | "file_upload";
  payload: unknown;
  createdAt: string;
  retryCount?: number;
  lastError?: string;
  lastAttempt?: string;
  businessKey?: string; // Unique business key for deduplication (e.g., "sale:store123:timestamp:amount")
  context?: OperationContext; // Context captured at queue time for conflict detection
}

// Context for conflict detection
export interface OperationContext {
  storeOutstandingAtQueueTime?: number;
  productPriceAtQueueTime?: number;
  customerCreditLimitAtQueueTime?: number;
  timestampAtQueueTime: string;
  storeId?: string;
  customerId?: string;
  productIds?: string[];
}

// Conflict tracking
export interface ConflictInfo {
  actionId: string;
  conflictType: "credit_exceeded" | "price_changed" | "store_inactive" | "product_unavailable" | "insufficient_stock" | "data_stale" | "none";
  severity: "warning" | "error" | "critical";
  reason: string;
  currentValue?: number | string | boolean;
  queuedValue?: number | string | boolean;
  detectedAt: string;
  resolved: boolean;
  resolution?: "apply_anyway" | "modify_and_apply" | "discard" | "defer";
}

export interface PendingFileUpload {
  id: string;
  type: "kyc" | "entity_photo" | "store_photo";
  fileName: string;
  bucket: string;
  path: string;
  fileData: ArrayBuffer; // Store raw file data
  contentType: string;
  metadata?: Record<string, unknown>; // Additional data like customer_id, field name
  createdAt: string;
  retryCount?: number;
  lastError?: string;
}

function emitQueueChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("offline-queue-changed"));
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      // Create pending_actions store if doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }

      // Create pending_files store for file uploads (v3+)
      if (oldVersion < 3 && !db.objectStoreNames.contains(FILE_STORE_NAME)) {
        const fileStore = db.createObjectStore(FILE_STORE_NAME, { keyPath: "id" });
        fileStore.createIndex("type", "type", { unique: false });
        fileStore.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Check if action already exists in queue (deduplication by ID)
 */
export async function isActionQueued(id: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result !== undefined);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Check if action with same business key already exists (business deduplication)
 * This prevents duplicate sales/transactions from being queued
 */
export async function isBusinessKeyQueued(businessKey: string): Promise<boolean> {
  if (!businessKey) return false;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const actions = req.result as PendingAction[];
      const exists = actions.some(a => a.businessKey === businessKey);
      resolve(exists);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Generate business key for deduplication
 */
export function generateBusinessKey(
  type: PendingAction['type'],
  params: {
    storeId?: string;
    customerId?: string;
    amount?: number;
    timestamp?: string | number;
    products?: Array<{ product_id: string; quantity: number }>;
  }
): string {
  const parts: string[] = [type];

  if (params.storeId) parts.push(params.storeId);
  if (params.customerId) parts.push(params.customerId);
  if (params.amount !== undefined) parts.push(String(Math.round(params.amount * 100) / 100));

  // For sales, include product signature
  if (type === 'sale' && params.products?.length) {
    const productSig = params.products
      .map(p => `${p.product_id}:${p.quantity}`)
      .sort()
      .join(',');
    parts.push(productSig);
  }

  // Include timestamp rounded to minute for grouping similar actions
  const ts = params.timestamp || Date.now();
  const roundedTs = typeof ts === 'string'
    ? new Date(ts).getTime()
    : ts;
  const minuteRounded = Math.floor(roundedTs / 60000) * 60000;
  parts.push(String(minuteRounded));

  return parts.join(':');
}

/**
 * Add action to queue with deduplication
 * Checks both action ID and business key for duplicates
 */
export async function addToQueue(action: PendingAction): Promise<void> {
  // Validate required fields
  if (!action.id || !action.type || action.payload === undefined) {
    throw new Error("Invalid action: missing required fields (id, type, payload)");
  }

  // Check for duplicate by ID
  const existsById = await isActionQueued(action.id);
  if (existsById) {
    console.warn(`Action ${action.id} already queued, skipping duplicate`);
    return;
  }

  // Check for duplicate by business key (if provided)
  if (action.businessKey) {
    const existsByBusinessKey = await isBusinessKeyQueued(action.businessKey);
    if (existsByBusinessKey) {
      console.warn(`Action with business key ${action.businessKey} already queued, skipping duplicate`);
      toast.warning("This action is already pending sync. Please wait for it to complete.");
      return;
    }
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({
      ...action,
      retryCount: 0,
      createdAt: action.createdAt || new Date().toISOString(),
    });
    tx.oncomplete = () => {
      emitQueueChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

// Import toast for warnings in addToQueue
import { toast } from "sonner";

export async function getQueuedActions(): Promise<PendingAction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      emitQueueChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueueCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Mark action as failed and increment retry count
 */
export async function markActionFailed(id: string, error: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const action = getReq.result as PendingAction | undefined;
      if (!action) {
        resolve(false);
        return;
      }

      const retryCount = (action.retryCount || 0) + 1;
      const shouldRemove = retryCount >= MAX_RETRIES;

      if (shouldRemove) {
        // Max retries exceeded - remove from queue
        store.delete(id);
        console.error(`Action ${id} failed after ${MAX_RETRIES} retries, removing from queue`);
      } else {
        // Update retry count and error info
        store.put({
          ...action,
          retryCount,
          lastError: error,
          lastAttempt: new Date().toISOString(),
        });
      }

      tx.oncomplete = () => {
        emitQueueChanged();
        resolve(!shouldRemove); // Return true if we should retry
      };
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Get delay before next retry (exponential backoff)
 */
export function getRetryDelay(retryCount: number): number {
  return RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
}

/**
 * Get actions that are ready to retry (not recently attempted)
 */
export async function getRetryableActions(): Promise<PendingAction[]> {
  const actions = await getQueuedActions();
  const now = Date.now();

  return actions.filter((action) => {
    if (!action.lastAttempt) return true; // Never attempted

    const lastAttempt = new Date(action.lastAttempt).getTime();
    const delay = getRetryDelay(action.retryCount || 0);

    return now - lastAttempt >= delay;
  });
}

/**
 * Get failed actions that have exceeded max retries
 */
export async function getFailedActions(): Promise<PendingAction[]> {
  const actions = await getQueuedActions();
  return actions.filter((action) => (action.retryCount || 0) >= MAX_RETRIES);
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE UPLOAD QUEUE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Queue a file upload for when device comes back online
 */
export async function queueFileUpload(upload: Omit<PendingFileUpload, "createdAt" | "retryCount">): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_NAME, "readwrite");
    tx.objectStore(FILE_STORE_NAME).put({
      ...upload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    });
    tx.oncomplete = () => {
      emitQueueChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all queued file uploads
 */
export async function getQueuedFileUploads(): Promise<PendingFileUpload[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_NAME, "readonly");
    const req = tx.objectStore(FILE_STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Remove a file upload from queue
 */
export async function removeFileUpload(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_NAME, "readwrite");
    tx.objectStore(FILE_STORE_NAME).delete(id);
    tx.oncomplete = () => {
      emitQueueChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get count of queued file uploads
 */
export async function getFileUploadCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_NAME, "readonly");
    const req = tx.objectStore(FILE_STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Mark file upload as failed and increment retry count
 */
export async function markFileUploadFailed(id: string, error: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_NAME, "readwrite");
    const store = tx.objectStore(FILE_STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const upload = getReq.result as PendingFileUpload | undefined;
      if (!upload) {
        resolve(false);
        return;
      }

      const retryCount = (upload.retryCount || 0) + 1;
      const shouldRemove = retryCount >= MAX_RETRIES;

      if (shouldRemove) {
        store.delete(id);
        console.error(`File upload ${id} failed after ${MAX_RETRIES} retries, removing from queue`);
      } else {
        store.put({
          ...upload,
          retryCount,
          lastError: error,
        });
      }

      tx.oncomplete = () => {
        emitQueueChanged();
        resolve(!shouldRemove);
      };
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Convert File/Blob to ArrayBuffer for storage
 */
export async function fileToArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Convert ArrayBuffer back to Blob for upload
 */
export function arrayBufferToBlob(buffer: ArrayBuffer, contentType: string): Blob {
  return new Blob([buffer], { type: contentType });
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT RESOLUTION FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const CONFLICT_STORE_NAME = "conflict_info";

/**
 * Add action to queue with context tracking for conflict detection
 */
export async function addToQueueWithContext(
  action: PendingAction,
  context: OperationContext
): Promise<void> {
  return addToQueue({
    ...action,
    context,
  });
}

/**
 * Get all actions that have conflicts
 */
export async function getConflictedActions(): Promise<PendingAction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFLICT_STORE_NAME, "readonly");
    const req = tx.objectStore(CONFLICT_STORE_NAME).getAll();
    
    req.onsuccess = () => {
      const conflicts = req.result as ConflictInfo[];
      const conflictIds = new Set(conflicts.map(c => c.actionId));
      
      // Get the actual actions
      const actionTx = db.transaction(STORE_NAME, "readonly");
      const actionReq = actionTx.objectStore(STORE_NAME).getAll();
      
      actionReq.onsuccess = () => {
        const actions = actionReq.result as PendingAction[];
        const conflictedActions = actions.filter(a => conflictIds.has(a.id));
        resolve(conflictedActions);
      };
      
      actionReq.onerror = () => reject(actionReq.error);
    };
    
    req.onerror = () => reject(req.error);
  });
}

/**
 * Store conflict information
 */
export async function storeConflict(
  actionId: string,
  conflict: Omit<ConflictInfo, "actionId" | "detectedAt">
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    // First check if db needs upgrade
    if (!db.objectStoreNames.contains(CONFLICT_STORE_NAME)) {
      // Store will be created on next open, for now log and resolve
      console.warn("Conflict store not yet available, logging conflict for action:", actionId);
      resolve();
      return;
    }
    
    const tx = db.transaction(CONFLICT_STORE_NAME, "readwrite");
    const store = tx.objectStore(CONFLICT_STORE_NAME);
    
    store.put({
      ...conflict,
      actionId,
      detectedAt: new Date().toISOString(),
    });
    
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Resolve a conflict
 */
export async function resolveConflict(
  actionId: string,
  resolution: "apply_anyway" | "modify_and_apply" | "discard" | "defer",
  modifiedPayload?: unknown
): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([CONFLICT_STORE_NAME, STORE_NAME], "readwrite");
    
    // Update conflict info
    if (db.objectStoreNames.contains(CONFLICT_STORE_NAME)) {
      const conflictStore = tx.objectStore(CONFLICT_STORE_NAME);
      conflictStore.put({
        actionId,
        resolved: true,
        resolution,
        resolvedAt: new Date().toISOString(),
      });
    }
    
    // Update action if modified
    if (modifiedPayload && resolution === "modify_and_apply") {
      const actionStore = tx.objectStore(STORE_NAME);
      const getReq = actionStore.get(actionId);
      
      getReq.onsuccess = () => {
        const action = getReq.result as PendingAction | undefined;
        if (action) {
          actionStore.put({
            ...action,
            payload: modifiedPayload,
            retryCount: 0, // Reset retry count
            lastError: undefined,
          });
        }
      };
    }
    
    // If discard, remove from queue
    if (resolution === "discard") {
      const actionStore = tx.objectStore(STORE_NAME);
      actionStore.delete(actionId);
    }
    
    tx.oncomplete = () => {
      emitQueueChanged();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get queue status with conflict summary
 */
export async function getQueueStatus(): Promise<{
  total: number;
  pending: number;
  failed: number;
  conflicts: number;
  readyToSync: number;
}> {
  const [actions, conflicts] = await Promise.all([
    getQueuedActions(),
    getConflictedActions(),
  ]);
  
  const failed = actions.filter(a => (a.retryCount || 0) >= MAX_RETRIES).length;
  const conflictIds = new Set(conflicts.map(c => c.id));
  
  return {
    total: actions.length,
    pending: actions.length - failed - conflictIds.size,
    failed,
    conflicts: conflictIds.size,
    readyToSync: actions.filter(a => 
      (a.retryCount || 0) < MAX_RETRIES && !conflictIds.has(a.id)
    ).length,
  };
}

/**
 * Get retryable actions excluding conflicts
 */
export async function getRetryableActionsExcludingConflicts(): Promise<PendingAction[]> {
  const [allActions, conflictedActions] = await Promise.all([
    getRetryableActions(),
    getConflictedActions(),
  ]);
  
  const conflictIds = new Set(conflictedActions.map(a => a.id));
  return allActions.filter(a => !conflictIds.has(a.id));
}
