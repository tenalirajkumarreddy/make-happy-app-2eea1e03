import { PageHeader } from "@/components/shared/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CalendarIcon } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays } from "date-fns";
import { calculateSalesForecast } from "@/lib/forecastEngine";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, Legend, ComposedChart, Scatter
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const COLORS = ["hsl(217, 91%, 50%)", "hsl(142, 72%, 42%)", "hsl(38, 92%, 50%)", "hsl(280, 65%, 60%)", "hsl(0, 72%, 51%)"];

const Analytics = () => {
  const today = new Date();
  const thirtyAgo = new Date(today);
  thirtyAgo.setDate(thirtyAgo.getDate() - 29);
  const [from, setFrom] = useState(thirtyAgo.toISOString().split("T")[0]);
  const [to, setTo] = useState(today.toISOString().split("T")[0]);
  const [pending, setPending] = useState({ from: thirtyAgo.toISOString().split("T")[0], to: today.toISOString().split("T")[0] });

  const applyFilter = () => setPending({ from, to });

  const { data, isLoading } = useQuery({
    queryKey: ["analytics-enhanced", pending.from, pending.to],
    queryFn: async () => {
      const startOfDay = pending.from + "T00:00:00";
      const endOfDay = pending.to + "T23:59:59";

      const [salesRes, txnRes, storesRes, ordersRes, profilesRes, rolesRes, customersRes, routesRes, visitsRes] = await Promise.all([
        supabase.from("sales").select("total_amount, cash_amount, upi_amount, created_at, recorded_by, stores(name, store_type_id, route_id, store_types(name))").gte("created_at", startOfDay).lte("created_at", endOfDay).order("created_at"),
        supabase.from("transactions").select("total_amount, cash_amount, upi_amount, created_at").gte("created_at", startOfDay).lte("created_at", endOfDay),
        supabase.from("stores").select("id, outstanding, store_type_id, route_id, is_active, created_at, store_types(name)").eq("is_active", true),
        supabase.from("orders").select("status"),
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("user_roles").select("user_id, role").in("role", ["agent", "marketer"]),
        supabase.from("customers").select("id, created_at, kyc_status"),
        supabase.from("routes").select("id, name").eq("is_active", true).order("name"),
        supabase.from("store_visits").select("store_id, stores(route_id)").gte("visited_at", startOfDay).lte("visited_at", endOfDay),
      ]);

      const sales = salesRes.data || [];
      const txns = txnRes.data || [];
      const stores = storesRes.data || [];
      const orders = ordersRes.data || [];
      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];
      const customers = customersRes.data || [];
      const routes = routesRes.data || [];
      const visits = visitsRes.data || [];

      const profileMap: Record<string, string> = {};
      profiles.forEach((p) => { profileMap[p.user_id] = p.full_name; });

      // Daily sales trend within the selected range
      const fromDate = new Date(pending.from);
      const toDate = new Date(pending.to);
      const dayMs = 86400000;
      const numDays = Math.min(Math.ceil((toDate.getTime() - fromDate.getTime()) / dayMs) + 1, 90);
      const rangeDays = Array.from({ length: numDays }, (_, i) => {
        const d = new Date(fromDate); d.setDate(fromDate.getDate() + i);
        return d.toISOString().split("T")[0];
      });
      const dailySales: Record<string, number> = {};
      rangeDays.forEach((d) => { dailySales[d] = 0; });
      sales.forEach((s) => {
        const day = s.created_at.split("T")[0];
        if (dailySales[day] !== undefined) dailySales[day] += Number(s.total_amount);
      });
      const salesTrend = rangeDays.map((d) => ({ date: d.slice(5), amount: dailySales[d] }));

      // Payment method split
      const totalCash = sales.reduce((s, r) => s + Number(r.cash_amount), 0) + txns.reduce((s, r) => s + Number(r.cash_amount), 0);
      const totalUpi = sales.reduce((s, r) => s + Number(r.upi_amount), 0) + txns.reduce((s, r) => s + Number(r.upi_amount), 0);
      const paymentSplit = [
        { name: "Cash", value: totalCash, color: "hsl(142, 72%, 42%)" },
        { name: "UPI", value: totalUpi, color: "hsl(217, 91%, 50%)" },
      ].filter((p) => p.value > 0);

      // Outstanding by store type
      const outByType: Record<string, number> = {};
      stores.forEach((s: any) => {
        const typeName = s.store_types?.name || "Other";
        outByType[typeName] = (outByType[typeName] || 0) + Number(s.outstanding);
      });
      const outstandingData = Object.entries(outByType).map(([name, value]) => ({ name, value }));

      // Order status breakdown
      const orderStatus: Record<string, number> = { pending: 0, delivered: 0, cancelled: 0 };
      orders.forEach((o) => { orderStatus[o.status] = (orderStatus[o.status] || 0) + 1; });
      const orderData = [
        { name: "Pending", value: orderStatus.pending, color: "hsl(38, 92%, 50%)" },
        { name: "Delivered", value: orderStatus.delivered, color: "hsl(142, 72%, 42%)" },
        { name: "Cancelled", value: orderStatus.cancelled, color: "hsl(0, 72%, 51%)" },
      ].filter((o) => o.value > 0);

      // Agent leaderboard (within range)
      const agentSales: Record<string, { total: number; count: number }> = {};
      const agentIds = new Set(roles.map((r) => r.user_id));
      sales.forEach((s) => {
        if (agentIds.has(s.recorded_by)) {
          if (!agentSales[s.recorded_by]) agentSales[s.recorded_by] = { total: 0, count: 0 };
          agentSales[s.recorded_by].total += Number(s.total_amount);
          agentSales[s.recorded_by].count += 1;
        }
      });
      const leaderboard = Object.entries(agentSales)
        .map(([uid, val]) => ({ name: profileMap[uid] || "Unknown", ...val }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      // Customer growth (last 12 months, always)
      const monthlyCustomers: Record<string, number> = {};
      const last12 = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(); d.setMonth(d.getMonth() - (11 - i));
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      });
      last12.forEach((m) => { monthlyCustomers[m] = 0; });
      customers.forEach((c) => {
        const month = c.created_at.slice(0, 7);
        if (monthlyCustomers[month] !== undefined) monthlyCustomers[month] += 1;
      });
      let cumulative = 0;
      const customerGrowth = last12.map((m) => {
        cumulative += monthlyCustomers[m];
        return { month: m.slice(5), newCustomers: monthlyCustomers[m], total: cumulative };
      });

      // Store analytics by type
      const storesByType: Record<string, { count: number; totalOutstanding: number }> = {};
      stores.forEach((s: any) => {
        const typeName = s.store_types?.name || "Other";
        if (!storesByType[typeName]) storesByType[typeName] = { count: 0, totalOutstanding: 0 };
        storesByType[typeName].count += 1;
        storesByType[typeName].totalOutstanding += Number(s.outstanding);
      });
      const storeAnalytics = Object.entries(storesByType).map(([name, val]) => ({ name, ...val }));

      // Revenue vs collections per day
      const dailyCollections: Record<string, number> = {};
      rangeDays.forEach((d) => { dailyCollections[d] = 0; });
      txns.forEach((t) => {
        const day = t.created_at.split("T")[0];
        if (dailyCollections[day] !== undefined) dailyCollections[day] += Number(t.total_amount);
      });
      const revenueVsCollections = rangeDays.map((d) => ({
        date: d.slice(5),
        sales: dailySales[d],
        collections: dailyCollections[d],
      }));

      return { salesTrend, paymentSplit, outstandingData, orderData, totalCash, totalUpi, leaderboard, customerGrowth, storeAnalytics, revenueVsCollections, topStoresBySales, kycData, outstandingHistogram, routeSalesData, rangeDays };
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const d = data!;
  const hasData = d.salesTrend.some((s) => s.amount > 0) || d.paymentSplit.length > 0;

  // Forecast Calculation
  const forecastData = useMemo(() => {
    if (!d || !d.salesTrend || d.salesTrend.length < 5) return [];

    const trendData = d.salesTrend.map(s => ({ date: s.date, amount: s.amount }));
    return calculateSalesForecast(trendData, d.rangeDays, 14).map(pt => ({
      date: pt.date,
      // Re-map to match recharts expected format for ComposedChart
      actual: pt.actual,
      forecast: pt.forecast,
      fullDate: pt.fullDate,
    }));
  }, [d]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Analytics" subtitle="Business intelligence and performance metrics" />

      <Tabs defaultValue="overview" className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="forecast">Sales Forecast</TabsTrigger>
            </TabsList>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-1">
                <Popover>
                <PopoverTrigger asChild>
                    <Button variant="ghost" className="h-8 text-xs gap-1.5 justify-start font-normal min-w-[110px]">
                    <CalendarIcon className="h-3 w-3 shrink-0" />
                    {from ? format(new Date(from + "T00:00:00"), "dd MMM yy") : "From"}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" selected={from ? new Date(from + "T00:00:00") : undefined} onSelect={(d) => setFrom(d ? format(d, "yyyy-MM-dd") : "")} initialFocus />
                </PopoverContent>
                </Popover>
                <div className="text-muted-foreground">-</div>
                <Popover>
                <PopoverTrigger asChild>
                    <Button variant="ghost" className="h-8 text-xs gap-1.5 justify-start font-normal min-w-[110px]">
                    <CalendarIcon className="h-3 w-3 shrink-0" />
                    {to ? format(new Date(to + "T00:00:00"), "dd MMM yy") : "To"}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" selected={to ? new Date(to + "T00:00:00") : undefined} onSelect={(d) => setTo(d ? format(d, "yyyy-MM-dd") : "")} initialFocus />
                </PopoverContent>
                </Popover>
                <Button size="sm" onClick={applyFilter} disabled={isLoading} className="h-8">
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                </Button>
            </div>
        </div>

      <TabsContent value="overview" className="space-y-4">
      {!hasData && d.leaderboard.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <p className="text-lg font-semibold">No data yet</p>
          <p className="text-sm text-muted-foreground mt-1">Start recording sales and transactions to see analytics here.</p>
        </div>
      ) : (
        <>
          {/* Row 1: Sales trend + Payment methods */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Sales Trend ({pending.from} to {pending.to})</h3>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={d.salesTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Payment Methods</h3>
              {d.paymentSplit.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-16">No payments recorded</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={d.paymentSplit} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                        {d.paymentSplit.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-6 mt-2 text-sm">
                    <span className="flex items-center gap-2"><div className="h-3 w-3 rounded-full" style={{ backgroundColor: "hsl(142, 72%, 42%)" }} />Cash: ₹{d.totalCash.toLocaleString()}</span>
                    <span className="flex items-center gap-2"><div className="h-3 w-3 rounded-full" style={{ backgroundColor: "hsl(217, 91%, 50%)" }} />UPI: ₹{d.totalUpi.toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Row 2: Agent Leaderboard + Customer Growth */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Agent Leaderboard</h3>
              {d.leaderboard.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No agent sales yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={d.leaderboard} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={100} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      formatter={(v: number, name: string) => [name === "total" ? `₹${v.toLocaleString()}` : v, name === "total" ? "Revenue" : "Sales Count"]}
                    />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Customer Growth (Last 12 Months)</h3>
              {d.customerGrowth.every((c) => c.total === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-12">No customers yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={d.customerGrowth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Area type="monotone" dataKey="total" stroke="hsl(142, 72%, 42%)" fill="hsl(142, 72%, 42%)" fillOpacity={0.1} strokeWidth={2} name="Total Customers" />
                    <Bar dataKey="newCustomers" fill="hsl(217, 91%, 50%)" opacity={0.6} name="New This Month" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Row 3: Store Analytics + Outstanding + Orders */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Stores by Type</h3>
              {d.storeAnalytics.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No stores</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={d.storeAnalytics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Bar dataKey="count" fill="hsl(217, 91%, 50%)" radius={[6, 6, 0, 0]} name="Store Count" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Outstanding by Store Type</h3>
              {d.outstandingData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No outstanding</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={d.outstandingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Bar dataKey="value" fill="hsl(0, 72%, 51%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Order Status</h3>
              {d.orderData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No orders</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={d.orderData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {d.orderData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Row 4: Revenue vs Collections + Agent Sales Count */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Revenue vs Collections</h3>
              {d.revenueVsCollections.every((r) => r.sales === 0 && r.collections === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-16">No data in range</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={d.revenueVsCollections}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      formatter={(v: number) => `₹${v.toLocaleString()}`}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Line type="monotone" dataKey="sales" stroke="hsl(217, 91%, 50%)" strokeWidth={2} dot={false} name="Sales" />
                    <Line type="monotone" dataKey="collections" stroke="hsl(142, 72%, 42%)" strokeWidth={2} dot={false} name="Collections" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Agent Performance (Count vs Revenue)</h3>
              {d.leaderboard.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-16">No agent sales yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={d.leaderboard}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" angle={-30} textAnchor="end" height={50} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      formatter={(v: number, name: string) => [name === "Revenue" ? `₹${v.toLocaleString()}` : v, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar yAxisId="left" dataKey="total" fill="hsl(217, 91%, 50%)" radius={[4, 4, 0, 0]} name="Revenue" />
                    <Bar yAxisId="right" dataKey="count" fill="hsl(142, 72%, 42%)" radius={[4, 4, 0, 0]} name="Sales Count" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Row 5: Top Stores by Sales */}
          {d.topStoresBySales.length > 0 && (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Top Stores by Sales</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={d.topStoresBySales} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={120} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(v: number) => `₹${v.toLocaleString()}`}
                  />
                  <Bar dataKey="amount" fill="hsl(38, 92%, 50%)" radius={[0, 6, 6, 0]} name="Sales Amount" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Row 6: KYC Status + Outstanding Histogram + Route Sales */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Customers by KYC Status</h3>
              {d.kycData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No customers</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={d.kycData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                        {d.kycData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => `${v} customers`} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2 text-xs">
                    {d.kycData.map((k) => (
                      <span key={k.name} className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: k.color }} />
                        {k.name}: {k.value}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Outstanding Distribution</h3>
              {d.outstandingHistogram.every((b) => b.count === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-12">No stores</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={d.outstandingHistogram}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="range" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      formatter={(v: number) => [`${v} stores`, "Count"]}
                    />
                    <Bar dataKey="count" fill="hsl(0, 72%, 51%)" radius={[6, 6, 0, 0]} name="Stores" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Sales by Route</h3>
              {d.routeSalesData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No routes</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={d.routeSalesData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => v >= 1000 ? `₹${(v/1000).toFixed(0)}k` : `₹${v}`} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={90} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      formatter={(v: number, name: string) => [name === "sales" ? `₹${v.toLocaleString()}` : `${v}%`, name === "sales" ? "Sales" : "Completion"]}
                    />
                    <Bar dataKey="sales" fill="hsl(280, 65%, 60%)" radius={[0, 6, 6, 0]} name="sales" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
      </TabsContent>

      <TabsContent value="forecast" className="space-y-4">
        <div className="rounded-xl border bg-card p-6">
            <div className="mb-6">
                <h3 className="text-lg font-semibold">Sales Forecast (Next 14 Days)</h3>
                <p className="text-sm text-muted-foreground">Linear projection based on selected historical data.</p>
            </div>
            
            {forecastData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={forecastData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `₹${v}`} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                            formatter={(v: number, name: string) => [
                                `₹${v.toLocaleString()}`, 
                                name === "actual" ? "Actual Sales" : "Trend/Forecast"
                            ]}
                            labelFormatter={(label) => `Date: ${label}`}
                        />
                        <Legend />
                        <Area type="monotone" dataKey="actual" fill="hsl(var(--primary))" fillOpacity={0.1} stroke="hsl(var(--primary))" strokeWidth={2} name="Actual" />
                        <Line type="monotone" dataKey="forecast" stroke="hsl(280, 65%, 60%)" strokeWidth={2} strokeDasharray="5 5" name="Forecast" dot={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            ) : (
                <div className="py-20 text-center text-muted-foreground">
                    Not enough data to generate a forecast. Please select a wider date range or record more sales.
                </div>
            )}
        </div>
      </TabsContent>
      </Tabs>
    </div>
  );
};

export default Analytics;
