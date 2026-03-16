import { useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Menu,
  LayoutDashboard,
  Package,
  Users,
  Store,
  Route,
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
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isNativeApp } from "@/lib/capacitorUtils";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { PermissionSetup } from "./components/PermissionSetup";
import { MobileHeader } from "./components/MobileHeader";
import { BottomNav, CUSTOMER_TABS, MARKETER_TABS, MobileTab, POS_TABS } from "./components/BottomNav";
import Dashboard from "@/pages/Dashboard";
import Products from "@/pages/Products";
import Customers from "@/pages/Customers";
import CustomerDetail from "@/pages/CustomerDetail";
import Stores from "@/pages/Stores";
import StoreDetail from "@/pages/StoreDetail";
import RoutesPage from "@/pages/Routes";
import RouteDetail from "@/pages/RouteDetail";
import Sales from "@/pages/Sales";
import Transactions from "@/pages/Transactions";
import Orders from "@/pages/Orders";
import Handovers from "@/pages/Handovers";
import Reports from "@/pages/Reports";
import Analytics from "@/pages/Analytics";
import Activity from "@/pages/Activity";
import AccessControl from "@/pages/AccessControl";
import SettingsPage from "@/pages/Settings";
import MapPage from "@/pages/MapPage";
import { AgentHome } from "./pages/agent/AgentHome";
import { AgentRoutes } from "./pages/agent/AgentRoutes";
import { AgentScan } from "./pages/agent/AgentScan";
import { AgentRecord } from "./pages/agent/AgentRecord";
import { AgentHistory } from "./pages/agent/AgentHistory";
import { AgentCustomers } from "./pages/agent/AgentCustomers";
import { AgentStoreProfile } from "./pages/agent/AgentStoreProfile";
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
};

type StaffRole = "super_admin" | "manager";

type StaffMenuItem = {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
};

const STAFF_MENU_BY_ROLE: Record<StaffRole, StaffMenuItem[]> = {
  super_admin: [
    { id: "dashboard", label: "Dashboard", path: "/", icon: LayoutDashboard },
    { id: "products", label: "Products", path: "/products", icon: Package },
    { id: "customers", label: "Customers", path: "/customers", icon: Users },
    { id: "stores", label: "Stores", path: "/stores", icon: Store },
    { id: "routes", label: "Routes", path: "/routes", icon: Route },
    { id: "sales", label: "Sales", path: "/sales", icon: ShoppingCart },
    { id: "transactions", label: "Transactions", path: "/transactions", icon: Receipt },
    { id: "orders", label: "Orders", path: "/orders", icon: ClipboardList },
    { id: "handovers", label: "Handovers", path: "/handovers", icon: HandCoins },
    { id: "map", label: "Map", path: "/map", icon: Map },
    { id: "reports", label: "Reports", path: "/reports", icon: FileText },
    { id: "analytics", label: "Analytics", path: "/analytics", icon: BarChart3 },
    { id: "activity", label: "Activity Log", path: "/activity", icon: History },
    { id: "access", label: "Access Control", path: "/access-control", icon: Shield },
    { id: "settings", label: "Settings", path: "/settings", icon: Settings },
  ],
  manager: [
    { id: "dashboard", label: "Dashboard", path: "/", icon: LayoutDashboard },
    { id: "products", label: "Products", path: "/products", icon: Package },
    { id: "customers", label: "Customers", path: "/customers", icon: Users },
    { id: "stores", label: "Stores", path: "/stores", icon: Store },
    { id: "routes", label: "Routes", path: "/routes", icon: Route },
    { id: "sales", label: "Sales", path: "/sales", icon: ShoppingCart },
    { id: "transactions", label: "Transactions", path: "/transactions", icon: Receipt },
    { id: "orders", label: "Orders", path: "/orders", icon: ClipboardList },
    { id: "handovers", label: "Handovers", path: "/handovers", icon: HandCoins },
    { id: "map", label: "Map", path: "/map", icon: Map },
    { id: "reports", label: "Reports", path: "/reports", icon: FileText },
    { id: "analytics", label: "Analytics", path: "/analytics", icon: BarChart3 },
    { id: "activity", label: "Activity Log", path: "/activity", icon: History },
    { id: "settings", label: "Settings", path: "/settings", icon: Settings },
  ],
};

