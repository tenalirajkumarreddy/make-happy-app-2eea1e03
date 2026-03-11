import { useState, useEffect, useCallback } from "react";
import { getQueuedActions, removeFromQueue, getQueueCount } from "@/lib/offlineQueue";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    // Load initial pending count
    getQueueCount().then(setPendingCount).catch(() => {});
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
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
        }
        await removeFromQueue(action.id);
        synced++;
      } catch {
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
