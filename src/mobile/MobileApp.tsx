import { useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/contexts/AuthContext";
import { isNativeApp } from "@/lib/capacitorUtils";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { PermissionSetup } from "./components/PermissionSetup";
import { MobileHeader } from "./components/MobileHeader";
import { BottomNav, CUSTOMER_TABS, MARKETER_TABS, MobileTab } from "./components/BottomNav";
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
  if (role === "agent" || role === "manager" || role === "super_admin") {
    return <AgentApp />;
  }

  if (role === "marketer") {
    return <MarketerApp />;
  }

  if (role === "customer") {
    return <CustomerApp />;
  }

  return (
    <div className="h-screen flex items-center justify-center px-6 text-center bg-background">
      <div>
        <p className="text-lg font-semibold text-foreground">Mobile interface unavailable for this role</p>
        <p className="text-sm text-muted-foreground mt-1">This APK currently supports agent, marketer, and customer role interfaces.</p>
      </div>
    </div>
  );
}
