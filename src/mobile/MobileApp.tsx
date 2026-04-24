import { useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Menu, LayoutDashboard, Package, Users, Store, Route, ShoppingCart,
  Receipt, ClipboardList, HandCoins, Map, FileText, BarChart3, History,
  Shield, Settings, Warehouse, User, LogOut, ArrowRightLeft, Building2,
  Calendar, CreditCard, Image, Wallet, Truck, TrendingUp, ClipboardCheck,
  Factory, Undo2, UserCog, Coins,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isNativeApp } from "@/lib/capacitorUtils";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { PermissionSetup } from "./components/PermissionSetup";
import { MobileHeader } from "./components/MobileHeader";
import { BottomNav, CUSTOMER_TABS, MARKETER_TABS, MobileTab, POS_TABS, AGENT_TABS } from "./components/BottomNav";
import { AdminHome } from "./pages/admin/AdminHome";
import Products from "@/pages/Products";
import Customers from "@/pages/Customers";
import CustomerDetail from "@/pages/CustomerDetail";
import Stores from "@/pages/Stores";
import StoreDetail from "@/pages/StoreDetail";
import RoutesPage from "@/pages/Routes";
import RouteDetail from "@/pages/RouteDetail";
import { cn } from "@/lib/utils";
import Sales from "@/pages/Sales";
import Transactions from "@/pages/Transactions";
import Orders from "@/pages/Orders";
import Handovers from "@/pages/Handovers";
import Reports from "@/pages/Reports";
import Analytics from "@/pages/Analytics";
import Inventory from "@/pages/Inventory";
import Activity from "@/pages/Activity";
import AccessControl from "@/pages/AccessControl";
import SettingsPage from "@/pages/Settings";
import MapPage from "@/pages/MapPage";
import UserProfile from "@/pages/UserProfile";
import Vendors from "@/pages/Vendors";
import VendorDetail from "@/pages/VendorDetail";
import Purchases from "@/pages/Purchases";
import StockTransfers from "@/pages/StockTransfers";
import Expenses from "@/pages/Expenses";
import Attendance from "@/pages/Attendance";
import Banners from "@/pages/Banners";
import Invoices from "@/pages/Invoices";
import InvoiceView from "@/pages/InvoiceView";
import { StaffDirectory } from "@/pages/StaffDirectory";
import { Income } from "@/pages/Income";
import CostInsights from "@/pages/CostInsights";
import HandoverRequests from "@/pages/HandoverRequests";
import SaleReturns from "@/pages/SaleReturns";
import PurchaseReturns from "@/pages/PurchaseReturns";
import VendorPayments from "@/pages/VendorPayments";
import StoreTypes from "@/pages/StoreTypes";
import ProductionPage from "@/pages/Production";
import WorkersPage from "@/pages/hr/Workers";
import PayrollPage from "@/pages/hr/Payroll";
import AdminSetup from "@/pages/admin/AdminSetup";
import AdminVehicles from "@/pages/admin/AdminVehicles";
import DeliveryFeasibility from "@/pages/admin/DeliveryFeasibility";
import ProductionLogPage from "@/pages/admin/ProductionLog";
import AdminCostHistory from "@/pages/admin/AdminCostHistory";
import { MobilePageWrapper } from "./components/MobilePageWrapper";
import { AgentHome } from "./pages/agent/AgentHome";
import { AgentRoutes } from "./pages/agent/AgentRoutes";
import { AgentScan } from "./pages/agent/AgentScan";
import { AgentRecord } from "./pages/agent/AgentRecord";
import { AgentHistory } from "./pages/agent/AgentHistory";
import { AgentCustomers } from "./pages/agent/AgentCustomers";
import { AgentStoreProfile } from "./pages/agent/AgentStoreProfile";
import { AgentProducts } from "./pages/agent/AgentProducts";
import { MarketerHome } from "./pages/marketer/MarketerHome";
import { MarketerOrders } from "./pages/marketer/MarketerOrders";
import { MarketerStores } from "./pages/marketer/MarketerStores";
import { MarketerStoreProfile } from "./pages/marketer/MarketerStoreProfile";
import { CustomerHome } from "./pages/customer/CustomerHome";
import { CustomerSales } from "./pages/customer/CustomerSales";
import { CustomerOrders } from "./pages/customer/CustomerOrders";
import { CustomerTransactions } from "./pages/customer/CustomerTransactions";
import { CustomerProfile } from "./pages/customer/CustomerProfile";
import { PosHome } from "./pages/pos/PosHome";
import type { StoreOption } from "./components/StorePickerSheet";
import AddCustomerStore from "@/mobile/pages/agent/AddCustomerStore";

