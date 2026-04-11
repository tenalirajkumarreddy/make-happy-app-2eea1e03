import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/error/ErrorBoundary";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  Users,
  Store,
  Route as RouteIcon,
  ShoppingCart,
  Receipt,
  ClipboardList,
  HandCoins,
  Map,
  FileText,
  BarChart3,
  History,
  Shield,
  Settings,
  Warehouse,
  Image,
  Building2,
  CreditCard,
  Calendar,
  Wallet,
  ArrowRightLeft,
  User,
} from "lucide-react";

// Layout Components
import { MobileHeader } from "./components/MobileHeader";
import { BottomNav, AGENT_TABS, MARKETER_TABS, CUSTOMER_TABS, POS_TABS, ADMIN_TABS } from "./components/BottomNav";

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

// Admin Pages (mobile-v2 native versions)
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

// Web pages reused for features not yet in mobile-v2
import Inventory from "@/pages/Inventory";
import Vendors from "@/pages/Vendors";
import VendorDetail from "@/pages/VendorDetail";
import Purchases from "@/pages/Purchases";
import VendorPayments from "@/pages/VendorPayments";
import Expenses from "@/pages/Expenses";
import Attendance from "@/pages/Attendance";
import Invoices from "@/pages/Invoices";
import InvoiceForm from "@/pages/InvoiceForm";
import InvoiceView from "@/pages/InvoiceView";
import StockTransfers from "@/pages/StockTransfers";
import Banners from "@/pages/Banners";
import MapPage from "@/pages/MapPage";
import Reports from "@/pages/Reports";
import Analytics from "@/pages/Analytics";
import Activity from "@/pages/Activity";
import AccessControl from "@/pages/AccessControl";
import { AdminStaffDirectory } from "@/pages/AdminStaffDirectory";
import CustomerDetail from "@/pages/CustomerDetail";
import StoreDetail from "@/pages/StoreDetail";
import RouteDetail from "@/pages/RouteDetail";
import SaleReturns from "@/pages/SaleReturns";
import PurchaseReturns from "@/pages/PurchaseReturns";
import Handovers from "@/pages/Handovers";

// Import mobile-v2 styles
import "./styles/mobile-v2.css";

type UserRole = "super_admin" | "manager" | "agent" | "marketer" | "pos" | "customer";

