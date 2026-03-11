import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { isNativeApp } from "@/lib/capacitorUtils";

export function AppLayout() {
  useRealtimeSync();

  return (
    <div className={`flex h-screen overflow-hidden ${isNativeApp() ? "native-app safe-area-top" : ""}`}>
      <AppSidebar />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <TopBar />
        <main className={`flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden overflow-y-auto native-scroll ${isNativeApp() ? "safe-area-bottom" : ""}`}>
          <Outlet />
        </main>
      </div>
      <GlobalSearch />
    </div>
  );
}
