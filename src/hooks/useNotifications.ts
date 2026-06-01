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

  // Realtime subscription updates the query cache
  useEffect(() => {
    if (!user) return;

    const channelName = `notifications-${user.id}-${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as AppNotification;
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
          
          // Display visual in-app toast
          toast(newNotif.title, {
            description: newNotif.message,
            duration: 5000,
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as AppNotification;
          queryClient.setQueryData<AppNotification[]>(queryKey, (old) =>
            old?.map((n) => (n.id === updated.id ? updated : n))
          );
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (err) {
        logError("Failed to remove notification channel", err);
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
  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;

    let active = true;

    const syncFCMToken = async () => {
      try {
        const permResult = await PushNotifications.checkPermissions();
        if (permResult.receive !== "granted") {
          logDebug("FCM Sync: Notification permission not granted");
          return;
        }

        // Add listener BEFORE register() to avoid race condition
        // (main.tsx also has a listener, but this one saves token
        // directly in sync context without relying on localStorage)
        let capturedToken: string | null = null;
        const handler = await PushNotifications.addListener(
          "registration",
          (token: any) => {
            capturedToken = token.value;
            localStorage.setItem("last_fcm_token", token.value);
          }
        );

        await PushNotifications.register();

        // If registration event already fired, save immediately
        if (capturedToken && active) {
          await saveFCMTokenToBackend(user.id, capturedToken);
          handler.remove();
          return;
        }

        // Fallback: check localStorage (main.tsx listener may have saved it)
        const lastToken = localStorage.getItem("last_fcm_token");
        if (lastToken && active) {
          await saveFCMTokenToBackend(user.id, lastToken);
        }

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
