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
  ShoppingCart, TrendingUp, TrendingDown, DollarSign, Banknote,
  Smartphone, Download, FileText, FileSpreadsheet, Users, Store,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const pct = (n: number, t: number) => t > 0 ? ((n / t) * 100).toFixed(1) + "%" : "0%";
const COLORS = ["hsl(217, 91%, 50%)", "hsl(142, 72%, 42%)", "hsl(38, 92%, 50%)", "hsl(280, 65%, 60%)", "hsl(0, 72%, 51%)", "hsl(190, 80%, 45%)"];

export default function SalesReport() {
  const today = new Date();
  const thirtyAgo = new Date(today);
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const [from, setFrom] = useState(thirtyAgo.toISOString().split("T")[0]);
  const [to, setTo] = useState(today.toISOString().split("T")[0]);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-report", from, to],
    queryFn: async () => {
      const startOfDay = from + "T00:00:00";
      const endOfDay = to + "T23:59:59";

      const [salesRes, saleItemsRes, profilesRes, storesRes, storeTypesRes] = await Promise.all([
        supabase.from("sales").select("*, stores(name, store_type_id)").gte("created_at", startOfDay).lte("created_at", endOfDay).order("created_at"),
        supabase.from("sale_items").select("*, products(name, unit, category)").gte("created_at", startOfDay).lte("created_at", endOfDay),
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("stores").select("id, name, display_id, store_type_id, outstanding"),
        supabase.from("store_types").select("id, name"),
      ]);

      const sales = salesRes.data || [];
      const saleItems = saleItemsRes.data || [];
      const profiles = profilesRes.data || [];
      const stores = storesRes.data || [];
      const storeTypes = storeTypesRes.data || [];

      const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.full_name]));
      const storeTypeMap = Object.fromEntries(storeTypes.map(t => [t.id, t.name]));
      const storeMap = Object.fromEntries(stores.map(s => [s.id, s]));

      // Summary
      const totalSales = sales.reduce((s, r) => s + Number(r.total_amount), 0);
      const totalCash = sales.reduce((s, r) => s + Number(r.cash_amount), 0);
      const totalUpi = sales.reduce((s, r) => s + Number(r.upi_amount), 0);
      const totalCredit = sales.reduce((s, r) => s + Number(r.outstanding_amount), 0);
      const avgSale = sales.length > 0 ? totalSales / sales.length : 0;

      // Daily trend
      const dailyMap: Record<string, { amount: number; count: number }> = {};
      sales.forEach(s => {
        const day = s.created_at.split("T")[0];
        if (!dailyMap[day]) dailyMap[day] = { amount: 0, count: 0 };
        dailyMap[day].amount += Number(s.total_amount);
        dailyMap[day].count += 1;
      });
      const dailyTrend = Object.entries(dailyMap).sort().map(([d, v]) => ({ date: d.slice(5), amount: v.amount, count: v.count }));

      // Days in range for EOM projection
      const fromDate = new Date(from);
      const toDate = new Date(to);
      const daysInRange = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
      const dailyAvgSales = totalSales / daysInRange;
      const currentMonth = new Date();
      const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
      const dayOfMonth = currentMonth.getDate();
      const estimatedEOM = dailyAvgSales * daysInMonth;

      // Growth rate: compare first half vs second half
      const midpoint = Math.floor(dailyTrend.length / 2);
      const firstHalf = dailyTrend.slice(0, midpoint).reduce((s, d) => s + d.amount, 0);
      const secondHalf = dailyTrend.slice(midpoint).reduce((s, d) => s + d.amount, 0);
      const growthRate = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf * 100).toFixed(1) : "0";

      // Agent performance
      const agentMap: Record<string, { name: string; amount: number; count: number; cash: number; upi: number; credit: number }> = {};
      sales.forEach(s => {
        const uid = s.recorded_by;
        if (!agentMap[uid]) agentMap[uid] = { name: profileMap[uid] || "Unknown", amount: 0, count: 0, cash: 0, upi: 0, credit: 0 };
        agentMap[uid].amount += Number(s.total_amount);
        agentMap[uid].count += 1;
        agentMap[uid].cash += Number(s.cash_amount);
        agentMap[uid].upi += Number(s.upi_amount);
        agentMap[uid].credit += Number(s.outstanding_amount);
      });
      const agentRanking = Object.values(agentMap).sort((a, b) => b.amount - a.amount);

      // Store performance
      const storePerf: Record<string, { name: string; type: string; amount: number; count: number; avgSale: number }> = {};
      sales.forEach(s => {
        const sid = s.store_id;
        const st = storeMap[sid];
        const typeName = st ? storeTypeMap[st.store_type_id] || "Other" : "Unknown";
        if (!storePerf[sid]) storePerf[sid] = { name: (s.stores as any)?.name || "Unknown", type: typeName, amount: 0, count: 0, avgSale: 0 };
        storePerf[sid].amount += Number(s.total_amount);
        storePerf[sid].count += 1;
      });
      Object.values(storePerf).forEach(s => { s.avgSale = s.count > 0 ? s.amount / s.count : 0; });
      const storeRanking = Object.values(storePerf).sort((a, b) => b.amount - a.amount);

      // Store type breakdown
      const storeTypePerf: Record<string, { name: string; amount: number; count: number }> = {};
      sales.forEach(s => {
        const st = storeMap[s.store_id];
        const typeName = st ? storeTypeMap[st.store_type_id] || "Other" : "Other";
        if (!storeTypePerf[typeName]) storeTypePerf[typeName] = { name: typeName, amount: 0, count: 0 };
        storeTypePerf[typeName].amount += Number(s.total_amount);
        storeTypePerf[typeName].count += 1;
      });
      const storeTypeData = Object.values(storeTypePerf).sort((a, b) => b.amount - a.amount);

      // Payment method split
      const paymentSplit = [
        { name: "Cash", value: totalCash },
        { name: "UPI", value: totalUpi },
        { name: "Credit", value: totalCredit },
      ].filter(p => p.value > 0);

      return {
        totalSales, totalCash, totalUpi, totalCredit, avgSale, salesCount: sales.length,
        dailyTrend, dailyAvgSales, estimatedEOM, growthRate,
        agentRanking, storeRanking, storeTypeData, paymentSplit,
      };
    },
  });

  const exportPDF = () => {
    if (!data) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();

    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pw, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text("Sales Report", 10, 12);
    doc.setFontSize(9);
    doc.text(`${from} to ${to}`, pw - 10, 12, { align: "right" });

    let y = 24;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);

    // Summary
    const summaryData = [
      ["Total Sales", fmt(data.totalSales), "Avg Sale", fmt(data.avgSale)],
      ["Cash", fmt(data.totalCash), "UPI", fmt(data.totalUpi)],
      ["Credit Given", fmt(data.totalCredit), "Sale Count", String(data.salesCount)],
      ["Daily Avg", fmt(data.dailyAvgSales), "Est. EOM", fmt(data.estimatedEOM)],
      ["Growth Rate", data.growthRate + "%", "", ""],
    ];
    autoTable(doc, { startY: y, head: [["Metric", "Value", "Metric", "Value"]], body: summaryData, theme: "grid", styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [30, 41, 59] }, margin: { left: 10 }, tableWidth: 120 });

    // Agent ranking
    y = (doc as any).lastAutoTable.finalY + 4;
    autoTable(doc, { startY: y, head: [["Agent", "Sales", "Count", "Cash", "UPI", "Credit"]], body: data.agentRanking.map(a => [a.name, fmt(a.amount), a.count, fmt(a.cash), fmt(a.upi), fmt(a.credit)]), theme: "grid", styles: { fontSize: 6, cellPadding: 1.2 }, headStyles: { fillColor: [30, 41, 59] }, margin: { left: 10 }, tableWidth: 130 });

    // Store ranking on right side
    autoTable(doc, { startY: 24, head: [["Store", "Type", "Sales", "Count", "Avg"]], body: data.storeRanking.slice(0, 20).map(s => [s.name, s.type, fmt(s.amount), s.count, fmt(s.avgSale)]), theme: "grid", styles: { fontSize: 6, cellPadding: 1.2 }, headStyles: { fillColor: [30, 41, 59] }, margin: { left: 150 }, tableWidth: 137 });

    doc.save(`sales-report-${from}-to-${to}.pdf`);
    toast.success("PDF downloaded");
  };

  const exportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Sales Report", `${from} to ${to}`],
      [], ["Metric", "Value"],
      ["Total Sales", data.totalSales], ["Cash", data.totalCash], ["UPI", data.totalUpi],
      ["Credit", data.totalCredit], ["Sale Count", data.salesCount], ["Avg Sale", data.avgSale],
      ["Daily Avg", data.dailyAvgSales], ["Est. EOM", data.estimatedEOM], ["Growth %", data.growthRate],
    ]), "Summary");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.agentRanking), "Agents");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.storeRanking), "Stores");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.dailyTrend), "Daily Trend");

    XLSX.writeFile(wb, `sales-report-${from}-to-${to}.xlsx`);
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
        <StatCard title="Total Sales" value={fmt(d.totalSales)} icon={ShoppingCart} iconColor="bg-primary" />
        <StatCard title="Sale Count" value={String(d.salesCount)} icon={ShoppingCart} iconColor="bg-accent" />
        <StatCard title="Cash" value={fmt(d.totalCash)} icon={Banknote} iconColor="bg-success" />
        <StatCard title="UPI" value={fmt(d.totalUpi)} icon={Smartphone} iconColor="bg-info" />
        <StatCard title="Credit Given" value={fmt(d.totalCredit)} icon={TrendingDown} iconColor="bg-destructive" />
        <StatCard title="Avg Sale" value={fmt(d.avgSale)} icon={DollarSign} iconColor="bg-warning" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">Daily Average</p>
          <p className="text-xl font-bold">{fmt(d.dailyAvgSales)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">Estimated EOM</p>
          <p className="text-xl font-bold">{fmt(d.estimatedEOM)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">Growth Rate</p>
          <p className={`text-xl font-bold ${Number(d.growthRate) >= 0 ? "text-success" : "text-destructive"}`}>{d.growthRate}%</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="trend">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="trend">Sales Trend</TabsTrigger>
          <TabsTrigger value="agents">Agent Ranking</TabsTrigger>
          <TabsTrigger value="stores">Store Ranking</TabsTrigger>
          <TabsTrigger value="types">By Store Type</TabsTrigger>
          <TabsTrigger value="split">Payment Split</TabsTrigger>
        </TabsList>

        <TabsContent value="trend">
          <Card><CardHeader><CardTitle className="text-sm">Daily Sales Trend</CardTitle></CardHeader><CardContent>
            {d.dailyTrend.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data</p> : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={d.dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Amount" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="agents">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow>
              <TableHead>#</TableHead><TableHead>Agent</TableHead><TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Count</TableHead><TableHead className="text-right">Cash</TableHead>
              <TableHead className="text-right">UPI</TableHead><TableHead className="text-right">Credit</TableHead>
            </TableRow></TableHeader><TableBody>
              {d.agentRanking.map((a, i) => (
                <TableRow key={i}>
                  <TableCell><Badge variant={i === 0 ? "default" : "secondary"}>{i + 1}</Badge></TableCell>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-right">{fmt(a.amount)}</TableCell>
                  <TableCell className="text-right">{a.count}</TableCell>
                  <TableCell className="text-right">{fmt(a.cash)}</TableCell>
                  <TableCell className="text-right">{fmt(a.upi)}</TableCell>
                  <TableCell className="text-right text-destructive">{fmt(a.credit)}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="stores">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow>
              <TableHead>#</TableHead><TableHead>Store</TableHead><TableHead>Type</TableHead>
              <TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Avg Sale</TableHead>
            </TableRow></TableHeader><TableBody>
              {d.storeRanking.slice(0, 30).map((s, i) => (
                <TableRow key={i}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell><Badge variant="outline">{s.type}</Badge></TableCell>
                  <TableCell className="text-right">{fmt(s.amount)}</TableCell>
                  <TableCell className="text-right">{s.count}</TableCell>
                  <TableCell className="text-right">{fmt(s.avgSale)}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="types">
          <Card><CardHeader><CardTitle className="text-sm">Sales by Store Type</CardTitle></CardHeader><CardContent>
            {d.storeTypeData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data</p> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={d.storeTypeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Sales" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="split">
          <Card><CardHeader><CardTitle className="text-sm">Payment Method Split</CardTitle></CardHeader><CardContent>
            {d.paymentSplit.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data</p> : (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart><Pie data={d.paymentSplit} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${fmt(value)}`}>
                    {d.paymentSplit.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie><Tooltip formatter={(v: number) => fmt(v)} /></PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