const TAB_TITLES: Record<MobileTab, string> = {
  home: "Dashboard",
  routes: "My Routes",
  scan: "Scan Store",
  history: "History",
  customers: "Stores",
  orders: "Orders",
  record: "Record Transaction",
  sales: "Sales",
  transactions: "Transactions",
  profile: "Profile",
  handovers: "Handovers",
  products: "Product Catalog",
};

type StaffRole = "super_admin" | "manager";

type StaffMenuItem = {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
};

type StaffMenuSection = {
  section: string;
  items: StaffMenuItem[];
};

const STAFF_MENU_BY_ROLE: Record<StaffRole, StaffMenuSection[]> = {
  super_admin: [
    { section: "Overview", items: [
      { id: "dashboard", label: "Dashboard", path: "/", icon: LayoutDashboard },
      { id: "orders", label: "Orders", path: "/orders", icon: ClipboardList },
      { id: "sales", label: "Sales", path: "/sales", icon: ShoppingCart },
      { id: "transactions", label: "Transactions", path: "/transactions", icon: Receipt },
      { id: "handovers", label: "Handovers", path: "/handovers", icon: HandCoins },
      { id: "handover-requests", label: "Handover Requests", path: "/handover-requests", icon: HandCoins },
    ]},
    { section: "Operations", items: [
      { id: "products", label: "Products", path: "/products", icon: Package },
      { id: "inventory", label: "Inventory", path: "/inventory", icon: Warehouse },
      { id: "purchases", label: "Purchases", path: "/purchases", icon: ShoppingCart },
      { id: "stock-transfers", label: "Stock Transfers", path: "/stock-transfers", icon: ArrowRightLeft },
      { id: "routes", label: "Routes", path: "/routes", icon: Route },
      { id: "attendance", label: "Attendance", path: "/attendance", icon: Calendar },
      { id: "map", label: "Map", path: "/map", icon: Map },
    ]},
    { section: "Directory", items: [
      { id: "customers", label: "Customers", path: "/customers", icon: Users },
      { id: "stores", label: "Stores", path: "/stores", icon: Store },
      { id: "store-types", label: "Store Types", path: "/store-types", icon: Store },
      { id: "vendors", label: "Vendors", path: "/vendors", icon: Building2 },
      { id: "invoices", label: "Invoices", path: "/invoices", icon: FileText },
      { id: "vendor-payments", label: "Vendor Payments", path: "/vendor-payments", icon: CreditCard },
      { id: "expenses", label: "Expenses", path: "/expenses", icon: Wallet },
      { id: "sale-returns", label: "Sale Returns", path: "/sale-returns", icon: Undo2 },
      { id: "purchase-returns", label: "Purchase Returns", path: "/purchase-returns", icon: Undo2 },
      { id: "banners", label: "Banners", path: "/banners", icon: Image },
    ]},
    { section: "Insights", items: [
      { id: "reports", label: "Reports", path: "/reports", icon: FileText },
      { id: "analytics", label: "Analytics", path: "/analytics", icon: BarChart3 },
      { id: "cost-insights", label: "Cost Insights", path: "/cost-insights", icon: TrendingUp },
      { id: "income", label: "Income", path: "/income", icon: Coins },
      { id: "activity", label: "Activity Log", path: "/activity", icon: History },
    ]},
    { section: "Manufacturing", items: [
      { id: "production", label: "Production", path: "/production", icon: Factory },
      { id: "production-log", label: "Production Log", path: "/admin/production-log", icon: ClipboardCheck },
    ]},
    { section: "Administration", items: [
      { id: "access", label: "Access Control", path: "/access-control", icon: Shield },
      { id: "staff-dir", label: "Staff Directory", path: "/staff", icon: Users },
      { id: "admin-setup", label: "ERP Setup", path: "/admin/setup", icon: Settings },
      { id: "cost-history", label: "Cost History", path: "/admin/cost-history", icon: TrendingUp },
      { id: "vehicles", label: "Vehicles", path: "/admin/vehicles", icon: Truck },
      { id: "delivery-feasibility", label: "Delivery Feasibility", path: "/admin/delivery-feasibility", icon: Route },
      { id: "settings", label: "Settings", path: "/settings", icon: Settings },
      { id: "profile", label: "My Profile", path: "/profile", icon: User },
    ]},
    { section: "HR", items: [
      { id: "hr-workers", label: "Workers", path: "/hr/staff", icon: UserCog },
      { id: "hr-payroll", label: "Payroll", path: "/hr/payroll", icon: Wallet },
    ]},
  ],
  manager: [
    { section: "Overview", items: [
      { id: "dashboard", label: "Dashboard", path: "/", icon: LayoutDashboard },
      { id: "orders", label: "Orders", path: "/orders", icon: ClipboardList },
      { id: "sales", label: "Sales", path: "/sales", icon: ShoppingCart },
      { id: "transactions", label: "Transactions", path: "/transactions", icon: Receipt },
      { id: "handovers", label: "Handovers", path: "/handovers", icon: HandCoins },
      { id: "handover-requests", label: "Handover Requests", path: "/handover-requests", icon: HandCoins },
    ]},
    { section: "Operations", items: [
      { id: "products", label: "Products", path: "/products", icon: Package },
      { id: "inventory", label: "Inventory", path: "/inventory", icon: Warehouse },
      { id: "purchases", label: "Purchases", path: "/purchases", icon: ShoppingCart },
      { id: "stock-transfers", label: "Stock Transfers", path: "/stock-transfers", icon: ArrowRightLeft },
      { id: "routes", label: "Routes", path: "/routes", icon: Route },
      { id: "attendance", label: "Attendance", path: "/attendance", icon: Calendar },
      { id: "map", label: "Map", path: "/map", icon: Map },
    ]},
    { section: "Directory", items: [
      { id: "customers", label: "Customers", path: "/customers", icon: Users },
      { id: "stores", label: "Stores", path: "/stores", icon: Store },
      { id: "vendors", label: "Vendors", path: "/vendors", icon: Building2 },
      { id: "invoices", label: "Invoices", path: "/invoices", icon: FileText },
      { id: "vendor-payments", label: "Vendor Payments", path: "/vendor-payments", icon: CreditCard },
      { id: "expenses", label: "Expenses", path: "/expenses", icon: Wallet },
      { id: "sale-returns", label: "Sale Returns", path: "/sale-returns", icon: Undo2 },
      { id: "purchase-returns", label: "Purchase Returns", path: "/purchase-returns", icon: Undo2 },
      { id: "banners", label: "Banners", path: "/banners", icon: Image },
    ]},
    { section: "Insights", items: [
      { id: "reports", label: "Reports", path: "/reports", icon: FileText },
      { id: "analytics", label: "Analytics", path: "/analytics", icon: BarChart3 },
      { id: "cost-insights", label: "Cost Insights", path: "/cost-insights", icon: TrendingUp },
      { id: "income", label: "Income", path: "/income", icon: Coins },
      { id: "production-log", label: "Production Log", path: "/admin/production-log", icon: ClipboardCheck },
      { id: "activity", label: "Activity Log", path: "/activity", icon: History },
    ]},
    { section: "Manage", items: [
      { id: "access", label: "Access Control", path: "/access-control", icon: Shield },
      { id: "staff-dir", label: "Staff Directory", path: "/staff", icon: Users },
      { id: "settings", label: "Settings", path: "/settings", icon: Settings },
      { id: "profile", label: "My Profile", path: "/profile", icon: User },
    ]},
    { section: "HR", items: [
      { id: "hr-workers", label: "Workers", path: "/hr/staff", icon: UserCog },
      { id: "hr-payroll", label: "Payroll", path: "/hr/payroll", icon: Wallet },
    ]},
  ],
};
function StaffApp({ role }: { role: StaffRole }) {
  useRealtimeSync();
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const menuSections = STAFF_MENU_BY_ROLE[role];
  const allMenuItems = menuSections.flatMap((s) => s.items);

  const activeMenuItem =
    allMenuItems.find((item) => location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path))) ||
    allMenuItems[0];

  const handleNavigate = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };

  const renderCurrentScreen = () => {
    const path = location.pathname;

    // Detail pages — wrapped with back-nav
    if (matchPath("/customers/:id", path)) return <MobilePageWrapper showBack><CustomerDetail /></MobilePageWrapper>;
    if (matchPath("/stores/:id", path)) return <MobilePageWrapper showBack><StoreDetail /></MobilePageWrapper>;
    if (matchPath("/routes/:id", path)) return <MobilePageWrapper showBack><RouteDetail /></MobilePageWrapper>;
    if (matchPath("/vendors/:id", path)) return <MobilePageWrapper showBack><VendorDetail /></MobilePageWrapper>;
    if (matchPath("/invoices/:id", path)) return <MobilePageWrapper showBack><InvoiceView /></MobilePageWrapper>;

    // Overview
    if (path === "/orders") return <MobilePageWrapper><Orders /></MobilePageWrapper>;
    if (path === "/sales") return <MobilePageWrapper><Sales /></MobilePageWrapper>;
    if (path === "/transactions") return <MobilePageWrapper><Transactions /></MobilePageWrapper>;
    if (path === "/handovers") return <MobilePageWrapper><Handovers /></MobilePageWrapper>;
    if (path === "/handover-requests") return <MobilePageWrapper><HandoverRequests /></MobilePageWrapper>;

    // Operations
    if (path === "/products") return <MobilePageWrapper><Products /></MobilePageWrapper>;
    if (path === "/inventory") return <MobilePageWrapper><Inventory /></MobilePageWrapper>;
    if (path === "/purchases") return <MobilePageWrapper><Purchases /></MobilePageWrapper>;
    if (path === "/stock-transfers") return <MobilePageWrapper><StockTransfers /></MobilePageWrapper>;
    if (path === "/routes") return <MobilePageWrapper><RoutesPage /></MobilePageWrapper>;
    if (path === "/attendance") return <MobilePageWrapper><Attendance /></MobilePageWrapper>;
    if (path === "/map") return <MobilePageWrapper><MapPage /></MobilePageWrapper>;

    // Directory
    if (path === "/customers") return <MobilePageWrapper><Customers /></MobilePageWrapper>;
    if (path === "/stores") return <MobilePageWrapper><Stores /></MobilePageWrapper>;
    if (path === "/store-types") return <MobilePageWrapper><StoreTypes /></MobilePageWrapper>;
    if (path === "/vendors") return <MobilePageWrapper><Vendors /></MobilePageWrapper>;
    if (path === "/invoices") return <MobilePageWrapper><Invoices /></MobilePageWrapper>;
    if (path === "/vendor-payments") return <MobilePageWrapper><VendorPayments /></MobilePageWrapper>;
    if (path === "/expenses") return <MobilePageWrapper><Expenses /></MobilePageWrapper>;
    if (path === "/sale-returns") return <MobilePageWrapper><SaleReturns /></MobilePageWrapper>;
    if (path === "/purchase-returns") return <MobilePageWrapper><PurchaseReturns /></MobilePageWrapper>;
    if (path === "/banners") return <MobilePageWrapper><Banners /></MobilePageWrapper>;

    // Insights
    if (path.startsWith("/reports")) return <MobilePageWrapper><Reports /></MobilePageWrapper>;
    if (path === "/analytics") return <MobilePageWrapper><Analytics /></MobilePageWrapper>;
    if (path === "/cost-insights") return <MobilePageWrapper><CostInsights /></MobilePageWrapper>;
    if (path === "/income") return <MobilePageWrapper><Income /></MobilePageWrapper>;
    if (path === "/activity") return <MobilePageWrapper><Activity /></MobilePageWrapper>;

    // Manufacturing
    if (path === "/production") return <MobilePageWrapper><ProductionPage /></MobilePageWrapper>;
    if (path === "/admin/production-log") return <MobilePageWrapper><ProductionLogPage /></MobilePageWrapper>;

    // Administration
    if (path === "/access-control") return <MobilePageWrapper><AccessControl /></MobilePageWrapper>;
    if (path === "/staff") return <MobilePageWrapper><StaffDirectory /></MobilePageWrapper>;
    if (path === "/admin/setup") return <MobilePageWrapper><AdminSetup /></MobilePageWrapper>;
    if (path === "/admin/cost-history") return <MobilePageWrapper><AdminCostHistory /></MobilePageWrapper>;
    if (path === "/admin/vehicles") return <MobilePageWrapper><AdminVehicles /></MobilePageWrapper>;
    if (path === "/admin/delivery-feasibility") return <MobilePageWrapper><DeliveryFeasibility /></MobilePageWrapper>;
    if (path === "/settings") return <MobilePageWrapper><SettingsPage /></MobilePageWrapper>;
    if (path === "/profile") return <MobilePageWrapper><UserProfile /></MobilePageWrapper>;

    // HR
    if (path === "/hr/staff") return <MobilePageWrapper><WorkersPage /></MobilePageWrapper>;
    if (path === "/hr/payroll") return <MobilePageWrapper><PayrollPage /></MobilePageWrapper>;

    // Dashboard: render mobile-native AdminHome
    return <AdminHome role={role} onNavigate={handleNavigate} />;
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: { remove: () => Promise<void> } | null = null;

    const register = async () => {
      listenerHandle = await CapacitorApp.addListener("backButton", () => {
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }

        if (location.pathname !== "/") {
          navigate("/");
        }
      });
    };

    register();

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [location.pathname, menuOpen, navigate]);

  const initials = (profile?.full_name ?? "A")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <MobileHeader title={activeMenuItem?.label || "Dashboard"} />

      {/* Hamburger menu button — positioned over the header */}
      <button
        onClick={() => setMenuOpen(true)}
        className="fixed left-3 z-50 h-9 w-9 flex items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm hover:bg-white/25 active:scale-95 transition-all"
        style={{ top: "calc(env(safe-area-inset-top) + 0.65rem)" }}
      >
        <Menu className="h-5 w-5 text-white" />
      </button>

      {/* Sidebar Drawer */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 border-0">
          <div className="h-full flex flex-col bg-white dark:bg-slate-900">
            {/* User Info Header */}
            <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 py-5" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)" }}>
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-white/20 ring-2 ring-white/40 flex items-center justify-center shrink-0">
                  <span className="text-white text-sm font-bold">{initials}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{profile?.full_name ?? "User"}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/15 text-[10px] font-semibold text-blue-100 uppercase tracking-wider">
                      {role === "super_admin" ? "Admin" : "Manager"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Menu Items — Grouped by Section */}
            <nav className="flex-1 px-3 py-2 overflow-y-auto">
              {menuSections.map((section, si) => (
                <div key={section.section} className={si > 0 ? "mt-3" : ""}>
                  <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    {section.section}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive =
                        location.pathname === item.path ||
                        (item.path !== "/" && location.pathname.startsWith(item.path));

                      return (
                        <button
                          key={item.id}
                          onClick={() => handleNavigate(item.path)}
                          className={cn(
                            "w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all active:scale-[0.98]",
                            isActive
                              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold shadow-sm"
                              : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                          )}
                        >
                          <div className={cn(
                            "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                            isActive
                              ? "bg-blue-100 dark:bg-blue-800/50"
                              : "bg-slate-100 dark:bg-slate-800"
                          )}>
                            <Icon className={cn(
                              "h-3.5 w-3.5",
                              isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"
                            )} />
                          </div>
                          <span className="truncate">{item.label}</span>
                          {isActive && (
                            <div className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* Sign Out */}
            <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-3">
              <button
                onClick={() => { setMenuOpen(false); signOut(); }}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-[0.98]"
              >
                <div className="h-8 w-8 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                  <LogOut className="h-4 w-4 text-red-500" />
                </div>
                <span className="font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: "calc(3.5rem + env(safe-area-inset-top))",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {renderCurrentScreen()}
      </main>
    </div>
  );
}

function CustomerApp() {
  // useRealtimeSync(); // Excluded for customers to save connections
  const [tab, setTab] = useState<MobileTab>("home");
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: { remove: () => Promise<void> } | null = null;

    const register = async () => {
      listenerHandle = await CapacitorApp.addListener("backButton", () => {
        if (tab !== "home") {
          setTab("home");
        }
      });
    };

    register();

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [tab]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <MobileHeader title={TAB_TITLES[tab]} />

      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: "calc(3.5rem + env(safe-area-inset-top))",
          paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))",
        }}
      >
        {tab === "home" && (
          <CustomerHome
            selectedStoreId={selectedStoreId}
            onStoreChange={setSelectedStoreId}
            onOpenSales={() => setTab("sales")}
            onOpenOrders={() => setTab("orders")}
            onOpenTransactions={() => setTab("transactions")}
            onOpenProfile={() => setTab("profile")}
          />
        )}
        {tab === "sales" && <CustomerSales selectedStoreId={selectedStoreId} />}
        {tab === "orders" && <CustomerOrders selectedStoreId={selectedStoreId} onStoreChange={setSelectedStoreId} />}
        {tab === "transactions" && <CustomerTransactions selectedStoreId={selectedStoreId} />}
        {tab === "profile" && <CustomerProfile />}
      </main>

      <BottomNav tab={tab} onChange={setTab} tabs={CUSTOMER_TABS} />
    </div>
  );
}

