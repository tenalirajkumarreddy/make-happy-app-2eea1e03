import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Users,
  Store,
  Route,
  ShoppingCart,
  Receipt,
  ClipboardList,
  BarChart3,
  Settings,
  Shield,
  History,
  Bell,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Megaphone,
  HandCoins,
  FileText,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

const mainNav: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Products", path: "/products", icon: Package },
  { label: "Customers", path: "/customers", icon: Users },
  { label: "Stores", path: "/stores", icon: Store },
  { label: "Routes", path: "/routes", icon: Route },
  { label: "Sales", path: "/sales", icon: ShoppingCart },
  { label: "Transactions", path: "/transactions", icon: Receipt },
  { label: "Orders", path: "/orders", icon: ClipboardList, badge: 5 },
  { label: "Handovers", path: "/handovers", icon: HandCoins },
];

const secondaryNav: NavItem[] = [
  { label: "Reports", path: "/reports", icon: FileText },
  { label: "Analytics", path: "/analytics", icon: BarChart3 },
  { label: "Activity Log", path: "/activity", icon: History },
  { label: "Access Control", path: "/access-control", icon: Shield },
  { label: "Settings", path: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const renderNav = (items: NavItem[]) =>
    items.map((item) => {
      const isActive = location.pathname === item.path;
      return (
        <NavLink
          key={item.path}
          to={item.path}
          onClick={() => setMobileOpen(false)}
          className={cn(
            "sidebar-item group relative",
            isActive ? "sidebar-item-active" : "sidebar-item-inactive"
          )}
        >
          <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-sidebar-primary" : "")} />
          {!collapsed && (
            <>
              <span className="truncate">{item.label}</span>
              {item.badge && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {item.badge}
                </span>
              )}
            </>
          )}
          {collapsed && (
            <div className="absolute left-full ml-2 hidden rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-lg group-hover:block z-50">
              {item.label}
            </div>
          )}
        </NavLink>
      );
    });

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className={cn("flex items-center gap-3 px-4 py-5 border-b border-sidebar-border", collapsed && "justify-center px-2")}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm shrink-0">
          BM
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-sidebar-accent-foreground truncate">BizManager</h1>
            <p className="text-[11px] text-sidebar-muted truncate">Business Management</p>
          </div>
        )}
      </div>

      {/* Search - desktop only */}
      {!collapsed && (
        <div className="px-3 pt-4 pb-2">
          <button className="flex w-full items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-xs text-sidebar-muted hover:text-sidebar-foreground transition-colors">
            <Search className="h-3.5 w-3.5" />
            <span>Search...</span>
            <kbd className="ml-auto rounded bg-sidebar-border px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
          </button>
        </div>
      )}

      {/* Main Nav */}
      <nav className="flex-1 space-y-1 px-3 py-3 overflow-y-auto">
        <p className={cn("px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted", collapsed && "text-center")}>
          {collapsed ? "•" : "Main"}
        </p>
        {renderNav(mainNav)}

        <div className="my-3 border-t border-sidebar-border" />

        <p className={cn("px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted", collapsed && "text-center")}>
          {collapsed ? "•" : "System"}
        </p>
        {renderNav(secondaryNav)}
      </nav>

      {/* Collapse button */}
      <div className="hidden lg:flex items-center justify-center border-t border-sidebar-border p-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile trigger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-lg bg-card border border-border shadow-sm lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside
            className="h-full w-72 bg-sidebar overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-muted hover:text-sidebar-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex h-screen flex-col bg-sidebar border-r border-sidebar-border sticky top-0 transition-all duration-200",
          collapsed ? "w-[72px]" : "w-64"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
