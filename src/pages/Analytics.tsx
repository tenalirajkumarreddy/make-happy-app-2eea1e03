import { PageHeader } from "@/components/shared/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";

const COLORS = ["hsl(217, 91%, 50%)", "hsl(142, 72%, 42%)", "hsl(38, 92%, 50%)", "hsl(280, 65%, 60%)", "hsl(0, 72%, 51%)"];

const Analytics = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-enhanced"],
    queryFn: async () => {
      const [salesRes, txnRes, storesRes, ordersRes, profilesRes, rolesRes, customersRes] = await Promise.all([
        supabase.from("sales").select("total_amount, cash_amount, upi_amount, created_at, recorded_by, stores(name, store_type_id, store_types(name))").order("created_at"),
        supabase.from("transactions").select("total_amount, cash_amount, upi_amount, created_at"),
        supabase.from("stores").select("id, outstanding, store_type_id, is_active, created_at, store_types(name)").eq("is_active", true),
        supabase.from("orders").select("status"),
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("user_roles").select("user_id, role").in("role", ["agent", "marketer"]),
        supabase.from("customers").select("id, created_at, kyc_status"),
      ]);

      const sales = salesRes.data || [];
      const txns = txnRes.data || [];
      const stores = storesRes.data || [];
      const orders = ordersRes.data || [];
      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];
      const customers = customersRes.data || [];

      const profileMap: Record<string, string> = {};
      profiles.forEach((p) => { profileMap[p.user_id] = p.full_name; });

      // Daily sales trend (last 30 days)
      const dailySales: Record<string, number> = {};
      const last30 = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (29 - i));
        return d.toISOString().split("T")[0];
      });
      last30.forEach((d) => { dailySales[d] = 0; });
      sales.forEach((s) => {
        const day = s.created_at.split("T")[0];
        if (dailySales[day] !== undefined) dailySales[day] += Number(s.total_amount);
      });
      const salesTrend = last30.map((d) => ({ date: d.slice(5), amount: dailySales[d] }));

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

      // Agent leaderboard
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

      // Customer growth (last 12 months)
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

      return { salesTrend, paymentSplit, outstandingData, orderData, totalCash, totalUpi, leaderboard, customerGrowth, storeAnalytics };
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const d = data!;
  const hasData = d.salesTrend.some((s) => s.amount > 0) || d.paymentSplit.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Analytics" subtitle="Business intelligence and performance metrics" />

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
              <h3 className="text-sm font-semibold mb-4">Sales Trend (Last 30 Days)</h3>
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
        </>
      )}
    </div>
  );
};

export default Analytics;
