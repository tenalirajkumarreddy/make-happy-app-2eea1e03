import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { logError, logDebug } from "@/lib/logger";
import type { AppRole } from "@/types/roles";
import { normalizeRole } from "@/types/roles";
import { cacheAuthState, getCachedAuthState, clearAuthCache } from "@/lib/authCache";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: { id: string; full_name: string; email: string; avatar_url: string | null } | null;
  customer: { id: string; user_id: string | null; name: string; phone: string | null; email: string | null } | null;
  needsOnboarding: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  profile: null,
  customer: null,
  needsOnboarding: false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [customer, setCustomer] = useState<AuthContextType["customer"]>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvingRef = useRef(false);

  const fallbackToCache = async () => {
    try {
      const cached = await getCachedAuthState();
      if (cached?.role) {
        const cachedAt = cached.cachedAt ? new Date(cached.cachedAt).getTime() : 0;
        if (Date.now() - cachedAt < CACHE_TTL_MS) {
          logDebug("[Auth] Using cached auth state");
          setRole(cached.role as any);
          setProfile(cached.profile as any);
          setCustomer(cached.customer as any);
          setNeedsOnboarding(cached.needsOnboarding);
        }
      }
    } catch (e) {
      logError("Failed to read auth cache", e);
    }
  };

  const checkGoogleStaff = async (userId: string, email: string | null) => {
    if (!email) return;
    try {
      const { data: staffDir } = await supabase
        .from("staff_directory")
        .select("id")
        .eq("email", email)
        .eq("is_active", true)
        .limit(1);
      if (staffDir && staffDir.length > 0) {
        logDebug("[Auth] Staff directory record found via Google email — syncing role");
        await supabase.functions.invoke("google-staff-exchange", {
          body: { user_id: userId },
        });
      }
    } catch (e) {
      logError("[Auth] Google staff check failed", e);
    }
  };

  const fetchUserData = async (userId: string) => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    try {
      const resolverCall: any = (supabase as any).rpc("resolve_user_identity", { p_user_id: userId });
      let resolverData: any = null;
      let resolverError: any = null;

      if (resolverCall?.single) {
        const result = await resolverCall.single();
        resolverData = result.data;
        resolverError = result.error;
      } else {
        const result = await resolverCall;
        resolverData = Array.isArray(result.data) ? result.data[0] : result.data;
        resolverError = result.error;
      }

      if (resolverError) throw resolverError;

      const resolvedRole = normalizeRole(resolverData?.role ?? null);
      const resolvedNeedsOnboarding = !!resolverData?.onboarding_required;

      let resolvedCustomer: AuthContextType["customer"] = null;
      if (resolverData?.has_customer) {
        const { data: customerData } = await supabase
          .from("customers")
          .select("id, user_id, name, phone, email")
          .eq("user_id", userId)
          .maybeSingle();
        resolvedCustomer = customerData ?? null;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, is_active")
        .eq("user_id", userId)
        .maybeSingle();

      if (profileError) throw profileError;
      if (profileData && !profileData.is_active) {
        throw new Error("USER_DISABLED");
      }

      const resolvedProfile = (profileData ?? null) as any;
      setProfile(resolvedProfile);
      setCustomer(resolvedCustomer);
      setRole(resolvedRole);
      setNeedsOnboarding(resolvedNeedsOnboarding);

      // If role is customer but user has staff_directory record via email → staff via Google OAuth
      if (resolvedRole === "customer" && profileData?.email) {
        await checkGoogleStaff(userId, profileData.email);
      }

      try {
        await cacheAuthState({
          session: session ? {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
          } : null,
          role: resolvedRole as string | null,
          profile: resolvedProfile,
          customer: resolvedCustomer,
          needsOnboarding: resolvedNeedsOnboarding,
          cachedAt: new Date().toISOString(),
        });
      } catch (e) {
        logError("Failed to cache auth state", e);
      }

      // Role-aware redirect for first-time staff login
      if (resolvedRole && resolvedRole !== "customer") {
        const ROLE_DASHBOARD_MAP: Record<string, string> = {
          super_admin: "/",
          manager: "/",
          agent: "/",
          marketer: "/",
          operator: "/",
        };
        const target = ROLE_DASHBOARD_MAP[resolvedRole];
        if (target && window.location.pathname !== target) {
          window.location.href = target;
        }
      } else if (resolvedNeedsOnboarding) {
        // New customer — redirect to onboarding page
        if (window.location.pathname !== "/auth/onboarding") {
          window.location.href = "/auth/onboarding";
        }
      } else if (resolvedCustomer) {
        if (window.location.pathname !== "/") {
          window.location.href = "/";
        }
      }
    } catch (error: any) {
      logError("Error fetching user data", error);
      if (error?.message === "USER_DISABLED") {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setRole(null);
        setProfile(null);
        setCustomer(null);
        setNeedsOnboarding(false);
        return;
      }
      setNeedsOnboarding(false);
    } finally {
      resolvingRef.current = false;
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      setLoading(false);
    }
    // If roleError is set, leave role as null; ProtectedRoute will handle it
  };

  useEffect(() => {
    let mounted = true;

    // 2-second loading timeout — fallback to cache so app doesn't deadlock
    loadingTimeoutRef.current = setTimeout(async () => {
      if (!mounted) return;
      await fallbackToCache();
      if (mounted) setLoading(false);
    }, 2000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(async () => {
            if (!mounted) return;
            await fetchUserData(session.user.id);
          }, 0);
        } else {
          setRole(null);
          setProfile(null);
          setCustomer(null);
          setNeedsOnboarding(false);
          setLoading(false);
        }
      }
    );

    // Read initial session — listener fires INITIAL_SESSION on subscribe
    // if session exists. This handles fetchUserData. For no-session case
    // we clear loading here since no event will fire.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setSession(session);
        setUser(session.user);
      } else {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    await clearAuthCache();
    setUser(null);
    setSession(null);
    setRole(null);
    setProfile(null);
    setCustomer(null);
    setNeedsOnboarding(false);
  };

  // Heartbeat: poll profiles.is_active every 30s to catch disabled users
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("is_active")
          .eq("user_id", user.id)
          .single();

        if (data && !data.is_active) {
          await signOut();
        }
      } catch (e) {
        logError("Auth heartbeat failed", e);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [user, signOut]);

  return (
    <AuthContext.Provider value={{ user, session, role, profile, customer, needsOnboarding, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
