import { Home, Map, ScanLine, FileText, History } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileTab = "home" | "routes" | "scan" | "record" | "history";

interface Props {
  tab: MobileTab;
  onChange: (t: MobileTab) => void;
}

const TABS = [
  { id: "home" as MobileTab, label: "Home", icon: Home },
  { id: "routes" as MobileTab, label: "Routes", icon: Map },
  { id: "scan" as MobileTab, label: "Scan", icon: ScanLine },
  { id: "record" as MobileTab, label: "Record", icon: FileText },
  { id: "history" as MobileTab, label: "History", icon: History },
];

export function BottomNav({ tab, onChange }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t border-border flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((t) => {
        const Icon = t.icon;
        const isActive = tab === t.id;
        const isScan = t.id === "scan";

        if (isScan) {
          return (
            <button
              key={t.id}
              className="flex-1 flex flex-col items-center justify-center py-2 relative"
              onClick={() => onChange(t.id)}
            >
              <div
                className={cn(
                  "h-12 w-12 rounded-full flex items-center justify-center shadow-lg -mt-5 transition-all",
                  isActive
                    ? "bg-primary scale-110"
                    : "bg-primary/90 scale-100"
                )}
              >
                <Icon className="h-6 w-6 text-primary-foreground" />
              </div>
              <span
                className={cn(
                  "text-[10px] mt-1 font-medium",
                  isActive ? "text-primary" : "text-muted-foreground"
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
            className="flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors"
            onClick={() => onChange(t.id)}
          >
            <Icon
              className={cn(
                "h-5 w-5 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            />
            <span
              className={cn(
                "text-[10px] font-medium",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              {t.label}
            </span>
            {isActive && (
              <span className="absolute bottom-[env(safe-area-inset-bottom)] left-[inherit] h-0.5 w-8 bg-primary rounded-t-full" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
