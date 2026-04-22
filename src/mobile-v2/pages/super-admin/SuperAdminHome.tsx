import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Crown,
  Users,
  Store,
  ShoppingCart,
  Package,
  TrendingUp,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  UserPlus,
  Route,
  Settings,
  ChevronRight,
  BarChart3,
  Activity,
  Smartphone,
  Banknote,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard, Section, Card, QuickAction, Badge, Loading, EmptyState } from "@/mobile-v2/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export function SuperAdminHome() {
  const { profile, user } = useAuth();
  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  });

  const today = new Date().toISOString().split("T")[0];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["mobile-v2-super-admin-dashboard", user?.id, today],
    queryFn: async () => {
      if (!user?.id) return null;

      const [
        todaySalesRes,
        staffRes,
        customersRes,
        storesRes,
        inventoryRes,
        lowStockRes,
        recentSalesRes,
        recentOrdersRes,
        activeRoutesRes,
      ] = await Promise.all([
        // Today's sales
        supabase
          .from("sales")
          .select("total_amount, cash_amount, upi_amount, payment_type")
          .gte("created_at", todayStart.toISOString())
          .lt("created_at", todayEnd.toISOString()),
        // Staff count
        supabase
          .from("profiles")
          .select("id, role", { count: "exact" })
          .neq("role", "customer"),
        // Customer count
        supabase
          .from("profiles")
          .select("id", { count: "exact" })
          .eq("role", "customer"),
        // Store count
        supabase
          .from("stores")
          .select("id, is_active", { count: "exact" }),
        // Total inventory
        supabase
          .from("products")
          .select("stock_quantity")
          .eq("is_active", true),
        // Low stock items
        supabase
          .from("products")
          .select("id, name, stock_quantity, reorder_level, category")
          .eq("is_active", true)
          .lte("stock_quantity", 10)
          .limit(10),
        // Recent sales
        supabase
          .from("sales")
          .select("id, display_id, total_amount, created_at, status, recorded_by, profiles!inner(full_name)")
          .order("created_at", { ascending: false })
          .limit(10),
        // Recent orders
        supabase
          .from("orders")
          .select("id, display_id, total_amount, status, created_at, stores(name), customers(name)")
          .order("created_at", { ascending: false })
          .limit(10),
        // Active routes
        supabase
          .from("route_sessions")
          .select("*, routes(name), profiles!inner(full_name)")
          .eq("status", "active")
          .gte("session_date", today),
      ]);

      const sales = todaySalesRes.data || [];
      const inventory = inventoryRes.data || [];
      const lowStock = lowStockRes.data || [];
      const recentSales = recentSalesRes.data || [];
      const recentOrders = recentOrdersRes.data || [];
      const activeRoutes = activeRoutesRes.data || [];
      const stores = storesRes.data || [];

      // Calculate totals
      const totalCash = sales.reduce((s, r) => s + Number(r.cash_amount || 0), 0);
      const totalUpi = sales.reduce((s, r) => s + Number(r.upi_amount || 0), 0);
      const totalSales = sales.reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const totalStock = inventory.reduce((s, p) => s + (p.stock_quantity || 0), 0);

      // Calculate weekly growth
      const cashSales = sales.filter(s => s.payment_type === "cash").length;
      const upiSales = sales.filter(s => s.payment_type === "upi" || s.payment_type === "mobile").length;

      return {
        stats: {
          cashInHand: totalCash,
          upiCollections: totalUpi,
          totalCollections: totalCash + totalUpi,
          counterSales: sales.length,
          totalSalesAmount: totalSales,
          staffCount: staffRes.count || 0,
          customerCount: customersRes.count || 0,
          totalStores: stores.length,
          activeStores: stores.filter((s: any) => s.is_active).length,
          totalStock,
          lowStockCount: lowStock.length,
          activeRoutes: activeRoutes.length,
          cashSales,
          upiSales,
        },
        recentSales,
        recentOrders,
        lowStockItems: lowStock.slice(0, 5),
        activeRoutes: activeRoutes.slice(0, 5),
      };
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-32 mb-4" />
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Loading.Skeleton className="h-20" />
          <Loading.Skeleton className="h-20" />
          <Loading.Skeleton className="h-20" />
        </div>
        <Loading.Skeleton className="h-48" />
      </div>
    );
  }

  const s = dashboardData?.stats;

  return (
    <div className="mv2-page">
      {/* Hero Section */}
      <div className="mv2-hero mb-4">
        <div className="mv2-hero-content">
          <p className="text-white/80 text-sm">{greeting}</p>
          <h1 className="text-xl font-bold text-white mt-1">
            {profile?.full_name || "Super Admin"}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge className="bg-white/20 text-white border-0">
              <Crown className="w-3 h-3 mr-1" />
              Super Admin
            </Badge>
          </div>
        </div>
      </div>

      {/* Today's Revenue - 3 cards */}
      <Section title="Today's Revenue" className="mb-4">
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            icon={Banknote}
            label="Cash"
            value={formatCurrency(s?.cashInHand || 0)}
            variant="success"
            className="text-xs"
          />
          <StatCard
            icon={Smartphone}
            label="UPI"
            value={formatCurrency(s?.upiCollections || 0)}
            variant="info"
            className="text-xs"
          />
          <StatCard
            icon={Wallet}
            label="Total"
            value={formatCurrency(s?.totalCollections || 0)}
            variant="primary"
            className="text-xs"
          />
        </div>
      </Section>

      {/* Business Overview - 3 cards */}
      <Section title="Business Overview" className="mb-4">
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            icon={Users}
            label="Staff"
            value={String(s?.staffCount || 0)}
            variant="default"
            className="text-xs"
          />
          <StatCard
            icon={Store}
            label="Stores"
            value={String(s?.activeStores || 0)}
            variant="success"
            className="text-xs"
          />
          <StatCard
            icon={ShoppingCart}
            label="Sales"
            value={String(s?.counterSales || 0)}
            variant={s?.counterSales ? "success" : "default"}
            className="text-xs"
          />
        </div>
      </Section>

      {/* Sales Distribution */}
      <Section title="Sales Distribution" className="mb-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <span className="font-medium">Payment Methods</span>
            </div>
          </div>
          <div className="space-y-3">
            {/* Cash */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm flex items-center gap-1">
                  <Banknote className="w-4 h-4 text-success" />
                  Cash
                </span>
                <span className="text-sm font-medium">{s?.cashSales || 0}</span>
              </div>
              <Progress 
                value={s?.counterSales ? ((s.cashSales / s.counterSales) * 100) : 0} 
                className="h-2" 
              />
            </div>
            {/* UPI */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm flex items-center gap-1">
                  <Smartphone className="w-4 h-4 text-info" />
                  UPI/Mobile
                </span>
                <span className="text-sm font-medium">{s?.upiSales || 0}</span>
              </div>
              <Progress 
                value={s?.counterSales ? ((s.upiSales / s.counterSales) * 100) : 0} 
                className="h-2" 
              />
            </div>
          </div>
        </Card>
      </Section>

      {/* Active Operations */}
      <Section title="Active Operations" className="mb-4">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <StatCard
            icon={Route}
            label="Active Routes"
            value={String(s?.activeRoutes || 0)}
            variant={s?.activeRoutes ? "success" : "default"}
          />
          <StatCard
            icon={Package}
            label="Total Stock"
            value={String(s?.totalStock || 0)}
            variant="default"
          />
        </div>

        {dashboardData?.activeRoutes && dashboardData.activeRoutes.length > 0 ? (
          <div className="space-y-2">
            {dashboardData.activeRoutes.map((route: any) => (
              <Card key={route.id} variant="outline" className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                      <Route className="w-4 h-4 text-success" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{route.routes?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Agent: {route.profiles?.full_name}
                      </p>
                    </div>
                  </div>
                  <Badge variant="success" className="text-xs">
                    Active
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="No active routes"
            description="Routes in progress will appear here"
          />
        )}
      </Section>

      {/* Inventory Alerts */}
      <Section title="Inventory Alerts" className="mb-4">
        {s?.lowStockCount > 0 ? (
          <Card className="p-3 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {s.lowStockCount} items need restocking
              </span>
            </div>
            <div className="space-y-2">
              {dashboardData?.lowStockItems.map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex-1">
                    <span className="truncate block">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{item.category}</span>
                  </div>
                  <Badge variant="warning" className="text-xs">
                    {item.stock_quantity} left
                  </Badge>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              className="w-full text-xs mt-2"
              onClick={() => window.location.href = "/super-admin/inventory"}
            >
              Manage inventory
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Card>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="Stock levels healthy"
            description="All products above reorder level"
          />
        )}
      </Section>

      {/* Recent Sales */}
      <Section title="Recent Sales" className="mb-4">
        {dashboardData?.recentSales && dashboardData.recentSales.length > 0 ? (
          <div className="space-y-2">
            {dashboardData.recentSales.slice(0, 5).map((sale: any) => (
              <Card key={sale.id} variant="outline" className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <ShoppingCart className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{sale.display_id}</p>
                      <p className="text-xs text-muted-foreground">
                        by {sale.profiles?.full_name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">
                      {formatCurrency(sale.total_amount || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(sale.created_at)}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
            <Button
              variant="ghost"
              className="w-full text-sm"
              onClick={() => window.location.href = "/super-admin/sales"}
            >
              View all sales
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        ) : (
          <EmptyState
            icon={ShoppingCart}
            title="No sales today"
            description="Sales will appear here"
          />
        )}
      </Section>

      {/* Pending Orders */}
      <Section title="Recent Orders" className="mb-4">
        {dashboardData?.recentOrders && dashboardData.recentOrders.length > 0 ? (
          <div className="space-y-2">
            {dashboardData.recentOrders.slice(0, 5).map((order: any) => (
              <Card key={order.id} variant="outline" className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {order.stores?.name || order.customers?.name || "Order"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.display_id}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">
                      {formatCurrency(order.total_amount || 0)}
                    </p>
                    <Badge
                      variant={
                        order.status === "completed"
                          ? "success"
                          : order.status === "pending"
                          ? "warning"
                          : "default"
                      }
                      className="text-xs"
                    >
                      {order.status}
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
            <Button
              variant="ghost"
              className="w-full text-sm"
              onClick={() => window.location.href = "/super-admin/orders"}
            >
              View all orders
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="No orders"
            description="Orders will appear here"
          />
        )}
      </Section>

      {/* Quick Actions */}
      <Section title="Quick Actions" className="mb-4">
        <div className="grid grid-cols-4 gap-2">
          <QuickAction
            icon={UserPlus}
            label="Add Staff"
            href="/super-admin/staff"
            variant="primary"
          />
          <QuickAction
            icon={Store}
            label="Stores"
            href="/super-admin/stores"
          />
          <QuickAction
            icon={Settings}
            label="Settings"
            href="/super-admin/settings"
          />
          <QuickAction
            icon={Activity}
            label="Activity"
            href="/super-admin/activity"
          />
        </div>
      </Section>
    </div>
  );
}
