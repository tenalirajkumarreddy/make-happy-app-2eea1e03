import { useState, useEffect, useCallback } from "react";
import { getQueuedActions, removeFromQueue, getQueueCount } from "@/lib/offlineQueue";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logError } from "@/lib/logger";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleQueueChanged = () => {
      getQueueCount().then(setPendingCount).catch((err) => {
        logError(err, { context: "useOnlineStatus.handleQueueChanged" });
      });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offline-queue-changed", handleQueueChanged);
    // Load initial pending count
    getQueueCount().then(setPendingCount).catch((err) => {
      logError(err, { context: "useOnlineStatus.initialLoad" });
    });
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("offline-queue-changed", handleQueueChanged);
    };
  }, []);

  const refreshCount = useCallback(async () => {
    const count = await getQueueCount();
    setPendingCount(count);
  }, []);

  const syncQueue = useCallback(async () => {
    if (syncing || !navigator.onLine) return;
    setSyncing(true);
    const actions = await getQueuedActions();
    let synced = 0;
    let failed = 0;

    for (const action of actions) {
      try {
        if (action.type === "sale") {
          const { saleData, saleItems } = action.payload;
          const { data: displayId } = await supabase.rpc("generate_display_id", { prefix: "SALE", seq_name: "sale_display_seq" });
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
        } else if (action.type === "transaction") {
          const { txData } = action.payload;
          const { data: displayId } = await supabase.rpc("generate_display_id", { prefix: "PAY", seq_name: "pay_display_seq" });
          const { error } = await supabase.from("transactions").insert({ ...txData, display_id: displayId });
          if (error) throw error;
          // DB trigger trg_transactions_recalc_outstanding handles store.outstanding update automatically
        } else if (action.type === "visit") {
          const { userId, storeId, lat, lng } = action.payload;
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
        } else if (action.type === "customer") {
          const { customerData } = action.payload as {
            customerData: {
              name: string;
              phone?: string | null;
              email?: string | null;
              address?: string | null;
              photo_url?: string | null;
            };
          };
          const { data: displayId } = await supabase.rpc("generate_display_id", {
            prefix: "CUST",
            seq_name: "customer_display_seq",
          });

          const { error } = await supabase.from("customers").insert({
            display_id: String(displayId),
            name: customerData.name,
            phone: customerData.phone ?? null,
            email: customerData.email ?? null,
            address: customerData.address ?? null,
            photo_url: customerData.photo_url ?? null,
          });
          if (error) throw error;
        }
        await removeFromQueue(action.id);
        synced++;
      } catch (err) {
        logError(err, { context: "useOnlineStatus.syncQueue", actionType: action.type, actionId: action.id });
        failed++;
      }
    }

    setSyncing(false);
    await refreshCount();

    if (synced > 0) toast.success(`Synced ${synced} offline action(s)`);
    if (failed > 0) toast.error(`${failed} action(s) failed to sync`);
  }, [syncing, refreshCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncQueue();
    }
  }, [isOnline, pendingCount, syncQueue]);

  return { isOnline, pendingCount, syncing, syncQueue, refreshCount };
}
