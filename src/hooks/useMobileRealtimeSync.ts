import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logError } from "@/lib/logger";
import * as Sentry from "@sentry/react";
import { getChannelStatuses } from "./useRealtimeSync";

// Re-use hooks from useRealtimeSync.ts
const STAFF_ROLES = ["super_admin", "manager", "agent", "marketer", "operator"];

const RETRY = { maxRetries: 5, baseDelay: 1000, maxDelay: 30000 };

interface RealtimeSubscriber {
  qc: ReturnType<typeof useQueryClient>;
  isAdmin: boolean;
  userId?: string | null;
  role: string | null;
}

const mobileChannels = new Map<string, ReturnType<typeof supabase.channel>>();
const mobileSubscribers = new Map<symbol, RealtimeSubscriber>();
let mobileIsTearingDown = false;
let mobileRetryAttempt = 0;
let mobileRetryTimer: ReturnType<typeof setTimeout> | null = null;
const mobileInvalidateTimers = new Map<string, ReturnType<typeof setTimeout>>();
const mobilePendingInvalidations = new Map<string, Set<string>>();
const MOBILE_DEBOUNCE_MS = 250;

function flushMobileInvalidations(subscriberId: symbol) {
  const sub = mobileSubscribers.get(subscriberId);
  if (!sub || !mobilePendingInvalidations.has(String(subscriberId))) return;
  const keys = mobilePendingInvalidations.get(String(subscriberId));
  if (!keys || keys.size === 0) return;
  keys.forEach((key) => {
    sub.qc.invalidateQueries({ queryKey: [key] });
  });
  setTimeout(() => {
    keys.forEach((key) => {
      sub.qc.refetchQueries({ queryKey: [key], exact: false, type: "all" });
    });
    mobilePendingInvalidations.delete(String(subscriberId));
  }, 150);
}

function handleMobilePayload(table: string, payload: any) {
  const TABLE_QUERY_MAP: Record<string, string[]> = {
    sales: ["sales", "mobile-sales", "mobile-agent-sales-today"],
    transactions: ["transactions", "mobile-transactions", "mobile-agent-tx-today"],
    orders: ["orders", "mobile-orders", "mobile-agent-pending-orders"],
    stores: ["stores", "mobile-stores"],
    customers: ["customers"],
    products: ["products", "mobile-products"],
    handovers: ["handovers"],
    notifications: ["notifications"],
  };
  
  const keys = TABLE_QUERY_MAP[table];
  if (!keys?.length) return;
  mobileSubscribers.forEach((sub, subscriberId) => {
    const subKey = String(subscriberId);
    if (!mobilePendingInvalidations.has(subKey)) {
      mobilePendingInvalidations.set(subKey, new Set());
    }
    keys.forEach((key) => mobilePendingInvalidations.get(subKey)?.add(key));

    if (mobileInvalidateTimers.has(subKey)) clearTimeout(mobileInvalidateTimers.get(subKey));
    mobileInvalidateTimers.set(subKey, setTimeout(() => {
      flushMobileInvalidations(subscriberId);
      mobileInvalidateTimers.delete(subKey);
    }, MOBILE_DEBOUNCE_MS));
  });
}

async function tearDownMobileChannels() {
  if (mobileChannels.size === 0) return;
  mobileIsTearingDown = true;
  const removals = Array.from(mobileChannels.values()).map((ch) =>
    supabase.removeChannel(ch).catch(() => {})
  );
  await Promise.allSettled(removals);
  mobileChannels.clear();
  mobileIsTearingDown = false;
}

function buildMobileChannel(tables: string[], role: string | null) {
  const channelName = `mobile-realtime-${tables.join("-").slice(0, 50)}`;
  if (mobileChannels.has(channelName)) return;
  
  let ch = supabase.channel(channelName);
  tables.forEach((table) => {
    ch = ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload: any) => handleMobilePayload(table, payload)
    );
  });

  ch.subscribe((status: string) => {
    if (mobileIsTearingDown) return;
    
    if (status === "SUBSCRIBED") {
      mobileRetryAttempt = 0;
      if (import.meta.env.DEV) console.log(`[MobileRealtime] Subscribed to ${tables.length} tables`);
    } else if (status === "CHANNEL_ERROR") {
      const errorMsg = `[MobileRealtime] Channel error for ${tables.length} tables`;
      logError(errorMsg, { context: "useMobileRealtimeSync" });
      Sentry.captureMessage(errorMsg, {
        level: 'warning',
        extra: { tables: tables.slice(0, 10), channelName },
      });
      scheduleMobileReconnect(tables, role);
    } else if (status === "CLOSED" || status === "TIMED_OUT") {
      const warnMsg = `[MobileRealtime] Connection ${status} — reconnecting…`;
      if (import.meta.env.DEV) console.warn(warnMsg);
      Sentry.captureMessage(warnMsg, {
        level: 'warning',
        extra: { status, tables: tables.slice(0, 10), channelName },
      });
      scheduleMobileReconnect(tables, role);
    }
  });

  mobileChannels.set(channelName, ch);
}

