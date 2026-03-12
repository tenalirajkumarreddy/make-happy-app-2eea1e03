import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { isNativeApp } from "@/lib/capacitorUtils";
import { MobileApp } from "@/mobile/MobileApp";

export function AppLayout() {
  useRealtimeSync();

  // Native APK: render dedicated mobile UI
  if (isNativeApp()) {
    return <MobileApp />;
  }

  // Web: standard sidebar layout (unchanged)
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <GlobalSearch />
    </div>
  );
}
