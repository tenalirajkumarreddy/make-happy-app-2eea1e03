import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications, PushNotificationSchema } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logDebug, logError } from "@/lib/logger";
import { toast } from "sonner";

// ── Singleton channel state (module-level) ──────────────────────
// Only ONE Realtime channel per user, shared across all hook consumers.
let activeChannel: ReturnType<typeof supabase.channel> | null = null;
let activeUserId: string | null = null;
let refCount = 0;
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityThrottle: ReturnType<typeof setTimeout> | null = null;
const SEEN = new Set<string>();

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

const NOTIF_STALE_MS = 5 * 60 * 1000;
const NOTIF_SEEN_MAX = 100;
const NOTIF_RECONNECT_MAX_RETRIES = 5;
const NOTIF_RECONNECT_MAX_DELAY_MS = 8000;

async function fetchNotificationsFromDb(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as AppNotification[]) || [];
}

export async function saveFCMTokenToBackend(userId: string, token: string) {
  try {
    const lastSaved = localStorage.getItem(`saved_fcm_token_${userId}`);
    if (lastSaved === token) {
      logDebug("FCM token already synchronized for user", { userId });
      return;
    }

    const { error } = await supabase.from("fcm_tokens").upsert(
      { user_id: userId, token, platform: "android", updated_at: new Date().toISOString() },
      { onConflict: "user_id,token" }
    );
    if (error) throw error;

    localStorage.setItem(`saved_fcm_token_${userId}`, token);
    localStorage.setItem("last_fcm_token", token);
    logDebug("FCM token synchronized to backend", { userId });
  } catch (err) {
    logError("Failed to synchronize FCM token to backend", err);
  }
}

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["notifications", user?.id] as const;

  const { data: notifications = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: () => fetchNotificationsFromDb(user!.id),
    enabled: !!user,
    staleTime: NOTIF_STALE_MS,
});

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<AppNotification[]>(queryKey);
      queryClient.setQueryData<AppNotification[]>(queryKey, (old) =>
        old?.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) queryClient.setQueryData(queryKey, context.prev);
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<AppNotification[]>(queryKey);
      queryClient.setQueryData<AppNotification[]>(queryKey, (old) =>
        old?.map((n) => ({ ...n, is_read: true }))
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(queryKey, context.prev);
    },
  });

  // ── Singleton Realtime channel (shared across all hook consumers) ──
  const mountedRef = useRef(true);
  mountedRef.current = true;

  useEffect(() => {
    if (!user) return;
    mountedRef.current = true;
    const userId = user.id;
    const channelName = `notifications-${userId}`;
    const queryKeyForUser: readonly string[] = ["notifications", userId];

    function subscribeToChannel() {
      if (activeUserId !== userId) return;
      if (activeChannel) {
        try { supabase.removeChannel(activeChannel); } catch { /* ignore */ }
      }

      activeChannel = supabase.channel(channelName)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const newNotif = payload.new as AppNotification;
            if (SEEN.has(newNotif.id)) return;
            SEEN.add(newNotif.id);
            if (SEEN.size > NOTIF_SEEN_MAX) {
              const first = SEEN.values().next().value;
              if (first) SEEN.delete(first);
            }

            queryClient.setQueryData<AppNotification[]>(queryKeyForUser, (old) => {
              if (!old) return [newNotif];
              if (old.some((n) => n.id === newNotif.id)) return old;
              return [newNotif, ...old].slice(0, 50);
            });

            if (!mountedRef.current) return;
            if (!Capacitor.isNativePlatform()) {
              showBrowserNotification(newNotif.title, newNotif.message);
            } else {
              fireNativeNotification(newNotif.id, newNotif.title, newNotif.message);
            }
            // Show in-app toast with higher z-index class for mobile
            toast(newNotif.title, {
              description: newNotif.message,
              duration: 5000,
              className: "z-[9999]",
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const updated = payload.new as AppNotification;
            queryClient.setQueryData<AppNotification[]>(queryKeyForUser, (old) =>
              old?.map((n) => (n.id === updated.id ? updated : n))
            );
          }
        )
        .subscribe((status: string) => {
          if (activeUserId !== userId) return;
          logDebug("Notification channel status", { status, userId });
          if (status === "SUBSCRIBED") {
            retryCount = 0;
          } else if (status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT") {
            if (retryCount >= NOTIF_RECONNECT_MAX_RETRIES) return;
            const delay = Math.min(1000 * 2 ** retryCount, NOTIF_RECONNECT_MAX_DELAY_MS);
            retryCount++;
            retryTimer = setTimeout(subscribeToChannel, delay);
          }
        });
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (visibilityThrottle) return;
        visibilityThrottle = setTimeout(() => { visibilityThrottle = null; }, 1000);
        // Always resubscribe on visibility to ensure fresh connection
        retryCount = 0;
        if (retryTimer) clearTimeout(retryTimer);
        subscribeToChannel();
        // Also refresh notifications from DB
        queryClient.invalidateQueries({ queryKey: queryKeyForUser });
      }
    }

    // First consumer for this user → create the channel
    if (refCount === 0 || activeUserId !== userId) {
      if (activeChannel && activeUserId !== userId) {
        try { supabase.removeChannel(activeChannel); } catch { /* ignore */ }
        activeChannel = null;
        activeUserId = null;
        SEEN.clear();
      }

      retryCount = 0;
      activeUserId = userId;
      subscribeToChannel();
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    refCount++;

    // ── App resume listener (Capacitor native only) ──────────────────
    // When the Android app comes back to foreground, reconnect Realtime
    let appStateHandle: { remove: () => Promise<void> } | null = null;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive && activeUserId === userId) {
          logDebug("App resumed — reconnecting notification channel", { userId });
          retryCount = 0;
          if (retryTimer) clearTimeout(retryTimer);
          subscribeToChannel();
          // Refresh from DB to catch any missed notifications
          queryClient.invalidateQueries({ queryKey: queryKeyForUser });
        }
      }).then((handle) => {
        appStateHandle = handle;
      }).catch(() => { /* ignore */ });
    }

    return () => {
      mountedRef.current = false;
      refCount--;
      if (refCount <= 0) {
        refCount = 0;
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        if (visibilityThrottle) { clearTimeout(visibilityThrottle); visibilityThrottle = null; }
        document.removeEventListener("visibilitychange", onVisibilityChange);
        if (activeChannel) {
          try { supabase.removeChannel(activeChannel); } catch { /* ignore */ }
          activeChannel = null;
        }
        activeUserId = null;
      }
      if (appStateHandle) {
        appStateHandle.remove().catch(() => { /* ignore */ });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, queryClient]);

  // Handle foreground FCM push notifications (instant, no guard)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let mounted = true;
    const handleForegroundPush = (notification: PushNotificationSchema) => {
      if (!mounted) return;
      logDebug("Foreground push notification received (suppressed local copy)", notification);
    };

    PushNotifications.addListener("pushNotificationReceived", handleForegroundPush);

    return () => {
      mounted = false;
      try {
        (PushNotifications as any).removeListener("pushNotificationReceived", handleForegroundPush);
      } catch {
        // ignore
      }
    };
  }, []);

  // Synchronize FCM token to database when user is logged in on native platform
  // Delay 2s to avoid lock contention with auth session initialization
  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;

    let active = true;
    const delayTimer = setTimeout(async () => {
      try {
        const cachedToken = localStorage.getItem("last_fcm_token");
        if (cachedToken && active) {
          await saveFCMTokenToBackend(user.id, cachedToken);
        }

        const permResult = await PushNotifications.checkPermissions();
        if (permResult.receive !== "granted" || !active) {
          return;
        }

        let capturedToken: string | null = null;
        const handler = await PushNotifications.addListener(
          "registration",
          (token: any) => {
            capturedToken = token.value;
            localStorage.setItem("last_fcm_token", token.value);
            if (active) {
              saveFCMTokenToBackend(user.id, token.value);
            }
          }
        );

        await PushNotifications.register();

        if (capturedToken || !active) {
          handler.remove();
          return;
        }
        handler.remove();
      } catch (err) {
        logError("FCM token synchronization failed", err);
      }
    }, 2000);

    return () => {
      active = false;
      clearTimeout(delayTimer);
    };
  }, [user?.id]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead: markAsRead.mutate,
    markAllAsRead: markAllAsRead.mutate,
    refetch: () => fetchNotificationsFromDb(user!.id).then((data) => queryClient.setQueryData(queryKey, data)),
  };
}

