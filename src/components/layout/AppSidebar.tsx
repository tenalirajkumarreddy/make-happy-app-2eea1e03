import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
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
  ChevronUp,
  ChevronDown,
  Menu,
  X,
  Megaphone,
  HandCoins,
  FileText,
  Warehouse,
  Image,
  Search,
  Map,
  Building2,
  CreditCard,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface NavChild {
  label: string;
  path: string;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  children?: NavChild[];
}

const REPORT_CHILDREN: NavChild[] = [
  { label: "Daily Reports", path: "/reports/daily" },
  { label: "Sales Reports", path: "/reports/sales" },
  { label: "Smart Insights", path: "/reports/smart" },
  { label: "Order Reports", path: "/reports/orders" },
  { label: "Agent Performance", path: "/reports/agent" },
  { label: "Product Reports", path: "/reports/product" },
  { label: "Payment Reports", path: "/reports/payment" },
  { label: "Outstanding Reports", path: "/reports/outstanding" },
];

const NAV_BY_ROLE: Record<string, { main: NavItem[]; secondary: NavItem[] }> = {
  super_admin: {
    main: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      { label: "Products", path: "/products", icon: Package },
      { label: "Inventory", path: "/inventory", icon: Warehouse },
      { label: "Vendors", path: "/vendors", icon: Building2 },
      { label: "Purchases", path: "/purchases", icon: ShoppingCart },
      { label: "Vendor Payments", path: "/vendor-payments", icon: CreditCard },
      { label: "Attendance", path: "/attendance", icon: Calendar },
      { label: "Invoices", path: "/invoices", icon: FileText },
      { label: "Banners", path: "/banners", icon: Image },
      { label: "Customers", path: "/customers", icon: Users },
      { label: "Stores", path: "/stores", icon: Store },
      { label: "Routes", path: "/routes", icon: Route },
      { label: "Sales", path: "/sales", icon: ShoppingCart },
      { label: "Transactions", path: "/transactions", icon: Receipt },
      { label: "Orders", path: "/orders", icon: ClipboardList },
      { label: "Handovers", path: "/handovers", icon: HandCoins },
      { label: "Map", path: "/map", icon: Map },
    ],
    secondary: [
      { label: "Reports", path: "/reports", icon: FileText, children: REPORT_CHILDREN },
      { label: "Analytics", path: "/analytics", icon: BarChart3 },
      { label: "Activity Log", path: "/activity", icon: History },
      { label: "Access Control", path: "/access-control", icon: Shield },
      { label: "Staff Directory", path: "/admin/staff", icon: Users },
      { label: "Settings", path: "/settings", icon: Settings },
    ],
  },
  manager: {
    main: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      { label: "Products", path: "/products", icon: Package },
      { label: "Inventory", path: "/inventory", icon: Warehouse },
      { label: "Vendors", path: "/vendors", icon: Building2 },
      { label: "Purchases", path: "/purchases", icon: ShoppingCart },
      { label: "Vendor Payments", path: "/vendor-payments", icon: CreditCard },
      { label: "Attendance", path: "/attendance", icon: Calendar },
      { label: "Invoices", path: "/invoices", icon: FileText },
      { label: "Banners", path: "/banners", icon: Image },
      { label: "Customers", path: "/customers", icon: Users },
      { label: "Stores", path: "/stores", icon: Store },
      { label: "Routes", path: "/routes", icon: Route },
      { label: "Sales", path: "/sales", icon: ShoppingCart },
      { label: "Transactions", path: "/transactions", icon: Receipt },
      { label: "Orders", path: "/orders", icon: ClipboardList },
      { label: "Handovers", path: "/handovers", icon: HandCoins },
      { label: "Map", path: "/map", icon: Map },
    ],
    secondary: [
      { label: "Reports", path: "/reports", icon: FileText, children: REPORT_CHILDREN },
      { label: "Analytics", path: "/analytics", icon: BarChart3 },
      { label: "Activity Log", path: "/activity", icon: History },
      { label: "Settings", path: "/settings", icon: Settings },
    ],
  },
  agent: {
    main: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      { label: "Customers", path: "/customers", icon: Users },
      { label: "Stores", path: "/stores", icon: Store },
      { label: "Routes", path: "/routes", icon: Route },
      { label: "Sales", path: "/sales", icon: ShoppingCart },
      { label: "Transactions", path: "/transactions", icon: Receipt },
      { label: "Orders", path: "/orders", icon: ClipboardList },
      { label: "Handovers", path: "/handovers", icon: HandCoins },
    ],
    secondary: [],
  },
  marketer: {
    main: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      { label: "Customers", path: "/customers", icon: Users },
      { label: "Stores", path: "/stores", icon: Store },
      { label: "Orders", path: "/orders", icon: ClipboardList },
      { label: "Transactions", path: "/transactions", icon: Receipt },
      { label: "Handovers", path: "/handovers", icon: HandCoins },
    ],
    secondary: [],
  },
  pos: {
    main: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard },
      { label: "Sales", path: "/sales", icon: ShoppingCart },
      { label: "Handovers", path: "/handovers", icon: HandCoins },
    ],
    secondary: [],
  },
};

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuth();

  const isCustomer = role === "customer";
  const customerNav: NavItem[] = [
    { label: "Dashboard", path: "/", icon: LayoutDashboard },
    { label: "Sales", path: "/portal/sales", icon: ShoppingCart },
    { label: "Orders", path: "/portal/orders", icon: ClipboardList },
    { label: "Transactions", path: "/portal/transactions", icon: Receipt },
    { label: "Profile", path: "/portal/profile", icon: Users },
  ];

  const roleNav = NAV_BY_ROLE[role || "agent"] || NAV_BY_ROLE.agent;
  const visibleMainNav = isCustomer ? customerNav : roleNav.main;
  const visibleSecondaryNav = isCustomer ? [] : roleNav.secondary;

  const toggleExpanded = (path: string) => {
    setExpandedItems((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const renderNav = (items: NavItem[]) =>
    items.map((item) => {
      const hasChildren = item.children && item.children.length > 0;
      const isActive = location.pathname === item.path;
      const isChildActive = hasChildren && item.children!.some((c) => location.pathname === c.path);
      const isGroupActive = isActive || isChildActive;
      const isExpanded = expandedItems[item.path] || isChildActive;

      if (hasChildren) {
        const handleParentClick = () => {
          if (collapsed) {
            navigate(item.children![0].path);
          } else {
            toggleExpanded(item.path);
          }
        };

        return (
          <div key={item.path}>
            <button
              onClick={handleParentClick}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}-toggle`}
              className={cn(
                "sidebar-item group relative w-full",
                isGroupActive ? "sidebar-item-active" : "sidebar-item-inactive"
              )}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", isGroupActive ? "text-sidebar-primary" : "")} />
              {!collapsed && (
                <>
                  <span className="truncate">{item.label}</span>
                  <span className="ml-auto">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </span>
                </>
              )}
              {collapsed && (
                <div className="absolute left-full ml-2 hidden rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-lg group-hover:block z-50">
                  {item.label}
                </div>
              )}
            </button>
            {isExpanded && !collapsed && (
              <div className="ml-4 mt-1 space-y-0.5 border-l border-sidebar-border pl-3">
                {item.children!.map((child) => {
                  const childActive = location.pathname === child.path;
                  return (
                    <NavLink
                      key={child.path}
                      to={child.path}
                      onClick={() => setMobileOpen(false)}
                      data-testid={`nav-${child.label.toLowerCase().replace(/\s+/g, "-")}`}
                      className={cn(
                        "flex items-center rounded-md px-3 py-2 text-sm transition-colors",
                        childActive
                          ? "text-sidebar-primary font-medium bg-sidebar-accent"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                      )}
                    >
                      <span className="truncate">{child.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

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
      <div className={cn("flex items-center gap-3 px-4 py-5 border-b border-sidebar-border", collapsed && "justify-center px-2")}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden shrink-0">
          <img src="/logo.png" alt="Logo" className="h-full w-full object-contain" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-sidebar-accent-foreground truncate">Aqua Prime</h1>
            <p className="text-[11px] text-sidebar-muted truncate">Business Management</p>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="px-3 pt-4 pb-2">
          <button
            onClick={() => {
              document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
            }}
            className="flex w-full items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-xs text-sidebar-muted hover:text-sidebar-foreground transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search...</span>
            <kbd className="ml-auto rounded bg-sidebar-border px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
          </button>
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3 py-3 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <p className={cn("px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted", collapsed && "text-center")}>
          {collapsed ? "•" : "Main"}
        </p>
        {renderNav(visibleMainNav)}

        {visibleSecondaryNav.length > 0 && (
          <>
            <div className="my-3 border-t border-sidebar-border" />
            <p className={cn("px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted", collapsed && "text-center")}>
              {collapsed ? "•" : "System"}
            </p>
            {renderNav(visibleSecondaryNav)}
          </>
        )}
      </nav>

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
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-lg bg-card border border-border shadow-sm lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside
            className="h-full w-72 bg-sidebar overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
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
