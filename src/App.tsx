import { Suspense, lazy } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createIndexedDbPersister } from "@/lib/persister";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { logDebug, logError } from "@/lib/logger";
import { Loader2 } from "lucide-react";
import { useCapacitorAppState } from "@/hooks/useCapacitorAppState";
import Auth from "./pages/Auth";

const Onboarding = lazy(() => import("./pages/Onboarding"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AppShell = lazy(() => import("./components/app/AppShell"));

const PageLoader = () => (
  <div className="flex h-full items-center justify-center py-20">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Reactive data layer: data becomes stale immediately so mutations
      // trigger refetches across all subscribed components.
      staleTime: 0,
      // Refetch when window/tab regains focus (keeps cross-tab data in sync)
      refetchOnWindowFocus: true,
      // Always refetch on reconnect (critical for offline-first behaviour)
      refetchOnReconnect: true,
    },
    mutations: {
      onError: (error) => {
        logError("Global mutation error", error);
      },
    },
  },
});

const indexedDbPersister = createIndexedDbPersister();

/**
 * Inner app root that runs *inside* PersistQueryClientProvider.
 * All hooks that need useQueryClient (e.g. useCapacitorAppState)
 * must live here or deeper in the tree.
 */
function AppContent() {
  // Activate Capacitor foreground invalidation (no-op on web)
  useCapacitorAppState();

  return (
    <AuthProvider>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<Suspense fallback={<PageLoader />}><Onboarding /></Suspense>} />
            <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
            <Route path="/*" element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <AppShell />
                </Suspense>
              </ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  );
}

const App = () => {
  logDebug("[APP] Starting Aqua Prime");

  try {
    const _envOk = import.meta.env.VITE_SUPABASE_URL;
    logDebug("[APP] Env vars loaded OK");
  } catch (e) {
    console.error("[APP] ENV ERROR:", e);
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: indexedDbPersister,
        maxAge: 1000 * 60 * 60 * 24,
        buster: "v1",
        prefix: "ap",
      }}
    >
      <AppContent />
    </PersistQueryClientProvider>
  );
};

export default App;
