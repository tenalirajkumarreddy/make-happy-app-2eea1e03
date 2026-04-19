import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart,
  TrendingUp,
  Banknote,
  Smartphone,
  Receipt,
  Package,
  Store,
  History,
  Plus,
  Calculator,
  QrCode,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard, Section, Card, QuickAction, Badge, Loading, EmptyState } from "@/mobile-v2/components/ui";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  stock_quantity: number;
  reorder_level: number;
  category: string;
}

export function PosHome() {
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
    queryKey: ["mobile-v2-pos-dashboard", user?.id, today],
    queryFn: async () => {
      if (!user?.id) return null;

      const [
        todaySalesRes,
        todayTransactionsRes,
        inventoryRes,
        lowStockRes,
        recentSalesRes,
      ] = await Promise.all([
        // Today's counter sales
        supabase
          .from("sales")
          .select("total_amount, cash_amount, upi_amount, payment_type")
          .eq("recorded_by", user.id)
          .gte("created_at", todayStart.toISOString())
          .lt("created_at", todayEnd.toISOString()),
        // Today's transactions
        supabase
          .from("transactions")
          .select("total_amount, cash_amount, upi_amount, transaction_type")
          .eq("recorded_by", user.id)
          .gte("created_at", todayStart.toISOString())
          .lt("created_at", todayEnd.toISOString()),
        // Current inventory
        supabase
          .from("products")
          .select("id, name, sku, stock_quantity, reorder_level, category")
          .eq("is_active", true)
          .order("stock_quantity", { ascending: true })
          .limit(20),
        // Low stock items
        supabase
          .from("products")
          .select("id, name, stock_quantity, reorder_level")
          .eq("is_active", true)
          .lte("stock_quantity", supabase.rpc("get_reorder_threshold", {}))
          .limit(10),
        // Recent sales
        supabase
          .from("sales")
          .select("id, display_id, total_amount, created_at, status, payment_type")
          .eq("recorded_by", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const sales = todaySalesRes.data || [];
      const transactions = todayTransactionsRes.data || [];
      const inventory = inventoryRes.data || [];
      const lowStock = lowStockRes.data || [];
      const recentSales = recentSalesRes.data || [];

      // Calculate totals
      const totalCash = sales.reduce((s, r) => s + Number(r.cash_amount || 0), 0) +
        transactions.reduce((s, r) => s + Number(r.cash_amount || 0), 0);
      const totalUpi = sales.reduce((s, r) => s + Number(r.upi_amount || 0), 0) +
        transactions.reduce((s, r) => s + Number(r.upi_amount || 0), 0);
      const totalSales = sales.reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const totalTransactions = transactions.reduce((s, r) => s + Number(r.total_amount || 0), 0);

      // Inventory stats
      const totalProducts = inventory.length;
      const lowStockCount = lowStock.length;
      const totalStock = inventory.reduce((s, p) => s + (p.stock_quantity || 0), 0);

      return {
        stats: {
          cashInHand: totalCash,
          upiCollections: totalUpi,
          totalCollections: totalCash + totalUpi,
          counterSales: sales.length,
          totalSalesAmount: totalSales + totalTransactions,
          totalProducts,
          lowStockCount,
          totalStock,
        },
        recentSales,
        lowStockItems: lowStock.slice(0, 5),
        inventory: inventory.slice(0, 10),
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
            {profile?.full_name || "POS Operator"}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge className="bg-white/20 text-white border-0">
              <Store className="w-3 h-3 mr-1" />
              POS Terminal
            </Badge>
          </div>
        </div>
      </div>

      {/* Today's Collections - 3 cards */}
      <Section title="Today's Collections" className="mb-4">
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
            icon={TrendingUp}
            label="Total"
            value={formatCurrency(s?.totalCollections || 0)}
            variant="primary"
            className="text-xs"
          />
        </div>
      </Section>

      {/* Counter Sales Stats */}
      <Section title="Counter Sales" className="mb-4">
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            icon={Receipt}
            label="Sales Count"
            value={String(s?.counterSales || 0)}
            variant="default"
          />
          <StatCard
            icon={ShoppingCart}
            label="Sales Amount"
            value={formatCurrency(s?.totalSalesAmount || 0)}
            variant="success"
          />
        </div>
      </Section>

      {/* Inventory Levels */}
      <Section title="Inventory Levels" className="mb-4">
        <div className="grid grid-cols-3 gap-2 mb-3">
          <StatCard
            icon={Package}
            label="Products"
            value={String(s?.totalProducts || 0)}
            variant="default"
            className="text-xs"
          />
          <StatCard
            icon={Store}
            label="Total Stock"
            value={String(s?.totalStock || 0)}
            variant="success"
            className="text-xs"
          />
          <StatCard
            icon={TrendingUp}
            label="Low Stock"
            value={String(s?.lowStockCount || 0)}
            variant={s?.lowStockCount ? "warning" : "success"}
            className="text-xs"
          />
        </div>

        {/* Low Stock Alert */}
        {s?.lowStockCount > 0 && (
          <Card className="p-3 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Low Stock Items
              </span>
            </div>
            <div className="space-y-2">
              {dashboardData?.lowStockItems.slice(0, 3).map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate">{item.name}</span>
                  <Badge variant="warning" className="text-xs">
                    {item.stock_quantity} left
                  </Badge>
                </div>
              ))}
              {dashboardData!.lowStockItems.length > 3 && (
                <Button
                  variant="ghost"
                  className="w-full text-xs mt-1"
                  onClick={() => window.location.href = "/pos/inventory"}
                >
                  View all {dashboardData?.lowStockItems.length} items
                </Button>
              )}
            </div>
          </Card>
        )}
      </Section>

      {/* Quick Billing Actions */}
      <Section title="Quick Actions" className="mb-4">
        <div className="grid grid-cols-4 gap-2">
          <QuickAction
            icon={Plus}
            label="New Sale"
            href="/pos/sales"
            variant="primary"
          />
          <QuickAction
            icon={Calculator}
            label="Calculator"
            href="/pos/calculator"
          />
          <QuickAction
            icon={QrCode}
            label="Scan QR"
            href="/pos/scan"
          />
          <QuickAction
            icon={History}
            label="History"
            href="/pos/history"
          />
        </div>
      </Section>

      {/* Recent Sales */}
      <Section title="Recent Sales" className="mb-4">
        {dashboardData?.recentSales && dashboardData.recentSales.length > 0 ? (
          <div className="space-y-2">
            {dashboardData.recentSales.slice(0, 5).map((sale: any) => (
              <Card
                key={sale.id}
                variant="outline"
                className="p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Receipt className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{sale.display_id}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(sale.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {formatCurrency(sale.total_amount || 0)}
                  </p>
                  <Badge
                    variant={sale.payment_type === "cash" ? "success" : "info"}
                    className="text-xs"
                  >
                    {sale.payment_type || "cash"}
                  </Badge>
                </div>
              </Card>
            ))}
            <Button
              variant="ghost"
              className="w-full text-sm mt-2"
              onClick={() => window.location.href = "/pos/sales"}
            >
              View all sales
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        ) : (
          <EmptyState
            icon={Receipt}
            title="No sales today"
            description="Start billing to see transactions here"
          />
        )}
      </Section>
    </div>
  );
}
