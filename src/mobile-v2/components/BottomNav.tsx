import { useLocation, useNavigate } from "react-router-dom";
import { Home, Map, ScanLine, History, Users, ClipboardList, ReceiptIndianRupee, Plus, HandCoins, Package, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileTab = 
  | "home" 
  | "routes" 
  | "scan" 
  | "history" 
  | "customers" 
  | "orders" 
  | "record" 
  | "sales" 
  | "transactions" 
  | "profile" 
  | "products" 
  | "handovers"
  | "stores"
  | "settings";

interface MobileTabItem {
  id: MobileTab;
  label: string;
  icon: typeof Home;
  href: string;
  centerAction?: boolean;
}

interface Props {
  tabs: MobileTabItem[];
}

export const AGENT_TABS: MobileTabItem[] = [
  { id: "home", label: "Home", icon: Home, href: "/agent" },
  { id: "routes", label: "Routes", icon: Map, href: "/agent/routes" },
  { id: "scan", label: "Scan", icon: ScanLine, href: "/agent/scan", centerAction: true },
  { id: "customers", label: "Stores", icon: Users, href: "/agent/customers" },
  { id: "history", label: "History", icon: History, href: "/agent/history" },
];

export const MARKETER_TABS: MobileTabItem[] = [
  { id: "home", label: "Home", icon: Home, href: "/marketer" },
  { id: "orders", label: "Orders", icon: ClipboardList, href: "/marketer/orders" },
  { id: "record", label: "Order", icon: Plus, href: "/marketer/orders", centerAction: true },
  { id: "stores", label: "Stores", icon: Users, href: "/marketer/stores" },
  { id: "profile", label: "Profile", icon: Settings, href: "/marketer" },
];

export const CUSTOMER_TABS: MobileTabItem[] = [
  { id: "home", label: "Home", icon: Home, href: "/customer" },
  { id: "sales", label: "Purchases", icon: ClipboardList, href: "/customer/sales" },
  { id: "orders", label: "Orders", icon: Package, href: "/customer/orders", centerAction: true },
  { id: "transactions", label: "Ledger", icon: ReceiptIndianRupee, href: "/customer/transactions" },
  { id: "profile", label: "Profile", icon: Users, href: "/customer/profile" },
];

export const POS_TABS: MobileTabItem[] = [
  { id: "home", label: "POS", icon: Home, href: "/pos" },
  { id: "products", label: "Products", icon: Package, href: "/pos" },
  { id: "record", label: "Sale", icon: ScanLine, href: "/pos", centerAction: true },
  { id: "handovers", label: "Handover", icon: HandCoins, href: "/pos" },
  { id: "history", label: "History", icon: History, href: "/pos" },
];

export const ADMIN_TABS: MobileTabItem[] = [
  { id: "home", label: "Home", icon: Home, href: "/admin" },
  { id: "sales", label: "Sales", icon: ClipboardList, href: "/admin/sales" },
  { id: "orders", label: "Orders", icon: Package, href: "/admin/orders", centerAction: true },
  { id: "stores", label: "Stores", icon: Users, href: "/admin/stores" },
  { id: "profile", label: "More", icon: Settings, href: "/admin/profile" },
];

export function BottomNav({ tabs }: Props) {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active tab based on current path
  const getActiveTab = () => {
    const path = location.pathname;
    // Find exact match first, then prefix match
    const exactMatch = tabs.find(t => t.href === path);
    if (exactMatch) return exactMatch.id;
    
    // For nested routes, find the best prefix match
    const prefixMatch = tabs
      .filter(t => path.startsWith(t.href) && t.href !== "/")
      .sort((a, b) => b.href.length - a.href.length)[0];
    
    return prefixMatch?.id || tabs[0]?.id;
  };

  const activeTab = getActiveTab();

  return (
    <nav className="mv2-bottom-nav">
      <div className="mv2-bottom-nav-inner">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          const isCenterAction = !!t.centerAction;

          if (isCenterAction) {
            return (
              <button
                key={t.id}
                className="mv2-nav-center-action"
                onClick={() => navigate(t.href)}
              >
                <div className={cn("mv2-nav-center-btn", isActive && "active")}>
                  <Icon className="h-6 w-6" />
                </div>
                <span
                  className={cn(
                    "mv2-nav-item-label mt-1",
                    isActive ? "mv2-text-primary" : "mv2-text-muted"
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
              className={cn("mv2-nav-item", isActive && "active")}
              onClick={() => navigate(t.href)}
            >
              <Icon
                className={cn(
                  "h-5 w-5 transition-transform duration-200",
                  isActive && "scale-110"
                )}
              />
              <span className="mv2-nav-item-label">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