function MarketerApp() {
  useRealtimeSync();
  const [tab, setTab] = useState<MobileTab>("home");
  const [showAddEntity, setShowAddEntity] = useState(false);
  const [recordAction, setRecordAction] = useState<"sale" | "payment" | null>(null);
  const [profileStore, setProfileStore] = useState<StoreOption | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: { remove: () => Promise<void> } | null = null;

    const register = async () => {
      listenerHandle = await CapacitorApp.addListener("backButton", () => {
        if (showAddEntity) {
          setShowAddEntity(false);
          return;
        }
        if (recordAction) {
          setRecordAction(null);
        } else if (profileStore) {
          setProfileStore(null);
        } else if (tab !== "home") {
          setTab("home");
        }
      });
    };

    register();

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [tab, recordAction, profileStore, showAddEntity]);

  const handleGoRecord = (store: StoreOption, action: "sale" | "payment" = "sale") => {
    setRecordAction(action);
    setTab("record");
  };

  const handleOpenStoreProfile = (store: StoreOption) => {
    setProfileStore(store);
  };
  
  const handleCloseStoreProfile = () => {
    setProfileStore(null);
  };

  const headerTitle = TAB_TITLES[tab];

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {showAddEntity && <AddCustomerStore onClose={() => setShowAddEntity(false)} />}
      
      {!showAddEntity && <MobileHeader title={headerTitle} />}

      <main
        className={cn(
          "flex-1 overflow-y-auto",
          showAddEntity && "hidden"
         )}
        style={{
          paddingTop: showAddEntity ? 0 : "calc(3.5rem + env(safe-area-inset-top))",
          paddingBottom: showAddEntity ? 0 : "calc(4.5rem + env(safe-area-inset-bottom))",
        }}
      >
        {tab === "home" && (
          <MarketerHome
            onOpenOrders={() => setTab("orders")}
            onOpenRecord={() => setTab("record")}
            onOpenStores={() => setTab("customers")}
            onOpenAddEntity={() => setShowAddEntity(true)}
          />
        )}
        {tab === "products" && <AgentProducts />}
        {tab === "orders" && <MarketerOrders />}
        {tab === "record" && <AgentRecord preselectTab="payment" allowSale={false} />}
        {tab === "history" && <AgentHistory />}
        {tab === "customers" && !profileStore && (
          <MarketerStores
            onOpenStore={handleOpenStoreProfile}
            onGoRecord={handleGoRecord}
          />
        )}
        {tab === "customers" && !!profileStore && (
          <MarketerStoreProfile
            store={profileStore}
            onBack={handleCloseStoreProfile}
            onGoRecord={handleGoRecord}
          />
        )}
      </main>

      <BottomNav tab={tab} onChange={setTab} tabs={MARKETER_TABS} />
    </div>
  );
}

