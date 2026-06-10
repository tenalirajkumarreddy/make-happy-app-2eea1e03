import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { afterSaleCancelled } from "@/lib/mutationHelpers";
import { toast } from "sonner";

export function useCancelSale() {
  const qc = useQueryClient();
  const [cancelSale, setCancelSale] = useState<any | null>(null);
  const [cancelRestockTarget, setCancelRestockTarget] = useState<"warehouse" | "agent">("agent");
  const [cancelSelectedAgentId, setCancelSelectedAgentId] = useState("");

  const cancelMutation = useMutation({
    mutationFn: async (saleId: string) => {
      const { error } = await (supabase as any).rpc("admin_cancel_sale", {
        p_sale_id: saleId,
        p_restock_user_id: cancelRestockTarget === "warehouse" ? null : cancelSelectedAgentId,
      });
      if (error) throw error;
    },
    onMutate: async (saleId) => {
      await qc.cancelQueries({ queryKey: ["sales"] });
      const previousQueries = qc.getQueriesData({ queryKey: ["sales"] });
      qc.setQueriesData({ queryKey: ["sales"] }, (old: unknown) => {
        if (!old) return old;
        if (Array.isArray(old)) return old.filter((s: any) => s.id !== saleId);
        return old;
      });
      return { previousQueries };
    },
    onError: (_err, _saleId, context) => {
      context?.previousQueries.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error((_err as any).message || "Failed to cancel sale");
    },
    onSuccess: () => {
      toast.success(`Sale ${cancelSale?.display_id} cancelled. Stock restored to ${cancelRestockTarget === "warehouse" ? "warehouse" : "agent"}.`);
      setCancelSale(null);
      setCancelRestockTarget("agent");
      setCancelSelectedAgentId("");
    },
    onSettled: () => {
      afterSaleCancelled(qc);
    },
  });

  const handleCancel = async () => {
    if (!cancelSale) return;
    if (cancelRestockTarget === "agent" && !cancelSelectedAgentId) {
      toast.error("Please select an agent to restore stock to");
      return;
    }
    cancelMutation.mutate(cancelSale.id);
  };

  const closeCancel = () => {
    setCancelSale(null);
    setCancelRestockTarget("agent");
    setCancelSelectedAgentId("");
  };

  return {
    cancelSale, setCancelSale, cancelRestockTarget, setCancelRestockTarget,
    cancelSelectedAgentId, setCancelSelectedAgentId,
    isCancellingSale: cancelMutation.isPending,
    handleCancel, closeCancel,
  };
}
