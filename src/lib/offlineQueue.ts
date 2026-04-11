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
 * Check if action already exists in queue (deduplication)
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
 * Add action to queue with deduplication
 */
export async function addToQueue(action: PendingAction): Promise<void> {
  // Validate required fields
  if (!action.id || !action.type || action.payload === undefined) {
    throw new Error("Invalid action: missing required fields (id, type, payload)");
  }

  // Check for duplicate
  const exists = await isActionQueued(action.id);
  if (exists) {
    console.warn(`Action ${action.id} already queued, skipping duplicate`);
    return;
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
