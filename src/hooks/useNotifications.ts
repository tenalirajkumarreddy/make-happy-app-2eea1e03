import { useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications, PushNotificationSchema } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logDebug, logError } from "@/lib/logger";
import { toast } from "sonner";

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

  // Stable channel name + reconnection logic
  useEffect(() => {
    if (!user) return;

    const SEEN = new Set<string>();
    const MAX_SEEN = 100;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    const channelName = `notifications-${user.id}`;
    let channel = supabase.channel(channelName);

    function setupChannel() {
      if (!mounted) return;
      supabase.removeChannel(channel);

      channel = supabase.channel(channelName)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const newNotif = payload.new as AppNotification;
            if (SEEN.has(newNotif.id)) return;
            SEEN.add(newNotif.id);
            if (SEEN.size > MAX_SEEN) {
              const first = SEEN.values().next().value;
              if (first) SEEN.delete(first);
            }

            queryClient.setQueryData<AppNotification[]>(queryKey, (old) => {
              if (!old) return [newNotif];
              if (old.some((n) => n.id === newNotif.id)) return old;
              return [newNotif, ...old].slice(0, 50);
            });

            if (!Capacitor.isNativePlatform()) {
              showBrowserNotification(newNotif.title, newNotif.message);
            } else {
              fireNativeNotification(newNotif.id, newNotif.title, newNotif.message);
            }
            toast(newNotif.title, { description: newNotif.message, duration: 5000 });
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const updated = payload.new as AppNotification;
            queryClient.setQueryData<AppNotification[]>(queryKey, (old) =>
              old?.map((n) => (n.id === updated.id ? updated : n))
            );
          }
        )
        .subscribe((status: string) => {
          if (!mounted) return;
          if (status === "SUBSCRIBED") {
            retryCount = 0;
          } else if (status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT") {
            if (retryCount >= MAX_RETRIES) return;
            const delay = Math.min(1000 * 2 ** retryCount, 8000);
            retryCount++;
            retryTimer = setTimeout(setupChannel, delay);
          }
        });
    }

    setupChannel();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (retryCount > 0 || ((channel as any)._state !== "SUBSCRIBED" && (channel as any).state !== "SUBSCRIBED")) {
          retryCount = 0;
          if (retryTimer) clearTimeout(retryTimer);
          setupChannel();
        }
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      supabase.removeChannel(channel);
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
  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;

    let active = true;

    const syncFCMToken = async () => {
      try {
        // Step 1: If a token was cached by main.tsx, save it immediately
        const cachedToken = localStorage.getItem("last_fcm_token");
        if (cachedToken) {
          await saveFCMTokenToBackend(user.id, cachedToken);
        }

        // Step 2: Check permission, then register to capture any new/refreshed token
        const permResult = await PushNotifications.checkPermissions();
        if (permResult.receive !== "granted") {
          logDebug("FCM Sync: Notification permission not granted");
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

        // register() may not fire 'registration' if token already obtained,
        // but if it does (first time or token refresh), we catch it above
        await PushNotifications.register();

        if (capturedToken) {
          handler.remove();
          return;
        }

        // Fallback: if register() didn't fire event, token was already
        // handled in Step 1 from localStorage — no-op
        handler.remove();
      } catch (err) {
        logError("FCM token synchronization failed", err);
      }
    };

    syncFCMToken();

    return () => {
      active = false;
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
      const permResult = await PushNotifications.requestPermissions();
      logDebug("Push notification permission requested on native platform", permResult);
      if (permResult.receive === "granted") {
        await PushNotifications.register();
      }
      return permResult.receive;
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
        icon: "/favicon.ico",
        tag: "app-notification",
      });
    } catch {
      // Silent fail
    }
  }
}

async function fireNativeNotification(_id: string, title: string, body: string) {
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 100000),
        title,
        body,
        smallIcon: "ic_launcher",
        largeIcon: "ic_launcher",
      }],
    });
  } catch (err) {
    logError("Failed to fire native notification", err);
  }
}
