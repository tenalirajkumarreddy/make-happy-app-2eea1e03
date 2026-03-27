import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleRoute } from "@/components/auth/RoleRoute";
import { RoleGuard } from "@/components/auth/RoleGuard";
import * as Sentry from "@sentry/react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { logError } from "@/lib/logger";
import Dashboard from "./pages/Dashboard";
import AgentDashboard from "./pages/AgentDashboard";
import MarketerDashboard from "./pages/MarketerDashboard";
import PosDashboard from "./pages/PosDashboard";
import Products from "./pages/Products";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Stores from "./pages/Stores";
import StoreDetail from "./pages/StoreDetail";
import RoutesPage from "./pages/Routes";
import RouteDetail from "./pages/RouteDetail";
import Sales from "./pages/Sales";
import Transactions from "./pages/Transactions";
import Orders from "./pages/Orders";
import Handovers from "./pages/Handovers";
import Reports from "./pages/Reports";
import Analytics from "./pages/Analytics";
import Inventory from "./pages/Inventory";
import Banners from "./pages/Banners";
import Activity from "./pages/Activity";
import AccessControl from "./pages/AccessControl";
import { AdminStaffDirectory } from "./pages/AdminStaffDirectory";
import Settings from "./pages/Settings";
import StoreTypes from "./pages/StoreTypes";
import StoreTypeAccess from "./pages/StoreTypeAccess";
import CustomerPortal from "./pages/CustomerPortal";
import MapPage from "./pages/MapPage";
import CustomerSales from "./pages/CustomerSales";
import CustomerOrders from "./pages/CustomerOrders";
import CustomerTransactions from "./pages/CustomerTransactions";
import CustomerProfile from "./pages/CustomerProfile";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
    mutations: {
      onError: (error) => {
        logError("Global mutation error", error);
      },
    },
  },
});

function DashboardRouter() {
  return (
    <RoleRoute
      staffElement={<Dashboard />}
      customerElement={<CustomerPortal />}
      agentElement={<AgentDashboard />}
      marketerElement={<MarketerDashboard />}
      posElement={<PosDashboard />}
    />
  );
}

const App = () => (
  <Sentry.ErrorBoundary fallback={({ error, resetError }: { error: any, resetError: () => void }) => (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
      <h1 className="mb-2 text-2xl font-bold text-foreground">Something went wrong</h1>
      <p className="mb-4 text-muted-foreground">{error?.message || "An unexpected error occurred."}</p>
      <button 
        onClick={resetError}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  )}>
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Sonner />
        <ErrorBoundary>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardRouter />} />
              {/* Admin & Manager only */}
              <Route path="/products" element={<RoleGuard allowed={["super_admin", "manager"]}><Products /></RoleGuard>} />
              <Route path="/inventory" element={<RoleGuard allowed={["super_admin", "manager"]}><Inventory /></RoleGuard>} />
              <Route path="/banners" element={<RoleGuard allowed={["super_admin", "manager"]}><Banners /></RoleGuard>} />
              <Route path="/analytics" element={<RoleGuard allowed={["super_admin", "manager"]}><Analytics /></RoleGuard>} />
              <Route path="/reports" element={<RoleGuard allowed={["super_admin", "manager"]}><Reports /></RoleGuard>} />
              <Route path="/reports/:type" element={<RoleGuard allowed={["super_admin", "manager"]}><Reports /></RoleGuard>} />
              <Route path="/activity" element={<RoleGuard allowed={["super_admin", "manager"]}><Activity /></RoleGuard>} />
              <Route path="/access-control" element={<RoleGuard allowed={["super_admin"]}><AccessControl /></RoleGuard>} />
              <Route path="/admin/staff" element={<RoleGuard allowed={["super_admin"]}><AdminStaffDirectory /></RoleGuard>} />
              <Route path="/settings" element={<RoleGuard allowed={["super_admin", "manager"]}><Settings /></RoleGuard>} />
              <Route path="/map" element={<RoleGuard allowed={["super_admin", "manager"]}><MapPage /></RoleGuard>} />
              {/* Admin, Manager, Agent, Marketer */}
              <Route path="/customers" element={<RoleGuard allowed={["super_admin", "manager", "agent", "marketer"]}><Customers /></RoleGuard>} />
              <Route path="/customers/:id" element={<RoleGuard allowed={["super_admin", "manager", "agent", "marketer"]}><CustomerDetail /></RoleGuard>} />
              <Route path="/stores" element={<RoleGuard allowed={["super_admin", "manager", "agent", "marketer"]}><Stores /></RoleGuard>} />
              <Route path="/stores/:id" element={<RoleGuard allowed={["super_admin", "manager", "agent", "marketer"]}><StoreDetail /></RoleGuard>} />
              <Route path="/store-types" element={<RoleGuard allowed={["super_admin", "manager"]}><StoreTypes /></RoleGuard>} />
              <Route path="/store-types/access" element={<RoleGuard allowed={["super_admin", "manager"]}><StoreTypeAccess /></RoleGuard>} />
              {/* Routes: Admin, Manager, Agent */}
              <Route path="/routes" element={<RoleGuard allowed={["super_admin", "manager", "agent"]}><RoutesPage /></RoleGuard>} />
              <Route path="/routes/:id" element={<RoleGuard allowed={["super_admin", "manager", "agent"]}><RouteDetail /></RoleGuard>} />
              {/* Sales: Admin, Manager, Agent, POS */}
              <Route path="/sales" element={<RoleGuard allowed={["super_admin", "manager", "agent", "pos"]}><Sales /></RoleGuard>} />
              {/* Transactions: Admin, Manager, Agent, Marketer */}
              <Route path="/transactions" element={<RoleGuard allowed={["super_admin", "manager", "agent", "marketer"]}><Transactions /></RoleGuard>} />
              {/* Orders: Admin, Manager, Agent, Marketer */}
              <Route path="/orders" element={<RoleGuard allowed={["super_admin", "manager", "agent", "marketer"]}><Orders /></RoleGuard>} />
              {/* Handovers: All staff */}
              <Route path="/handovers" element={<RoleGuard allowed={["super_admin", "manager", "agent", "marketer", "pos"]}><Handovers /></RoleGuard>} />
              {/* Customer portal pages */}
              <Route path="/portal/sales" element={<RoleGuard allowed={["customer"]}><CustomerSales /></RoleGuard>} />
              <Route path="/portal/orders" element={<RoleGuard allowed={["customer"]}><CustomerOrders /></RoleGuard>} />
              <Route path="/portal/transactions" element={<RoleGuard allowed={["customer"]}><CustomerTransactions /></RoleGuard>} />
              <Route path="/portal/profile" element={<RoleGuard allowed={["customer"]}><CustomerProfile /></RoleGuard>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  </Sentry.ErrorBoundary>
);

export default App;
