import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Vendor {
  id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  current_balance: number;
  total_purchases: number;
  total_payments: number;
  last_purchase_at?: string;
  last_payment_at?: string;
  credit_limit: number;
  payment_terms: number;
  is_active: boolean;
  created_at?: string;
}

export interface VendorTransaction {
  id: string;
  display_id: string;
  vendor_id: string;
  transaction_type: "purchase" | "payment" | "credit_note" | "debit_note" | "opening_balance";
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_id?: string;
  reference_type?: string;
  description?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  vendor?: Vendor;
  creator?: {
    id: string;
    full_name?: string;
  };
}

interface UseVendorBalanceOptions {
  vendorId?: string;
  enabled?: boolean;
  limit?: number;
}

export function useVendorBalance(options: UseVendorBalanceOptions = {}) {
  const { vendorId, enabled = true, limit = 100 } = options;
  const queryClient = useQueryClient();

  // Query for all vendors with balance info
  const { 
    data: vendors, 
    isLoading: isLoadingVendors, 
    error: vendorsError 
  } = useQuery({
    queryKey: ["vendors-balance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_balance_summary")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return (data || []) as Vendor[];
    },
    enabled,
  });

  // Query for specific vendor
  const { 
    data: vendor, 
    isLoading: isLoadingVendor, 
    error: vendorError 
  } = useQuery({
    queryKey: ["vendor", vendorId],
    queryFn: async () => {
      if (!vendorId) return null;

      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("id", vendorId)
        .single();

      if (error) throw error;
      return data as Vendor;
    },
    enabled: enabled && !!vendorId,
  });

  // Query for vendor transactions
  const {
    data: transactions,
    isLoading: isLoadingTransactions,
    error: transactionsError
  } = useQuery({
    queryKey: ["vendor-transactions", vendorId, limit],
    queryFn: async () => {
      let query = supabase
        .from("vendor_transactions")
        .select(`
          *,
          vendor:vendors!vendor_transactions_vendor_id_fkey(id, name)
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (vendorId) {
        query = query.eq("vendor_id", vendorId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as VendorTransaction[];
    },
    enabled,
  });

  // Calculate overall stats
  const stats = vendors ? {
    totalVendors: vendors.length,
    totalBalance: vendors.reduce((sum, v) => sum + v.current_balance, 0),
    totalPurchases: vendors.reduce((sum, v) => sum + v.total_purchases, 0),
    totalPayments: vendors.reduce((sum, v) => sum + v.total_payments, 0),
    vendorsWithBalance: vendors.filter(v => v.current_balance > 0).length,
    vendorsOverLimit: vendors.filter(v => {
      if (v.credit_limit <= 0) return false;
      return (v.current_balance / v.credit_limit) >= 1;
    }).length,
  } : undefined;

  // Mutation to record vendor purchase
  const recordPurchase = useMutation({
    mutationFn: async ({
      vendorId,
      warehouseId,
      items,
      totalAmount,
      invoiceNumber,
      invoiceDate,
      notes,
    }: {
      vendorId: string;
      warehouseId: string;
      items: { rawMaterialId: string; quantity: number; unitPrice: number }[];
      totalAmount: number;
      invoiceNumber?: string;
      invoiceDate?: string;
      notes?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id;

      const { data, error } = await supabase.rpc("record_vendor_purchase", {
        p_vendor_id: vendorId,
        p_warehouse_id: warehouseId,
        p_items: JSON.stringify(items.map(item => ({
          raw_material_id: item.rawMaterialId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
        }))),
        p_total_amount: totalAmount,
        p_invoice_number: invoiceNumber,
        p_invoice_date: invoiceDate,
        p_notes: notes,
        p_user_id: currentUserId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors-balance"] });
      queryClient.invalidateQueries({ queryKey: ["vendor"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["raw-materials-inventory"] });
      toast.success("Purchase recorded successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to record purchase");
    },
  });

  // Mutation to record vendor payment
  const recordPayment = useMutation({
    mutationFn: async ({
      vendorId,
      amount,
      paymentMethod,
      referenceNumber,
      notes,
    }: {
      vendorId: string;
      amount: number;
      paymentMethod?: string;
      referenceNumber?: string;
      notes?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id;

      const { data, error } = await supabase.rpc("record_vendor_payment", {
        p_vendor_id: vendorId,
        p_amount: amount,
        p_payment_method: paymentMethod || "cash",
        p_reference_number: referenceNumber,
        p_notes: notes,
        p_user_id: currentUserId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors-balance"] });
      queryClient.invalidateQueries({ queryKey: ["vendor"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-transactions"] });
      toast.success("Payment recorded successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to record payment");
    },
  });

  // Mutation to update vendor
  const updateVendor = useMutation({
    mutationFn: async ({
      vendorId,
      data,
    }: {
      vendorId: string;
      data: Partial<Vendor>;
    }) => {
      const { data: result, error } = await supabase
        .from("vendors")
        .update(data)
        .eq("id", vendorId)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors-balance"] });
      queryClient.invalidateQueries({ queryKey: ["vendor"] });
      toast.success("Vendor updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update vendor");
    },
  });

  return {
    vendors,
    vendor,
    transactions,
    stats,
    isLoading: isLoadingVendors || isLoadingVendor || isLoadingTransactions,
    error: vendorsError || vendorError || transactionsError,
    recordPurchase,
    recordPayment,
    updateVendor,
  };
}

// Hook for getting vendors with outstanding balance
export function useVendorsWithBalance() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["vendors-with-balance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_balance_summary")
        .select("*")
        .gt("current_balance", 0)
        .order("current_balance", { ascending: false });

      if (error) throw error;
      return (data || []) as Vendor[];
    },
  });

  return {
    vendors: data || [],
    isLoading,
    error,
  };
}