function StaffApp({ role }: { role: StaffRole }) {
  useRealtimeSync();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const menuItems = STAFF_MENU_BY_ROLE[role];

  const activeMenuItem =
    menuItems.find((item) => location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path))) ||
    menuItems[0];

  const renderCurrentScreen = () => {
    const path = location.pathname;

    if (matchPath("/customers/:id", path)) return <CustomerDetail />;
    if (matchPath("/stores/:id", path)) return <StoreDetail />;
    if (matchPath("/routes/:id", path)) return <RouteDetail />;

    if (path.startsWith("/reports")) return <Reports />;
    if (path === "/products") return <Products />;
    if (path === "/customers") return <Customers />;
    if (path === "/stores") return <Stores />;
    if (path === "/routes") return <RoutesPage />;
    if (path === "/sales") return <Sales />;
    if (path === "/transactions") return <Transactions />;
    if (path === "/orders") return <Orders />;
    if (path === "/handovers") return <Handovers />;
    if (path === "/map") return <MapPage />;
    if (path === "/analytics") return <Analytics />;
    if (path === "/activity") return <Activity />;
    if (path === "/access-control" && role === "super_admin") return <AccessControl />;
    if (path === "/settings") return <SettingsPage />;

    return <Dashboard />;
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

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <MobileHeader title={activeMenuItem?.label || "Dashboard"} />

      <Button
        variant="secondary"
        size="icon"
        onClick={() => setMenuOpen(true)}
        className="fixed left-4 z-50 h-9 w-9 shadow-sm"
        style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <div className="h-full bg-sidebar text-sidebar-foreground">
            <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm shrink-0">
                BM
              </div>
              <div className="overflow-hidden">
                <h1 className="text-sm font-bold text-sidebar-accent-foreground truncate">BizManager</h1>
                <p className="text-[11px] text-sidebar-muted truncate">{role === "super_admin" ? "Admin" : "Manager"}</p>
              </div>
            </div>

            <nav className="p-3 space-y-1 overflow-y-auto h-[calc(100%-78px)]">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  location.pathname === item.path ||
                  (item.path !== "/" && location.pathname.startsWith(item.path));

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      navigate(item.path);
                      setMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary font-medium"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
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
  useRealtimeSync();
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
  const [recordStore, setRecordStore] = useState<StoreOption | null>(null);
  const [orderStore, setOrderStore] = useState<StoreOption | null>(null);
  const [profileStore, setProfileStore] = useState<StoreOption | null>(null);

  const handleOpenStoreProfile = (store: StoreOption) => {
    setProfileStore(store);
    setTab("customers");
  };

  const handleGoRecord = (store: StoreOption | null) => {
    setRecordStore(store || null);
    setTab("record");
  };

  const handleGoOrders = (store: StoreOption | null) => {
    setOrderStore(store || null);
    setTab("orders");
  };

  const handleTabChange = (nextTab: MobileTab) => {
    if (nextTab !== "customers") {
      setProfileStore(null);
    }
    if (nextTab !== "record") {
      setRecordStore(null);
    }
    setTab(nextTab);
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: { remove: () => Promise<void> } | null = null;

    const register = async () => {
      listenerHandle = await CapacitorApp.addListener("backButton", () => {
        if (profileStore) {
          setProfileStore(null);
          return;
        }

        if (tab !== "home") {
          setTab("home");
          return;
        }
      });
    };

    register();

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [tab, profileStore]);

  const headerTitle = TAB_TITLES[tab];

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <MobileHeader title={headerTitle} />

      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: "calc(3.5rem + env(safe-area-inset-top))",
          paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))",
        }}
      >
        {tab === "home" && (
          <MarketerHome
            onOpenOrders={() => setTab("orders")}
            onOpenRecord={() => setTab("record")}
            onOpenStores={() => setTab("customers")}
          />
        )}
        {tab === "orders" && <MarketerOrders preselectStore={orderStore} onStoreConsumed={() => setOrderStore(null)} />}
        {tab === "record" && <AgentRecord preselectStore={recordStore} preselectTab="payment" allowSale={false} />}
        {tab === "history" && <AgentHistory />}
        {tab === "customers" && !profileStore && (
          <MarketerStores
            onOpenStore={handleOpenStoreProfile}
            onGoRecord={(store) => handleGoRecord(store)}
            onGoOrders={(store) => handleGoOrders(store)}
          />
        )}
        {tab === "customers" && !!profileStore && (
          <MarketerStoreProfile
            store={profileStore}
            onBack={() => setProfileStore(null)}
            onGoRecord={(store) => handleGoRecord(store)}
            onGoOrders={(store) => handleGoOrders(store)}
          />
        )}
      </main>

      <BottomNav tab={tab} onChange={handleTabChange} tabs={MARKETER_TABS} />
    </div>
  );
}

function AgentApp() {
  useRealtimeSync();
  const [tab, setTab] = useState<MobileTab>("home");
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
        if (profileStore) {
          setProfileStore(null);
          setTab(profileReturnTab);
          return;
        }

        if (recordAction) {
          setRecordAction(null);
          setPreselectStore(null);
          setTab("scan");
          return;
        }

        if (tab !== "home") {
          setPreselectStore(null);
          setRecordAction(null);
          setTab("home");
          return;
        }
      });
    };

    register();

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [tab, recordAction, profileStore, profileReturnTab]);

  const headerTitle = tab === "scan" && recordAction ? "Record" : TAB_TITLES[tab];

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <MobileHeader title={headerTitle} />

      {/* Scrollable content area between header and bottom nav */}
      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: "calc(3.5rem + env(safe-area-inset-top))",
          paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))",
        }}
      >
        {tab === "home" && (
          <AgentHome
            onOpenStore={(store) => handleOpenStoreProfile(store, "home")}
            onGoRecord={(store, action) => handleGoRecord(store, action)}
          />
        )}
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

      <BottomNav tab={tab} onChange={handleTabChange} />
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
