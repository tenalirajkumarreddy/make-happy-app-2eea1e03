import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { isNativeApp } from "@/lib/capacitorUtils";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { PermissionSetup } from "./components/PermissionSetup";
import { MobileHeader } from "./components/MobileHeader";
import { BottomNav, MobileTab } from "./components/BottomNav";
import { AgentHome } from "./pages/agent/AgentHome";
import { AgentRoutes } from "./pages/agent/AgentRoutes";
import { AgentScan } from "./pages/agent/AgentScan";
import { AgentRecord } from "./pages/agent/AgentRecord";
import { AgentHistory } from "./pages/agent/AgentHistory";
import type { StoreOption } from "./components/StorePickerSheet";

const TAB_TITLES: Record<MobileTab, string> = {
  home: "Dashboard",
  routes: "My Routes",
  scan: "Scan Store",
  record: "Record",
  history: "History",
};

function AgentApp() {
  useRealtimeSync();
  const [tab, setTab] = useState<MobileTab>("home");
  const [preselectStore, setPreselectStore] = useState<StoreOption | null>(null);
  const [preselectTab, setPreselectTab] = useState<"sale" | "payment">("sale");

  const handleGoRecord = (store: StoreOption, action: "sale" | "payment") => {
    setPreselectStore(store);
    setPreselectTab(action);
    setTab("record");
  };

  const handleTabChange = (t: MobileTab) => {
    if (t !== "record") setPreselectStore(null);
    setTab(t);
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <MobileHeader title={TAB_TITLES[tab]} />

      {/* Scrollable content area between header and bottom nav */}
      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: "calc(3.5rem + env(safe-area-inset-top))",
          paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))",
        }}
      >
        {tab === "home" && <AgentHome />}
        {tab === "routes" && <AgentRoutes />}
        {tab === "scan" && <AgentScan onGoRecord={handleGoRecord} />}
        {tab === "record" && <AgentRecord preselectStore={preselectStore} preselectTab={preselectTab} />}
        {tab === "history" && <AgentHistory />}
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
  if (role === "agent") {
    return <AgentApp />;
  }

  // For other roles — show agent interface as placeholder until their tabs are built
  // (manager/admin/marketer/pos can still use the web layout)
  return <AgentApp />;
}
