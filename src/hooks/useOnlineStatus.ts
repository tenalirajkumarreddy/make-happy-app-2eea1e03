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
          const { saleData, saleItems, storeUpdate } = action.payload;
          const { data: sale, error } = await supabase.from("sales").insert(saleData).select("id").single();
          if (error) throw error;
          const items = saleItems.map((i: any) => ({ ...i, sale_id: sale.id }));
          await supabase.from("sale_items").insert(items);
          await supabase.from("stores").update(storeUpdate).eq("id", saleData.store_id);
        } else if (action.type === "transaction") {
          const { txData, storeUpdate } = action.payload;
          const { error } = await supabase.from("transactions").insert(txData);
          if (error) throw error;
          await supabase.from("stores").update(storeUpdate).eq("id", txData.store_id);
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
