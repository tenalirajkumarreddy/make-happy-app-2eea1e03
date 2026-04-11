import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DollarSign, Users, Store, ShoppingCart, TrendingUp, Banknote, Smartphone, Clock,
} from "lucide-react";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { QuickActionDrawer } from "@/components/agent/QuickActionDrawer";
import { isNativeApp } from "@/lib/capacitorUtils";
import { useFixedCostReminders } from "@/hooks/useFixedCostReminders";

const COLORS = ["hsl(217, 91%, 50%)", "hsl(142, 72%, 42%)", "hsl(38, 92%, 50%)", "hsl(280, 65%, 60%)", "hsl(0, 72%, 51%)"];

// Only fetch the most recent days for chart data to avoid unbounded queries
const CHART_DAYS = 7;
const MAX_SALES_FOR_CHART = 500;

const Dashboard = () => {
  const { profile } = useAuth();
  const { currentWarehouse } = useWarehouse();
  
  // Check and send fixed cost reminders when dashboard loads
  useFixedCostReminders();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", currentWarehouse?.id],
    enabled: !!currentWarehouse?.id,
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const sevenDaysAgo = new Date(Date.now() - CHART_DAYS * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      // Optimize: Separate queries for different purposes
      // 1. Today's sales aggregates (small dataset)
      // 2. Last 7 days for charts (bounded)
      // 3. Counts only where possible (head: true)
      const [
        todaySalesRes,
        recentSalesRes,
        customersRes,
        storesRes,
        ordersRes,
      ] = await Promise.all([
        // Today's sales - usually small, get full data for precise totals
        supabase.from("sales")
          .select("total_amount, cash_amount, upi_amount")
          .eq("warehouse_id", currentWarehouse.id)
          .gte("created_at", today + "T00:00:00")
          .limit(500),
        // Recent sales for charts - bounded to 7 days and limited rows
        supabase.from("sales")
          .select("total_amount, created_at, stores(store_type_id, store_types(name))")
          .eq("warehouse_id", currentWarehouse.id)
          .gte("created_at", sevenDaysAgo + "T00:00:00")
          .order("created_at", { ascending: false })
          .limit(MAX_SALES_FOR_CHART),
        // Customer count only
        supabase.from("customers")
          .select("*", { count: "exact", head: true })
          .eq("warehouse_id", currentWarehouse.id)
          .eq("is_active", true),
        // Stores with outstanding - bounded and selected columns
        supabase.from("stores")
          .select("id, outstanding")
          .eq("warehouse_id", currentWarehouse.id)
          .eq("is_active", true)
          .limit(500),
        // Pending orders - just a few for display
        supabase.from("orders")
          .select("id, status, display_id, stores(name), created_at")
          .eq("warehouse_id", currentWarehouse.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const todaySales = todaySalesRes.data || [];
      const recentSales = recentSalesRes.data || [];
      const allStores = storesRes.data || [];

      // Calculate today's totals
      const todayTotal = todaySales.reduce((s, r) => s + Number(r.total_amount), 0);
      const todayCash = todaySales.reduce((s, r) => s + Number(r.cash_amount), 0);
      const todayUpi = todaySales.reduce((s, r) => s + Number(r.upi_amount), 0);
      
      // Calculate store outstanding totals
      const totalOutstanding = allStores.reduce((s, r) => s + Number(r.outstanding), 0);
      const overdueStores = allStores.filter((s) => Number(s.outstanding) > 0).length;

      // Sales by day of week (last 7 days)
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const last7 = Array.from({ length: CHART_DAYS }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (CHART_DAYS - 1 - i));
        return d;
      });
      const weeklySales = last7.map((d) => {
        const dateStr = d.toISOString().split("T")[0];
        const daySales = recentSales.filter((s) => s.created_at.startsWith(dateStr));
        return { day: dayNames[d.getDay()], sales: daySales.reduce((sum, s) => sum + Number(s.total_amount), 0) };
      });

      // Sales by store type (from recent sales only)
      const storeTypeSales: Record<string, number> = {};
      recentSales.forEach((s) => {
        const typeName = (s.stores as any)?.store_types?.name || "Other";
        storeTypeSales[typeName] = (storeTypeSales[typeName] || 0) + Number(s.total_amount);
      });
      const totalSalesAmount = Object.values(storeTypeSales).reduce((a, b) => a + b, 0) || 1;
      const storeTypeData = Object.entries(storeTypeSales).map(([name, value], i) => ({
        name,
        value: Math.round((value / totalSalesAmount) * 100),
        color: COLORS[i % COLORS.length],
      }));

      return {
        todayTotal, todayCash, todayUpi, totalOutstanding, overdueStores,
        customerCount: customersRes.count || 0,
        storeCount: allStores.length,
        pendingOrders: ordersRes.data || [],
        weeklySales,
        storeTypeData: storeTypeData.length > 0 ? storeTypeData : [{ name: "No data", value: 100, color: "hsl(220, 13%, 80%)" }],
      };
    },
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const s = stats!;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Dashboard" subtitle={`Welcome back, ${profile?.full_name || "User"}! Here's your business overview.`} />

      {/* Quick Action Button - Floating (hidden in native APK to avoid BottomNav overlap) */}
      {!isNativeApp() && (
        <div className="fixed bottom-6 right-4 z-50 sm:bottom-8 sm:right-8">
          <QuickActionDrawer />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Total Sales (Today)" value={`₹${s.todayTotal.toLocaleString()}`} icon={DollarSign} iconColor="primary" />
        <StatCard title="Cash Collected" value={`₹${s.todayCash.toLocaleString()}`} icon={Banknote} iconColor="success" />
        <StatCard title="UPI Collected" value={`₹${s.todayUpi.toLocaleString()}`} icon={Smartphone} iconColor="info" />
        <StatCard title="Pending Outstanding" value={`₹${s.totalOutstanding.toLocaleString()}`} change={`${s.overdueStores} stores with balance`} changeType="negative" icon={Clock} iconColor="warning" />
      </div>

      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Active Customers" value={String(s.customerCount)} icon={Users} iconColor="cyan" />
        <StatCard title="Active Stores" value={String(s.storeCount)} icon={Store} iconColor="purple" />
        <StatCard title="Pending Orders" value={String(s.pendingOrders.length)} icon={ShoppingCart} iconColor="orange" />
        <StatCard title="Store Types" value={String(s.storeTypeData.filter((t) => t.name !== "No data").length)} icon={TrendingUp} iconColor="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Last 7 Days Sales</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={s.weeklySales}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
              <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Sales by Store Type</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={s.storeTypeData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                {s.storeTypeData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {s.storeTypeData.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground">{item.name}</span>
                <span className="font-medium ml-auto">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Pending Orders</h3>
        {s.pendingOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No pending orders</p>
        ) : (
          <div className="space-y-3">
            {s.pendingOrders.map((order: any) => (
              <div key={order.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{order.stores?.name || "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono">{order.display_id}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-warning">Pending</p>
                  <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString("en-IN")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