function AgentApp() {
  useRealtimeSync();
  const [tab, setTab] = useState<MobileTab>("home");
  const [showAddEntity, setShowAddEntity] = useState(false);
  const [preselectStore, setPreselectStore] = useState<StoreOption | null>(null);
  const [recordAction, setRecordAction] = useState<"sale" | "payment" | null>(null);
  const [profileStore, setProfileStore] = useState<StoreOption | null>(null);
  const [profileReturnTab, setProfileReturnTab] = useState<MobileTab>("customers");

  const handleGoRecord = (store: StoreOption | null, action: "sale" | "payment") => {
    setPreselectStore(store || null);
    setRecordAction(action);
    setTab("scan");
  };

  const handleGoVisit = () => {
    setPreselectStore(null);
    setRecordAction(null);
    setTab("routes");
  };

  const handleOpenStoreProfile = (store: StoreOption, sourceTab?: MobileTab) => {
    setProfileStore(store);
    setProfileReturnTab(sourceTab || tab);
    setTab("customers");
  };

  const handleCloseStoreProfile = () => {
    setProfileStore(null);
    setTab(profileReturnTab);
  };

  const handleTabChange = (t: MobileTab) => {
    if (t !== "scan") {
      setPreselectStore(null);
      setRecordAction(null);
      setProfileStore(null);
    } else if (t === "scan" && tab === "scan" && (preselectStore || recordAction)) {
      setPreselectStore(null);
      setRecordAction(null);
      return;
    }
    setTab(t);
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: { remove: () => Promise<void> } | null = null;

    const register = async () => {
      listenerHandle = await CapacitorApp.addListener("backButton", () => {
        if (showAddEntity) {
          setShowAddEntity(false);
          return;
        }
        if (recordAction) {
          setRecordAction(null);
        } else if (profileStore) {
          setProfileStore(null);
        } else if (tab !== "home") {
          setTab("home");
        }
      });
    };

    register();

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [tab, recordAction, profileStore, showAddEntity]);

  const headerTitle = tab === "scan" && recordAction ? "Record" : TAB_TITLES[tab];

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {showAddEntity && <AddCustomerStore onClose={() => setShowAddEntity(false)} />}
      
      {!showAddEntity && <MobileHeader title={headerTitle} />}

      {/* Scrollable content area between header and bottom nav */}
      <main
        className={cn(
          "flex-1 overflow-y-auto",
          showAddEntity && "hidden"
         )}
        style={{
          paddingTop: showAddEntity ? 0 : "calc(3.5rem + env(safe-area-inset-top))",
          paddingBottom: showAddEntity ? 0 : "calc(4.5rem + env(safe-area-inset-bottom))",
        }}
      >
        {tab === "home" && (
          <AgentHome
            onOpenStore={(store) => handleOpenStoreProfile(store, "home")}
            onGoRecord={(store, action) => handleGoRecord(store, action)}
            onGoProducts={() => setTab("products")}
            onOpenAddEntity={() => setShowAddEntity(true)}
          />
        )}
        {tab === "products" && <AgentProducts />}
        {tab === "routes" && <AgentRoutes />}
        {tab === "scan" && !recordAction && (
          <AgentScan
            onGoRecord={handleGoRecord}
            onGoVisit={handleGoVisit}
            onOpenStore={(store) => handleOpenStoreProfile(store, "scan")}
          />
        )}
        {tab === "scan" && !!recordAction && <AgentRecord preselectStore={preselectStore} preselectTab={recordAction} />}
        {tab === "history" && <AgentHistory />}
        {tab === "customers" && !profileStore && (
          <AgentCustomers
            onOpenStore={(store) => handleOpenStoreProfile(store, "customers")}
            onGoRecord={(store, action) => handleGoRecord(store, action)}
            onGoVisit={handleGoVisit}
          />
        )}
        {tab === "customers" && !!profileStore && (
          <AgentStoreProfile
            store={profileStore}
            onBack={handleCloseStoreProfile}
            onGoRecord={(store, action) => handleGoRecord(store, action)}
          />
        )}
      </main>

      <BottomNav tab={tab} onChange={handleTabChange} tabs={AGENT_TABS} />
    </div>
  );
}

