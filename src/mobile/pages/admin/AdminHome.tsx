import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  Store,
  Package,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Link } from "react-router-dom";

interface DashboardStats {
  totalSales: number;
  totalOrders: number;
  totalTransactions: number;
  outstandingAmount: number;
  lowStockCount: number;
  todaySales: number;
}

export function AdminHome({
  role,
  onNavigate,
}: {
  role: "super_admin" | "manager";
  onNavigate: (path: string) => void;
}) {
  const { user } = useAuth();
  const { currentWarehouse } = useWarehouse();

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["mobile-admin-dashboard", currentWarehouse?.id, role],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      
      // Get today's sales
      const { data: todaySalesData } = await supabase
        .from("sales")
        .select("total_amount")
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`);
      
      // Get total outstanding
      const { data: storesData } = await supabase
        .from("stores")
        .select("outstanding");
      
      // Get low stock count
      const { data: stockData } = await supabase
        .from("product_stock")
        .select("quantity, reorder_level");
      
      // Get counts
      const { count: salesCount } = await supabase
        .from("sales")
        .select("*", { count: "exact", head: true });
      
      const { count: ordersCount } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      
      const { count: transactionsCount } = await supabase
        .from("transactions")
        .select("*", { count: "exact", head: true });

      const todaySales = (todaySalesData || []).reduce(
        (sum, sale) => sum + (sale.total_amount || 0),
        0
      );

      const outstandingAmount = (storesData || []).reduce(
        (sum, store) => sum + (store.outstanding || 0),
        0
      );

      const lowStockCount = (stockData || []).filter(
        (item) => item.quantity <= item.reorder_level
      ).length;

      return {
        totalSales: salesCount || 0,
        totalOrders: ordersCount || 0,
        totalTransactions: transactionsCount || 0,
        outstandingAmount,
        lowStockCount,
        todaySales,
      } as DashboardStats;
    },
  });

  // Fetch recent activity
  const { data: recentActivity } = useQuery({
    queryKey: ["mobile-recent-activity", currentWarehouse?.id],
    queryFn: async () => {
      const { data: sales } = await supabase
        .from("sales")
        .select("id, display_id, total_amount, created_at, stores(name)")
        .order("created_at", { ascending: false })
        .limit(5);
      
      return (sales || []).map((sale) => ({
        type: "sale" as const,
        id: sale.id,
        displayId: sale.display_id,
        amount: sale.total_amount,
        store: sale.stores?.name,
        date: sale.created_at,
      }));
    },
  });

  const formatAmount = (amount: number) => {
    return `Rs ${Math.round(amount).toLocaleString("en-IN")}`;
  };

  const quickActions = [
    {
      label: "Record Sale",
      icon: ShoppingCart,
      path: "/sales",
      color: "bg-blue-500",
      darkColor: "dark:bg-blue-600",
    },
    {
      label: "Add Order",
      icon: ClipboardList,
      path: "/orders",
      color: "bg-emerald-500",
      darkColor: "dark:bg-emerald-600",
    },
    {
      label: "Payment",
      icon: Receipt,
      path: "/transactions",
      color: "bg-violet-500",
      darkColor: "dark:bg-violet-600",
    },
    {
      label: "View Reports",
      icon: TrendingUp,
      path: "/reports",
      color: "bg-amber-500",
      darkColor: "dark:bg-amber-600",
    },
  ];

  return (
    <div className="pb-6 space-y-4">
      {/* Header */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {role === "super_admin" ? "Admin Dashboard" : "Manager Dashboard"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(), "EEEE, d MMMM yyyy")}
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <LayoutDashboard className="h-5 w-5 text-primary" />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="px-4 grid grid-cols-2 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Today's Sales</p>
                <p className="text-lg font-bold text-foreground">
                  {statsLoading ? "..." : formatAmount(stats?.todaySales || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending Orders</p>
                <p className="text-lg font-bold text-foreground">
                  {statsLoading ? "..." : stats?.totalOrders || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="text-lg font-bold text-foreground">
                  {statsLoading ? "..." : formatAmount(stats?.outstandingAmount || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Package className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Low Stock</p>
                <p className="text-lg font-bold text-foreground">
                  {statsLoading ? "..." : stats?.lowStockCount || 0}
                </p>
                {stats?.lowStockCount && stats.lowStockCount > 0 && (
                  <p className="text-[10px] text-orange-600 dark:text-orange-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Needs attention
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="px-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-4 gap-2">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => onNavigate(action.path)}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-card border border-border hover:bg-muted dark:hover:bg-muted/50 transition-colors active:scale-95"
            >
              <div
                className={`h-10 w-10 rounded-lg ${action.color} ${action.darkColor} flex items-center justify-center`}
              >
                <action.icon className="h-5 w-5 text-white" />
              </div>
              <span className="text-[10px] font-medium text-foreground text-center leading-tight">
                {action.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Recent Sales</h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto py-1 px-2 text-xs text-primary"
            onClick={() => onNavigate("/sales")}
          >
            View All
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-0">
            {recentActivity && recentActivity.length > 0 ? (
              <div className="divide-y divide-border">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-3 hover:bg-muted dark:hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <ShoppingCart className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {activity.displayId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activity.store || "Unknown Store"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {formatAmount(activity.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(activity.date), "hh:mm a")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">No recent sales</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Navigation Links */}
      <div className="px-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => onNavigate("/customers")}
          className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:bg-muted dark:hover:bg-muted/50 transition-colors"
        >
          <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">Customers</p>
            <p className="text-xs text-muted-foreground">View all</p>
          </div>
        </button>

        <button
          onClick={() => onNavigate("/stores")}
          className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:bg-muted dark:hover:bg-muted/50 transition-colors"
        >
          <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Store className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">Stores</p>
            <p className="text-xs text-muted-foreground">View all</p>
          </div>
        </button>
      </div>
    </div>
  );
}