// ---------- Staff Drawer Menu Items ----------
interface StaffMenuItem {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_MENU_ITEMS: StaffMenuItem[] = [
  { id: "dashboard", label: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { id: "products", label: "Products", path: "/admin/products", icon: Package },
  { id: "inventory", label: "Inventory", path: "/admin/inventory", icon: Warehouse },
  { id: "customers", label: "Customers", path: "/admin/customers", icon: Users },
  { id: "vendors", label: "Vendors", path: "/admin/vendors", icon: Building2 },
  { id: "stores", label: "Stores", path: "/admin/stores", icon: Store },
  { id: "routes", label: "Routes", path: "/admin/routes", icon: RouteIcon },
  { id: "orders", label: "Orders", path: "/admin/orders", icon: ClipboardList },
  { id: "invoices", label: "Invoices", path: "/admin/invoices", icon: FileText },
  { id: "sales", label: "Sales", path: "/admin/sales", icon: ShoppingCart },
  { id: "transactions", label: "Transactions", path: "/admin/transactions", icon: Receipt },
  { id: "purchases", label: "Purchases", path: "/admin/purchases", icon: ShoppingCart },
  { id: "vendor-payments", label: "Vendor Payments", path: "/admin/vendor-payments", icon: CreditCard },
  { id: "expenses", label: "Expenses", path: "/admin/expenses", icon: Wallet },
  { id: "attendance", label: "Attendance", path: "/admin/attendance", icon: Calendar },
  { id: "handovers", label: "Handovers", path: "/admin/handovers", icon: HandCoins },
  { id: "stock-transfers", label: "Stock Transfers", path: "/admin/stock-transfers", icon: ArrowRightLeft },
  { id: "map", label: "Map", path: "/admin/map", icon: Map },
  { id: "banners", label: "Banners", path: "/admin/banners", icon: Image },
  { id: "reports", label: "Reports", path: "/admin/reports", icon: FileText },
  { id: "analytics", label: "Analytics", path: "/admin/analytics", icon: BarChart3 },
  { id: "activity", label: "Activity Log", path: "/admin/activity", icon: History },
  { id: "profile", label: "My Profile", path: "/admin/profile", icon: User },
  { id: "settings", label: "Settings", path: "/admin/settings", icon: Settings },
];

const SUPER_ADMIN_ONLY_ITEMS: StaffMenuItem[] = [
  { id: "access", label: "Access Control", path: "/admin/access-control", icon: Shield },
  { id: "staff", label: "Staff Directory", path: "/admin/staff", icon: Users },
];

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

// ---------- Staff Drawer Component ----------
function StaffDrawer({
  open,
  onClose,
  role,
}: {
  open: boolean;
  onClose: () => void;
  role: UserRole;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    ...ADMIN_MENU_ITEMS,
    ...(role === "super_admin" ? SUPER_ADMIN_ONLY_ITEMS : []),
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="left" className="w-72 p-0">
        <div className="h-full bg-sidebar text-sidebar-foreground flex flex-col">
          {/* Drawer header */}
          <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden shrink-0 ring-1 ring-white/20 bg-white/10">
              <img src="/logo.png" alt="Logo" className="h-full w-full object-contain p-1" />
            </div>
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold text-sidebar-accent-foreground truncate">
                Aqua Prime
              </h1>
              <p className="text-[11px] text-sidebar-muted truncate">
                {role === "super_admin" ? "Super Admin" : "Manager"}
              </p>
            </div>
          </div>

          {/* Nav items */}
          <nav className="p-3 space-y-0.5 overflow-y-auto flex-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.path ||
                (item.path !== "/admin" &&
                  location.pathname.startsWith(item.path));

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    navigate(item.path);
                    onClose();
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------- Main Mobile App ----------
export function MobileAppV2() {
  const { user, profile, role, loading } = useAuth();
  const location = useLocation();
  const [isInitialized, setIsInitialized] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
  const isStaff = userRole === "super_admin" || userRole === "manager";

  // Check if we should show the bottom nav (hide on detail pages)
  const hideBottomNav = location.pathname.includes("/stores/") || 
                        location.pathname.includes("/record") ||
                        location.pathname.includes("/scan") ||
                        location.pathname.includes("/customers/") ||
                        location.pathname.includes("/routes/") ||
                        location.pathname.includes("/vendors/") ||
                        location.pathname.includes("/invoices/");

  return (
    <div className="mobile-v2 min-h-screen bg-background">
      {/* Staff Drawer */}
      {isStaff && (
        <StaffDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          role={userRole}
        />
      )}

      {/* Header — show hamburger for staff roles */}
      <MobileHeader
        onMenuClick={isStaff ? () => setDrawerOpen(true) : undefined}
      />

      {/* Main Content */}
      <ErrorBoundary>
        <main className="pt-16 pb-20">
          <Routes>
          {/* Default Redirect */}
          <Route path="/" element={<Navigate to={defaultRoute} replace />} />

          {/* ═══════════════ Agent Routes ═══════════════ */}
          <Route path="/agent" element={<AgentHome />} />
          <Route path="/agent/routes" element={<AgentRoutes />} />
          <Route path="/agent/customers" element={<AgentCustomers />} />
          <Route path="/agent/history" element={<AgentHistory />} />
          <Route path="/agent/products" element={<AgentProducts />} />
          <Route path="/agent/scan" element={<AgentScan />} />
          <Route path="/agent/record" element={<AgentRecord />} />
          <Route path="/agent/record/:storeId" element={<AgentRecord />} />
          <Route path="/agent/stores/:storeId" element={<AgentStoreProfile />} />

          {/* ═══════════════ Customer Routes ═══════════════ */}
          <Route path="/customer" element={<CustomerHome />} />
          <Route path="/customer/sales" element={<CustomerSales />} />
          <Route path="/customer/orders" element={<CustomerOrders />} />
          <Route path="/customer/transactions" element={<CustomerTransactions />} />
          <Route path="/customer/profile" element={<CustomerProfile />} />
          <Route path="/customer/kyc" element={<CustomerKyc />} />

          {/* ═══════════════ Marketer Routes ═══════════════ */}
          <Route path="/marketer" element={<MarketerHome />} />
          <Route path="/marketer/orders" element={<MarketerOrders />} />
          <Route path="/marketer/stores" element={<MarketerStores />} />
          <Route path="/marketer/stores/:storeId" element={<MarketerStoreProfile />} />

          {/* ═══════════════ Admin/Manager Routes ═══════════════ */}
          {/* Native mobile-v2 pages */}
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

          {/* All missing web-parity pages — reusing web page components */}
          <Route path="/admin/inventory" element={<Inventory />} />
          <Route path="/admin/vendors" element={<Vendors />} />
          <Route path="/admin/vendors/:id" element={<VendorDetail />} />
          <Route path="/admin/purchases" element={<Purchases />} />
          <Route path="/admin/purchase-returns" element={<PurchaseReturns />} />
          <Route path="/admin/vendor-payments" element={<VendorPayments />} />
          <Route path="/admin/expenses" element={<Expenses />} />
          <Route path="/admin/attendance" element={<Attendance />} />
          <Route path="/admin/invoices" element={<Invoices />} />
          <Route path="/admin/invoices/new" element={<InvoiceForm />} />
          <Route path="/admin/invoices/:id" element={<InvoiceView />} />
          <Route path="/admin/stock-transfers" element={<StockTransfers />} />
          <Route path="/admin/sale-returns" element={<SaleReturns />} />
          <Route path="/admin/banners" element={<Banners />} />
          <Route path="/admin/map" element={<MapPage />} />
          <Route path="/admin/reports" element={<Reports />} />
          <Route path="/admin/reports/:type" element={<Reports />} />
          <Route path="/admin/analytics" element={<Analytics />} />
          <Route path="/admin/activity" element={<Activity />} />
          <Route path="/admin/access-control" element={<AccessControl />} />
          <Route path="/admin/staff" element={<AdminStaffDirectory />} />

          {/* Detail pages (shared web components) */}
          <Route path="/admin/customers/:id" element={<CustomerDetail />} />
          <Route path="/admin/stores/:id" element={<StoreDetail />} />
          <Route path="/admin/routes/:id" element={<RouteDetail />} />

          {/* ═══════════════ POS Routes ═══════════════ */}
          <Route path="/pos" element={<PosHome />} />
          <Route path="/pos/handovers" element={<Handovers />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Routes>
        </main>
      </ErrorBoundary>

      {/* Bottom Navigation */}
      {!hideBottomNav && <BottomNav tabs={tabs} />}
    </div>
  );
}

export default MobileAppV2;