function scheduleMobileReconnect(tables: string[], role: string | null) {
  if (mobileRetryTimer) clearTimeout(mobileRetryTimer);
  if (mobileRetryAttempt >= RETRY.maxRetries) {
    const errorMsg = "[MobileRealtime] Max retries reached";
    logError(errorMsg, { context: "useMobileRealtimeSync" });
    Sentry.captureMessage(errorMsg, { level: 'error', extra: { role, retryAttempt: mobileRetryAttempt } });
    return;
  }
  const delay = Math.min(RETRY.baseDelay * 2 ** mobileRetryAttempt, RETRY.maxDelay);
  mobileRetryTimer = setTimeout(async () => {
    mobileRetryAttempt++;
    await tearDownMobileChannels();
    buildMobileChannel(tables, role);
  }, delay);
}

/**
 * Reconnect all mobile realtime channels
 * Called when app comes to foreground
 */
export async function reconnectMobileRealtime() {
  if (mobileChannels.size === 0) return;
  
  try {
    await supabase.realtime.connect();
    
    // Rebuild all channels
    const existingChannelNames = Array.from(mobileChannels.keys());
    await tearDownMobileChannels();
    
    // Re-subscribe with same tables
    mobileSubscribers.forEach((sub) => {
      const roleTables = ["sales", "transactions", "orders", "stores", "customers", "products", "handovers", "notifications"];
      const effectiveTables = roleTables.filter((t) => {
        const roleTablesMap: Record<string, string[]> = {
          super_admin: roleTables,
          manager: roleTables,
          agent: roleTables,
          marketer: roleTables,
          operator: roleTables,
          customer: ["orders", "stores", "customers", "products", "notifications"],
        };
        return (roleTablesMap[sub.role ?? ""] ?? roleTables).includes(t);
      });
      
      if (effectiveTables.length > 0) {
        buildMobileChannel(effectiveTables, sub.role);
      }
    });
    
    if (import.meta.env.DEV) console.log("[MobileRealtime] Reconnected on foreground");
  } catch (err) {
    logError(err, { context: "reconnectMobileRealtime" });
    Sentry.captureException(err, { extra: { context: "reconnectMobileRealtime" } });
  }
}

/**
 * Mobile-specific realtime sync hook with Capacitor AppState handling.
 * Automatically reconnects when app comes to foreground.
 */
export function useMobileRealtimeSync(tables: string[]) {
  const qc = useQueryClient();
  const { role, user } = useAuth();
  const isAdmin = role === "super_admin" || role === "manager";
  const tablesRef = useRef<string[]>(tables);
  const roleRef = useRef<string | null>(role);

  useEffect(() => {
    if (!role || !tables.length) return;

    let cancelled = false;
    const id = Symbol("mobile-rt-sub");
    const subscriberId = String(id);
    const effectiveTables = tables.filter((t) => {
      const roleTables: Record<string, string[]> = {
        super_admin: tables,
        manager: tables,
        agent: tables,
        marketer: tables,
        operator: tables,
        customer: tables.filter(t => ["orders", "stores", "customers", "products", "notifications"].includes(t)),
      };
      return (roleTables[role] ?? tables).includes(t);
    });

    if (effectiveTables.length === 0) return;

    const setup = async () => {
      if (cancelled) return;

      mobileSubscribers.set(id, { qc, isAdmin, userId: user?.id, role });
      buildMobileChannel(effectiveTables, role);
    };

    setup();

    return () => {
      cancelled = true;
      mobileSubscribers.delete(id);
      flushMobileInvalidations(id);
      mobilePendingInvalidations.delete(subscriberId);
    };
  }, [qc, isAdmin, user?.id, role]);

  // Capacitor AppState change handler
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleAppStateChange = async ({ isActive }: { isActive: boolean }) => {
      if (isActive) {
        await reconnectMobileRealtime();
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        await reconnectMobileRealtime();
      }
    };

    // Capacitor App listener
    let appListener: { remove: () => void } | null = null;
    import("@capacitor/app")
      .then(({ App }) => {
        App.addListener("appStateChange", handleAppStateChange)
          .then((listener) => {
            appListener = listener;
            if (import.meta.env.DEV) console.log("[MobileRealtime] AppState listener registered");
          })
          .catch((err) => {
            logError(err, { context: "useMobileRealtimeSync.capacitorListener" });
          });
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.log("[MobileRealtime] Capacitor App not available, using visibility only");
      });

    // Web visibility change
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (appListener) {
        appListener.remove();
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Update tables ref
  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  // Update role ref
  useEffect(() => {
    roleRef.current = role;
  }, [role]);
}

export function getMobileChannelStatuses(): Array<{ name: string; status: string }> {
  return Array.from(mobileChannels.keys()).map((name) => {
    const ch = mobileChannels.get(name);
    return {
      name,
      status: ch?.state ?? "unknown",
    };
  });
}