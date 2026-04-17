import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StaffStockItem {
  id: string;
  user_id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  is_negative: boolean;
  amount_value: number;
  last_received_at?: string;
  last_sale_at?: string;
  transfer_count: number;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    base_price: number;
    image_url?: string;
  };
}

/** One grouped entry per staff member */
export interface StaffStockGroup {
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role?: string;
  items: StaffStockItem[];
  totalValue: number;
  totalQuantity: number;
  negativeItems: number;
  lastActivity?: string;
}

/** Summary shape used by InventorySummaryCards */
export interface StaffInventorySummary {
  user_id: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
  user_role?: string;
  warehouse_id: string;
  warehouse_name?: string;
  total_products: number;
  total_quantity: number;
  total_value: number;
  negative_products: number;
  negative_value: number;
  last_received?: string;
  last_sale?: string;
  total_transfers: number;
}

interface UseStaffStockOptions {
  userId?: string;
  warehouseId?: string;
  enabled?: boolean;
}

/**
 * Primary hook: fetches staff_stock grouped by user for a given warehouse.
 * Returns:
 *   staffGroups  — StaffStockGroup[] (grouped, with full profile info)
 *   staffSummary — StaffInventorySummary[] (flat summary for cards / stats)
 *   isLoadingStock — boolean
 *   stockError     — error | null
 */
export function useStaffStockByWarehouse(warehouseId: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["staff-stock-by-warehouse", warehouseId],
    queryFn: async () => {
      if (!warehouseId) return { groups: [], summary: [] };

      // Step 1: fetch staff_stock rows for this warehouse
      const { data: stockRows, error: stockError } = await supabase
        .from("staff_stock")
        .select(
          `
          id, user_id, warehouse_id, product_id, quantity,
          is_negative, amount_value, last_received_at, last_sale_at, transfer_count,
          product:products!staff_stock_product_id_fkey(
            id, name, sku, unit, base_price, image_url
          )
        `
        )
        .eq("warehouse_id", warehouseId)
        .gt("quantity", 0);

      if (stockError) throw stockError;
      if (!stockRows?.length) return { groups: [], summary: [] };

      // Step 2: resolve profiles + roles for all user_ids
      const userIds = [...new Set(stockRows.map((r) => r.user_id))];

      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url, email")
          .in("user_id", userIds),
        supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds),
      ]);

      const profileMap = Object.fromEntries(
        (profiles ?? []).map((p) => [p.user_id, p])
      );
      const roleMap = Object.fromEntries(
        (roles ?? []).map((r) => [r.user_id, r.role])
      );

      // Step 3: group rows per user
      const groupMap = new Map<string, StaffStockGroup>();

      for (const row of stockRows) {
        const uid = row.user_id;
        if (!groupMap.has(uid)) {
          const profile = profileMap[uid];
          groupMap.set(uid, {
            user_id: uid,
            full_name: profile?.full_name ?? "Unknown",
            email: profile?.email ?? "",
            avatar_url: profile?.avatar_url ?? null,
            role: roleMap[uid],
            items: [],
            totalValue: 0,
            totalQuantity: 0,
            negativeItems: 0,
            lastActivity: undefined,
          });
        }

        const g = groupMap.get(uid)!;
        // Normalise nested product (Supabase can return array)
        const rawProduct = row.product;
        const product = Array.isArray(rawProduct) ? rawProduct[0] : rawProduct;

        g.items.push({ ...row, product } as StaffStockItem);
        g.totalValue += row.amount_value ?? 0;
        g.totalQuantity += row.quantity ?? 0;
        if (row.is_negative) g.negativeItems++;

        const activity = row.last_sale_at ?? row.last_received_at;
        if (activity && (!g.lastActivity || activity > g.lastActivity)) {
          g.lastActivity = activity;
        }
      }

      const groups = Array.from(groupMap.values()).sort((a, b) =>
        a.full_name.localeCompare(b.full_name)
      );

      // Step 4: derive summary array (consumed by InventorySummaryCards)
      const summary: StaffInventorySummary[] = groups.map((g) => ({
        user_id: g.user_id,
        full_name: g.full_name,
        email: g.email,
        avatar_url: g.avatar_url ?? undefined,
        user_role: g.role,
        warehouse_id: warehouseId,
        total_products: g.items.length,
        total_quantity: g.totalQuantity,
        total_value: g.totalValue,
        negative_products: g.negativeItems,
        negative_value: g.items
          .filter((i) => i.is_negative)
          .reduce((s, i) => s + (i.amount_value ?? 0), 0),
        last_received: g.items
          .map((i) => i.last_received_at)
          .filter(Boolean)
          .sort()
          .at(-1),
        last_sale: g.items
          .map((i) => i.last_sale_at)
          .filter(Boolean)
          .sort()
          .at(-1),
        total_transfers: g.items.reduce(
          (s, i) => s + (i.transfer_count ?? 0),
          0
        ),
      }));

      return { groups, summary };
    },
    enabled: !!warehouseId,
  });

  return {
    staffGroups: data?.groups ?? [],
    staffSummary: data?.summary ?? [],
    isLoadingStock: isLoading,
    stockError: error,
  };
}

/**
 * Legacy shim — kept so any other callers (mobile etc.) don't break.
 * Returns flat raw rows with profile stitched in.
 */
export function useStaffStock(options: UseStaffStockOptions = {}) {
  const { userId, warehouseId, enabled = true } = options;
  useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["staff-stock", userId, warehouseId],
    queryFn: async () => {
      let q = supabase.from("staff_stock").select(
        `
          id, user_id, warehouse_id, product_id, quantity,
          is_negative, amount_value, last_received_at, last_sale_at, transfer_count,
          product:products!staff_stock_product_id_fkey(
            id, name, sku, unit, base_price, image_url
          )
        `
      );

      if (userId) q = q.eq("user_id", userId);
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);

      const { data: stockRows, error: stockError } = await q;
      if (stockError) throw stockError;
      if (!stockRows?.length) return [];

      const userIds = [...new Set(stockRows.map((r) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url, email")
        .in("user_id", userIds);

      const profileMap = Object.fromEntries(
        (profiles ?? []).map((p) => [p.user_id, p])
      );

      return stockRows.map((item) => ({
        ...item,
        product: Array.isArray(item.product) ? item.product[0] : item.product,
        profile: profileMap[item.user_id] ?? { full_name: "Unknown User" },
      }));
    },
    enabled: enabled && (!!userId || !!warehouseId),
  });

  // Return shape that old callers expect
  return {
    staffStock: data ?? [],
    staffSummary: [],           // legacy callers shouldn't use this; use useStaffStockByWarehouse
    isLoadingStock: isLoading,
    stockError: error,
  };
}
