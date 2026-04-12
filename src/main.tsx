import { createRoot } from "react-dom/client";
import "./index.css";
import { env, envError, envIssues } from "@/lib/env";
import { logDebug, logError } from "@/lib/logger";

function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-xl border bg-card p-6 shadow-sm space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">App setup needed</h1>
          <p className="text-sm text-muted-foreground">
            The app can’t start because required configuration is missing or invalid.
          </p>
        </div>

        {(envIssues.missing.length > 0 || envIssues.invalid.length > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {envIssues.missing.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">Missing</p>
                <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                  {envIssues.missing.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </div>
            )}
            {envIssues.invalid.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">Invalid</p>
                <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                  {envIssues.invalid.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">{message}</p>
        </div>

        <p className="text-xs text-muted-foreground">
          Helpful docs: <span className="font-medium">ENVIRONMENT_CONFIG.md</span>, <span className="font-medium">SECURITY_SETUP.md</span>
        </p>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element '#root' not found");
}

const root = createRoot(rootElement);

if (envError) {
  root.render(<ConfigErrorScreen message={envError} />);
} else {
  bootstrap();
}

function attachGlobalErrorHandlers() {
  window.addEventListener("error", (event) => {
    logError("[Global] Unhandled error", event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logError("[Global] Unhandled promise rejection", event.reason);
  });
}

async function bootstrap() {
  attachGlobalErrorHandlers();

  // Initialize Sentry only when configured (keeps dev + web startup fast)
  if (env.VITE_SENTRY_DSN && import.meta.env.PROD) {
    try {
      const Sentry = await import("@sentry/react");
      Sentry.init({
        dsn: env.VITE_SENTRY_DSN,
        environment: env.VITE_SENTRY_ENVIRONMENT || "production",
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
    } catch (err) {
      logError("[Sentry] init failed", err);
    }
  }

  const { default: App } = await import("./App.tsx");
  root.render(<App />);

  // Initialize native features + PWA after render
  initCapacitor();
  registerServiceWorker();
}

// Initialize Capacitor plugins only when running as native app
async function initCapacitor() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const [{ App: CapacitorApp }, { SplashScreen }, statusBarModule, supaModule] = await Promise.all([
      import("@capacitor/app"),
      import("@capacitor/splash-screen"),
      import("@capacitor/status-bar"),
      import("@/integrations/supabase/client"),
    ]);

    const { StatusBar, Style } = statusBarModule;
    const { supabase } = supaModule;

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
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: "#1a1a2e" });
    } catch {
      logDebug("StatusBar plugin not available");
    }

    try {
      await SplashScreen.hide();
    } catch {
      logDebug("SplashScreen plugin not available");
    }
  } catch (error) {
    logError("[Capacitor] init failed", error);
  }
}

// Register service worker for offline support and push notifications
async function registerServiceWorker() {
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      logDebug("[SW] Registered", { scope: reg.scope });
    } catch (err) {
      logError("[SW] Registration failed", err);
    }
  }
}
