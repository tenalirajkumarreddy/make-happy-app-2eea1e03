import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/shared/StatCard";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  ClipboardList, CheckCircle, XCircle, Clock, TrendingUp,
  FileText, FileSpreadsheet, Truck, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const COLORS = ["hsl(38, 92%, 50%)", "hsl(142, 72%, 42%)", "hsl(0, 72%, 51%)", "hsl(217, 91%, 50%)"];

export default function OrderReport() {
  const today = new Date();
  const thirtyAgo = new Date(today); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const [from, setFrom] = useState(thirtyAgo.toISOString().split("T")[0]);
  const [to, setTo] = useState(today.toISOString().split("T")[0]);

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

      // Avg delivery time (hours)
      const deliveredOrders = orders.filter(o => o.status === "delivered" && o.delivered_at);
      const avgDeliveryHours = deliveredOrders.length > 0
        ? deliveredOrders.reduce((s, o) => s + (new Date(o.delivered_at!).getTime() - new Date(o.created_at).getTime()) / 3600000, 0) / deliveredOrders.length
        : 0;

      // Status pie
      const statusData = [
        { name: "Pending", value: pending },
        { name: "Delivered", value: delivered },
        { name: "Cancelled", value: cancelled },
      ].filter(s => s.value > 0);

      // Source breakdown
      const sourceMap: Record<string, number> = {};
      orders.forEach(o => { sourceMap[o.source] = (sourceMap[o.source] || 0) + 1; });
      const sourceData = Object.entries(sourceMap).map(([name, value]) => ({ name, value }));

      // Cancellation reasons
      const reasonMap: Record<string, number> = {};
      orders.filter(o => o.cancellation_reason).forEach(o => {
        const r = o.cancellation_reason!;
        reasonMap[r] = (reasonMap[r] || 0) + 1;
      });
      const cancellationReasons = Object.entries(reasonMap).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count }));

      // Store frequency
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

      // Daily orders
      const dailyMap: Record<string, number> = {};
      orders.forEach(o => {
        const day = o.created_at.split("T")[0];
        dailyMap[day] = (dailyMap[day] || 0) + 1;
      });
      const dailyTrend = Object.entries(dailyMap).sort().map(([d, c]) => ({ date: d.slice(5), count: c }));

      // Peak days
      const dayOfWeekMap: Record<string, number> = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      orders.forEach(o => {
        const dow = dayNames[new Date(o.created_at).getDay()];
        dayOfWeekMap[dow] += 1;
      });
      const peakDays = Object.entries(dayOfWeekMap).map(([day, count]) => ({ day, count }));

      // Store type breakdown
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

  const exportPDF = () => {
    if (!data) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, pw, 18, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(14);
    doc.text("Order Report", 10, 12); doc.setFontSize(9);
    doc.text(`${from} to ${to}`, pw - 10, 12, { align: "right" });

    doc.setTextColor(0, 0, 0);
    autoTable(doc, { startY: 24, head: [["Metric", "Value"]], body: [
      ["Total Orders", data.total], ["Delivered", data.delivered], ["Pending", data.pending],
      ["Cancelled", data.cancelled], ["Fulfillment Rate", data.fulfillmentRate + "%"],
      ["Cancellation Rate", data.cancellationRate + "%"], ["Avg Delivery Time", data.avgDeliveryHours.toFixed(1) + " hrs"],
    ], theme: "grid", styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [30, 41, 59] }, margin: { left: 10 }, tableWidth: 80 });

    autoTable(doc, { startY: 24, head: [["Store", "Type", "Total", "Delivered", "Cancelled"]], body: data.storeFreqData.slice(0, 25).map(s => [s.name, s.type, s.total, s.delivered, s.cancelled]), theme: "grid", styles: { fontSize: 6, cellPadding: 1.2 }, headStyles: { fillColor: [30, 41, 59] }, margin: { left: 100 }, tableWidth: 187 });

    doc.save(`order-report-${from}-to-${to}.pdf`);
    toast.success("PDF downloaded");
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" /></div>
        <Button variant="outline" size="sm" onClick={exportPDF}><FileText className="h-4 w-4 mr-1" />PDF</Button>
        <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard title="Total Orders" value={String(d.total)} icon={ClipboardList} iconColor="bg-primary" />
        <StatCard title="Delivered" value={String(d.delivered)} icon={CheckCircle} iconColor="bg-success" />
        <StatCard title="Pending" value={String(d.pending)} icon={Clock} iconColor="bg-warning" />
        <StatCard title="Cancelled" value={String(d.cancelled)} icon={XCircle} iconColor="bg-destructive" />
        <StatCard title="Fulfillment" value={d.fulfillmentRate + "%"} icon={TrendingUp} iconColor="bg-success" />
        <StatCard title="Avg Delivery" value={d.avgDeliveryHours.toFixed(1) + "h"} icon={Truck} iconColor="bg-accent" />
      </div>

      <Tabs defaultValue="status">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="trend">Daily Trend</TabsTrigger>
          <TabsTrigger value="stores">Store Frequency</TabsTrigger>
          <TabsTrigger value="peak">Peak Days</TabsTrigger>
          <TabsTrigger value="reasons">Cancellations</TabsTrigger>
        </TabsList>

        <TabsContent value="status">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card><CardHeader><CardTitle className="text-sm">Order Status</CardTitle></CardHeader><CardContent>
              {d.statusData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data</p> : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart><Pie data={d.statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {d.statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
              )}
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">By Source</CardTitle></CardHeader><CardContent>
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
          <Card><CardContent className="pt-4">
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
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow>
              <TableHead>#</TableHead><TableHead>Store</TableHead><TableHead>Type</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Cancelled</TableHead>
            </TableRow></TableHeader><TableBody>
              {d.storeFreqData.slice(0, 30).map((s, i) => (
                <TableRow key={i}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell><Badge variant="outline">{s.type}</Badge></TableCell>
                  <TableCell className="text-right">{s.total}</TableCell>
                  <TableCell className="text-right text-success">{s.delivered}</TableCell>
                  <TableCell className="text-right text-destructive">{s.cancelled}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="peak">
          <Card><CardContent className="pt-4">
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
          <Card><CardContent className="pt-4">
            {d.cancellationReasons.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No cancellations with reasons</p> : (
              <Table><TableHeader><TableRow>
                <TableHead>Reason</TableHead><TableHead className="text-right">Count</TableHead>
              </TableRow></TableHeader><TableBody>
                {d.cancellationReasons.map((r, i) => (
                  <TableRow key={i}><TableCell>{r.reason}</TableCell><TableCell className="text-right">{r.count}</TableCell></TableRow>
                ))}
              </TableBody></Table>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
