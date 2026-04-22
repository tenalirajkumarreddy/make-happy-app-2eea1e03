/**
 * Mobile Offline Queue System
 * Optimized for Capacitor/Cordova mobile apps with IndexedDB
 */

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logError } from "@/lib/logger";

const DB_NAME = "AquaPrimeMobileDB";
const DB_VERSION = 1;
const ACTIONS_STORE = "pending_actions";
const FILES_STORE = "pending_files";
const CONFLICT_STORE = "conflicts";
const MAX_RETRIES = 5;
const RETRY_DELAY_BASE = 2000; // 2 seconds base delay

export type PendingActionType = "sale" | "transaction" | "visit" | "customer" | "store" | "file_upload";

export interface PendingAction {
  id: string;
  type: PendingActionType;
  payload: any;
  createdAt: string;
  retryCount?: number;
  lastError?: string;
  businessKey?: string;
  context?: {
    creditLimit?: number;
    currentOutstanding?: number;
    storeId?: string;
    cached?: boolean;
  };
}

interface PendingFileUpload {
  id: string;
  type: "file_upload";
  payload: {
    fileData: ArrayBuffer;
    fileName: string;
    contentType: string;
    path: string;
    metadata?: Record<string, any>;
  };
  createdAt: string;
}

let db: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (db) return db;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      if (!database.objectStoreNames.contains(ACTIONS_STORE)) {
        const actionsStore = database.createObjectStore(ACTIONS_STORE, { keyPath: "id" });
        actionsStore.createIndex("type", "type", { unique: false });
        actionsStore.createIndex("createdAt", "createdAt", { unique: false });
        actionsStore.createIndex("businessKey", "businessKey", { unique: false });
      }
      
      if (!database.objectStoreNames.contains(FILES_STORE)) {
        const filesStore = database.createObjectStore(FILES_STORE, { keyPath: "id" });
        filesStore.createIndex("type", "type", { unique: false });
      }
      
      if (!database.objectStoreNames.contains(CONFLICT_STORE)) {
        const conflictStore = database.createObjectStore(CONFLICT_STORE, { keyPath: "actionId" });
        conflictStore.createIndex("resolved", "resolved", { unique: false });
      }
    };
  });
}

function emitQueueChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("offline-queue-changed"));
  }
}

export async function getQueueCount(): Promise<number> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(ACTIONS_STORE, "readonly");
    const countReq = tx.objectStore(ACTIONS_STORE).count();
    countReq.onsuccess = () => resolve(countReq.result);
    countReq.onerror = () => reject(countReq.error);
  });
}

