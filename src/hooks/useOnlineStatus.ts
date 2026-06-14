import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getQueuedActions,
  removeFromQueue,
  getQueueCount,
  getQueuedFileUploads,
  removeFileUpload,
  markFileUploadFailed,
  getFileUploadCount,
  arrayBufferToBlob,
  PendingFileUpload,
  getConflictedActions,
  getRetryableActionsOrdered,
  storeConflict,
} from "@/lib/offlineQueue";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logError } from "@/lib/logger";
import { detectConflicts, ConflictType } from "@/lib/conflictResolver";
import { validateActionPermission, getUserRole } from "@/lib/permissionCheck";
import { afterTransactionSaved, afterPaymentReturned } from "@/lib/mutationHelpers";

export function useOnlineStatus() {
  const qc = useQueryClient();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncStartRef = useRef(0);
  const [conflictCount, setConflictCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleQueueChanged = async () => {
      try {
        const [actionCount, fileCount, conflictedActions] = await Promise.all([
          getQueueCount(),
          getFileUploadCount(),
          getConflictedActions(),
        ]);
        setPendingCount(actionCount + fileCount);
        setConflictCount(conflictedActions.length);
      } catch (err) {
        logError(String(err), { context: "useOnlineStatus.handleQueueChanged" });
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offline-queue-changed", handleQueueChanged);
    // Load initial pending count
    handleQueueChanged();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("offline-queue-changed", handleQueueChanged);
    };
  }, []);

  const refreshCount = useCallback(async () => {
    const [actionCount, fileCount] = await Promise.all([
      getQueueCount(),
      getFileUploadCount(),
    ]);
    setPendingCount(actionCount + fileCount);
  }, []);

  /**
   * Sync queued file uploads
   */
  const syncFileUploads = useCallback(async (): Promise<{ synced: number; failed: number }> => {
    const files = await getQueuedFileUploads();
    let synced = 0;
    let failed = 0;
    const db: any = supabase;

    for (const file of files) {
      try {
        const blob = arrayBufferToBlob(file.fileData, file.contentType);
        
        const { error: uploadErr } = await supabase.storage
          .from(file.bucket)
          .upload(file.path, blob, { upsert: true });

        if (uploadErr) throw uploadErr;

        // For KYC uploads, update the customer record
        if (file.type === "kyc" && file.metadata?.customerId && file.metadata?.field) {
          const customerId = String(file.metadata.customerId ?? "");
          const { data: urlData } = supabase.storage.from(file.bucket).getPublicUrl(file.path);
          const field = file.metadata.field as string;
          
          // Get current KYC status to determine if we should mark as pending
          const { data: customer } = await db
            .from("customers")
            .select("kyc_selfie_url, kyc_aadhar_front_url, kyc_aadhar_back_url")
            .eq("id", customerId)
            .maybeSingle();

          const updated: any = { [field]: urlData.publicUrl };
          
          if (customer) {
            const current = {
              kyc_selfie_url: customer.kyc_selfie_url,
              kyc_aadhar_front_url: customer.kyc_aadhar_front_url,
              kyc_aadhar_back_url: customer.kyc_aadhar_back_url,
              [field]: urlData.publicUrl,
            };

            if (current.kyc_selfie_url && current.kyc_aadhar_front_url && current.kyc_aadhar_back_url) {
              updated.kyc_status = "pending";
              updated.kyc_submitted_at = new Date().toISOString();
            }
          }

           const { error: dbErr } = await supabase
             .from("customers")
             .update(updated)
             .eq("id", customerId);
            
          if (dbErr) throw dbErr;
        }

        await removeFileUpload(file.id);
        synced++;
      } catch (err: any) {
        logError(err, { context: "useOnlineStatus.syncFileUploads", fileId: file.id, fileType: file.type });
        const shouldRetry = await markFileUploadFailed(file.id, err.message || "Unknown error");
        if (!shouldRetry) {
          logError(`File upload ${file.id} exceeded max retries`, { 
            context: "useOnlineStatus.syncFileUploads.maxRetries" 
          });
        }
        failed++;
      }
    }

    return { synced, failed };
  }, []);

  const syncQueue = useCallback(async () => {
    // Auto-release stale sync guard after 2 minutes (prevents permanent lock)
    if (syncing && Date.now() - syncStartRef.current > 120000) {
      setSyncing(false);
    }
    if (syncing || !navigator.onLine) return;
    setSyncing(true);
    syncStartRef.current = Date.now();

    let totalSynced = 0;
    let totalFailed = 0;
    let totalConflicts = 0;

    const db: any = supabase;

    // Sync file uploads first
    const fileResult = await syncFileUploads();
    totalSynced += fileResult.synced;
    totalFailed += fileResult.failed;

    // Get actions ordered by createdAt (FCFS), excluding those with conflicts
    const actions = await getRetryableActionsOrdered();
    const conflicted = await getConflictedActions();
    const conflictIds = new Set(conflicted.map(a => a.id));
    const filteredActions = actions.filter(a => !conflictIds.has(a.id));

    for (const action of filteredActions) {
      try {
        // Validate user permission before executing the action
        let userIdToCheck: string | null = null;

        // Extract user ID based on action type
        if (action.type === "sale") {
          const { saleData } = action.payload as { saleData: { recorded_by: string } };
          userIdToCheck = saleData?.recorded_by;
        } else if (action.type === "transaction") {
          const { txData } = action.payload as { txData: { recorded_by: string } };
          userIdToCheck = txData?.recorded_by;
        } else if (action.type === "visit") {
          const { userId } = action.payload as { userId: string };
          userIdToCheck = userId;
        } else if (action.type === "customer") {
          // For customer creation, check if user still has permission
          const { customerData } = action.payload as { customerData: Record<string, unknown> };
          // Use current authenticated user if not specified
          const { data: { user } } = await supabase.auth.getUser();
          userIdToCheck = user?.id ?? null;
        } else if (action.type === "store") {
          // For store creation, check current user
          const { data: { user } } = await supabase.auth.getUser();
          userIdToCheck = user?.id ?? null;
        } else if (action.type === "order") {
          const { data: { user } } = await supabase.auth.getUser();
          userIdToCheck = user?.id ?? null;
        } else if (action.type === "transaction_edit" || action.type === "payment_return") {
          const { recordedBy } = action.payload as any;
          userIdToCheck = recordedBy;
        }

        // Validate permission before proceeding
        if (userIdToCheck) {
          const permissionCheck = await validateActionPermission(userIdToCheck, action.type as any);
          if (!permissionCheck.allowed) {
            throw new Error(`Permission denied: ${permissionCheck.reason}`);
          }
        }

        if (action.type === "sale") {
          const { saleData, saleItems } = action.payload as any;
          const { data: displayId } = await supabase.rpc("generate_display_id", { prefix: "SALE", seq_name: "sale_display_seq" }) as any;
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
            p_expected_outstanding: saleData.old_outstanding ?? null,
            p_sale_items: saleItems,
            p_created_at: saleData.created_at ?? null,
          }) as any;
          if (error) throw error;
        } else if (action.type === "transaction") {
          const { txData } = action.payload as any;
          const { data: displayId } = await supabase.rpc("generate_display_id", { prefix: "PAY", seq_name: "pay_display_seq" }) as any;
           // Use atomic RPC — server computes outstanding, locks store row
           const { error } = await supabase.rpc("record_transaction", {
            p_display_id: displayId,
            p_store_id: txData.store_id,
            p_customer_id: txData.customer_id,
            p_recorded_by: txData.recorded_by,
            p_logged_by: txData.logged_by ?? null,
            p_cash_amount: txData.cash_amount,
            p_upi_amount: txData.upi_amount,
            p_notes: txData.notes ?? null,
            p_created_at: txData.created_at ?? null,
          }) as any;
          if (error) throw error;
        } else if (action.type === "visit") {
          const { userId, storeId, lat, lng } = action.payload as any;
          const { data: session, error: sessionError } = await supabase
            .from("route_sessions")
            .select("id")
            .eq("user_id", userId)
            .eq("status", "active")
            .maybeSingle();
          if (sessionError) throw sessionError;
          if (!session?.id) throw new Error("No active route session available for queued visit");

          const { error } = await supabase.from("store_visits").insert({
            session_id: session.id,
            store_id: storeId,
            lat: lat ?? null,
            lng: lng ?? null,
          });
          if (error) throw error;
        } else if (action.type === "transaction_edit") {
          const { txnId, cashAmount, upiAmount, notes } = action.payload as any;
          const { error } = await (supabase as any).rpc("update_transaction", {
            p_transaction_id: txnId,
            p_cash_amount: cashAmount,
            p_upi_amount: upiAmount,
            p_notes: notes ?? null,
          });
          if (error) throw error;
        } else if (action.type === "payment_return") {
          const { displayId, originalTransactionId, storeId, customerId, recordedBy, loggedBy, returnAmount, returnType, reason, notes } = action.payload as any;
          const { error } = await (supabase as any).rpc("record_payment_return", {
            p_display_id: displayId,
            p_original_transaction_id: originalTransactionId,
            p_store_id: storeId,
            p_customer_id: customerId,
            p_recorded_by: recordedBy,
            p_logged_by: loggedBy ?? null,
            p_return_amount: returnAmount,
            p_return_type: returnType,
            p_reason: reason,
            p_notes: notes ?? null,
          });
          if (error) throw error;
        } else if (action.type === "customer") {
          const { customerData } = action.payload as {
            customerData: {
              name: string;
              phone?: string | null;
              email?: string | null;
              address?: string | null;
              photo_url?: string | null;
              warehouse_id?: string | null;
            };
          };
          const { data: displayId } = await supabase.rpc("generate_display_id", {
            prefix: "CUST",
            seq_name: "customer_display_seq",
          }) as any;

          const { error } = await (supabase.from("customers").insert({
            display_id: String(displayId),
            name: customerData.name,
            phone: customerData.phone ?? null,
            email: customerData.email ?? null,
            address: customerData.address ?? null,
            photo_url: customerData.photo_url ?? null,
            warehouse_id: customerData.warehouse_id ?? null,
          } as any));
          if (error) throw error;
        } else if (action.type === "order") {
          const { store_id, customer_id, order_type, requirement_note, order_items, assigned_to, is_urgent } = action.payload as any;
          const { data: order, error: orderError } = await supabase.rpc("create_order", {
            p_store_id: store_id,
            p_customer_id: customer_id || null,
            p_assigned_to: assigned_to || null,
            p_warehouse_id: null,
            p_order_type: order_type || "simple",
            p_requirement_note: requirement_note || null,
            p_total_amount: 0,
            p_created_by: userIdToCheck,
            p_is_urgent: is_urgent ?? false,
          }) as any;
          if (orderError) throw orderError;
          if (order_type === "detailed" && order_items?.length > 0) {
            const orderId = order?.[0]?.order_id;
            if (orderId) {
              const { error: itemsError } = await supabase.from("order_items").insert(
                order_items.map((item: any) => ({
                  order_id: orderId,
                  product_id: item.product_id,
                  quantity: item.quantity,
                }))
              );
              if (itemsError) throw itemsError;
            }
          }
        } else if (action.type === "store") {
          const { storeData } = action.payload as {
            storeData: {
              id?: string;
              name: string;
              customer_id?: string | null;
              store_type_id?: string | null;
              route_id?: string | null;
              phone?: string | null;
              address?: string | null;
              lat?: number | null;
              lng?: number | null;
              created_at?: string;
              is_active?: boolean;
              warehouse_id?: string | null;
            };
          };

          const { data: displayId } = await supabase.rpc("generate_display_id", {
            prefix: "STR",
            seq_name: "str_display_seq",
          }) as any;

           const { error } = await (supabase as any).from("stores").insert({
             ...storeData,
             display_id: String(displayId),
             warehouse_id: storeData.warehouse_id ?? null,
           });
          if (error) throw error;
        }
      if (action.type === "transaction") afterTransactionSaved(qc);
      if (action.type === "payment_return") afterPaymentReturned(qc);
      try {
        await removeFromQueue(action.id);
      } catch (removeErr) {
        logError("Failed to remove synced action from queue", removeErr, { context: "useOnlineStatus.syncQueue.removeFromQueue", actionId: action.id, actionType: action.type });
      }
      totalSynced++;
      } catch (err: any) {
        logError("Sync queue error", err, { context: "useOnlineStatus.syncQueue", actionType: action.type, actionId: action.id });

        // Check if this is a permission error
        const errorMessage = err?.message || "";
        const isPermissionError =
          errorMessage.includes("Permission denied") ||
          errorMessage.includes("permission") ||
          errorMessage.includes("unauthorized");

        if (isPermissionError) {
          // Permission errors are non-retryable — user's permissions won't change mid-sync
          await removeFromQueue(action.id);
          logError("Permission denied for action " + action.id, new Error(errorMessage), {
            context: "useOnlineStatus.syncQueue.permissionDenied",
            actionType: action.type,
          });
          toast.error(`Cannot sync ${action.type}: ${errorMessage}`);
          totalFailed++;
          continue;
        }

        // Check if this is a conflict error
        const isConflict =
          errorMessage.includes("credit limit") ||
          errorMessage.includes("price changed") ||
          errorMessage.includes("inactive") ||
          errorMessage.includes("unavailable") ||
          errorMessage.includes("insufficient stock");

        if (isConflict && action.context) {
          // Detect and store conflict
          try {
            const conflicts = await detectConflicts(action);
            if (conflicts.length > 0) {
              for (const conflict of conflicts) {
                await storeConflict(action.id, {
                  conflictType: conflict.type as any,
                  severity: conflict.severity,
                  reason: conflict.reason,
                  currentValue: conflict.currentState.storeOutstanding,
                  queuedValue: conflict.queuedState.storeOutstandingAtQueueTime,
                  detectedAt: new Date().toISOString(),
                  resolved: false,
                } as any);
              }
              totalConflicts++;
              toast.warning(`Conflict detected for ${action.type}: ${conflicts[0].reason}`);
            } else {
              totalFailed++;
            }
          } catch (conflictErr) {
            totalFailed++;
          }
        } else {
          totalFailed++;
        }
      }
  }

  setSyncing(false);
  await refreshCount();

  if (totalSynced > 0) toast.success(`Synced ${totalSynced} offline item(s)`);
  if (totalFailed > 0) toast.error(`${totalFailed} item(s) failed to sync`);
  if (totalConflicts > 0) {
    toast.warning(`${totalConflicts} item(s) have conflicts - resolve in Conflicts panel`, {
      action: {
        label: "View",
        onClick: () => {
          // Navigate to conflicts or show conflict resolver
          window.dispatchEvent(new CustomEvent("show-conflict-resolver"));
        },
      },
    });
  }
}, [syncing, qc, refreshCount, syncFileUploads]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncQueue();
    }
  }, [isOnline, pendingCount, syncQueue]);

  return { isOnline, pendingCount, syncing, conflictCount, syncQueue, refreshCount };
}
