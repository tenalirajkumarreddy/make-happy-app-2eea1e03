import { Suspense, lazy } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { WarehouseProvider } from "@/contexts/WarehouseContext";
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
const HandoverRequests = lazy(() => import("./pages/HandoverRequests"));
const Reports = lazy(() => import("./pages/Reports"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Vendors = lazy(() => import("./pages/Vendors"));
const VendorDetail = lazy(() => import("./pages/VendorDetail"));
const Purchases = lazy(() => import("./pages/Purchases"));
const VendorPayments = lazy(() => import("./pages/VendorPayments"));
const RawMaterials = lazy(() => import("./pages/RawMaterials"));
const RawMaterialsPage = lazy(() => import('./pages/RawMaterials'));
const BillOfMaterialsPage = lazy(() => import('./pages/BillOfMaterials'));
const BomDetailPage = lazy(() => import('./pages/BomDetail'));
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceForm = lazy(() => import("./pages/InvoiceForm"));
const InvoiceView = lazy(() => import("./pages/InvoiceView"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Banners = lazy(() => import("./pages/Banners"));
const CostInsights = lazy(() => import("./pages/CostInsights"));
const Activity = lazy(() => import("./pages/Activity"));
const AccessControl = lazy(() => import("./pages/AccessControl"));
const AdminStaffDirectory = lazy(() => import("./pages/AdminStaffDirectory").then(m => ({ default: m.AdminStaffDirectory })));
const AdminVehicles = lazy(() => import("./pages/admin/AdminVehicles"));
const DeliveryFeasibility = lazy(() => import("./pages/admin/DeliveryFeasibility"));
const AdminSetup = lazy(() => import("./pages/admin/AdminSetup"));
const AdminCostHistory = lazy(() => import("./pages/admin/AdminCostHistory"));
const ProductionLogPage = lazy(() => import("./pages/admin/ProductionLog"));
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
const StockTransfers = lazy(() => import("./pages/StockTransfers"));
const ProductionPage = lazy(() => import('./pages/Production'));
const WorkerRolesPage = lazy(() => import('./pages/hr/WorkerRoles'));
const WorkersPage = lazy(() => import('./pages/hr/Workers'));
const PayrollPage = lazy(() => import('./pages/hr/Payroll'));
const PayrollDetailPage = lazy(() => import('./pages/hr/PayrollDetail'));

// New features - Staff & Income
const StaffDirectory = lazy(() => import("./pages/StaffDirectory").then(m => ({ default: m.StaffDirectory })));
const StaffProfile = lazy(() => import("./pages/StaffProfile").then(m => ({ default: m.StaffProfile })));
const Income = lazy(() => import("./pages/Income").then(m => ({ default: m.Income })));

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
    <Sentry.ErrorBoundary fallback={({ error, resetError }: { error: any, resetError: () => void }) => {
      console.error("APP CRASH ERROR:", error);
      return (
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
    )}}>
      <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WarehouseProvider>
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
              <Route path="/products" element={<Products />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/vendors" element={<Vendors />} />
              <Route path="/vendors/:vendorId" element={<VendorDetail />} />
              <Route path="/inventory/vendors" element={<Vendors />} />
              <Route path="/inventory/vendors/:vendorId" element={<VendorDetail />} />
              <Route path="/inventory/purchases" element={<RoleGuard allowed={["super_admin", "manager"]}><Purchases /></RoleGuard>} />
              <Route path="/inventory/raw-materials" element={<RawMaterialsPage />} />
              <Route path="/inventory/boms" element={<BillOfMaterialsPage />} />
              <Route path="/inventory/boms/:bomId" element={<BomDetailPage />} />
              <Route path="/production" element={<ProductionPage />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/stores" element={<Stores />} />
              <Route path="/stores/:id" element={<StoreDetail />} />
              <Route path="/store-types" element={<StoreTypes />} />
              <Route path="/store-types/access" element={<StoreTypeAccess />} />
              <Route path="/routes" element={<RoutesPage />} />
              <Route path="/routes/:id" element={<RouteDetail />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/sale-returns" element={<SaleReturns />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/purchase-returns" element={<PurchaseReturns />} />
              <Route path="/purchases" element={<RoleGuard allowed={["super_admin", "manager"]}><Purchases /></RoleGuard>} />
              <Route path="/stock-transfers" element={<StockTransfers />} />
              <Route path="/vendor-payments" element={<VendorPayments />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/attendance" element={<RoleGuard allowed={["super_admin", "manager"]}><Attendance /></RoleGuard>} />
              <Route path="/banners" element={<Banners />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/invoices/new" element={<InvoiceForm />} />
              <Route path="/invoices/:id" element={<InvoiceView />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/handovers" element={<Handovers />} />
              <Route path="/handover-requests" element={<HandoverRequests />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/reports/:type" element={<Reports />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/access-control" element={<AccessControl />} />
              <Route path="/admin/staff" element={<AdminStaffDirectory />} />
<Route path="/staff" element={<StaffDirectory />} />
<Route path="/staff/:userId" element={<StaffProfile />} />
<Route path="/staff/:userId/edit" element={<StaffProfile />} />
<Route path="/income" element={<RoleGuard allowed={["super_admin", "manager"]}><Income /></RoleGuard>} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/profile" element={<UserProfile />} />
              <Route path="/cost-insights" element={<CostInsights />} />
              <Route path="/portal/sales" element={<CustomerSales />} />
              <Route path="/portal/orders" element={<CustomerOrders />} />
              <Route path="/portal/transactions" element={<CustomerTransactions />} />
              <Route path="/portal/profile" element={<CustomerProfile />} />
              <Route path="/admin" element={<RoleGuard allowed={["super_admin"]}><Outlet /></RoleGuard>}>
                <Route path="staff" element={<AdminStaffDirectory />} />
                <Route path="setup" element={<AdminSetup />} />
                <Route path="cost-history" element={<AdminCostHistory />} />
                <Route path="vehicles" element={<AdminVehicles />} />
                <Route path="delivery-feasibility" element={<DeliveryFeasibility />} />
                <Route path="production-log" element={<ProductionLogPage />} />
                <Route path="settings" element={<Settings />} />
                <Route path="map" element={<MapPage />} />
              </Route>
              <Route path="/hr/staff" element={<WorkersPage />} />
              <Route path="/hr/roles" element={<WorkerRolesPage />} />
              <Route path="/hr/payroll" element={<PayrollPage />} />
              <Route path="/hr/payrolls/:payrollId" element={<PayrollDetailPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
            )}
          </Suspense>
        </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
      </WarehouseProvider>
    </AuthProvider>
  </QueryClientProvider>
  </Sentry.ErrorBoundary>
  );
};

export default App;