export async function getQueuedActions(): Promise<PendingAction[]> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(ACTIONS_STORE, "readonly");
    const req = tx.objectStore(ACTIONS_STORE).getAll();
    req.onsuccess = () => {
      const actions = req.result || [];
      // Sort by creation time (oldest first)
      resolve(actions.sort((a: PendingAction, b: PendingAction) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function isBusinessKeyQueued(businessKey: string): Promise<boolean> {
  if (!businessKey) return false;
  
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(ACTIONS_STORE, "readonly");
    const store = tx.objectStore(ACTIONS_STORE);
    const index = store.index("businessKey");
    const request = index.get(businessKey);
    
    request.onsuccess = () => resolve(!!request.result);
    request.onerror = () => reject(request.error);
  });
}

export function generateBusinessKey(
  type: PendingActionType,
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
  
  if (type === "sale" && params.products?.length) {
    const productSig = params.products
      .map((p) => `${p.product_id}:${p.quantity}`)
      .sort()
      .join(",");
    parts.push(productSig);
  }
  
  // Millisecond precision with random salt for uniqueness
  const ts = params.timestamp || Date.now();
  const timestampMs = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const salt = Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  parts.push(`${timestampMs}-${salt}`);
  
  return parts.join(":");
}

export async function addToQueue(action: Omit<PendingAction, "id" | "createdAt">): Promise<void> {
  const database = await openDB();
  
  // Check for duplicates
  if (action.businessKey) {
    const exists = await isBusinessKeyQueued(action.businessKey);
    if (exists) {
      toast.warning("This action is already pending sync");
      return;
    }
  }
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(ACTIONS_STORE, "readwrite");
    const store = tx.objectStore(ACTIONS_STORE);
    
    const fullAction: PendingAction = {
      ...action,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };
    
    const req = store.put(fullAction);
    req.onsuccess = () => {
      emitQueueChanged();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removeFromQueue(id: string): Promise<void> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(ACTIONS_STORE, "readwrite");
    const req = tx.objectStore(ACTIONS_STORE).delete(id);
    req.onsuccess = () => {
      emitQueueChanged();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function markActionFailed(id: string, error: string): Promise<boolean> {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(ACTIONS_STORE, "readwrite");
    const store = tx.objectStore(ACTIONS_STORE);
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
        store.delete(id);
        logError(new Error(`Action ${id} failed after ${MAX_RETRIES} retries`), {
          context: "offlineQueue",
          actionType: action.type,
        });
      } else {
        store.put({
          ...action,
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
 * Sync all queued actions when online
 */
export async function syncQueue(
  onProgress?: (completed: number, total: number) => void
): Promise<{ success: number; failed: number; conflicts: number }> {
  const actions = await getQueuedActions();
  const total = actions.length;
  
  if (total === 0) {
    return { success: 0, failed: 0, conflicts: 0 };
  }
  
  let success = 0;
  let failed = 0;
  let conflicts = 0;
  
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    
    try {
      await syncAction(action);
      await removeFromQueue(action.id);
      success++;
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      
      // Check if this is a permission error - should not retry
      if (
        errorMessage.includes("Permission denied") ||
        errorMessage.includes("permission") ||
        errorMessage.includes("unauthorized")
      ) {
        await markActionFailed(action.id, errorMessage);
        failed++;
        continue;
      }
      
      // Check for conflicts
      if (
        errorMessage.includes("credit limit") ||
        errorMessage.includes("price changed") ||
        errorMessage.includes("insufficient stock")
      ) {
        await storeConflict(action.id, {
          type: "business_rule",
          message: errorMessage,
          detectedAt: new Date().toISOString(),
        });
        conflicts++;
        continue;
      }
      
      // For other errors, increment retry count
      const shouldRetry = await markActionFailed(action.id, errorMessage);
      if (!shouldRetry) {
        failed++;
      }
    }
    
    onProgress?.(i + 1, total);
  }
  
  return { success, failed, conflicts };
}

async function syncAction(action: PendingAction): Promise<void> {
  // Extract user ID for permission check
  let userIdToCheck: string | null = null;
  
  if (action.type === "sale") {
    userIdToCheck = action.payload?.saleData?.recorded_by;
  } else if (action.type === "transaction") {
    userIdToCheck = action.payload?.txData?.recorded_by;
  } else if (action.type === "visit") {
    userIdToCheck = action.payload?.userId;
  }
  
  // Validate permission before executing
  if (userIdToCheck) {
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userIdToCheck)
      .maybeSingle();
    
    if (!userRoles) {
      throw new Error("Permission denied: User account is inactive or banned");
    }
  }
  
  // Execute based on action type
  switch (action.type) {
    case "sale":
      await syncSale(action.payload);
      break;
    case "transaction":
      await syncTransaction(action.payload);
      break;
    case "visit":
      await syncVisit(action.payload);
      break;
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

async function syncSale(payload: any): Promise<void> {
  const { saleData, saleItems } = payload;
  
  const { data: displayId, error: displayError } = await supabase.rpc(
    "generate_display_id",
    { prefix: "SALE", seq_name: "sale_display_seq" }
  );
  
  if (displayError) throw displayError;
  
  const { error } = await supabase.rpc("record_sale", {
    p_display_id: displayId,
    p_store_id: saleData.store_id,
    p_customer_id: saleData.customer_id,
    p_recorded_by: saleData.recorded_by,
    p_logged_by: saleData.logged_by ?? null,
    p_total_amount: saleData.total_amount,
    p_cash_amount: saleData.cash_amount,
    p_upi_amount: saleData.upi_amount,
    p_outstanding_amount: saleData.outstanding_amount,
    p_sale_items: saleItems,
    p_created_at: saleData.created_at ?? null,
  });
  
  if (error) throw error;
}

async function syncTransaction(payload: any): Promise<void> {
  const { txData } = payload;
  
  const { data: displayId, error: displayError } = await supabase.rpc(
    "generate_display_id",
    { prefix: "PAY", seq_name: "pay_display_seq" }
  );
  
  if (displayError) throw displayError;
  
  const { error } = await supabase.rpc("record_transaction", {
    p_display_id: displayId,
    p_store_id: txData.store_id,
    p_customer_id: txData.customer_id,
    p_recorded_by: txData.recorded_by,
    p_logged_by: txData.logged_by ?? null,
    p_cash_amount: txData.cash_amount,
    p_upi_amount: txData.upi_amount,
    p_notes: txData.notes,
    p_created_at: txData.created_at ?? null,
  });
  
  if (error) throw error;
}

async function syncVisit(payload: any): Promise<void> {
  // Store visit sync implementation
  const { error } = await supabase.from("store_visits").insert({
    store_id: payload.storeId,
    session_id: payload.sessionId,
    user_id: payload.userId,
    notes: payload.notes,
    lat: payload.lat,
    lng: payload.lng,
  });
  
  if (error) throw error;
}

async function storeConflict(actionId: string, conflictData: any): Promise<void> {
  const database = await openDB();
  const tx = database.transaction(CONFLICT_STORE, "readwrite");
  const store = tx.objectStore(CONFLICT_STORE);
  
  await new Promise<void>((resolve, reject) => {
    const req = store.put({
      actionId,
      ...conflictData,
      resolved: false,
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Auto-sync when online
if (typeof window !== "undefined") {
  window.addEventListener("online", async () => {
    const count = await getQueueCount();
    if (count > 0) {
      toast.info(`Syncing ${count} pending actions...`);
      const result = await syncQueue();
      if (result.success > 0) {
        toast.success(`Synced ${result.success} actions`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} actions failed`);
      }
      if (result.conflicts > 0) {
        toast.warning(`${result.conflicts} conflicts need resolution`);
      }
    }
  });
}

export default {
  addToQueue,
  getQueueCount,
  getQueuedActions,
  syncQueue,
  removeFromQueue,
  generateBusinessKey,
  isBusinessKeyQueued,
};
