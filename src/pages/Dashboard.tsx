import { useEffect } from "react";
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
  Banknote,
  Smartphone,
  Clock,
  AlertCircle,
  HandCoins,
  Settings,
  FileText,
  Package,
  UserCircle,
  Users2,
  Warehouse as WarehouseIcon,
  Receipt,
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
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

// ==================== Super Admin Dashboard ====================

const SuperAdminDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["super-admin-dashboard-stats"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const [
        todaySalesRes,
        recentSalesRes,
        customersRes,
        storesRes,
        warehousesRes,
        staffRes,
        pendingHandoversRes,
        alertsRes,
        fulfillmentRes,
        collectionRes,
        staffRankRes,
      ] = await Promise.all([
        // Today's sales across all warehouses
        supabase.from("sales")
          .select("total_amount, cash_amount, upi_amount")
          .gte("created_at", today + "T00:00:00")
          .limit(500),
        // Recent sales for trend
        supabase.from("sales")
          .select("total_amount, created_at")
          .gte("created_at", sevenDaysAgo + "T00:00:00")
          .order("created_at", { ascending: false })
          .limit(500),
        // Customer count
        supabase.from("customers")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true),
        // Stores with outstanding
        supabase.from("stores")
          .select("id, outstanding")
          .eq("is_active", true)
          .limit(500),
        // Warehouses count
        supabase.from("warehouses")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true),
        // Active staff count
        supabase.from("staff_directory")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true),
        // Pending handovers
        supabase.from("handovers")
          .select("cash_amount, upi_amount")
          .in("status", ["pending", "awaiting_confirmation"]),
        // Low stock alerts (from per-warehouse product_stock)
        supabase.from("product_stock")
          .select("id, warehouse_id, stock_quantity:quantity, products(name, is_active)")
          .limit(100),
        // Order fulfillment rate
        supabase.from("orders")
          .select("status")
          .gte("created_at", thirtyDaysAgo)
          .limit(5000),
        // Collection efficiency (today's sales with outstanding)
        supabase.from("sales")
          .select("total_amount, outstanding_amount")
          .gte("created_at", today + "T00:00:00")
          .limit(1000),
        // Staff sales ranking
        supabase.from("sales")
          .select("total_amount, recorded_by, profiles!inner(full_name)")
          .gte("created_at", today + "T00:00:00")
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

      const todaySales: any[] = todaySalesRes.data || [];
      const recentSales: any[] = recentSalesRes.data || [];
      const allStores: any[] = storesRes.data || [];

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

      const totalOrders = (fulfillmentRes.data || []).length;
      const fulfilledOrders = (fulfillmentRes.data || []).filter(
        (o: any) => o.status === "fulfilled" || o.status === "delivered"
      ).length;
      const fulfillmentRate = totalOrders > 0
        ? Math.round((fulfilledOrders / totalOrders) * 100) : 0;

      const collectionData = (collectionRes.data || []) as any[];
      const collectionTotal = collectionData.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
      const collectionOutstanding = collectionData.reduce((s: number, r: any) => s + Number(r.outstanding_amount || 0), 0);
      const collectionEfficiency = collectionTotal > 0
        ? Math.round(((collectionTotal - collectionOutstanding) / collectionTotal) * 100) : 0;

      const staffSales: Record<string, number> = {};
      (staffRankRes.data || []).forEach((sale: any) => {
        const name = sale.profiles?.full_name || "Unknown";
        staffSales[name] = (staffSales[name] || 0) + Number(sale.total_amount);
      });
      const topStaff = Object.entries(staffSales)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 3)
        .map(([name, sales]) => ({ name, sales: sales as number }));

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
        lowStockAlerts: (alertsRes.data || [])
          .filter((item: any) => item?.products?.is_active !== false)
          .filter((item: any) => Number(item.stock_quantity || 0) <= 10)
          .slice(0, 5)
          .map((item: any) => ({
            id: item.id,
            name: item.products?.name || "Unknown product",
            stock_quantity: Number(item.stock_quantity || 0),
            reorder_level: 10,
            warehouse_id: item.warehouse_id,
          })),
        weeklySales,
        fulfillmentRate,
        collectionEfficiency,
        topStaff,
      };
    },
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats ?? {
    todayTotal: 0,
    todayCash: 0,
    todayUpi: 0,
    totalOutstanding: 0,
    overdueStores: 0,
    customerCount: 0,
    storeCount: 0,
    warehouseCount: 0,
    staffCount: 0,
    pendingHandover: 0,
    lowStockAlerts: [] as any[],
    weeklySales: [] as any[],
    fulfillmentRate: 0,
    collectionEfficiency: 0,
    topStaff: [] as { name: string; sales: number }[],
  };

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
            title="Overdue Stores"
            value={String(s.overdueStores)}
            change={`Out of ${s.storeCount} stores`}
            changeType={s.overdueStores > 0 ? "warning" : "positive"}
            icon={AlertCircle}
            iconColor="warning"
          />
        <StatCard
          title="Pending Handovers"
          value={`₹${s.pendingHandover.toLocaleString()}`}
          change={`Awaiting confirmation`}
           changeType={"warning" as any}
           icon={Clock}
           iconColor="warning"
         />
       </div>

       {/* Operational Metrics */}
       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
         <StatCard
           title="Order Fulfillment"
           value={`${s.fulfillmentRate}%`}
           change={s.fulfillmentRate >= 80 ? "On track" : s.fulfillmentRate >= 50 ? "Needs improvement" : "Critical"}
           changeType={s.fulfillmentRate >= 80 ? "positive" : s.fulfillmentRate >= 50 ? "warning" : "negative"}
           icon={ShoppingCart}
           iconColor="primary"
         />
         <StatCard
           title="Collection Efficiency"
           value={`${s.collectionEfficiency}%`}
           change={s.collectionEfficiency >= 80 ? "Strong" : "Below target"}
           changeType={s.collectionEfficiency >= 80 ? "positive" : "negative"}
           icon={Banknote}
           iconColor="success"
         />
         <StatCard
           title="Top Staff (Today)"
           value={s.topStaff[0]?.name || "—"}
           change={s.topStaff[0] ? `₹${(s.topStaff[0].sales || 0).toLocaleString()}` : ""}
           icon={Users}
           iconColor="purple"
         />
         <StatCard
           title="Warehouses"
           value={String(s.warehouseCount)}
           icon={WarehouseIcon}
           iconColor="orange"
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
            <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-4 cursor-pointer" onClick={() => navigate("/stores")}>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <p className="text-sm font-medium">Outstanding Risk</p>
              </div>
              <p className="mt-2 text-2xl font-bold">₹{s.totalOutstanding.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.overdueStores} stores with balance</p>
            </div>
            <div className="rounded-lg border p-4 cursor-pointer" onClick={() => navigate("/inventory")}>
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
          supabase.from("sales")
            .select("total_amount, cash_amount, upi_amount")
            .eq("warehouse_id", currentWarehouse!.id)
            .gte("created_at", today + "T00:00:00"),
          // Staff handovers pending
          supabase.from("handovers")
            .select("cash_amount, upi_amount, status, profiles(full_name)")
            .in("status", ["pending", "awaiting_confirmation"])
            .eq("warehouse_id", currentWarehouse!.id)
            .limit(10),
          // Pending orders
          supabase.from("orders")
            .select("id, display_id, stores(name), created_at, total_amount")
            .eq("warehouse_id", currentWarehouse!.id)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(5),
         // Low stock
         supabase.from("product_stock")
           .select("id, warehouse_id, stock_quantity:quantity, products(name, is_active)")
           .eq("warehouse_id", currentWarehouse!.id)
           .limit(100),
         // Staff sales today
         supabase.from("sales")
           .select("total_amount, recorded_by, profiles(full_name)")
           .eq("warehouse_id", currentWarehouse!.id)
           .gte("created_at", today + "T00:00:00"),
      ]);

      const todaySales: any[] = todaySalesRes.data || [];
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
        pendingOrders: (pendingOrdersRes.data || []) as any[],
        lowStockItems: (lowStockRes.data || [])
          .filter((item: any) => item?.products?.is_active !== false)
          .filter((item: any) => Number(item.stock_quantity || 0) <= 10)
          .slice(0, 5)
          .map((item: any) => ({
            id: item.id,
            name: item.products?.name || "Unknown product",
            stock_quantity: Number(item.stock_quantity || 0),
            reorder_level: 10,
          })),
        staffHandovers: (staffHandoversRes.data || []) as any[],
        salesByStaff: salesByStaffData,
      };
    },
    enabled: !!currentWarehouse?.id,
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats ?? {
    todaySales: 0,
    todayCash: 0,
    todayUpi: 0,
    staffHoldings: 0,
    pendingOrders: [] as any[],
    lowStockItems: [] as any[],
    staffHandovers: [] as any[],
    salesByStaff: [] as any[],
  };

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
          changeType={"warning" as any}
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



// ==================== Main Dashboard Component ====================

const Dashboard = () => {
  const { role, loading } = useAuth();

  useEffect(() => {
    const names: Record<string, string> = {
      super_admin: "Admin Dashboard",
      manager: "Manager Dashboard",
    };
    document.title = (names[role || ""] || "Dashboard") + " — BizManager";
  }, [role]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  // Route to appropriate dashboard based on role
  switch (role) {
    case "super_admin":
      return <SuperAdminDashboard />;
    case "manager":
      return <ManagerDashboard />;
    default:
      return <SuperAdminDashboard />;
  }
};



export default Dashboard;
