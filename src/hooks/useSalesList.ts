import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { format } from "date-fns";
import { sanitizeString } from "@/lib/sanitization";
import { toast } from "sonner";

interface CsvColumn { header: string; key: string; }

const PAGE_SIZE = 100;

export function useSalesList() {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();
  const isAdmin = role === "super_admin" || role === "manager";

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [filterFrom, setFilterFrom] = useState(thirtyDaysAgo);
  const [filterTo, setFilterTo] = useState(today);
  const [filterStore, setFilterStore] = useState("all");
  const [filterStoreType, setFilterStoreType] = useState("all");
  const [filterRoute, setFilterRoute] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [loadedPages, setLoadedPages] = useState(1);

  useEffect(() => { setLoadedPages(1); }, [filterFrom, filterTo, filterStore, filterStoreType, filterRoute, filterUser, filterPayment, filterSearch]);

  const { data: sales, isLoading, isFetching } = useQuery({
    queryKey: ["sales", currentWarehouse?.id, isAdmin ? "all" : user?.id, filterFrom, filterTo, filterStore, filterStoreType, filterRoute, filterUser, filterPayment, filterSearch, loadedPages],
    queryFn: async () => {
      let q = supabase
        .from("sales")
        .select("*, is_fully_returned, stores(id, name, display_id, store_type_id, route_id, address, outstanding, routes(name), store_types(name)), customers(id, name, display_id, phone, email), fulfilled_order_id, invoice_sales(invoice_id)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (currentWarehouse?.id) q = q.or(`warehouse_id.eq.${currentWarehouse.id},warehouse_id.is.null`);
      if (!isAdmin) q = q.eq("recorded_by", user!.id);
      if (filterFrom) q = q.gte("created_at", filterFrom + "T00:00:00");
      if (filterTo) q = q.lte("created_at", filterTo + "T23:59:59");
      if (filterStore !== "all") q = q.eq("store_id", filterStore);
      if (filterUser !== "all") q = q.eq("recorded_by", filterUser);
      if (filterPayment === "cash") q = q.gt("cash_amount", 0);
      if (filterPayment === "upi") q = q.gt("upi_amount", 0);
      if (filterPayment === "outstanding") q = q.gt("outstanding_amount", 0);
      if (filterSearch.trim()) q = q.ilike("display_id", `%${filterSearch.trim()}%`);
      q = q.range(0, loadedPages * PAGE_SIZE - 1);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const hasMoreSales = (sales?.length || 0) >= loadedPages * PAGE_SIZE;

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url");
      return data || [];
    },
  });

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

  const { data: storeTypes } = useQuery({
    queryKey: ["store-types-credit"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name, credit_limit_kyc, credit_limit_no_kyc");
      return data || [];
    },
  });

  const { data: routes } = useQuery({
    queryKey: ["routes-for-filter"],
    queryFn: async () => {
      const { data } = await supabase.from("routes").select("id, name").order("name");
      return data || [];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-kyc-for-sale", currentWarehouse?.id],
    queryFn: async () => {
      let q = supabase.from("customers").select("id, kyc_status, credit_limit_override");
      if (currentWarehouse?.id) q = q.or(`warehouse_id.eq.${currentWarehouse.id},warehouse_id.is.null`);
      const { data } = await q;
      return data || [];
    },
  });

  const { data: stores } = useQuery({
    queryKey: ["stores-for-sale", currentWarehouse?.id],
    queryFn: async () => {
      let q = supabase.from("stores").select("id, name, outstanding, display_id, store_type_id, customer_id, lat, lng, is_active").order("is_active", { ascending: false }).order("name");
      if (currentWarehouse?.id) q = q.or(`warehouse_id.eq.${currentWarehouse.id},warehouse_id.is.null`);
      const { data } = await q;
      return data || [];
    },
  });

  const { data: agentProfiles = [] } = useQuery({
    queryKey: ["agent-profiles"],
    queryFn: async () => {
      const { data: agentIds } = await supabase.from("user_roles").select("user_id").eq("role", "agent");
      if (!agentIds?.length) return [];
      const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", agentIds.map((a: any) => a.user_id));
      return data || [];
    },
    enabled: role === "super_admin" || role === "manager",
  });

  const filteredSales = useMemo(() => {
    let data: any[] = sales || [];
    if (filterStoreType !== "all") data = data.filter((s: any) => s.stores?.store_type_id === filterStoreType);
    if (filterRoute !== "all") data = data.filter((s: any) => s.stores?.route_id === filterRoute);
    return data;
  }, [sales, filterStoreType, filterRoute]);

  const activeFilterCount = [filterStore !== "all", filterStoreType !== "all", filterRoute !== "all", filterUser !== "all", filterPayment !== "all", filterFrom !== thirtyDaysAgo, filterTo !== today].filter(Boolean).length;

  const clearFilters = () => {
    setFilterFrom(thirtyDaysAgo); setFilterTo(today); setFilterStore("all"); setFilterStoreType("all"); setFilterRoute("all"); setFilterUser("all"); setFilterPayment("all");
  };

  const getRecorderName = (userId: string) => profileMap.get(userId)?.full_name || "Unknown";
  const getRecorderAvatar = (userId: string) => profileMap.get(userId)?.avatar_url || null;

  const isPastDate = (created_at: string, updated_at?: string) => {
    if (isAdmin) return false;
    if (!created_at) return false;
    const today = new Date();
    const isToday = (d: string) => { const dt = new Date(d); return dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth() && dt.getDate() === today.getDate(); };
    if (isToday(created_at)) return false;
    if (updated_at && isToday(updated_at)) return false;
    const sd = new Date(created_at);
    return sd.getFullYear() < today.getFullYear() || sd.getMonth() < today.getMonth() || sd.getDate() < today.getDate();
  };

  function exportCSV<T extends Record<string, any>>(data: T[], columns: CsvColumn[], filename: string) {
    const header = columns.map((c) => c.header).join(",");
    const rows = data.map((row) =>
      columns.map((c) => {
        const val = c.key.includes(".") ? c.key.split(".").reduce((o: Record<string, any>, k: string) => o?.[k], row) : row[c.key];
        return `"${sanitizeString(String(val ?? "")).replace(/"/g, '""')}"`;
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.length} rows`);
  }

  return {
    sales: sales || [], filteredSales, isLoading, isFetching, hasMoreSales, loadedPages, setLoadedPages,
    profiles, profileMap, stores: stores || [], storeTypes: storeTypes || [], routes: routes || [], customers: customers || [],
    agentProfiles,
    filterFrom, setFilterFrom, filterTo, setFilterTo, filterStore, setFilterStore,
    filterStoreType, setFilterStoreType, filterRoute, setFilterRoute, filterUser, setFilterUser, filterPayment, setFilterPayment, filterSearch, setFilterSearch,
    activeFilterCount, clearFilters, getRecorderName, getRecorderAvatar, isPastDate, exportCSV, isAdmin, qc, isPosUser: role === "operator",
  };
}
