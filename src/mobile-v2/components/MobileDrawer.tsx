import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  BarChart, Boxes, Users, Truck, Store, Map as MapIcon,
  ShoppingCart, Landmark, FileText, Settings, ShieldAlert,
  ClipboardList, CreditCard, Activity, PackageSearch
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouteAccess } from "@/hooks/useRouteAccess";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileDrawer({ open, onOpenChange }: Props) {
  const { role } = useAuth();
  const location = useLocation();
  const allowedRoutes = useRouteAccess();

  // Navigation Items config. This covers all missing features.
  const allNavItems = [
    { name: "Products", path: "/admin/products", icon: PackageSearch, roles: ["super_admin", "manager"] },
    { name: "Inventory", path: "/inventory", icon: Boxes, roles: ["super_admin", "manager"] },
    { name: "Raw Materials", path: "/raw-materials", icon: ClipboardList, roles: ["super_admin", "manager"] },
    { name: "Vendors", path: "/vendors", icon: Store, roles: ["super_admin", "manager"] },
    { name: "Purchases", path: "/purchases", icon: ShoppingCart, roles: ["super_admin", "manager"] },
    { name: "Vendor Payments", path: "/vendor-payments", icon: CreditCard, roles: ["super_admin", "manager"] },
    { name: "Invoices", path: "/invoices", icon: FileText, roles: ["super_admin", "manager"] },
    { name: "Attendance", path: "/attendance", icon: Users, roles: ["super_admin", "manager"] },
    { name: "Expenses", path: "/expenses", icon: Landmark, roles: ["super_admin", "manager"] },
    { name: "Banners", path: "/banners", icon: FileText, roles: ["super_admin", "manager"] },
    { name: "Analytics", path: "/analytics", icon: BarChart, roles: ["super_admin", "manager"] },
    { name: "Reports", path: "/reports", icon: Activity, roles: ["super_admin", "manager"] },
    { name: "Activity Logs", path: "/activity", icon: ClipboardList, roles: ["super_admin", "manager"] },
    { name: "Map Tracking", path: "/map", icon: MapIcon, roles: ["super_admin", "manager"] },
    { name: "Store Types", path: "/store-types", icon: Store, roles: ["super_admin", "manager"] },
    { name: "Sale Returns", path: "/sale-returns", icon: ShoppingCart, roles: ["super_admin", "manager"] },
    { name: "Purchase Returns", path: "/purchase-returns", icon: ShoppingCart, roles: ["super_admin", "manager"] },
    { name: "Stock Transfers", path: "/stock-transfers", icon: Truck, roles: ["super_admin", "manager", "agent", "marketer"] },
    { name: "Access Control", path: "/access-control", icon: ShieldAlert, roles: ["super_admin"] },
    { name: "Staff Directory", path: "/admin/staff", icon: Users, roles: ["super_admin"] },
    { name: "Settings", path: "/admin/settings", icon: Settings, roles: ["super_admin", "manager"] },
  ];

  // Filter based on user's role
  const visibleItems = allNavItems.filter((item) => 
    item.roles.includes(role || "customer")
  );

  if (visibleItems.length === 0) {
    return null; // Don't render for roles without any extra menu options
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[85vw] max-w-[320px] p-0 flex flex-col pt-[env(safe-area-inset-top)]">
        <SheetHeader className="p-4 text-left border-b border-border">
          <SheetTitle className="text-lg">Main Menu</SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="flex-1 py-2">
          <div className="flex flex-col gap-1 px-3">
            {visibleItems.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
