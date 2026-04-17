import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logError } from "@/lib/logger";

export interface Warehouse {
  id: string;
  name: string;
  type: string;
  location: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  is_active: boolean;
  is_default: boolean;
}

interface WarehouseContextType {
  /** The warehouse the current user is scoped to (null for super_admin before selecting) */
  currentWarehouse: Warehouse | null;
  /** All warehouses (only populated for super_admin) */
  allWarehouses: Warehouse[];
  /** The user's assigned warehouse_id (from user_roles) — null for super_admin */
  assignedWarehouseId: string | null;
  /** Loading state */
  loading: boolean;
  /** Super admin can switch the active warehouse context */
  setActiveWarehouse: (warehouseId: string) => void;
}

const WarehouseContext = createContext<WarehouseContextType>({
  currentWarehouse: null,
  allWarehouses: [],
  assignedWarehouseId: null,
  loading: true,
  setActiveWarehouse: () => {},
});

const ADMIN_WAREHOUSE_KEY = "admin_selected_warehouse_id";

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [currentWarehouse, setCurrentWarehouse] = useState<Warehouse | null>(null);
  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([]);
  const [assignedWarehouseId, setAssignedWarehouseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = role === "super_admin";

  const fetchAllWarehouses = useCallback(async () => {
    const { data, error } = await supabase
      .from("warehouses")
      .select("*")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("name");

    if (error) {
      logError("Error fetching warehouses", error);
      return [];
    }
    return (data || []) as Warehouse[];
  }, []);

  const fetchAssignedWarehouse = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("warehouse_id, warehouses(id, name, type, location, address, city, state, pincode, phone, is_active, is_default)")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logError("Error fetching assigned warehouse", error);
      return null;
    }

    const wh = data?.warehouses as Warehouse | null;
    return { warehouseId: data?.warehouse_id ?? null, warehouse: wh };
  }, []);

  useEffect(() => {
    if (!user) {
      setCurrentWarehouse(null);
      setAllWarehouses([]);
      setAssignedWarehouseId(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const init = async () => {
      try {
        if (isAdmin) {
          // Super admin: load all warehouses, respect saved selection
          const warehouses = await fetchAllWarehouses();
          setAllWarehouses(warehouses);

          const savedId = localStorage.getItem(ADMIN_WAREHOUSE_KEY);
          const saved = warehouses.find((w) => w.id === savedId);
          const defaultWh = warehouses.find((w) => w.is_default) ?? warehouses[0] ?? null;
          setCurrentWarehouse(saved ?? defaultWh);

          setAssignedWarehouseId(null);
        } else {
          // Non-admin: use the assigned warehouse from user_roles
          const result = await fetchAssignedWarehouse(user.id);
          let resolvedWarehouse: Warehouse | null = null;

          if (result?.warehouse) {
            resolvedWarehouse = result.warehouse;
          } else if (result?.warehouseId) {
            // Have ID but warehouse join failed — fetch directly
            const { data } = await supabase
              .from("warehouses")
              .select("*")
              .eq("id", result.warehouseId)
              .maybeSingle();
            resolvedWarehouse = (data as Warehouse) ?? null;
          } else {
            // No warehouse assigned — use the default
            const { data } = await supabase
              .from("warehouses")
              .select("*")
              .eq("is_default", true)
              .eq("is_active", true)
              .maybeSingle();
            resolvedWarehouse = (data as Warehouse) ?? null;
          }

          setCurrentWarehouse(resolvedWarehouse);

          setAssignedWarehouseId(result?.warehouseId ?? null);
          setAllWarehouses([]);
        }
      } catch (err) {
        logError("WarehouseContext init error", err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [user, isAdmin, fetchAllWarehouses, fetchAssignedWarehouse]);

  const setActiveWarehouse = useCallback(
    (warehouseId: string) => {
      if (!isAdmin) return;

      const wh = allWarehouses.find((w) => w.id === warehouseId) ?? null;
      setCurrentWarehouse(wh);
      if (wh) {
        localStorage.setItem(ADMIN_WAREHOUSE_KEY, wh.id);
      } else {
        localStorage.removeItem(ADMIN_WAREHOUSE_KEY);
      }
    },
    [isAdmin, allWarehouses]
  );

  return (
    <WarehouseContext.Provider
      value={{
        currentWarehouse,
        allWarehouses,
        assignedWarehouseId,
        loading,
        setActiveWarehouse,
      }}
    >
      {children}
    </WarehouseContext.Provider>
  );
}

export function useWarehouse() {
  return useContext(WarehouseContext);
}
