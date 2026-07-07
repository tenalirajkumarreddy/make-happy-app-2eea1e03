import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { calculateStoreHealth, StoreHealth } from "@/utils/storeHealth";

interface RawStore {
  id: string;
  name: string;
  outstanding: number;
  created_by: string;
  customers: { name: string } | null;
}

interface RawTarget {
  store_id: string;
  target_amount: number;
}

interface RawSale {
  store_id: string;
  total_amount: number;
}

interface RawFollowUp {
  store_id: string;
  status: string;
  scheduled_date: string;
  reason: string;
  priority: string;
}

interface RawProfile {
  user_id: string;
  full_name: string;
}

function getStartEndOfMonth() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
}

export function useStoreHealth() {
  const { user, role } = useAuth();

  return useQuery<StoreHealth[]>({
    queryKey: ["crm-store-health", user?.id, role],
    queryFn: async () => {
      const { start, end, month, year } = getStartEndOfMonth();

      // 1. Fetch stores (admin/manager see all, marketers see their own)
      let storeQuery = supabase
        .from("stores")
        .select("id, name, outstanding, created_by, customers(name)")
        .eq("is_active", true);

      if (role === "marketer") {
        storeQuery = storeQuery.eq("created_by", user!.id);
      }

      const { data: storesData, error: storesError } = await storeQuery;
      if (storesError) throw storesError;
      const stores = (storesData || []) as RawStore[];

      if (stores.length === 0) return [];

      const storeIds = stores.map((s) => s.id);

      // 2. Fetch store targets for current month
      const { data: targetsData, error: targetsError } = await supabase
        .from("store_targets")
        .select("store_id, target_amount")
        .in("store_id", storeIds)
        .eq("month", month)
        .eq("year", year)
        .eq("status", "active");
      if (targetsError) throw targetsError;
      const targets = (targetsData || []) as RawTarget[];

      // 3. Fetch sales for current month (non-cancelled)
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("store_id, total_amount")
        .in("store_id", storeIds)
        .gte("created_at", start + "T00:00:00")
        .lte("created_at", end + "T23:59:59")
        .neq("status", "cancelled");
      if (salesError) throw salesError;
      const sales = (salesData || []) as RawSale[];

      // 4. Fetch last order date per store
      const { data: lastOrderData, error: lastOrderError } = await supabase
        .from("sales")
        .select("store_id, created_at")
        .in("store_id", storeIds)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });
      if (lastOrderError) throw lastOrderError;

      const lastOrderMap: Record<string, string> = {};
      (lastOrderData || []).forEach((item: any) => {
        if (!lastOrderMap[item.store_id]) {
          lastOrderMap[item.store_id] = item.created_at;
        }
      });

      // 5. Fetch active follow-ups (use valid status lifecycle + reason)
      const { data: followUpsData, error: followUpsError } = await supabase
        .from("follow_up_schedule")
        .select("store_id, status, scheduled_date, reason, priority")
        .in("store_id", storeIds)
        .in("status", ["pending", "snoozed"]);
      if (followUpsError) throw followUpsError;
      const followUps = (followUpsData || []) as RawFollowUp[];

      // 6. Fetch profiles for marketer names
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in(
          "user_id",
          stores.map((s) => s.created_by)
        );
      if (profilesError) throw profilesError;
      const profiles = (profilesData || []) as RawProfile[];
      const profileMap: Record<string, string> = {};
      profiles.forEach((p) => {
        profileMap[p.user_id] = p.full_name;
      });

      // 7. Aggregate sales by store
      const salesByStore: Record<string, number> = {};
      sales.forEach((s) => {
        salesByStore[s.store_id] = (salesByStore[s.store_id] || 0) + (Number(s.total_amount) || 0);
      });

      // 8. Get most critical follow-up per store
      const followUpMap: Record<string, RawFollowUp> = {};
      followUps.forEach((f) => {
        const existing = followUpMap[f.store_id];
        if (!existing) {
          followUpMap[f.store_id] = f;
        } else {
          const priorityRank: Record<string, number> = { must_order: 4, run_out: 3, low_stock: 2, target_at_risk: 1, overdue_payment: 0 };
          if ((priorityRank[f.reason] || 0) > (priorityRank[existing.reason] || 0)) {
            followUpMap[f.store_id] = f;
          }
        }
      });

      // 9. Compute health for each store
      const result: StoreHealth[] = stores.map((store) => {
        const target = targets.find((t) => t.store_id === store.id)?.target_amount || 0;
        const actual = salesByStore[store.id] || 0;
        const lastOrderDate = lastOrderMap[store.id] ? new Date(lastOrderMap[store.id]) : null;
        const fu = followUpMap[store.id];
        const runoutDate = fu ? new Date(fu.scheduled_date) : null;
        const followUpStatus = fu ? fu.reason : null;

        const data = {
          storeId: store.id,
          storeName: store.name,
          marketerName: profileMap[store.created_by] || "—",
          target,
          actual,
          lastOrderDate,
          outstanding: Number(store.outstanding) || 0,
          runoutDate,
          followUpStatus,
        };

        return calculateStoreHealth(data);
      });

      // Sort by health score ascending (most critical first)
      return result.sort((a, b) => a.healthScore - b.healthScore);
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
