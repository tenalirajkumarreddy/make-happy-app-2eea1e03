import { Suspense, type ReactNode } from "react";
import { MobileHeader } from "./MobileHeader";
import { BottomNav, type MobileTab, type MobileTabItem } from "./BottomNav";

const PageLoader = () => (
  <div className="flex h-full items-center justify-center py-20">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

export function MobileShell({
  title,
  tabs,
  tab,
  onTabChange,
  children,
}: {
  title: string;
  tabs: MobileTabItem[];
  tab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <MobileHeader title={title} />
      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: "calc(3.5rem + env(safe-area-inset-top))",
          paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom))",
        }}
      >
        <Suspense fallback={<PageLoader />}>
          {children}
        </Suspense>
      </main>
      <BottomNav tab={tab} onChange={onTabChange} tabs={tabs} />
    </div>
  );
}
