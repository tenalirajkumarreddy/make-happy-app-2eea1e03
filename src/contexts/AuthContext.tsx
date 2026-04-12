import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { logError } from "@/lib/logger";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  }) as Promise<T>;
}

type AppRole = "super_admin" | "manager" | "agent" | "marketer" | "pos" | "customer";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: { full_name: string; email: string; avatar_url: string | null } | null;
  customer: { id: string; user_id: string | null; name: string; phone: string | null; email: string | null } | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  profile: null,
  customer: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [customer, setCustomer] = useState<AuthContextType["customer"]>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    try {
      const [roleRes, profileRes, customerRes] = await withTimeout(Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("full_name, email, avatar_url, is_active").eq("user_id", userId).maybeSingle(),
        supabase.from("customers").select("id, user_id, name, phone, email").eq("user_id", userId).maybeSingle(),
      ]), 10_000, "Fetching user data");

      if (roleRes.error) logError("Error fetching user role", roleRes.error);
      if (profileRes.error) logError("Error fetching user profile", profileRes.error);
      if (customerRes.error) logError("Error fetching customer record", customerRes.error);

      const roleData = roleRes.data;
      const profileData = profileRes.data;
      const customerData = customerRes.data;

      // If user is disabled, sign them out immediately
      if (profileData && !profileData.is_active) {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setRole(null);
        setProfile(null);
        return;
      }

      if (profileData) setProfile(profileData);
      setCustomer(customerData || null);

      if (roleData && roleData.role) {
        setRole(roleData.role as AppRole);
      } else {
        setRole("customer");
      }
    } catch (error) {
      logError("Error fetching user data", error);
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
            } catch (error) {
              logError("Auth state change user data fetch failed", error);
            } finally {
              if (mounted) setLoading(false);
            }
          }, 0);
        } else {
          setRole(null);
          setProfile(null);
          setCustomer(null);
          if (mounted) setLoading(false);
        }
      }
    );

    const initAuth = async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          10_000,
          "Auth session initialization"
        );
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
  };

  return (
    <AuthContext.Provider value={{ user, session, role, profile, customer, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
