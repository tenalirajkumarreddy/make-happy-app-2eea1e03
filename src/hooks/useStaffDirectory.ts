/**
 * useStaffDirectory - Single data hook for the staff directory.
 * Encapsulates: fetching, filtering, stats, debounced search, pagination.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type {
  StaffMember,
  StaffInvitation,
  StaffDirectoryFilters,
  StaffDirectoryStats,
  StaffInviteFormData,
} from "@/types/staff";
import { startOfDay, endOfDay } from "date-fns";

// ── Shared cache tag for invalidation ────────────────────────────────────────
const QUERY_KEY = "staff-directory-v2";

// ── Debounce helper ──────────────────────────────────────────────────────────
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ── Main hook ───────────────────────────────────────────────────────────────
export function useStaffDirectory() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<StaffDirectoryFilters>({
    search: "",
    role: "all",
    warehouse: "all",
    status: "active",
  });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const searchTerm = useDebouncedValue(filters.search, 300);

  // Fetch all enriched staff data in a single shot via RPC if available
  // or via batched queries if not
  const {
    data: rawStaff = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: [QUERY_KEY, filters.role, filters.warehouse, filters.status],
    queryFn: async () => {
      // ── Base query: all non-customer roles ────────────────────────────────
      let rolesQuery = (supabase as any)
        .from("user_roles")
        .select(
          `
          user_id,
          role,
          warehouse_id,
          warehouses(name)
        ` as any
        )
        .in("role", ["super_admin", "manager", "agent", "marketer", "operator"]);

      if (filters.role !== "all") {
        rolesQuery = rolesQuery.eq("role", filters.role);
      }

      if (filters.warehouse === "assigned") {
        rolesQuery = rolesQuery.not("warehouse_id", "is", null);
      } else if (filters.warehouse === "unassigned") {
        rolesQuery = rolesQuery.is("warehouse_id", null);
      }

      const { data: userRoles, error: rolesError } = await rolesQuery;
      if (rolesError) throw rolesError;

      const userIds = (userRoles ?? []).map((ur: any) => ur.user_id);
      if (userIds.length === 0) return [];

      // ── Fetch all related data in parallel ────────────────────────────────
      const now = new Date();
      const todayStart = startOfDay(now).toISOString();
      const todayEnd = endOfDay(now).toISOString();

      const [
        profilesRes,
        cashRes,
        stockRes,
        todaySalesRes,
        todayTxRes,
        permissionsRes,
        activityRes,
        warehousesRes,
      ] = await Promise.all([
        (supabase as any)
          .from("profiles")
          .select("user_id, full_name, email, phone, avatar_url, is_active, created_at")
          .in("user_id", userIds)
          .eq("is_active", filters.status === "active" ? true : filters.status === "inactive" ? false : true),
        (supabase as any)
          .from("staff_cash_accounts")
          .select("user_id, cash_amount, upi_amount")
          .in("user_id", userIds),
        (supabase as any)
          .from("staff_stock")
          .select("user_id, quantity, product:products(name, base_price)")
          .in("user_id", userIds),
        (supabase as any)
          .from("sales")
          .select("recorded_by, id, total_amount")
          .gte("created_at", todayStart)
          .lte("created_at", todayEnd)
          .in("recorded_by", userIds),
        (supabase as any)
          .from("transactions")
          .select("recorded_by, id, total_amount")
          .gte("created_at", todayStart)
          .lte("created_at", todayEnd)
          .in("recorded_by", userIds),
        (supabase as any)
          .from("user_permissions")
          .select("user_id, permission, enabled")
          .in("user_id", userIds)
          .eq("enabled", true),
        (supabase as any)
          .from("activity_logs")
          .select("user_id, created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: false }),
        (supabase as any).from("warehouses").select("id, name"),
      ]);

      if (profilesRes.error) throw profilesRes.error;

      // ── Build lookup maps ─────────────────────────────────────────────────
      const profiles = profilesRes.data ?? [];
      const cashAccounts = cashRes.data ?? [];
      const stockData = stockRes.data ?? [];
      const todaySales = todaySalesRes.data ?? [];
      const todayTx = todayTxRes.data ?? [];
      const permissions = permissionsRes.data ?? [];
      const activityLogs = activityRes.data ?? [];
      const warehouses = warehousesRes.data ?? [];

      const cashMap = new Map();
      cashAccounts.forEach((c: any) => {
        cashMap.set(c.user_id, { cash_amount: c.cash_amount || 0, upi_amount: c.upi_amount || 0 });
      });

      const stockMap = new Map<string, { items: number; units: number; value: number; preview: Array<{ product_name: string; quantity: number; value: number }> }>();
      stockData.forEach((s: any) => {
        const existing = stockMap.get(s.user_id) || { items: 0, units: 0, value: 0, preview: [] };
        const value = (s.product?.base_price || 0) * (s.quantity || 0);
        const item = {
          product_name: s.product?.name || "Unknown",
          quantity: s.quantity || 0,
          value,
        };
        stockMap.set(s.user_id, {
          items: existing.items + 1,
          units: existing.units + (s.quantity || 0),
          value: existing.value + value,
          preview: [...existing.preview, item].slice(0, 3),
        });
      });

      const salesCountMap = new Map<string, number>();
      const salesAmountMap = new Map<string, number>();
      todaySales.forEach((s: any) => {
        salesCountMap.set(s.recorded_by, (salesCountMap.get(s.recorded_by) || 0) + 1);
        salesAmountMap.set(s.recorded_by, (salesAmountMap.get(s.recorded_by) || 0) + (s.total_amount || 0));
      });

      const txCountMap = new Map<string, number>();
      const txAmountMap = new Map<string, number>();
      todayTx.forEach((t: any) => {
        txCountMap.set(t.recorded_by, (txCountMap.get(t.recorded_by) || 0) + 1);
        txAmountMap.set(t.recorded_by, (txAmountMap.get(t.recorded_by) || 0) + (t.total_amount || 0));
      });

      const lastActiveMap = new Map<string, string>();
      activityLogs.forEach((log: any) => {
        if (!lastActiveMap.has(log.user_id)) {
          lastActiveMap.set(log.user_id, log.created_at);
        }
      });

      const permissionsMap = new Map<string, string[]>();
      permissions.forEach((p: any) => {
        const existing = permissionsMap.get(p.user_id) || [];
        if (existing.length < 4) existing.push(p.permission);
        permissionsMap.set(p.user_id, existing);
      });

      // ── Merge into StaffMember shape ──────────────────────────────────────
      const enriched: StaffMember[] = (userRoles ?? [])
        .map((ur: any) => {
          const profile = profiles.find((p: any) => p.user_id === ur.user_id);
          if (!profile) return null;

          const cash = cashMap.get(ur.user_id) || { cash_amount: 0, upi_amount: 0 };
          const stock = stockMap.get(ur.user_id) || { items: 0, units: 0, value: 0, preview: [] };
          const lastActive = lastActiveMap.get(ur.user_id) || null;
          const warehouse = warehouses.find((w: any) => w.id === ur.warehouse_id);

          return {
            id: ur.user_id,
            user_id: ur.user_id,
            full_name: profile.full_name || "Unknown",
            email: profile.email || null,
            phone: profile.phone || null,
            avatar_url: profile.avatar_url || null,
            role: ur.role,
            is_active: profile.is_active ?? true,
            warehouse_id: ur.warehouse_id || null,
            warehouse_name: warehouse?.name || null,
            created_at: profile.created_at,
            last_active_at: lastActive,
            holdings: {
              cash_amount: cash.cash_amount,
              upi_amount: cash.upi_amount,
              total_amount: cash.cash_amount + cash.upi_amount,
            },
            stock: {
              total_items: stock.items,
              total_units: stock.units,
              total_value: stock.value,
              preview: stock.preview,
            },
            activity: {
              today_sales_count: salesCountMap.get(ur.user_id) || 0,
              today_sales_amount: salesAmountMap.get(ur.user_id) || 0,
              today_collections_count: txCountMap.get(ur.user_id) || 0,
              today_collections_amount: txAmountMap.get(ur.user_id) || 0,
              last_active_at: lastActive,
            },
            key_permissions: permissionsMap.get(ur.user_id) || [],
          };
        })
        .filter(Boolean) as StaffMember[];

      return enriched;
    },
  });

  // ── Pending invitations (separate query, not paginated) ────────────────────
  const {
    data: pendingInvitations = [],
    isLoading: invitesLoading,
  } = useQuery({
    queryKey: [QUERY_KEY, "pending-invitations"],
    queryFn: async () => {
      const { data: invites, error } = await (supabase as any)
        .from("staff_invitations")
        .select(`
          id,
          phone,
          email,
          full_name,
          role,
          invited_by,
          status,
          created_at,
          warehouse_id,
          warehouses(name)
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (invites ?? []).map((inv: any) => ({
        id: inv.id,
        phone: inv.phone || "",
        email: inv.email || null,
        full_name: inv.full_name,
        role: inv.role,
        invited_by: inv.invited_by,
        status: inv.status,
        created_at: inv.created_at,
        warehouse_id: inv.warehouse_id || null,
        warehouse_name: inv.warehouses?.name || null,
      })) as StaffInvitation[];
    },
  });

  // ── Client-side search filtering ──────────────────────────────────────────
  const filteredStaff = useMemo(() => {
    if (!searchTerm) return rawStaff;
    const query = searchTerm.toLowerCase();
    return rawStaff.filter(
      (s: StaffMember) =>
        s.full_name.toLowerCase().includes(query) ||
        (s.email?.toLowerCase().includes(query) ?? false) ||
        (s.phone?.toLowerCase().includes(query) ?? false)
    );
  }, [rawStaff, searchTerm]);

  const filteredInvitations = useMemo(() => {
    if (!searchTerm) return pendingInvitations;
    const q = searchTerm.toLowerCase();
    return pendingInvitations.filter(
      (inv) =>
        inv.full_name.toLowerCase().includes(q) ||
        (inv.phone?.toLowerCase().includes(q) ?? false) ||
        (inv.email?.toLowerCase().includes(q) ?? false)
    );
  }, [pendingInvitations, searchTerm]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedStaff = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredStaff.slice(start, start + PAGE_SIZE);
  }, [filteredStaff, currentPage]);

  // ── Stats (reflect filtered view) ───────────────────────────────────────────
  const stats: StaffDirectoryStats = useMemo(() => {
    return {
      total: rawStaff.length,
      active: rawStaff.filter((s) => s.is_active).length,
      withHoldings: filteredStaff.filter((s) => s.holdings.total_amount > 0 || s.stock.total_value > 0).length,
      totalCash: filteredStaff.reduce((sum, s) => sum + s.holdings.total_amount, 0),
      totalStockValue: filteredStaff.reduce((sum, s) => sum + s.stock.total_value, 0),
      totalStockItems: filteredStaff.reduce((sum, s) => sum + s.stock.total_items, 0),
    };
  }, [rawStaff, filteredStaff]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const inviteStaff = useCallback(
    async (data: StaffInviteFormData) => {
      let normalizedPhone = data.phone.trim();
      if (!normalizedPhone.startsWith("+")) {
        normalizedPhone = normalizedPhone.length === 10 ? `+91${normalizedPhone}` : normalizedPhone;
      }
      const digits = normalizedPhone.replace(/\D/g, "");
      if (digits.length < 10) throw new Error("Phone number must have at least 10 digits");

      const res = await (supabase as any).functions.invoke("invite-staff", {
        body: {
          phone: normalizedPhone,
          email: data.email || undefined,
          full_name: data.full_name.trim(),
          role: data.role,
          warehouse_id: data.warehouse_id || undefined,
        },
      });

      if (res.error) {
        let msg = res.error.message;
        try {
          if (res.error.context && typeof res.error.context.clone === "function") {
            const body = await res.error.context.clone().json();
            if (body?.error) msg = body.error;
          }
        } catch {}
        throw new Error(msg);
      }

      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      return res.data;
    },
    [queryClient]
  );

  const toggleActive = useCallback(
    async (userId: string, active: boolean) => {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ is_active: active })
        .eq("user_id", userId);

      if (error) throw error;

      toast.success(`Staff ${active ? "activated" : "deactivated"}`);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    [queryClient]
  );

  return {
    // Data
    staff: paginatedStaff,
    allStaff: filteredStaff,
    pendingInvitations: filteredInvitations,
    pendingCount: pendingInvitations.length,
    isLoading,
    invitesLoading,
    error,
    // Pagination
    page: currentPage,
    totalPages,
    setPage,
    PAGE_SIZE,
    // Filters
    filters,
    setFilters,
    // Stats
    stats,
    // Actions
    inviteStaff,
    toggleActive,
    // Refresh
    invalidate: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  };
}