/** Request notification permission (web and native Capacitor) */
export async function requestNotificationPermission() {
  if (Capacitor.isNativePlatform()) {
    try {
      // Request LocalNotifications permission (needed for Android 13+ / API 33+)
      let localGranted = false;
      try {
        const localPerm = await LocalNotifications.requestPermissions();
        localGranted = localPerm.display === "granted";
        logDebug("Local notification permission result", localPerm);
      } catch (err) {
        logError("Failed to request LocalNotifications permission", err);
      }

      // Request PushNotifications permission (for FCM)
      const permResult = await PushNotifications.requestPermissions();
      logDebug("Push notification permission requested on native platform", permResult);
      if (permResult.receive === "granted") {
        await PushNotifications.register();
      }

      return permResult.receive === "granted" || localGranted ? "granted" : "denied";
    } catch (err) {
      logError("Failed to request native push notification permission", err);
      return "denied";
    }
  } else if ("Notification" in window) {
    const result = await Notification.requestPermission();
    logDebug("Push notification permission requested on web platform", { result });
    return result;
  }
  return "default";
}

function showBrowserNotification(title: string, body: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        icon: "/favicon.png",
        tag: "app-notification",
      });
    } catch {
      // Silent fail
    }
  }
}

async function fireNativeNotification(_id: string, title: string, body: string) {
  try {
    // Check if LocalNotifications permission is granted; request if not
    let permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== "granted") {
      permStatus = await LocalNotifications.requestPermissions();
    }

    if (permStatus.display !== "granted") {
      logDebug("LocalNotifications permission not granted, skipping native notification");
      return;
    }

    // Ensure notification channel exists (required for Android 8.0+)
    const channels = await LocalNotifications.listChannels();
    if (!channels.channels.find(c => c.id === 'default')) {
      await LocalNotifications.createChannel({
        id: 'default',
        name: 'Default',
        description: 'Default app notifications',
        importance: 4, // 4 = High
        visibility: 1, // 1 = Public
      });
    }

    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 2147483647),
        title,
        body,
        smallIcon: "ic_launcher_foreground",
        largeIcon: "ic_launcher",
        channelId: "default",
        sound: "default",
        autoCancel: true,
        ongoing: false,
      }],
    });
  } catch (err) {
    logError("Failed to fire native notification", err);
  }
}
