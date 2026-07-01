import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

// Inter + JetBrains Mono fonts loaded via CDN in index.html (faster first-visit via jsdelivr cache)
import { env } from "@/lib/env";
import { logDebug, logError } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";

if (env.VITE_SENTRY_DSN && import.meta.env.PROD) {
  // Defer Sentry init to after first paint to reduce main-thread blocking (LCP/TBT)
  const initSentry = () => Sentry.init({
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
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(initSentry, { timeout: 3000 });
  } else {
    setTimeout(initSentry, 0);
  }
}

// Clear all Cache API caches (service worker precache + runtime caches)
async function clearAllCaches() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // Cache API not available (non-HTTP context)
  }
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
      await StatusBar.setBackgroundColor({ color: "hsl(222, 25%, 10%)" });
    } catch (e) {
      logDebug("StatusBar plugin not available");
    }

    try {
      // Enable keyboard-aware scrolling on Android
      Keyboard.setScroll({ isScroll: true });
      Keyboard.addListener("keyboardWillShow", (info) => {
        document.documentElement.style.setProperty("--keyboard-height", `${info.keyboardHeight}px`);
      });
      Keyboard.addListener("keyboardWillHide", () => {
        document.documentElement.style.removeProperty("--keyboard-height");
      });
    } catch (e) {
      logDebug("Keyboard plugin not available");
    }

    try {
      // Hide splash screen after app is ready
      await SplashScreen.hide();
    } catch (e) {
      logDebug("SplashScreen plugin not available");
    }

    // Initialize push notifications (FCM)
    initPushNotifications();

    // Create Android notification channel (required for LocalNotifications on Android 8+ / API 26+)
    // Without this, LocalNotifications will not appear in the system notification tray.
    try {
      await LocalNotifications.createChannel({
        id: "default",
        name: "App Notifications",
        description: "General app notifications for sales, payments, and alerts",
        importance: 4, // HIGH
        visibility: 1, // PUBLIC
        sound: "default",
        vibration: true,
        lights: true,
        lightColor: "#3b82f6",
      });
      logDebug("Notification channel created");
    } catch (e) {
      logDebug("LocalNotifications channel creation failed (may be web or old Android)", { error: e });
    }
  }
}

async function initPushNotifications() {
  try {
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") {
      logDebug("Push notification permission not granted");
      return;
    }

    // Register listeners BEFORE register() to avoid race condition
    PushNotifications.addListener("registration", async (token) => {
      logDebug("FCM token received", { token: token.value });
      localStorage.setItem("last_fcm_token", token.value);
      await saveFCMToken(token.value);
    });

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

    PushNotifications.addListener("tokenRefresh" as any, async (token: any) => {
      logDebug("FCM token refreshed", { token: token.value });
      localStorage.setItem("last_fcm_token", token.value);
      await saveFCMToken(token.value);
    });

    // Register with FCM (listeners are already in place)
    await PushNotifications.register();
  } catch (e) {
    logDebug("PushNotifications plugin not available", { error: e });
  }
}

async function saveFCMToken(token: string) {
  try {
    localStorage.setItem("last_fcm_token", token);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      logDebug("FCM token cached locally, user not logged in yet");
      return;
    }

    const lastSaved = localStorage.getItem(`saved_fcm_token_${user.id}`);
    if (lastSaved === token) {
      logDebug("FCM token already synchronized for user");
      return;
    }

    const { error } = await supabase.from("fcm_tokens").upsert(
      { user_id: user.id, token, platform: "android", updated_at: new Date().toISOString() },
      { onConflict: "user_id,token" }
    );
    if (error) throw error;

    localStorage.setItem(`saved_fcm_token_${user.id}`, token);
    logDebug("FCM token saved to backend");
  } catch (e) {
    logError("Failed to save FCM token", e);
  }
}

// Clear stale caches BEFORE rendering — prevents SW from serving old auth responses
async function startApp() {
  await clearAllCaches();

  /*
   * Defensive: if something crashes during render (e.g. a provider
   * failing), show a generic error so the user isn't stuck on a
   * blank white screen.
   */
  try {
    createRoot(document.getElementById("root")!).render(<App />);
  } catch (renderErr) {
    console.error("[startApp] React render crashed:", renderErr);
    const root = document.getElementById("root");
    if (root) {
      root.innerHTML = `
        <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;padding:24px;font-family:sans-serif;color:#fff;background:#0b0f19">
          <h1 style="font-size:20px;margin-bottom:12px">Something went wrong</h1>
          <p style="font-size:14px;opacity:.7;text-align:center">The app could not start. Please try clearing the app data or reinstalling.</p>
        </div>
      `;
    }
  }

  initCapacitor();
}
startApp();
