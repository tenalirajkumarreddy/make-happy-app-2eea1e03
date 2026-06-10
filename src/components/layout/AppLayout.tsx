import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { ConflictResolver } from "@/components/shared/ConflictResolver";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function AppLayout() {
  useRealtimeSync();
  const navigate = useNavigate();

  useEffect(() => {
    const handleTap = (e: Event) => {
      const customEvent = e as CustomEvent<{ entityId: string; entityType: string }>;
      const { entityId, entityType } = customEvent.detail;
      if (!entityId) return;

      if (entityType === "order") {
        navigate(`/orders?highlight=${entityId}`);
      } else if (entityType === "sale") {
        navigate(`/sales?highlight=${entityId}`);
      } else if (entityType === "transaction") {
        navigate(`/transactions?highlight=${entityId}`);
      } else if (entityType === "handover") {
        navigate(`/handovers?highlight=${entityId}`);
      } else if (entityType === "expense_claim" || entityType === "expense_request") {
        navigate(`/handovers?highlight=${entityId}`);
      } else if (entityType === "stock_transfer") {
        navigate(`/stock-transfers?highlight=${entityId}`);
      } else if (entityType === "customer") {
        navigate(`/customers/${entityId}`);
      }
    };

    window.addEventListener("push-notification-tap", handleTap);
    return () => {
      window.removeEventListener("push-notification-tap", handleTap);
    };
  }, [navigate]);

  // Web: standard sidebar layout
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden overflow-y-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <GlobalSearch />
      <ConflictResolver />
    </div>
  );
}
