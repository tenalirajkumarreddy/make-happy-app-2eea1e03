import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Warehouse,
  Users,
  Package,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Store,
  ShoppingCart,
  ChevronRight,
  ArrowRightLeft,
  DollarSign,
  BarChart3,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard, Section, Card, QuickAction, Badge, Loading, EmptyState } from "@/mobile-v2/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export function ManagerHome() {
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
    queryKey: ["mobile-v2-manager-dashboard", user?.id, today],
    queryFn: async () => {
      if (!user?.id) return null;

      const [
        todaySalesRes,
        staffHandoversRes,
        lowStockRes,
        inventoryRes,
        staffSalesRes,
        pendingOrdersRes,
        storesRes,
      ] = await Promise.all([
        // Today's sales
        supabase
          .from("sales")
          .select("total_amount, cash_amount, upi_amount")
          .gte("created_at", todayStart.toISOString())
          .lt("created_at", todayEnd.toISOString()),
        // Staff handovers today
        supabase
          .from("staff_handovers")
          .select("*, user:profiles(full_name)")
          .gte("created_at", todayStart.toISOString())
          .lt("created_at", todayEnd.toISOString())
          .order("created_at", { ascending: false })
          .limit(10),
        // Low stock items
        supabase
          .from("products")
          .select("id, name, stock_quantity, reorder_level")
          .eq("is_active", true)
          .lte("stock_quantity", 10)
          .limit(10),
        // Total inventory
        supabase
          .from("products")
          .select("stock_quantity")
          .eq("is_active", true),
        // Sales by staff today
        supabase
          .from("sales")
          .select("total_amount, recorded_by, profiles!inner(full_name)")
          .gte("created_at", todayStart.toISOString())
          .lt("created_at", todayEnd.toISOString()),
        // Pending orders
        supabase
          .from("orders")
          .select("id, display_id, total_amount, status, stores(name), customers(name)")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(10),
        // Store stats
        supabase
          .from("stores")
          .select("id, is_active")
          .order("name"),
      ]);

      const sales = todaySalesRes.data || [];
      const handovers = staffHandoversRes.data || [];
      const lowStock = lowStockRes.data || [];
      const inventory = inventoryRes.data || [];
      const staffSales = staffSalesRes.data || [];
      const pendingOrders = pendingOrdersRes.data || [];
      const stores = storesRes.data || [];

      // Calculate totals
      const totalCash = sales.reduce((s, r) => s + Number(r.cash_amount || 0), 0);
      const totalUpi = sales.reduce((s, r) => s + Number(r.upi_amount || 0), 0);
      const totalSales = sales.reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const totalStock = inventory.reduce((s, p) => s + (p.stock_quantity || 0), 0);

      // Group sales by staff
      const staffSalesMap = new Map();
      staffSales.forEach((sale: any) => {
        const name = sale.profiles?.full_name || "Unknown";
        const current = staffSalesMap.get(name) || 0;
        staffSalesMap.set(name, current + Number(sale.total_amount || 0));
      });
      const topStaff = Array.from(staffSalesMap.entries())
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      return {
        stats: {
          cashInHand: totalCash,
          upiCollections: totalUpi,
          totalCollections: totalCash + totalUpi,
          counterSales: sales.length,
          totalSalesAmount: totalSales,
          handoverCount: handovers.length,
          pendingHandovers: handovers.filter((h: any) => h.status === "pending").length,
          totalStock,
          lowStockCount: lowStock.length,
          pendingOrders: pendingOrders.length,
          totalStores: stores.length,
          activeStores: stores.filter((s: any) => s.is_active).length,
        },
        handovers: handovers.slice(0, 5),
        lowStockItems: lowStock.slice(0, 5),
        topStaff,
        pendingOrders: pendingOrders.slice(0, 5),
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
            {profile?.full_name || "Manager"}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge className="bg-white/20 text-white border-0">
              <Warehouse className="w-3 h-3 mr-1" />
              Warehouse Manager
            </Badge>
          </div>
        </div>
      </div>

      {/* Today's Collections - 3 cards */}
      <Section title="Today's Collections" className="mb-4">
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            icon={DollarSign}
            label="Cash"
            value={formatCurrency(s?.cashInHand || 0)}
            variant="success"
            className="text-xs"
          />
          <StatCard
            icon={TrendingUp}
            label="UPI"
            value={formatCurrency(s?.upiCollections || 0)}
            variant="info"
            className="text-xs"
          />
          <StatCard
            icon={BarChart3}
            label="Total"
            value={formatCurrency(s?.totalCollections || 0)}
            variant="primary"
            className="text-xs"
          />
        </div>
      </Section>

      {/* Warehouse Stats - 3 cards */}
      <Section title="Warehouse Stats" className="mb-4">
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            icon={Package}
            label="Stock"
            value={String(s?.totalStock || 0)}
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

      {/* Staff Handovers */}
      <Section title="Staff Handovers" className="mb-4">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <StatCard
            icon={UserCheck}
            label="Handovers"
            value={String(s?.handoverCount || 0)}
            variant="default"
          />
          <StatCard
            icon={Clock}
            label="Pending"
            value={String(s?.pendingHandovers || 0)}
            variant={s?.pendingHandovers ? "warning" : "success"}
          />
        </div>

        {dashboardData?.handovers && dashboardData.handovers.length > 0 ? (
          <div className="space-y-2">
            {dashboardData.handovers.map((handover: any) => (
              <Card key={handover.id} variant="outline" className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserCheck className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {handover.user?.full_name || "Staff"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(handover.created_at)}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      handover.status === "completed"
                        ? "success"
                        : handover.status === "pending"
                        ? "warning"
                        : "default"
                    }
                    className="text-xs"
                  >
                    {handover.status}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="No handovers today"
            description="Staff handovers will appear here"
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
                {s.lowStockCount} items low on stock
              </span>
            </div>
            <div className="space-y-2">
              {dashboardData?.lowStockItems.map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate flex-1">{item.name}</span>
                  <Badge variant="warning" className="text-xs">
                    {item.stock_quantity} / {item.reorder_level}
                  </Badge>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              className="w-full text-xs mt-2"
              onClick={() => window.location.href = "/manager/inventory"}
            >
              View inventory
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

      {/* Sales by Staff */}
      <Section title="Sales by Staff" className="mb-4">
        {dashboardData?.topStaff && dashboardData.topStaff.length > 0 ? (
          <div className="space-y-2">
            {dashboardData.topStaff.map((staff: any, index: number) => (
              <Card key={index} variant="outline" className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{staff.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Sales today
                      </p>
                    </div>
                  </div>
                  <span className="font-semibold text-primary">
                    {formatCurrency(staff.amount)}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No staff sales yet"
            description="Staff activity will appear here"
          />
        )}
      </Section>

      {/* Pending Orders */}
      <Section title="Pending Orders" className="mb-4">
        {dashboardData?.pendingOrders && dashboardData.pendingOrders.length > 0 ? (
          <div className="space-y-2">
            {dashboardData.pendingOrders.map((order: any) => (
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
                    <Badge variant="warning" className="text-xs">
                      Pending
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
            <Button
              variant="ghost"
              className="w-full text-sm"
              onClick={() => window.location.href = "/manager/orders"}
            >
              View all orders
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="No pending orders"
            description="All orders are fulfilled!"
          />
        )}
      </Section>

      {/* Quick Actions */}
      <Section title="Quick Actions" className="mb-4">
        <div className="grid grid-cols-4 gap-2">
          <QuickAction
            icon={ArrowRightLeft}
            label="Stock"
            href="/manager/inventory"
            variant="primary"
          />
          <QuickAction
            icon={UserCheck}
            label="Handovers"
            href="/manager/handovers"
          />
          <QuickAction
            icon={Package}
            label="Products"
            href="/manager/products"
          />
          <QuickAction
            icon={BarChart3}
            label="Reports"
            href="/manager/reports"
          />
        </div>
      </Section>
    </div>
  );
}
