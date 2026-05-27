import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import { env } from "@/lib/env";
import { logDebug, logError } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { PushNotifications } from "@capacitor/push-notifications";

if (env.VITE_SENTRY_DSN && import.meta.env.PROD) {
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENVIRONMENT || 'production',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

// Initialize Capacitor plugins when running as native app
async function initCapacitor() {
  if (Capacitor.isNativePlatform()) {
    const handleAuthCallback = async (url?: string) => {
      if (!url) return;

      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            logError("OAuth code exchange failed", error);
            return;
          }
          window.location.assign("/");
          return;
        }

        const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : "";
        if (!hash) return;

        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            logError("OAuth session restore failed", error);
            return;
          }
          window.location.assign("/");
        }
      } catch (error) {
        logError("OAuth callback parse failed", error);
      }
    };

    CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      handleAuthCallback(url);
    });

    try {
      // Set status bar style
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: "#1a1a2e" });
    } catch (e) {
      logDebug("StatusBar plugin not available");
    }

    try {
      // Hide splash screen after app is ready
      await SplashScreen.hide();
    } catch (e) {
      logDebug("SplashScreen plugin not available");
    }

    // Initialize push notifications (FCM)
    initPushNotifications();
  }
}

async function initPushNotifications() {
  try {
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") {
      logDebug("Push notification permission not granted");
      return;
    }

    // Register with FCM
    await PushNotifications.register();

    // Get FCM token and save to backend
    PushNotifications.addListener("registration", async (token) => {
      logDebug("FCM token received", { token: token.value });
      await saveFCMToken(token.value);
    });

    // Handle incoming push notification (app in background or foreground)
    PushNotifications.addListener("pushNotificationReceived", (notification: any) => {
      logDebug("Push notification received", { title: notification.title });
    });

    // Handle notification tap
    PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (response) => {
        const entityId = (response.notification as any).data?.entity_id;
        const entityType = (response.notification as any).data?.entity_type;
        if (entityId) {
          window.dispatchEvent(
            new CustomEvent("push-notification-tap", {
              detail: { entityId, entityType, title: response.notification.title },
            })
          );
        }
      }
    );

    // Token refresh
    PushNotifications.addListener("tokenRefresh" as any, async (token: any) => {
      logDebug("FCM token refreshed", { token: token.value });
      await saveFCMToken(token.value);
    });
  } catch (e) {
    logDebug("PushNotifications plugin not available", { error: e });
  }
}

async function saveFCMToken(token: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("fcm_tokens").upsert(
      { user_id: user.id, token, platform: "android", updated_at: new Date().toISOString() },
      { onConflict: "user_id,token" }
    );
    logDebug("FCM token saved to backend");
  } catch (e) {
    logError("Failed to save FCM token", e);
  }
}

// Render app first, then initialize native features
createRoot(document.getElementById("root")!).render(<App />);

// Initialize Capacitor after render
initCapacitor();
