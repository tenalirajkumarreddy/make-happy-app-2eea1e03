import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ClipboardList, CheckCircle, XCircle, Clock, TrendingUp, Truck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import * as XLSX from "xlsx";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";
import { ReportContainer, ReportKPICard } from "@/components/reports/ReportContainer";

const COLORS = ["hsl(38, 92%, 50%)", "hsl(142, 72%, 42%)", "hsl(0, 72%, 51%)", "hsl(217, 91%, 50%)"];

export default function OrderReport() {
  const today = new Date();
  const thirtyAgo = new Date(today); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const [from, setFrom] = useState(thirtyAgo.toISOString().split("T")[0]);
  const [to, setTo] = useState(today.toISOString().split("T")[0]);
  const { data: companySettings } = useCompanySettings();

  const { data, isLoading } = useQuery({
    queryKey: ["order-report", from, to],
    queryFn: async () => {
      const start = from + "T00:00:00", end = to + "T23:59:59";
      const [ordersRes, storesRes, storeTypesRes] = await Promise.all([
        supabase.from("orders").select("*, stores(name, store_type_id)").gte("created_at", start).lte("created_at", end).order("created_at"),
        supabase.from("stores").select("id, name, store_type_id"),
        supabase.from("store_types").select("id, name"),
      ]);
      const orders = ordersRes.data || [];
      const storeTypeMap = Object.fromEntries((storeTypesRes.data || []).map(t => [t.id, t.name]));
      const storeMap = Object.fromEntries((storesRes.data || []).map(s => [s.id, s]));

      const total = orders.length;
      const pending = orders.filter(o => o.status === "pending").length;
      const delivered = orders.filter(o => o.status === "delivered").length;
      const cancelled = orders.filter(o => o.status === "cancelled").length;
      const fulfillmentRate = total > 0 ? ((delivered / total) * 100).toFixed(1) : "0";
      const cancellationRate = total > 0 ? ((cancelled / total) * 100).toFixed(1) : "0";

      const deliveredOrders = orders.filter(o => o.status === "delivered" && o.delivered_at);
      const avgDeliveryHours = deliveredOrders.length > 0
        ? deliveredOrders.reduce((s, o) => s + (new Date(o.delivered_at!).getTime() - new Date(o.created_at).getTime()) / 3600000, 0) / deliveredOrders.length
        : 0;

      const statusData = [
        { name: "Pending", value: pending },
        { name: "Delivered", value: delivered },
        { name: "Cancelled", value: cancelled },
      ].filter(s => s.value > 0);

      const sourceMap: Record<string, number> = {};
      orders.forEach(o => { sourceMap[o.source] = (sourceMap[o.source] || 0) + 1; });
      const sourceData = Object.entries(sourceMap).map(([name, value]) => ({ name, value }));

      const reasonMap: Record<string, number> = {};
      orders.filter(o => o.cancellation_reason).forEach(o => {
        const r = o.cancellation_reason!;
        reasonMap[r] = (reasonMap[r] || 0) + 1;
      });
      const cancellationReasons = Object.entries(reasonMap).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count }));

      const storeFreq: Record<string, { name: string; type: string; total: number; delivered: number; cancelled: number }> = {};
      orders.forEach(o => {
        const sid = o.store_id;
        const st = storeMap[sid];
        const typeName = st ? storeTypeMap[st.store_type_id] || "Other" : "Unknown";
        if (!storeFreq[sid]) storeFreq[sid] = { name: (o.stores as any)?.name || "Unknown", type: typeName, total: 0, delivered: 0, cancelled: 0 };
        storeFreq[sid].total += 1;
        if (o.status === "delivered") storeFreq[sid].delivered += 1;
        if (o.status === "cancelled") storeFreq[sid].cancelled += 1;
      });
      const storeFreqData = Object.values(storeFreq).sort((a, b) => b.total - a.total);

      const dailyMap: Record<string, number> = {};
      orders.forEach(o => {
        const day = o.created_at.split("T")[0];
        dailyMap[day] = (dailyMap[day] || 0) + 1;
      });
      const dailyTrend = Object.entries(dailyMap).sort().map(([d, c]) => ({ date: d.slice(5), count: c }));

      const dayOfWeekMap: Record<string, number> = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      orders.forEach(o => {
        const dow = dayNames[new Date(o.created_at).getDay()];
        dayOfWeekMap[dow] += 1;
      });
      const peakDays = Object.entries(dayOfWeekMap).map(([day, count]) => ({ day, count }));

      const typeOrders: Record<string, number> = {};
      orders.forEach(o => {
        const st = storeMap[o.store_id];
        const tn = st ? storeTypeMap[st.store_type_id] || "Other" : "Other";
        typeOrders[tn] = (typeOrders[tn] || 0) + 1;
      });
      const storeTypeData = Object.entries(typeOrders).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

      return {
        total, pending, delivered, cancelled, fulfillmentRate, cancellationRate,
        avgDeliveryHours, statusData, sourceData, cancellationReasons,
        storeFreqData, dailyTrend, peakDays, storeTypeData,
      };
    },
  });

  const handlePrintHTML = () => {
    if (!data || !companySettings) return "";

    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-label">Total Orders</div><div class="kpi-value">${data.total}</div></div>
        <div class="kpi-card"><div class="kpi-label">Delivered</div><div class="kpi-value text-pos">${data.delivered}</div></div>
        <div class="kpi-card"><div class="kpi-label">Pending</div><div class="kpi-value">${data.pending}</div></div>
        <div class="kpi-card"><div class="kpi-label">Cancelled</div><div class="kpi-value text-neg">${data.cancelled}</div></div>
      </div>
      <div class="kpi-row">
        <div class="kpi-card highlight"><div class="kpi-label">Fulfillment Rate</div><div class="kpi-value">${data.fulfillmentRate}%</div></div>
        <div class="kpi-card"><div class="kpi-label">Cancellation Rate</div><div class="kpi-value">${data.cancellationRate}%</div></div>
        <div class="kpi-card"><div class="kpi-label">Avg Delivery Time</div><div class="kpi-value">${data.avgDeliveryHours.toFixed(1)}h</div></div>
      </div>

      <h2>Store-wise Order Frequency</h2>
      <table>
        <thead><tr><th>#</th><th>Store</th><th>Type</th><th class="text-right">Total</th><th class="text-right">Delivered</th><th class="text-right">Cancelled</th></tr></thead>
        <tbody>
          ${data.storeFreqData.slice(0, 30).map((s, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="font-semibold">${s.name}</td>
              <td>${s.type}</td>
              <td class="text-right font-semibold">${s.total}</td>
              <td class="text-right text-pos">${s.delivered}</td>
              <td class="text-right text-neg">${s.cancelled}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      ${data.cancellationReasons.length > 0 ? `
        <h2>Cancellation Reasons</h2>
        <table>
          <thead><tr><th>Reason</th><th class="text-right">Count</th></tr></thead>
          <tbody>
            ${data.cancellationReasons.map(r => `
              <tr><td>${r.reason}</td><td class="text-right font-semibold">${r.count}</td></tr>
            `).join("")}
          </tbody>
        </table>
      ` : ""}
    `;

    return generatePrintHTML({
      title: "Order Report",
      dateRange: `${from} — ${to}`,
      metadata: {
        "Total": `${data.total}`,
        "Delivered": `${data.delivered}`,
        "Fulfillment": `${data.fulfillmentRate}%`,
      },
      companyInfo: companySettings,
      htmlContent,
    });
  };

  const exportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Order Report", `${from} to ${to}`], [],
      ["Total", data.total], ["Delivered", data.delivered], ["Pending", data.pending], ["Cancelled", data.cancelled],
      ["Fulfillment %", data.fulfillmentRate], ["Avg Delivery Hrs", data.avgDeliveryHours.toFixed(1)],
    ]), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.storeFreqData), "Store Frequency");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.dailyTrend), "Daily Trend");
    XLSX.writeFile(wb, `order-report-${from}-to-${to}.xlsx`);
    toast.success("Excel downloaded");
  };

  if (isLoading) return <TableSkeleton />;
  if (!data) return null;
  const d = data;

  return (
    <ReportContainer
      title="Order Report"
      subtitle="Order fulfillment and delivery analytics"
      icon={<ClipboardList className="h-5 w-5" />}
      dateRange={`${from} — ${to}`}
      onPrint={() => {
        const html = handlePrintHTML();
        const w = window.open("", "_blank");
        if (w) { w.document.write(html); w.document.close(); }
      }}
      onExportExcel={exportExcel}
      isLoading={false}
      filters={
        <div className="flex items-end gap-3">
          <div><Label className="text-xs text-muted-foreground">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40 h-9" /></div>
          <div><Label className="text-xs text-muted-foreground">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40 h-9" /></div>
        </div>
      }
      summaryCards={
        <>
          <ReportKPICard label="Total Orders" value={String(d.total)} icon={<ClipboardList className="h-4 w-4" />} />
          <ReportKPICard label="Delivered" value={String(d.delivered)} trend="up" icon={<CheckCircle className="h-4 w-4" />} />
          <ReportKPICard label="Pending" value={String(d.pending)} icon={<Clock className="h-4 w-4" />} />
          <ReportKPICard label="Cancelled" value={String(d.cancelled)} trend={d.cancelled > 0 ? "down" : undefined} icon={<XCircle className="h-4 w-4" />} />
          <ReportKPICard label="Fulfillment" value={d.fulfillmentRate + "%"} highlight icon={<TrendingUp className="h-4 w-4" />} />
          <ReportKPICard label="Avg Delivery" value={d.avgDeliveryHours.toFixed(1) + "h"} icon={<Truck className="h-4 w-4" />} />
        </>
      }
    >
      <Tabs defaultValue="status" className="space-y-4">
        <TabsList className="bg-muted/50 p-1 flex-wrap h-auto">
          <TabsTrigger value="status" className="text-xs">Status</TabsTrigger>
          <TabsTrigger value="trend" className="text-xs">Daily Trend</TabsTrigger>
          <TabsTrigger value="stores" className="text-xs">Store Frequency</TabsTrigger>
          <TabsTrigger value="peak" className="text-xs">Peak Days</TabsTrigger>
          <TabsTrigger value="reasons" className="text-xs">Cancellations</TabsTrigger>
        </TabsList>

        <TabsContent value="status">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Order Status</CardTitle></CardHeader><CardContent>
              {d.statusData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data</p> : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart><Pie data={d.statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {d.statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
              )}
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold">By Source</CardTitle></CardHeader><CardContent>
              {d.sourceData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data</p> : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={d.sourceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip /><Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="trend">
          <Card className="border-0 shadow-sm"><CardContent className="pt-4">
            {d.dailyTrend.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data</p> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={d.dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip /><Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Orders" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="stores">
          <Card className="border-0 shadow-sm"><CardContent className="pt-4 p-0">
            <Table><TableHeader><TableRow className="bg-muted/50">
              <TableHead className="font-semibold">#</TableHead><TableHead className="font-semibold">Store</TableHead><TableHead className="font-semibold">Type</TableHead>
              <TableHead className="text-right font-semibold">Total</TableHead><TableHead className="text-right font-semibold">Delivered</TableHead>
              <TableHead className="text-right font-semibold">Cancelled</TableHead>
            </TableRow></TableHeader><TableBody>
              {d.storeFreqData.slice(0, 30).map((s, i) => (
                <TableRow key={i} className="hover:bg-muted/30">
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell><Badge variant="outline">{s.type}</Badge></TableCell>
                  <TableCell className="text-right">{s.total}</TableCell>
                  <TableCell className="text-right text-green-600">{s.delivered}</TableCell>
                  <TableCell className="text-right text-red-600">{s.cancelled}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="peak">
          <Card className="border-0 shadow-sm"><CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={d.peakDays}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip /><Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Orders" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="reasons">
          <Card className="border-0 shadow-sm"><CardContent className="pt-4 p-0">
            {d.cancellationReasons.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No cancellations with reasons</p> : (
              <Table><TableHeader><TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Reason</TableHead><TableHead className="text-right font-semibold">Count</TableHead>
              </TableRow></TableHeader><TableBody>
                {d.cancellationReasons.map((r, i) => (
                  <TableRow key={i} className="hover:bg-muted/30"><TableCell>{r.reason}</TableCell><TableCell className="text-right font-semibold">{r.count}</TableCell></TableRow>
                ))}
              </TableBody></Table>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </ReportContainer>
  );
}
