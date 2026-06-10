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
      staleTime: 5 * 60 * 1000,
    },
    mutations: {
      onError: (error) => {
        logError("Global mutation error", error);
      },
    },
  },
});

const indexedDbPersister = createIndexedDbPersister();

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
    </PersistQueryClientProvider>
  );
};

export default App;
