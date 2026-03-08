import { PageHeader } from "@/components/shared/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["hsl(217, 91%, 50%)", "hsl(142, 72%, 42%)", "hsl(38, 92%, 50%)", "hsl(280, 65%, 60%)", "hsl(0, 72%, 51%)"];

const Analytics = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const [salesRes, txnRes, storesRes, ordersRes] = await Promise.all([
        supabase.from("sales").select("total_amount, cash_amount, upi_amount, created_at, stores(name, store_type_id, store_types(name))").order("created_at"),
        supabase.from("transactions").select("total_amount, cash_amount, upi_amount, created_at"),
        supabase.from("stores").select("id, outstanding, store_type_id, store_types(name)").eq("is_active", true),
        supabase.from("orders").select("status"),
      ]);

      const sales = salesRes.data || [];
      const txns = txnRes.data || [];
      const stores = storesRes.data || [];
      const orders = ordersRes.data || [];

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
      stores.forEach((s) => {
        const typeName = (s.store_types as any)?.name || "Other";
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

      return { salesTrend, paymentSplit, outstandingData, orderData, totalCash, totalUpi };
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

      {!hasData ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <p className="text-lg font-semibold">No data yet</p>
          <p className="text-sm text-muted-foreground mt-1">Start recording sales and transactions to see analytics here.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Sales Trend (Last 30 Days)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={d.salesTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Outstanding by Store Type</h3>
              {d.outstandingData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No outstanding balances</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={d.outstandingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Bar dataKey="value" fill="hsl(0, 72%, 51%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Order Status Breakdown</h3>
              {d.orderData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No orders yet</p>
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