function PosApp() {
  useRealtimeSync();
  const [tab, setTab] = useState<MobileTab>("home");

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: { remove: () => Promise<void> } | null = null;

    const register = async () => {
      listenerHandle = await CapacitorApp.addListener("backButton", () => {
        if (tab !== "home") {
          setTab("home");
        }
      });
    };

    register();

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [tab]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <MobileHeader title={TAB_TITLES[tab]} />

      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: "calc(3.5rem + env(safe-area-inset-top))",
          paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))",
        }}
      >
        {tab === "home" && <PosHome onOpenRecord={() => setTab("record")} onOpenHistory={() => setTab("history")} />}
        {tab === "record" && <AgentRecord preselectTab="sale" allowPayment={false} />}
        {tab === "handovers" && <Handovers />}
        {tab === "history" && <AgentHistory />}
      </main>

      <BottomNav tab={tab} onChange={setTab} tabs={POS_TABS} />
    </div>
  );
}

export function MobileApp() {
  const { role } = useAuth();
  const permsDone = localStorage.getItem("mobile_permissions_done") === "1";
  const [permissionsSetupComplete, setPermissionsSetupComplete] = useState(
    // In native mode always show permissions screen on first run; in browser always skip
    isNativeApp() ? permsDone : true
  );

  if (!permissionsSetupComplete) {
    return <PermissionSetup onComplete={() => setPermissionsSetupComplete(true)} />;
  }

  // Role-based routing
  if (role === "agent") {
    return <AgentApp />;
  }

  if (role === "super_admin" || role === "manager") {
    return <StaffApp role={role} />;
  }

  if (role === "marketer") {
    return <MarketerApp />;
  }

  if (role === "customer") {
    return <CustomerApp />;
  }

  if (role === "pos") {
    return <PosApp />;
  }

  return (
    <div className="h-screen flex items-center justify-center px-6 text-center bg-background">
      <div>
        <p className="text-lg font-semibold text-foreground">Mobile interface unavailable for this role</p>
        <p className="text-sm text-muted-foreground mt-1">This APK currently supports agent, marketer, POS, and customer role interfaces.</p>
      </div>
    </div>
  );
}
