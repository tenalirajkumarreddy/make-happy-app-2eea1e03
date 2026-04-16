import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface ReturnRequest {
  id: string;
  display_id: string;
  status: string;
  return_reason: string;
  custom_reason?: string;
  requested_items_count: number;
  approved_items_count: number;
  total_requested_value: number;
  total_approved_value: number;
  submitted_at: string;
  reviewed_at?: string;
  completed_at?: string;
  staff_notes?: string;
  reviewer_notes?: string;
  warehouse?: {
    id: string;
    name: string;
  };
}

export interface ReturnItem {
  id: string;
  product_id: string;
  requested_quantity: number;
  approved_quantity: number;
  damaged_quantity: number;
  unit_price: number;
  item_status: string;
  staff_notes?: string;
  reviewer_notes?: string;
  product?: {
    id: string;
    name: string;
    sku: string;
  };
}

export function useMyReturns(status?: string) {
  const { user } = useAuth();

  const { data: returns, isLoading } = useQuery({
    queryKey: ["my-return-requests", user?.id, status],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase.rpc("get_my_return_requests", {
        p_staff_id: user.id,
        p_status: status || null,
        p_limit: 50,
      });

      if (error) throw error;
      return (data || []) as ReturnRequest[];
    },
    enabled: !!user?.id,
  });

  return { returns, isLoading };
}

export function usePendingReturns(warehouseId?: string) {
  const { data: pendingReturns, isLoading } = useQuery({
    queryKey: ["pending-returns", warehouseId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_pending_returns", {
        p_warehouse_id: warehouseId || null,
        p_limit: 50,
      });

      if (error) throw error;
      return (data || []) as any[];
    },
  });

  return { pendingReturns, isLoading };
}

export function useReturnDetails(returnId?: string) {
  const { data: returnDetails, isLoading } = useQuery({
    queryKey: ["return-details", returnId],
    queryFn: async () => {
      if (!returnId) return null;

      const { data: request, error: reqError } = await supabase
        .from("stock_return_requests")
        .select(`
          *,
          staff:auth.users!stock_return_requests_staff_id_fkey(id, raw_user_meta_data->>'full_name'),
          reviewer:auth.users!stock_return_requests_reviewed_by_fkey(id, raw_user_meta_data->>'full_name'),
          warehouse:warehouses(id, name)
        `)
        .eq("id", returnId)
        .single();

      if (reqError) throw reqError;

      const { data: items, error: itemsError } = await supabase
        .from("stock_return_items")
        .select("*, product:products(id, name, sku)")
        .eq("return_request_id", returnId);

      if (itemsError) throw itemsError;

      const { data: approvals, error: appError } = await supabase
        .from("stock_return_approvals")
        .select("*, approver:auth.users(id, raw_user_meta_data->>'full_name')")
        .eq("return_request_id", returnId)
        .order("created_at", { ascending: true });

      if (appError) throw appError;

      return {
        request,
        items: items || [],
        approvals: approvals || [],
      };
    },
    enabled: !!returnId,
  });

  return { returnDetails, isLoading };
}

export function useSubmitReturn() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const submit = useMutation({
    mutationFn: async ({
      warehouseId,
      reason,
      customReason,
      items,
    }: {
      warehouseId: string;
      reason: string;
      customReason?: string;
      items: { product_id: string; quantity: number; notes?: string }[];
    }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("submit_stock_return", {
        p_staff_id: user.id,
        p_warehouse_id: warehouseId,
        p_return_reason: reason,
        p_custom_reason: customReason,
        p_items: items,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-return-requests"] });
      queryClient.invalidateQueries({ queryKey: ["pending-returns"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stock"] });
    },
  });

  return submit;
}

export function useReviewReturn() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const review = useMutation({
    mutationFn: async ({
      returnId,
      action,
      itemDecisions,
      overallNotes,
    }: {
      returnId: string;
      action: "approve" | "reject";
      itemDecisions: {
        item_id: string;
        decision: string;
        approved_quantity: number;
        damaged_quantity: number;
        notes?: string;
      }[];
      overallNotes?: string;
    }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("review_stock_return", {
        p_return_id: returnId,
        p_reviewer_id: user.id,
        p_action: action,
        p_item_decisions: itemDecisions,
        p_overall_notes: overallNotes,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-returns"] });
      queryClient.invalidateQueries({ queryKey: ["my-reviewed-returns"] });
      queryClient.invalidateQueries({ queryKey: ["return-details"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stock"] });
    },
  });

  return review;
}

export function useCancelReturn() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const cancel = useMutation({
    mutationFn: async (returnId: string) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("cancel_stock_return", {
        p_return_id: returnId,
        p_staff_id: user.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-return-requests"] });
      queryClient.invalidateQueries({ queryKey: ["pending-returns"] });
    },
  });

  return cancel;
}

export function useReturnStats(warehouseId?: string) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["return-stats", warehouseId],
    queryFn: async () => {
      let query = supabase
        .from("stock_return_requests")
        .select("status, total_requested_value, total_approved_value", { count: "exact" });

      if (warehouseId) {
        query = query.eq("warehouse_id", warehouseId);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const stats = {
        total: count || 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        completed: 0,
        totalValue: 0,
        approvedValue: 0,
      };

      data?.forEach((r: any) => {
        stats.totalValue += r.total_requested_value || 0;
        stats.approvedValue += r.total_approved_value || 0;

        if (r.status === "pending" || r.status === "review") {
          stats.pending++;
        } else if (["approved", "partial", "damaged"].includes(r.status)) {
          stats.approved++;
        } else if (r.status === "rejected") {
          stats.rejected++;
        } else if (r.status === "completed") {
          stats.completed++;
        }
      });

      return stats;
    },
  });

  return { stats, isLoading };
}
