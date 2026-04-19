import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/error/ErrorBoundary";

// Layout Components
import { MobileHeader } from "./components/MobileHeader";
import { BottomNav, AGENT_TABS, MARKETER_TABS, CUSTOMER_TABS, POS_TABS, ADMIN_TABS } from "./components/BottomNav";
import { OfflineQueueStatus } from "./components/OfflineQueueStatus";

// Agent Pages
import { 
  AgentHome, 
  AgentRoutes, 
  AgentCustomers, 
  AgentHistory, 
  AgentProducts, 
  AgentScan, 
  AgentRecord, 
  AgentStoreProfile 
} from "./pages/agent";

// Customer Pages
import { 
  CustomerHome, 
  CustomerSales, 
  CustomerOrders, 
  CustomerTransactions, 
  CustomerProfile, 
  CustomerKyc 
} from "./pages/customer";

// Marketer Pages
import { 
  MarketerHome, 
  MarketerOrders, 
  MarketerStores, 
  MarketerStoreProfile 
} from "./pages/marketer";

// Admin Pages
import { 
  AdminHome, 
  AdminSales, 
  AdminOrders, 
  AdminCustomers, 
  AdminStores, 
  AdminProducts, 
  AdminTransactions, 
  AdminHandovers, 
  AdminRoutes, 
  AdminProfile, 
  AdminSettings 
} from "./pages/admin";

// POS Pages
import { PosHome } from "./pages/pos";

// Import mobile-v2 styles
import "./styles/mobile-v2.css";

type UserRole = "super_admin" | "manager" | "agent" | "marketer" | "pos" | "customer";

function getDefaultRoute(role: UserRole): string {
  switch (role) {
    case "super_admin":
    case "manager":
      return "/admin";
    case "agent":
      return "/agent";
    case "marketer":
      return "/marketer";
    case "pos":
      return "/pos";
    case "customer":
    default:
      return "/customer";
  }
}

function getTabsForRole(role: UserRole) {
  switch (role) {
    case "super_admin":
    case "manager":
      return ADMIN_TABS;
    case "agent":
      return AGENT_TABS;
    case "marketer":
      return MARKETER_TABS;
    case "pos":
      return POS_TABS;
    case "customer":
    default:
      return CUSTOMER_TABS;
  }
}

export function MobileAppV2() {
  const { user, profile, role, loading } = useAuth();
  const location = useLocation();
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    setIsInitialized(true);
  }, []);

  // Add mobile-v2 class to body for scoped styles
  useEffect(() => {
    document.body.classList.add("mobile-v2");
    return () => {
      document.body.classList.remove("mobile-v2");
    };
  }, []);

  // Loading state
  if (loading || !isInitialized) {
    return (
      <div className="mobile-v2 min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - redirect to auth
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const userRole = (role || "customer") as UserRole;
  const tabs = getTabsForRole(userRole);
  const defaultRoute = getDefaultRoute(userRole);

  // Check if we should show the bottom nav (hide on detail pages)
  const hideBottomNav = location.pathname.includes("/stores/") || 
                        location.pathname.includes("/record") ||
                        location.pathname.includes("/scan");

  return (
    <div className="mobile-v2 min-h-screen bg-background">
      {/* Header */}
      <MobileHeader />

      {/* Main Content - Wrapped in ErrorBoundary for isolated error handling */}
      <ErrorBoundary>
        <main className="pt-16 pb-20">
          <Routes>
          {/* Default Redirect */}
          <Route path="/" element={<Navigate to={defaultRoute} replace />} />

          {/* Agent Routes */}
          <Route path="/agent" element={<AgentHome />} />
          <Route path="/agent/routes" element={<AgentRoutes />} />
          <Route path="/agent/customers" element={<AgentCustomers />} />
          <Route path="/agent/history" element={<AgentHistory />} />
          <Route path="/agent/products" element={<AgentProducts />} />
          <Route path="/agent/scan" element={<AgentScan />} />
          <Route path="/agent/record" element={<AgentRecord />} />
          <Route path="/agent/record/:storeId" element={<AgentRecord />} />
          <Route path="/agent/stores/:storeId" element={<AgentStoreProfile />} />

          {/* Customer Routes */}
          <Route path="/customer" element={<CustomerHome />} />
          <Route path="/customer/sales" element={<CustomerSales />} />
          <Route path="/customer/orders" element={<CustomerOrders />} />
          <Route path="/customer/transactions" element={<CustomerTransactions />} />
          <Route path="/customer/profile" element={<CustomerProfile />} />
          <Route path="/customer/kyc" element={<CustomerKyc />} />

          {/* Marketer Routes */}
          <Route path="/marketer" element={<MarketerHome />} />
          <Route path="/marketer/orders" element={<MarketerOrders />} />
          <Route path="/marketer/stores" element={<MarketerStores />} />
          <Route path="/marketer/stores/:storeId" element={<MarketerStoreProfile />} />

          {/* Admin Routes */}
          <Route path="/admin" element={<AdminHome />} />
          <Route path="/admin/sales" element={<AdminSales />} />
          <Route path="/admin/orders" element={<AdminOrders />} />
          <Route path="/admin/customers" element={<AdminCustomers />} />
          <Route path="/admin/stores" element={<AdminStores />} />
          <Route path="/admin/products" element={<AdminProducts />} />
          <Route path="/admin/transactions" element={<AdminTransactions />} />
          <Route path="/admin/handovers" element={<AdminHandovers />} />
          <Route path="/admin/routes" element={<AdminRoutes />} />
          <Route path="/admin/profile" element={<AdminProfile />} />
          <Route path="/admin/settings" element={<AdminSettings />} />

          {/* POS Routes */}
          <Route path="/pos" element={<PosHome />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Routes>
        </main>
      </ErrorBoundary>

      {/* Bottom Navigation */}
      {!hideBottomNav && <BottomNav tabs={tabs} />}
      
      {/* Offline Queue Status */}
      <OfflineQueueStatus />
    </div>
  );
}

export default MobileAppV2;
