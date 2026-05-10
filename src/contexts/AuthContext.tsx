import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { logError } from "@/lib/logger";
import type { AppRole } from "@/types/roles";
import { normalizeRole } from "@/types/roles";

async function resolveUserType(supabaseClient: any, userId: string): Promise<{
  role: AppRole;
  isStaff: boolean;
  isCustomer: boolean;
  profile: any;
  customer: any;
}> {
  const { data: profileData, error: profileError } = await supabaseClient
    .from("profiles")
    .select("full_name, email, avatar_url, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) throw profileError;

  if (profileData && !profileData.is_active) {
    throw new Error("USER_DISABLED");
  }

  const { data: roleData } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  const isStaff = !!roleData?.role && roleData.role !== "customer";
  
  const { data: customerData } = await supabaseClient
    .from("customers")
    .select("id, user_id, name, phone, email")
    .eq("user_id", userId)
    .maybeSingle();

  const isCustomer = !!customerData;

  const role = isStaff 
    ? normalizeRole(roleData?.role ?? null)
    : "customer";

  return {
    role,
    isStaff,
    isCustomer,
    profile: profileData,
    customer: customerData,
  };
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: { full_name: string; email: string; avatar_url: string | null } | null;
  customer: { id: string; user_id: string | null; name: string; phone: string | null; email: string | null } | null;
  warehouses: string[]; // Warehouse IDs accessible to user
  warehouse: { id: string; name: string } | null; // Current selected warehouse
  loading: boolean;
  signOut: () => Promise<void>;
  refreshWarehouses: () => Promise<void>;
  setWarehouse: (warehouse: { id: string; name: string } | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  profile: null,
  customer: null,
  warehouses: [],
  warehouse: null,
  loading: true,
  signOut: async () => {},
  refreshWarehouses: async () => {},
  setWarehouse: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [customer, setCustomer] = useState<AuthContextType["customer"]>(null);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [warehouse, setWarehouseState] = useState<AuthContextType["warehouse"]>(null);
  const [loading, setLoading] = useState(true);

  const refreshWarehouses = async (targetUserId?: string) => {
    const effectiveUserId = targetUserId ?? user?.id;
    if (!effectiveUserId) {
      setWarehouses([]);
      setWarehouseState(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("warehouse_id")
        .eq("user_id", effectiveUserId)
        .not("warehouse_id", "is", null);
      if (error) throw error;
      
      const warehouseIds = (data || []).map((r: any) => r.warehouse_id).filter(Boolean);
      setWarehouses(warehouseIds);
      
      // Auto-select first warehouse if none selected
      if (warehouseIds.length > 0 && !warehouse) {
        const { data: warehouseData } = await supabase
          .from("warehouses")
          .select("id, name")
          .eq("id", warehouseIds[0])
          .maybeSingle();
        if (warehouseData) {
          setWarehouseState({ id: warehouseData.id, name: warehouseData.name });
        }
      }
    } catch (error) {
      logError("Error fetching user warehouses", error);
      setWarehouses([]);
      setWarehouseState(null);
    }
  };

  const fetchUserData = async (userId: string) => {
    try {
      const { role, profile, customer } = await resolveUserType(supabase, userId);

      if (role === "customer" && !customer) {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setRole(null);
        setProfile(null);
        return;
      }

      setProfile(profile);
      setCustomer(customer);
      await refreshWarehouses(userId);
      setRole(role);
    } catch (error: any) {
      logError("Error fetching user data", error);
      if (error?.message === "USER_DISABLED") {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setRole(null);
        setProfile(null);
        return;
      }
      setRole("customer");
      setCustomer(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        
        // Always block the UI from rendering auth-dependent routes 
        // until we finish resolving the new auth state.
        setLoading(true);
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Defer to avoid Supabase deadlock where DB query waits for Auth headers
          setTimeout(async () => {
            if (!mounted) return;
            try {
              await fetchUserData(session.user.id);
            } finally {
              if (mounted) setLoading(false);
            }
          }, 0);
        } else {
          setRole(null);
          setProfile(null);
          setCustomer(null);
          setWarehouses([]);
          if (mounted) setLoading(false);
        }
      }
    );

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // It's safe to await here since we aren't in the onAuthStateChange lock
          await fetchUserData(session.user.id);
        }
      } catch (error) {
        logError("Auth context initialization error", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setProfile(null);
    setCustomer(null);
    setWarehouses([]);
    setWarehouseState(null);
  };

  const setWarehouse = useCallback((w: { id: string; name: string } | null) => {
    setWarehouseState(w);
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, role, profile, customer, warehouses, warehouse, loading, signOut, refreshWarehouses, setWarehouse }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
