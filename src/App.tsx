import { Suspense, lazy } from "react";
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
import { Loader2 } from "lucide-react";
import { isNativeApp } from "@/lib/capacitorUtils";
import { MobileAppV2 } from "@/mobile-v2";

// Critical pages loaded eagerly for fast initial load
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Role dashboards - loaded eagerly as they're immediate destinations
import AgentDashboard from "./pages/AgentDashboard";
import MarketerDashboard from "./pages/MarketerDashboard";
import PosDashboard from "./pages/PosDashboard";
import CustomerPortal from "./pages/CustomerPortal";

// Lazy-loaded pages (code splitting)
const Products = lazy(() => import("./pages/Products"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));
const Stores = lazy(() => import("./pages/Stores"));
const StoreDetail = lazy(() => import("./pages/StoreDetail"));
const RoutesPage = lazy(() => import("./pages/Routes"));
const RouteDetail = lazy(() => import("./pages/RouteDetail"));
const Sales = lazy(() => import("./pages/Sales"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Orders = lazy(() => import("./pages/Orders"));
const Handovers = lazy(() => import("./pages/Handovers"));
const Reports = lazy(() => import("./pages/Reports"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Vendors = lazy(() => import("./pages/Vendors"));
const VendorDetail = lazy(() => import("./pages/VendorDetail"));
const Purchases = lazy(() => import("./pages/Purchases"));
const VendorPayments = lazy(() => import("./pages/VendorPayments"));
const RawMaterials = lazy(() => import("./pages/RawMaterials"));
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceForm = lazy(() => import("./pages/InvoiceForm"));
const InvoiceView = lazy(() => import("./pages/InvoiceView"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Banners = lazy(() => import("./pages/Banners"));
const Activity = lazy(() => import("./pages/Activity"));
const AccessControl = lazy(() => import("./pages/AccessControl"));
const AdminStaffDirectory = lazy(() => import("./pages/AdminStaffDirectory").then(m => ({ default: m.AdminStaffDirectory })).catch(() => ({ default: () => <div>Error loading page</div> })));
const StaffProfile = lazy(() => import("./pages/StaffProfile"));
const Settings = lazy(() => import("./pages/Settings"));
const StoreTypes = lazy(() => import("./pages/StoreTypes"));
const StoreTypeAccess = lazy(() => import("./pages/StoreTypeAccess"));
const MapPage = lazy(() => import("./pages/MapPage"));
const CustomerSales = lazy(() => import("./pages/CustomerSales"));
const CustomerOrders = lazy(() => import("./pages/CustomerOrders"));
const CustomerTransactions = lazy(() => import("./pages/CustomerTransactions"));
const CustomerProfile = lazy(() => import("./pages/CustomerProfile"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Expenses = lazy(() => import("./pages/Expenses"));
const SaleReturns = lazy(() => import("./pages/SaleReturns"));
const PurchaseReturns = lazy(() => import("./pages/PurchaseReturns"));

// Loading fallback component
const PageLoader = () => (
  <div className="flex h-full items-center justify-center py-20">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

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

const App = () => {
  const isMobile = isNativeApp();

  return (
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
            <Suspense fallback={<PageLoader />}>
            {isMobile ? (
              // Mobile APK: Use dedicated mobile routing
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/*" element={
                  <ProtectedRoute>
                    <MobileAppV2 />
                  </ProtectedRoute>
                } />
              </Routes>
            ) : (
              // Web: Standard routing
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
              <Route path="/vendors" element={<RoleGuard allowed={["super_admin", "manager"]}><Vendors /></RoleGuard>} />
              <Route path="/vendors/:id" element={<RoleGuard allowed={["super_admin", "manager"]}><VendorDetail /></RoleGuard>} />
              <Route path="/purchases" element={<RoleGuard allowed={["super_admin", "manager"]}><Purchases /></RoleGuard>} />
              <Route path="/vendor-payments" element={<RoleGuard allowed={["super_admin", "manager"]}><VendorPayments /></RoleGuard>} />
              <Route path="/raw-materials" element={<RoleGuard allowed={["super_admin", "manager"]}><RawMaterials /></RoleGuard>} />
              <Route path="/invoices" element={<RoleGuard allowed={["super_admin", "manager"]}><Invoices /></RoleGuard>} />
              <Route path="/invoices/new" element={<RoleGuard allowed={["super_admin", "manager"]}><InvoiceForm /></RoleGuard>} />
              <Route path="/invoices/:id" element={<RoleGuard allowed={["super_admin", "manager"]}><InvoiceView /></RoleGuard>} />
              <Route path="/invoices/:id/print" element={<RoleGuard allowed={["super_admin", "manager"]}><InvoiceView /></RoleGuard>} />
              <Route path="/attendance" element={<RoleGuard allowed={["super_admin", "manager"]}><Attendance /></RoleGuard>} />
              <Route path="/expenses" element={<RoleGuard allowed={["super_admin", "manager"]}><Expenses /></RoleGuard>} />
              <Route path="/banners" element={<RoleGuard allowed={["super_admin", "manager"]}><Banners /></RoleGuard>} />
              <Route path="/analytics" element={<RoleGuard allowed={["super_admin", "manager"]}><Analytics /></RoleGuard>} />
              <Route path="/reports" element={<RoleGuard allowed={["super_admin", "manager"]}><Reports /></RoleGuard>} />
              <Route path="/reports/:type" element={<RoleGuard allowed={["super_admin", "manager"]}><Reports /></RoleGuard>} />
              <Route path="/activity" element={<RoleGuard allowed={["super_admin", "manager"]}><Activity /></RoleGuard>} />
              <Route path="/access-control" element={<RoleGuard allowed={["super_admin"]}><AccessControl /></RoleGuard>} />
              <Route path="/admin/staff" element={<RoleGuard allowed={["super_admin"]}><AdminStaffDirectory /></RoleGuard>} />
              <Route path="/admin/staff/:userId" element={<RoleGuard allowed={["super_admin"]}><StaffProfile /></RoleGuard>} />
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
              {/* Sale Returns: Admin, Manager */}
              <Route path="/sale-returns" element={<RoleGuard allowed={["super_admin", "manager"]}><SaleReturns /></RoleGuard>} />
              {/* Transactions: Admin, Manager, Agent, Marketer */}
              <Route path="/transactions" element={<RoleGuard allowed={["super_admin", "manager", "agent", "marketer"]}><Transactions /></RoleGuard>} />
              {/* Purchase Returns: Admin, Manager */}
              <Route path="/purchase-returns" element={<RoleGuard allowed={["super_admin", "manager"]}><PurchaseReturns /></RoleGuard>} />
              {/* Orders: Admin, Manager, Agent, Marketer */}
              <Route path="/orders" element={<RoleGuard allowed={["super_admin", "manager", "agent", "marketer"]}><Orders /></RoleGuard>} />
              {/* Handovers: All staff */}
              <Route path="/handovers" element={<RoleGuard allowed={["super_admin", "manager", "agent", "marketer", "pos"]}><Handovers /></RoleGuard>} />
              
              {/* User Profile: All authenticated users */}
              <Route path="/profile" element={<UserProfile />} />
              
              {/* Customer portal pages */}
              <Route path="/portal/sales" element={<RoleGuard allowed={["customer"]}><CustomerSales /></RoleGuard>} />
              <Route path="/portal/orders" element={<RoleGuard allowed={["customer"]}><CustomerOrders /></RoleGuard>} />
              <Route path="/portal/transactions" element={<RoleGuard allowed={["customer"]}><CustomerTransactions /></RoleGuard>} />
              <Route path="/portal/profile" element={<RoleGuard allowed={["customer"]}><CustomerProfile /></RoleGuard>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
            )}
          </Suspense>
        </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  </Sentry.ErrorBoundary>
  );
};

export default App;
