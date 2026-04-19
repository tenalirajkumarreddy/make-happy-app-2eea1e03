import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DollarSign,
  Users,
  Store,
  ShoppingCart,
  TrendingUp,
  Banknote,
  Smartphone,
  Clock,
  ArrowRight,
  ClipboardList,
  Receipt,
  Users2,
  Warehouse as WarehouseIcon,
  AlertCircle,
  MapPin,
  HandCoins,
  Activity,
  Settings,
  FileText,
  Package,
  CreditCard,
  History,
  Plus,
  Navigation,
  CheckCircle,
  WifiOff,
  RefreshCw,
  Loader2,
  UserCircle,
  ReceiptIndianRupee,
} from "lucide-react";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { QuickActionDrawer } from "@/components/agent/QuickActionDrawer";
import { RouteSessionPanel } from "@/components/routes/RouteSessionPanel";
import { isNativeApp } from "@/lib/capacitorUtils";
import { useFixedCostReminders } from "@/hooks/useFixedCostReminders";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { formatDate } from "@/lib/utils";

const COLORS = ["hsl(217, 91%, 50%)", "hsl(142, 72%, 42%)", "hsl(38, 92%, 50%)", "hsl(280, 65%, 60%)", "hsl(0, 72%, 51%)"];

// ==================== Super Admin Dashboard ====================

const SuperAdminDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["super-admin-dashboard-stats"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const [
        todaySalesRes,
        recentSalesRes,
        customersRes,
        storesRes,
        warehousesRes,
        staffRes,
        pendingHandoversRes,
        alertsRes,
      ] = await Promise.all([
        // Today's sales across all warehouses
        (supabase as any).from("sales")
          .select("total_amount, cash_amount, upi_amount")
          .gte("created_at", today + "T00:00:00")
          .limit(500),
        // Recent sales for trend
        (supabase as any).from("sales")
          .select("total_amount, created_at")
          .gte("created_at", sevenDaysAgo + "T00:00:00")
          .order("created_at", { ascending: false })
          .limit(500),
        // Customer count
        (supabase as any).from("customers")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true),
        // Stores with outstanding
        (supabase as any).from("stores")
          .select("id, outstanding")
          .eq("is_active", true)
          .limit(500),
        // Warehouses count
        (supabase as any).from("warehouses")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true),
        // Active staff count
        (supabase as any).from("staff_directory")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true),
        // Pending handovers
        (supabase as any).from("handovers")
          .select("cash_amount, upi_amount")
          .in("status", ["pending", "awaiting_confirmation"]),
        // Low stock alerts (products below reorder level)
        (supabase as any).from("products")
          .select("id, name, stock_quantity, reorder_level, warehouse_id")
          .lte("stock_quantity", "reorder_level")
          .eq("is_active", true)
          .limit(5),
      ]);

      const todaySales = todaySalesRes.data || [];
      const recentSales = recentSalesRes.data || [];
      const allStores = storesRes.data || [];

      const todayTotal = todaySales.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
      const todayCash = todaySales.reduce((s: number, r: any) => s + Number(r.cash_amount), 0);
      const todayUpi = todaySales.reduce((s: number, r: any) => s + Number(r.upi_amount), 0);
      const totalOutstanding = allStores.reduce((s: number, r: any) => s + Number(r.outstanding), 0);
      const overdueStores = allStores.filter((s: any) => Number(s.outstanding) > 0).length;
      const pendingHandover = (pendingHandoversRes.data || []).reduce(
        (sum: number, h: any) => sum + Number(h.cash_amount || 0) + Number(h.upi_amount || 0),
        0
      );

      // Weekly sales trend
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d;
      });
      const weeklySales = last7.map((d) => {
        const dateStr = d.toISOString().split("T")[0];
        const daySales = recentSales.filter((s: any) => s.created_at.startsWith(dateStr));
        return {
          day: dayNames[d.getDay()],
          sales: daySales.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0),
        };
      });

      return {
        todayTotal,
        todayCash,
        todayUpi,
        totalOutstanding,
        overdueStores,
        customerCount: customersRes.count || 0,
        storeCount: allStores.length,
        warehouseCount: warehousesRes.count || 0,
        staffCount: staffRes.count || 0,
        pendingHandover,
        lowStockAlerts: alertsRes.data || [],
        weeklySales,
      };
    },
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats!;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Super Admin Dashboard"
        subtitle={`Welcome back, ${profile?.full_name || "Admin"}! Overseeing all operations.`}
      />

      {/* Stats Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Today's Sales"
          value={`₹${s.todayTotal.toLocaleString()}`}
          icon={DollarSign}
          iconColor="primary"
        />
        <StatCard
          title="Cash in Hand"
          value={`₹${s.todayCash.toLocaleString()}`}
          icon={Banknote}
          iconColor="success"
        />
        <StatCard
          title="UPI Collected"
          value={`₹${s.todayUpi.toLocaleString()}`}
          icon={Smartphone}
          iconColor="info"
        />
        <StatCard
          title="Active Staff"
          value={String(s.staffCount)}
          icon={Users}
          iconColor="purple"
        />
      </div>

      {/* Stats Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Total Customers"
          value={String(s.customerCount)}
          icon={UserCircle}
          iconColor="cyan"
        />
        <StatCard
          title="Total Stores"
          value={String(s.storeCount)}
          icon={Store}
          iconColor="emerald"
        />
        <StatCard
          title="Warehouses"
          value={String(s.warehouseCount)}
          icon={WarehouseIcon}
          iconColor="orange"
        />
        <StatCard
          title="Pending Handovers"
          value={`₹${s.pendingHandover.toLocaleString()}`}
          change={`Awaiting confirmation`}
          changeType="warning"
          icon={Clock}
          iconColor="warning"
        />
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold">Quick Actions</h3>
            <p className="text-xs text-muted-foreground mt-1">Management functions for global oversight.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          <Button variant="outline" className="h-auto min-h-24 flex-col gap-2 py-4" onClick={() => navigate("/staff-directory")}>
            <Users className="h-5 w-5" />
            Manage Users
          </Button>
          <Button variant="outline" className="h-auto min-h-24 flex-col gap-2 py-4" onClick={() => navigate("/staff-directory")}>
            <Users2 className="h-5 w-5" />
            Staff Directory
          </Button>
          <Button variant="outline" className="h-auto min-h-24 flex-col gap-2 py-4" onClick={() => navigate("/warehouses")}>
            <WarehouseIcon className="h-5 w-5" />
            Warehouses
          </Button>
          <Button variant="outline" className="h-auto min-h-24 flex-col gap-2 py-4" onClick={() => navigate("/settings")}>
            <Settings className="h-5 w-5" />
            Settings
          </Button>
          <Button variant="outline" className="h-auto min-h-24 flex-col gap-2 py-4" onClick={() => navigate("/reports")}>
            <FileText className="h-5 w-5" />
            Reports
          </Button>
        </div>
      </div>

      {/* Charts & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Sales Trend (Last 7 Days)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={s.weeklySales}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Alerts</h3>
          <div className="space-y-3">
            <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <p className="text-sm font-medium">Outstanding Risk</p>
              </div>
              <p className="mt-2 text-2xl font-bold">₹{s.totalOutstanding.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.overdueStores} stores with balance</p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-warning" />
                <p className="text-sm font-medium">Low Stock Items</p>
              </div>
              <p className="mt-2 text-xl font-bold">{s.lowStockAlerts.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Products below reorder level</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== Manager Dashboard ====================

const ManagerDashboard = () => {
  const { profile, user } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["manager-dashboard", currentWarehouse?.id, user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const [
        todaySalesRes,
        staffHandoversRes,
        pendingOrdersRes,
        lowStockRes,
        staffSalesRes,
      ] = await Promise.all([
        // Today's sales for this warehouse
        (supabase as any).from("sales")
          .select("total_amount, cash_amount, upi_amount")
          .eq("warehouse_id", currentWarehouse?.id)
          .gte("created_at", today + "T00:00:00"),
        // Staff handovers pending
        (supabase as any).from("handovers")
          .select("cash_amount, upi_amount, status, profiles(full_name)")
          .in("status", ["pending", "awaiting_confirmation"])
          .eq("warehouse_id", currentWarehouse?.id)
          .limit(10),
        // Pending orders
        (supabase as any).from("orders")
          .select("id, display_id, stores(name), created_at, total_amount")
          .eq("warehouse_id", currentWarehouse?.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(5),
        // Low stock
        (supabase as any).from("products")
          .select("id, name, stock_quantity, reorder_level")
          .eq("warehouse_id", currentWarehouse?.id)
          .lte("stock_quantity", "reorder_level")
          .eq("is_active", true)
          .limit(5),
        // Staff sales today
        (supabase as any).from("sales")
          .select("total_amount, recorded_by, profiles(full_name)")
          .eq("warehouse_id", currentWarehouse?.id)
          .gte("created_at", today + "T00:00:00"),
      ]);

      const todaySales = todaySalesRes.data || [];
      const totalSales = todaySales.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
      const totalCash = todaySales.reduce((s: number, r: any) => s + Number(r.cash_amount), 0);
      const totalUpi = todaySales.reduce((s: number, r: any) => s + Number(r.upi_amount), 0);

      const staffHoldings = (staffHandoversRes.data || []).reduce(
        (sum: number, h: any) => sum + Number(h.cash_amount || 0) + Number(h.upi_amount || 0),
        0
      );

      // Aggregate sales by staff
      const salesByStaff: Record<string, { name: string; sales: number }> = {};
      (staffSalesRes.data || []).forEach((sale: any) => {
        const staffId = sale.recorded_by;
        const staffName = sale.profiles?.full_name || "Unknown";
        if (!salesByStaff[staffId]) {
          salesByStaff[staffId] = { name: staffName, sales: 0 };
        }
        salesByStaff[staffId].sales += Number(sale.total_amount);
      });
      const salesByStaffData = Object.values(salesByStaff).slice(0, 5);

      return {
        todaySales: totalSales,
        todayCash: totalCash,
        todayUpi: totalUpi,
        staffHoldings,
        pendingOrders: pendingOrdersRes.data || [],
        lowStockItems: lowStockRes.data || [],
        staffHandovers: staffHandoversRes.data || [],
        salesByStaff: salesByStaffData,
      };
    },
    enabled: !!currentWarehouse?.id,
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats!;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Manager Dashboard"
        subtitle={`Welcome, ${profile?.full_name || "Manager"}! Warehouse: ${currentWarehouse?.name || "N/A"}`}
      />

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Today's Sales"
          value={`₹${s.todaySales.toLocaleString()}`}
          icon={DollarSign}
          iconColor="primary"
        />
        <StatCard
          title="Cash Held"
          value={`₹${s.todayCash.toLocaleString()}`}
          icon={Banknote}
          iconColor="success"
        />
        <StatCard
          title="Staff Holdings"
          value={`₹${s.staffHoldings.toLocaleString()}`}
          change={`Pending handover`}
          changeType="warning"
          icon={HandCoins}
          iconColor="warning"
        />
        <StatCard
          title="Pending Orders"
          value={String(s.pendingOrders.length)}
          icon={ShoppingCart}
          iconColor="info"
        />
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Button variant="outline" className="h-auto min-h-20 flex-col gap-2 py-4" onClick={() => navigate("/sales")}>
            <Receipt className="h-5 w-5" />
            Record Sale
          </Button>
          <Button variant="outline" className="h-auto min-h-20 flex-col gap-2 py-4" onClick={() => navigate("/handovers")}>
            <HandCoins className="h-5 w-5" />
            Review Handovers
          </Button>
          <Button variant="outline" className="h-auto min-h-20 flex-col gap-2 py-4" onClick={() => navigate("/staff-directory")}>
            <Users className="h-5 w-5" />
            Manage Staff
          </Button>
          <Button variant="outline" className="h-auto min-h-20 flex-col gap-2 py-4" onClick={() => navigate("/reports")}>
            <FileText className="h-5 w-5" />
            View Reports
          </Button>
        </div>
      </div>

      {/* Sales by Staff & Pending Handovers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Sales by Staff (Today)</h3>
          {s.salesByStaff.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No sales recorded today</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={s.salesByStaff} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Pending Handovers</h3>
          {s.staffHandovers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No pending handovers</p>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {s.staffHandovers.map((handover: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2">
                  <div>
                    <p className="text-sm font-medium">{handover.profiles?.full_name || "Unknown"}</p>
                    <Badge variant="outline" className="text-xs mt-1">{handover.status}</Badge>
                  </div>
                  <p className="text-sm font-semibold">
                    ₹{(Number(handover.cash_amount || 0) + Number(handover.upi_amount || 0)).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Inventory Alerts */}
      {s.lowStockItems.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold">Inventory Alerts</h3>
          </div>
          <div className="space-y-2">
            {s.lowStockItems.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Stock: {item.stock_quantity} (Reorder: {item.reorder_level})
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate("/inventory")}>
                  Reorder
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== Agent Dashboard ====================

const AgentDashboard = () => {
  const { user, profile } = useAuth();
  const { isOnline, pendingCount, syncing, syncQueue } = useOnlineStatus();
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["agent-dashboard", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const [
        salesRes,
        txnRes,
        visitsRes,
        allSalesRes,
        allTxnsRes,
        confirmedHandoversRes,
        todayHandoverRes,
        weeklySalesRes,
      ] = await Promise.all([
        supabase.from("sales").select("total_amount, cash_amount, upi_amount").eq("recorded_by", user!.id).gte("created_at", today + "T00:00:00"),
        supabase.from("transactions").select("total_amount, cash_amount, upi_amount").eq("recorded_by", user!.id).gte("created_at", today + "T00:00:00"),
        supabase.from("store_visits").select("id, stores(name)").gte("visited_at", today + "T00:00:00"),
        supabase.from("sales").select("cash_amount, upi_amount").eq("recorded_by", user!.id),
        supabase.from("transactions").select("cash_amount, upi_amount").eq("recorded_by", user!.id),
        supabase.from("handovers").select("cash_amount, upi_amount").eq("user_id", user!.id).eq("status", "confirmed"),
        supabase.from("handovers").select("cash_amount, upi_amount, status").eq("user_id", user!.id).eq("handover_date", today).maybeSingle(),
        supabase.from("sales").select("total_amount, created_at").eq("recorded_by", user!.id).gte("created_at", weekAgo + "T00:00:00"),
      ]);

      const todaySales = salesRes.data || [];
      const todayTxns = txnRes.data || [];

      const totalSale = todaySales.reduce((s, r) => s + Number(r.total_amount), 0);
      const totalCash = todaySales.reduce((s, r) => s + Number(r.cash_amount), 0) + todayTxns.reduce((s, r) => s + Number(r.cash_amount), 0);
      const totalUpi = todaySales.reduce((s, r) => s + Number(r.upi_amount), 0) + todayTxns.reduce((s, r) => s + Number(r.upi_amount), 0);

      const allTimeCash = (allSalesRes.data || []).reduce((s, r) => s + Number(r.cash_amount), 0) + (allTxnsRes.data || []).reduce((s, r) => s + Number(r.cash_amount), 0);
      const allTimeUpi = (allSalesRes.data || []).reduce((s, r) => s + Number(r.upi_amount), 0) + (allTxnsRes.data || []).reduce((s, r) => s + Number(r.upi_amount), 0);
      const confirmedCash = (confirmedHandoversRes.data || []).reduce((s, r) => s + Number(r.cash_amount), 0);
      const confirmedUpi = (confirmedHandoversRes.data || []).reduce((s, r) => s + Number(r.upi_amount), 0);

      const todayHandover = todayHandoverRes.data;
      const todayConfirmed = todayHandover?.status === "confirmed" ? Number(todayHandover.cash_amount) + Number(todayHandover.upi_amount) : 0;
      const todayHandoverable = Math.max(0, totalCash + totalUpi - todayConfirmed);
      const totalPendingHandoverable = Math.max(0, allTimeCash + allTimeUpi - confirmedCash - confirmedUpi);

      // Weekly performance data
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d;
      });
      const weeklyPerformance = last7.map((d) => {
        const dateStr = d.toISOString().split("T")[0];
        const daySales = (weeklySalesRes.data || []).filter((s: any) => s.created_at.startsWith(dateStr));
        return {
          day: dayNames[d.getDay()],
          sales: daySales.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0),
        };
      });

      return {
        storesCovered: visitsRes.data?.length || 0,
        totalSale,
        totalCash,
        totalUpi,
        todayHandoverable,
        totalPendingHandoverable,
        weeklyPerformance,
      };
    },
    enabled: !!user,
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats!;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Dashboard" subtitle={`Welcome, ${profile?.full_name || "Agent"}! Here's your daily summary.`} />

      {/* Offline / pending sync banner */}
      {(!isOnline || pendingCount > 0) && (
        <div className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${!isOnline ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-warning/30 bg-warning/5 text-warning"}`}>
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
              {!isOnline
                ? `You're offline${pendingCount > 0 ? ` — ${pendingCount} action${pendingCount > 1 ? "s" : ""} queued` : ""}`
                : `${pendingCount} action${pendingCount > 1 ? "s" : ""} pending sync`}
            </span>
          </div>
          {isOnline && pendingCount > 0 && (
            <Button size="sm" variant="outline" onClick={syncQueue} disabled={syncing} className="h-7 gap-1.5 text-xs shrink-0">
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Sync Now
            </Button>
          )}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard title="Stores Covered" value={String(s.storesCovered)} icon={MapPin} iconColor="primary" />
        <StatCard title="Sales Today" value={`₹${s.totalSale.toLocaleString()}`} icon={ShoppingCart} iconColor="success" />
        <StatCard title="Cash on Hand" value={`₹${s.totalCash.toLocaleString()}`} icon={Banknote} iconColor="warning" />
        <StatCard title="UPI Collected" value={`₹${s.totalUpi.toLocaleString()}`} icon={Smartphone} iconColor="info" />
        <StatCard title="Today's Handoverable" value={`₹${s.todayHandoverable.toLocaleString()}`} icon={HandCoins} iconColor="orange" />
        <StatCard title="Pending Handover" value={`₹${s.totalPendingHandoverable.toLocaleString()}`} icon={AlertCircle} iconColor="destructive" />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Button size="lg" className="h-20 flex-col gap-1" onClick={() => navigate("/sales")}>
          <Receipt className="h-6 w-6" />
          <span className="text-xs">Record Sale</span>
        </Button>
        <Button size="lg" variant="secondary" className="h-20 flex-col gap-1" onClick={() => navigate("/routes")}>
          <Navigation className="h-6 w-6" />
          <span className="text-xs">My Route</span>
        </Button>
        <Button size="lg" variant="outline" className="h-20 flex-col gap-1" onClick={() => navigate("/stores")}>
          <Store className="h-6 w-6" />
          <span className="text-xs">Stores</span>
        </Button>
      </div>

      {/* Route Session Panel */}
      <RouteSessionPanel />

      {/* Weekly Performance Chart */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Weekly Performance</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={s.weeklyPerformance}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Line type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Floating Quick Action */}
      {!isNativeApp() && (
        <div className="fixed bottom-6 right-4 z-50 sm:bottom-8 sm:right-8">
          <QuickActionDrawer />
        </div>
      )}
    </div>
  );
};

// ==================== Customer Dashboard ====================

const CustomerDashboard = () => {
  const { profile, customer } = useAuth();
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["customer-dashboard", customer?.id],
    queryFn: async () => {
      if (!customer?.id) return null;

      const [
        customerDataRes,
        pendingOrdersRes,
        recentOrdersRes,
        recentPaymentsRes,
      ] = await Promise.all([
        supabase.from("customers").select("outstanding, credit_limit").eq("id", customer.id).maybeSingle(),
        supabase.from("orders").select("id, display_id, status, total_amount, created_at").eq("customer_id", customer.id).eq("status", "pending").order("created_at", { ascending: false }),
        supabase.from("orders").select("id, display_id, status, total_amount, created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("transactions").select("id, total_amount, created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(5),
      ]);

      const customerData = customerDataRes.data;
      const outstanding = customerData?.outstanding || 0;
      const creditLimit = customerData?.credit_limit || 0;
      const availableCredit = Math.max(0, creditLimit - outstanding);

      return {
        outstanding,
        creditLimit,
        availableCredit,
        pendingOrders: pendingOrdersRes.data || [],
        recentOrders: recentOrdersRes.data || [],
        recentPayments: recentPaymentsRes.data || [],
      };
    },
    enabled: !!customer?.id,
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats;

  if (!s) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Customer Dashboard" subtitle={`Welcome, ${profile?.full_name || "Customer"}!`} />
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-muted-foreground">No customer data available. Please complete your profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Customer Dashboard" subtitle={`Welcome, ${profile?.full_name || "Customer"}!`} />

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          title="Outstanding Balance"
          value={`₹${s.outstanding.toLocaleString()}`}
          change={s.outstanding > 0 ? "Payment due" : "All clear"}
          changeType={s.outstanding > 0 ? "negative" : "positive"}
          icon={CreditCard}
          iconColor={s.outstanding > 0 ? "destructive" : "success"}
        />
        <StatCard
          title="Pending Orders"
          value={String(s.pendingOrders.length)}
          icon={ShoppingCart}
          iconColor="warning"
        />
        <StatCard
          title="Total Orders"
          value={String(s.recentOrders.length)}
          icon={ClipboardList}
          iconColor="primary"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Button size="lg" className="h-20 flex-col gap-1" onClick={() => navigate("/orders")}>
          <Plus className="h-6 w-6" />
          <span className="text-xs">Place Order</span>
        </Button>
        <Button size="lg" variant="secondary" className="h-20 flex-col gap-1" onClick={() => navigate("/orders")}>
          <History className="h-6 w-6" />
          <span className="text-xs">View History</span>
        </Button>
        <Button size="lg" variant="outline" className="h-20 flex-col gap-1" onClick={() => navigate("/payments")}>
          <Banknote className="h-6 w-6" />
          <span className="text-xs">Make Payment</span>
        </Button>
      </div>

      {/* Recent Orders */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold">Recent Orders</h3>
          <Button variant="ghost" size="sm" onClick={() => navigate("/orders")} className="gap-1.5">
            View all
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        {s.recentOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No orders yet</p>
        ) : (
          <div className="space-y-3">
            {s.recentOrders.map((order: any) => (
              <div key={order.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{order.display_id}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                </div>
                <div className="text-right">
                  <Badge variant={order.status === "pending" ? "secondary" : "default"} className="text-xs">
                    {order.status}
                  </Badge>
                  <p className="text-sm font-semibold mt-1">₹{Number(order.total_amount).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment History */}
      {s.recentPayments.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Recent Payments</h3>
          <div className="space-y-3">
            {s.recentPayments.map((payment: any) => (
              <div key={payment.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <p className="text-sm">Payment</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">₹{Number(payment.total_amount).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(payment.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== Default Dashboard (Marketer, POS, Operator) ====================

const DefaultDashboard = () => {
  const { profile, role, user } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const navigate = useNavigate();

  useFixedCostReminders();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["default-dashboard", currentWarehouse?.id, user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const [
        todaySalesRes,
        recentSalesRes,
        customersRes,
        storesRes,
        ordersRes,
      ] = await Promise.all([
        (supabase as any).from("sales")
          .select("total_amount, cash_amount, upi_amount")
          .gte("created_at", today + "T00:00:00")
          .limit(500),
        (supabase as any).from("sales")
          .select("total_amount, created_at, stores(store_type_id, store_types(name))")
          .gte("created_at", sevenDaysAgo + "T00:00:00")
          .order("created_at", { ascending: false })
          .limit(500),
        (supabase as any).from("customers")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true),
        (supabase as any).from("stores")
          .select("id, outstanding")
          .eq("is_active", true)
          .limit(500),
        (supabase as any).from("orders")
          .select("id, status, display_id, stores(name), created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const todaySales = todaySalesRes.data || [];
      const recentSales = recentSalesRes.data || [];
      const allStores = storesRes.data || [];

      const todayTotal = todaySales.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
      const todayCash = todaySales.reduce((s: number, r: any) => s + Number(r.cash_amount), 0);
      const todayUpi = todaySales.reduce((s: number, r: any) => s + Number(r.upi_amount), 0);
      const totalOutstanding = allStores.reduce((s: number, r: any) => s + Number(r.outstanding), 0);
      const overdueStores = allStores.filter((s: any) => Number(s.outstanding) > 0).length;

      // Sales by day
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d;
      });
      const weeklySales = last7.map((d) => {
        const dateStr = d.toISOString().split("T")[0];
        const daySales = recentSales.filter((s: any) => s.created_at.startsWith(dateStr));
        return {
          day: dayNames[d.getDay()],
          sales: daySales.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0),
        };
      });

      // Sales by store type
      const storeTypeSales: Record<string, number> = {};
      recentSales.forEach((s: any) => {
        const typeName = s.stores?.store_types?.name || "Other";
        storeTypeSales[typeName] = (storeTypeSales[typeName] || 0) + Number(s.total_amount);
      });
      const totalSalesAmount = Object.values(storeTypeSales).reduce((a, b) => a + b, 0) || 1;
      const storeTypeData = Object.entries(storeTypeSales).map(([name, value], i) => ({
        name,
        value: Math.round((value / totalSalesAmount) * 100),
        color: COLORS[i % COLORS.length],
      }));

      return {
        todayTotal,
        todayCash,
        todayUpi,
        totalOutstanding,
        overdueStores,
        customerCount: customersRes.count || 0,
        storeCount: allStores.length,
        pendingOrders: ordersRes.data || [],
        weeklySales,
        storeTypeData: storeTypeData.length > 0 ? storeTypeData : [{ name: "No data", value: 100, color: "hsl(220, 13%, 80%)" }],
      };
    },
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats!;

  const roleDisplayName = {
    marketer: "Marketer",
    pos: "POS",
    operator: "Operator",
  }[role || ""] || "User";

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`${roleDisplayName} Dashboard`}
        subtitle={`Welcome back, ${profile?.full_name || "User"}! Warehouse: ${currentWarehouse?.name || "selected context"}.`}
      />

      {/* Quick Action Button - Floating (hidden in native APK) */}
      {!isNativeApp() && (
        <div className="fixed bottom-6 right-4 z-50 sm:bottom-8 sm:right-8">
          <QuickActionDrawer />
        </div>
      )}

      {/* Stats Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Total Sales (Today)" value={`₹${s.todayTotal.toLocaleString()}`} icon={DollarSign} iconColor="primary" />
        <StatCard title="Cash Collected" value={`₹${s.todayCash.toLocaleString()}`} icon={Banknote} iconColor="success" />
        <StatCard title="UPI Collected" value={`₹${s.todayUpi.toLocaleString()}`} icon={Smartphone} iconColor="info" />
        <StatCard
          title="Pending Outstanding"
          value={`₹${s.totalOutstanding.toLocaleString()}`}
          change={`${s.overdueStores} stores with balance`}
          changeType="negative"
          icon={Clock}
          iconColor="warning"
        />
      </div>

      {/* Action Center */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold">Action Center</h3>
              <p className="text-xs text-muted-foreground mt-1">Use this area as the starting point for today's key workflows.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/reports")} className="gap-1.5">
              Open reports
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <Button variant="outline" className="h-auto min-h-24 flex-col gap-2 py-4" onClick={() => navigate("/orders")}>
              <ClipboardList className="h-5 w-5" />
              Review Orders
            </Button>
            <Button variant="outline" className="h-auto min-h-24 flex-col gap-2 py-4" onClick={() => navigate("/transactions")}>
              <Receipt className="h-5 w-5" />
              Collections
            </Button>
            <Button variant="outline" className="h-auto min-h-24 flex-col gap-2 py-4" onClick={() => navigate("/customers")}>
              <Users2 className="h-5 w-5" />
              Customer Follow-up
            </Button>
            <Button variant="outline" className="h-auto min-h-24 flex-col gap-2 py-4" onClick={() => navigate("/inventory")}>
              <WarehouseIcon className="h-5 w-5" />
              Inventory Check
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold">Needs Attention</h3>
          <div className="mt-4 space-y-3">
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding risk</p>
              <p className="mt-2 text-2xl font-bold">₹{s.totalOutstanding.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground mt-1">{s.overdueStores} stores currently have balance due.</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending orders</p>
              <p className="mt-2 text-2xl font-bold">{s.pendingOrders.length}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {s.pendingOrders.length > 0 ? "Follow up on pending delivery or fulfillment work." : "No pending orders right now."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Active Customers" value={String(s.customerCount)} icon={Users} iconColor="cyan" />
        <StatCard title="Active Stores" value={String(s.storeCount)} icon={Store} iconColor="purple" />
        <StatCard title="Pending Orders" value={String(s.pendingOrders.length)} icon={ShoppingCart} iconColor="orange" />
        <StatCard title="Store Types" value={String(s.storeTypeData.filter((t: any) => t.name !== "No data").length)} icon={TrendingUp} iconColor="emerald" />
      </div>

      {/* Charts */}
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
                {s.storeTypeData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {s.storeTypeData.map((item: any) => (
              <div key={item.name} className="flex items-center gap-2 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground">{item.name}</span>
                <span className="font-medium ml-auto">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pending Orders */}
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

// ==================== Main Dashboard Component ====================

const Dashboard = () => {
  const { role, loading } = useAuth();

  if (loading) {
    return <DashboardSkeleton />;
  }

  // Route to appropriate dashboard based on role
  switch (role) {
    case "super_admin":
      return <SuperAdminDashboard />;
    case "manager":
      return <ManagerDashboard />;
    case "agent":
      return <AgentDashboard />;
    case "customer":
      return <CustomerDashboard />;
    case "marketer":
    case "pos":
    case "operator":
    default:
      return <DefaultDashboard />;
  }
};

export default Dashboard;
