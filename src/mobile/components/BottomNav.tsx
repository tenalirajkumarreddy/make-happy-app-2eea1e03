import { memo } from "react";
import { Home, Map, ScanLine, History, Users, ClipboardList, ReceiptIndianRupee, Plus, HandCoins, Package } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileTab = "home" | "routes" | "scan" | "history" | "customers" | "orders" | "record" | "sales" | "transactions" | "profile" | "products" | "handovers" | "inventory" | "staff";

export interface MobileTabItem {
  id: MobileTab;
  label: string;
  icon: typeof Home;
  centerAction?: boolean;
  badge?: number;
}

interface Props {
  tab: MobileTab;
  onChange: (t: MobileTab) => void;
  tabs?: MobileTabItem[];
}

export const AGENT_TABS: MobileTabItem[] = [
  { id: "home" as MobileTab, label: "Home", icon: Home },
  { id: "routes" as MobileTab, label: "Routes", icon: Map },
  { id: "scan" as MobileTab, label: "Scan", icon: ScanLine, centerAction: true },
  { id: "customers" as MobileTab, label: "Stores", icon: Users },
  { id: "history" as MobileTab, label: "History", icon: History },
];

export const MARKETER_TABS: MobileTabItem[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "record", label: "Record", icon: ReceiptIndianRupee, centerAction: true },
  { id: "customers", label: "Stores", icon: Users },
  { id: "history", label: "History", icon: History },
];

export const CUSTOMER_TABS: MobileTabItem[] = [
  { id: "home" as MobileTab, label: "Home", icon: Home },
  { id: "sales" as MobileTab, label: "Sales", icon: ClipboardList },
  { id: "orders" as MobileTab, label: "Order", icon: Plus, centerAction: true },
  { id: "transactions" as MobileTab, label: "Ledger", icon: ReceiptIndianRupee },
  { id: "profile" as MobileTab, label: "Profile", icon: Users },
];

export const BottomNav = memo(function BottomNav({ tab, onChange, tabs = AGENT_TABS }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Frosted glass nav bar */}
      <div className="bg-white/90 dark:bg-card/95 backdrop-blur-xl border-t shadow-[0_-2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_-2px_12px_rgba(0,0,0,0.2)]">
        <div className="flex items-end h-16">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            const isCenterAction = !!t.centerAction;

            if (isCenterAction) {
              return (
                <button
                  key={t.id}
                  className="flex-1 flex flex-col items-center justify-end pb-2 relative"
                  onClick={() => onChange(t.id)}
                >
                  {/* Raised circular button */}
                  <div
                    className={cn(
                      "h-14 w-14 rounded-full flex items-center justify-center -mt-7 transition-all duration-200",
                      isActive
                        ? "bg-primary scale-110 shadow-lg shadow-primary/40"
                        : "bg-primary scale-100 shadow-md shadow-primary/30"
                    )}
                  >
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <span
                    className={cn(
                      "text-xs mt-1.5 font-semibold tracking-wide truncate max-w-full",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {t.label}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={t.id}
                className="flex-1 flex flex-col items-center justify-center h-full gap-1 relative transition-all"
                onClick={() => onChange(t.id)}
              >
                {/* Red dot badge */}
                {(t.badge ?? 0) > 0 && (
                  <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-destructive animate-pulse z-50" />
                )}
                {/* Active pill indicator */}
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 bg-primary dark:bg-primary rounded-b-full" />
                )}

                <div
                  className={cn(
                    "flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all duration-200",
                    isActive
                      ? "bg-primary/10 dark:bg-primary/20"
                      : "hover:bg-muted"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 transition-all duration-200",
                      isActive
                        ? "text-primary dark:text-primary scale-110"
                        : "text-muted-foreground"
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-semibold tracking-wide leading-none truncate max-w-[4rem]",
                      isActive
                        ? "text-primary dark:text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {t.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
});
