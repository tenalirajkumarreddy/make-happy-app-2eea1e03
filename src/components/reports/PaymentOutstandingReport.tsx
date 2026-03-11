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
  Banknote, TrendingDown, AlertTriangle, UserX, Clock,
  FileText, FileSpreadsheet, Shield, DollarSign, Percent,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const COLORS = ["hsl(142, 72%, 42%)", "hsl(38, 92%, 50%)", "hsl(280, 65%, 60%)", "hsl(0, 72%, 51%)"];

export default function PaymentOutstandingReport() {
  const today = new Date();
  const [inactiveDays, setInactiveDays] = useState(7);

  const { data, isLoading } = useQuery({
    queryKey: ["payment-outstanding-report", inactiveDays],
    queryFn: async () => {
      const [storesRes, txnRes, salesRes, storeTypesRes, customersRes, ordersRes] = await Promise.all([
        supabase.from("stores").select("id, name, display_id, outstanding, opening_balance, store_type_id, customer_id").eq("is_active", true),
        supabase.from("transactions").select("store_id, total_amount, cash_amount, upi_amount, created_at, recorded_by").order("created_at", { ascending: false }),
        supabase.from("sales").select("store_id, total_amount, outstanding_amount, created_at").order("created_at", { ascending: false }),
        supabase.from("store_types").select("id, name, credit_limit_kyc, credit_limit_no_kyc"),
        supabase.from("customers").select("id, name, phone, kyc_status, credit_limit_override"),
        supabase.from("orders").select("store_id, created_at").order("created_at", { ascending: false }),
      ]);

      const stores = storesRes.data || [];
      const txns = txnRes.data || [];
      const allSales = salesRes.data || [];
      const storeTypes = storeTypesRes.data || [];
      const customers = customersRes.data || [];
      const allOrders = ordersRes.data || [];

      const storeTypeMap = Object.fromEntries(storeTypes.map(t => [t.id, { name: t.name, creditKyc: Number(t.credit_limit_kyc), creditNoKyc: Number(t.credit_limit_no_kyc) }]));
      const customerMap = Object.fromEntries(customers.map(c => [c.id, c]));

      // Last order date per store
      const lastOrderDate: Record<string, string> = {};
      allOrders.forEach(o => {
        if (!lastOrderDate[o.store_id] || o.created_at > lastOrderDate[o.store_id]) lastOrderDate[o.store_id] = o.created_at;
      });

      // Total outstanding
      const totalOutstanding = stores.reduce((s, st) => s + Number(st.outstanding), 0);
      const totalOpeningBalance = stores.reduce((s, st) => s + Number(st.opening_balance), 0);

      // Total collections (all time recent 90 days for trend)
      const ninetyAgo = new Date(); ninetyAgo.setDate(ninetyAgo.getDate() - 90);
      const recentTxns = txns.filter(t => new Date(t.created_at) >= ninetyAgo);
      const totalCollections = recentTxns.reduce((s, t) => s + Number(t.total_amount), 0);
      const totalCollectionCash = recentTxns.reduce((s, t) => s + Number(t.cash_amount), 0);
      const totalCollectionUpi = recentTxns.reduce((s, t) => s + Number(t.upi_amount), 0);

      // Recent sales total for collection %
      const recentSales = allSales.filter(s => new Date(s.created_at) >= ninetyAgo);
      const recentSalesTotal = recentSales.reduce((s, r) => s + Number(r.total_amount), 0);
      const collectionRate = recentSalesTotal > 0 ? ((totalCollections / recentSalesTotal) * 100).toFixed(1) : "0";

      // Last sale and last payment per store
      const lastSaleDate: Record<string, string> = {};
      const lastPaymentDate: Record<string, string> = {};
      allSales.forEach(s => {
        if (!lastSaleDate[s.store_id] || s.created_at > lastSaleDate[s.store_id]) lastSaleDate[s.store_id] = s.created_at;
      });
      txns.forEach(t => {
        if (!lastPaymentDate[t.store_id] || t.created_at > lastPaymentDate[t.store_id]) lastPaymentDate[t.store_id] = t.created_at;
      });

      const nowMs = today.getTime();

      // Store analysis
      const storeAnalysis = stores.filter(s => Number(s.outstanding) > 0).map(s => {
        const outstanding = Number(s.outstanding);
        const openingBal = Number(s.opening_balance);
        const lastSale = lastSaleDate[s.id];
        const lastPayment = lastPaymentDate[s.id];
        const lastOrder = lastOrderDate[s.id];
        const daysSinceLastSale = lastSale ? Math.floor((nowMs - new Date(lastSale).getTime()) / 86400000) : 999;
        const daysSinceLastPayment = lastPayment ? Math.floor((nowMs - new Date(lastPayment).getTime()) / 86400000) : 999;
        const daysSinceLastOrder = lastOrder ? Math.floor((nowMs - new Date(lastOrder).getTime()) / 86400000) : 999;
        const typeInfo = storeTypeMap[s.store_type_id] || { name: "Other", creditKyc: 0, creditNoKyc: 0 };
        const typeName = typeInfo.name;
        const cust = customerMap[s.customer_id];
        const isKyc = cust?.kyc_status === "verified";
        const creditLimit = cust?.credit_limit_override
          ? Number(cust.credit_limit_override)
          : isKyc ? typeInfo.creditKyc : typeInfo.creditNoKyc;

        // Danger: outstanding > 2x credit limit OR no payment in 30+ days with high outstanding
        const isDanger = (creditLimit > 0 && outstanding > creditLimit * 2) || (daysSinceLastPayment > 30 && outstanding > 5000);
        // Inactive: has outstanding but no sale in X days
        const isInactive = daysSinceLastSale >= inactiveDays && outstanding > 0;
        // Credit limit exceeded
        const isCreditExceeded = creditLimit > 0 && outstanding > creditLimit;
        // No recent orders (15 days)
        const hasNoRecentOrders = daysSinceLastOrder >= 15;

        return {
          id: s.id, name: s.name, displayId: s.display_id, outstanding, openingBalance: openingBal,
          type: typeName, customerName: cust?.name || "-", customerPhone: cust?.phone || "-",
          daysSinceLastSale, daysSinceLastPayment, daysSinceLastOrder, isDanger, isInactive,
          isCreditExceeded, hasNoRecentOrders, creditLimit,
        };
      }).sort((a, b) => b.outstanding - a.outstanding);

      const dangerCustomers = storeAnalysis.filter(s => s.isDanger);
      const inactiveCustomers = storeAnalysis.filter(s => s.isInactive);
      const creditExceededStores = storeAnalysis.filter(s => s.isCreditExceeded);
      const noRecentOrdersStores = storeAnalysis.filter(s => s.hasNoRecentOrders);

      // Aging analysis
      const aging = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
      storeAnalysis.forEach(s => {
        const days = s.daysSinceLastPayment;
        if (days <= 30) aging["0-30"] += s.outstanding;
        else if (days <= 60) aging["31-60"] += s.outstanding;
        else if (days <= 90) aging["61-90"] += s.outstanding;
        else aging["90+"] += s.outstanding;
      });
      const agingData = Object.entries(aging).map(([name, value]) => ({ name, value }));

      // Outstanding by store type
      const outByType: Record<string, number> = {};
      stores.forEach(s => {
        const typeName = storeTypeMap[s.store_type_id] || "Other";
        outByType[typeName] = (outByType[typeName] || 0) + Number(s.outstanding);
      });
      const outstandingByType = Object.entries(outByType).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

      // Collection trend (daily last 30 days)
      const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
      const dailyCollections: Record<string, number> = {};
      const last30 = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (29 - i));
        return d.toISOString().split("T")[0];
      });
      last30.forEach(d => { dailyCollections[d] = 0; });
      recentTxns.forEach(t => {
        const day = t.created_at.split("T")[0];
        if (dailyCollections[day] !== undefined) dailyCollections[day] += Number(t.total_amount);
      });
      const collectionTrend = last30.map(d => ({ date: d.slice(5), amount: dailyCollections[d] }));

      // Payment split
      const paymentSplit = [
        { name: "Cash", value: totalCollectionCash },
        { name: "UPI", value: totalCollectionUpi },
      ].filter(p => p.value > 0);

      return {
        totalOutstanding, totalCollections, collectionRate, totalOpeningBalance,
        storeAnalysis, dangerCustomers, inactiveCustomers, creditExceededStores, noRecentOrdersStores,
        agingData, outstandingByType, collectionTrend, paymentSplit,
        storesWithOutstanding: storeAnalysis.length,
      };
    },
  });

  const exportPDF = () => {
    if (!data) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, pw, 18, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(14);
    doc.text("Payment & Outstanding Report", 10, 12);
    doc.setFontSize(9); doc.text(`Generated: ${new Date().toLocaleDateString()}`, pw - 10, 12, { align: "right" });

    doc.setTextColor(0, 0, 0);

    // Summary + Aging on left
    autoTable(doc, { startY: 24, head: [["Metric", "Value"]], body: [
      ["Total Outstanding", fmt(data.totalOutstanding)],
      ["Collections (90d)", fmt(data.totalCollections)],
      ["Collection Rate", data.collectionRate + "%"],
      ["Stores with Outstanding", data.storesWithOutstanding],
      ["Danger Customers", data.dangerCustomers.length],
      ["Inactive Customers", data.inactiveCustomers.length],
    ], theme: "grid", styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [30, 41, 59] }, margin: { left: 10 }, tableWidth: 80 });

    let y = (doc as any).lastAutoTable.finalY + 3;
    autoTable(doc, { startY: y, head: [["Aging Bucket", "Amount"]], body: data.agingData.map(a => [a.name + " days", fmt(a.value)]), theme: "grid", styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [150, 40, 40] }, margin: { left: 10 }, tableWidth: 80 });

    // Danger customers on right
    autoTable(doc, { startY: 24, head: [["Store", "Outstanding", "Last Sale", "Last Payment", "Type"]], body: data.dangerCustomers.slice(0, 20).map(s => [s.name, fmt(s.outstanding), s.daysSinceLastSale + "d ago", s.daysSinceLastPayment + "d ago", s.type]),
      theme: "grid", styles: { fontSize: 6, cellPadding: 1.2 }, headStyles: { fillColor: [150, 40, 40] }, margin: { left: 100 }, tableWidth: 187 });

    // Top outstanding stores on page 2
    doc.addPage();
    autoTable(doc, { startY: 10, head: [["#", "Store", "Customer", "Phone", "Outstanding", "Opening Bal", "Last Sale", "Last Payment"]],
      body: data.storeAnalysis.slice(0, 40).map((s, i) => [i + 1, s.name, s.customerName, s.customerPhone, fmt(s.outstanding), fmt(s.openingBalance), s.daysSinceLastSale + "d", s.daysSinceLastPayment + "d"]),
      theme: "grid", styles: { fontSize: 6, cellPadding: 1.2 }, headStyles: { fillColor: [30, 41, 59] }, margin: { left: 10, right: 10 },
    });

    doc.save(`payment-outstanding-report.pdf`);
    toast.success("PDF downloaded");
  };

  const exportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Payment & Outstanding Report"], [],
      ["Total Outstanding", data.totalOutstanding], ["Collections (90d)", data.totalCollections],
      ["Collection Rate", data.collectionRate + "%"], ["Danger Customers", data.dangerCustomers.length],
    ]), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.storeAnalysis), "All Stores");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.dangerCustomers), "Danger");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.inactiveCustomers), "Inactive");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.agingData), "Aging");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.collectionTrend), "Collection Trend");
    XLSX.writeFile(wb, `payment-outstanding-report.xlsx`);
    toast.success("Excel downloaded");
  };

  if (isLoading) return <TableSkeleton />;
  if (!data) return null;
  const d = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">Inactive threshold (days)</Label><Input type="number" value={inactiveDays} onChange={e => setInactiveDays(Number(e.target.value) || 7)} className="w-28" min={1} /></div>
        <Button variant="outline" size="sm" onClick={exportPDF}><FileText className="h-4 w-4 mr-1" />PDF</Button>
        <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Total Outstanding" value={fmt(d.totalOutstanding)} icon={TrendingDown} iconColor="bg-destructive" />
        <StatCard title="Collections (90d)" value={fmt(d.totalCollections)} icon={Banknote} iconColor="bg-success" />
        <StatCard title="Collection Rate" value={d.collectionRate + "%"} icon={Percent} iconColor="bg-primary" />
        <StatCard title="Stores w/ Dues" value={String(d.storesWithOutstanding)} icon={DollarSign} iconColor="bg-warning" />
        <StatCard title="Danger" value={String(d.dangerCustomers.length)} icon={AlertTriangle} iconColor="bg-destructive" />
        <StatCard title="Inactive" value={String(d.inactiveCustomers.length)} icon={UserX} iconColor="bg-warning" />
        <StatCard title="Credit Exceeded" value={String(d.creditExceededStores.length)} icon={Shield} iconColor="bg-destructive" />
        <StatCard title="No Orders (15d)" value={String(d.noRecentOrdersStores.length)} icon={Clock} iconColor="bg-warning" />
      </div>

      <Tabs defaultValue="danger">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="danger">⚠️ Danger</TabsTrigger>
          <TabsTrigger value="credit">💳 Credit Exceeded</TabsTrigger>
          <TabsTrigger value="noorders">📭 No Orders</TabsTrigger>
          <TabsTrigger value="inactive">Inactive</TabsTrigger>
          <TabsTrigger value="all">All Outstanding</TabsTrigger>
          <TabsTrigger value="aging">Aging</TabsTrigger>
          <TabsTrigger value="trend">Collection Trend</TabsTrigger>
          <TabsTrigger value="bytype">By Store Type</TabsTrigger>
        </TabsList>

        <TabsContent value="danger">
          <Card><CardHeader><CardTitle className="text-sm text-destructive flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Danger Customers — Urgent Collection Needed</CardTitle></CardHeader><CardContent>
            {d.dangerCustomers.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No danger customers 🎉</p> : (
              <Table><TableHeader><TableRow>
                <TableHead>#</TableHead><TableHead>Store</TableHead><TableHead>Customer</TableHead><TableHead>Phone</TableHead>
                <TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Credit Limit</TableHead>
                <TableHead className="text-right">Last Sale</TableHead><TableHead className="text-right">Last Payment</TableHead>
              </TableRow></TableHeader><TableBody>
                {d.dangerCustomers.map((s, i) => (
                  <TableRow key={s.id} className="bg-destructive/5">
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.customerName}</TableCell>
                    <TableCell>{s.customerPhone}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">{fmt(s.outstanding)}</TableCell>
                    <TableCell className="text-right">{fmt(s.openingBalance)}</TableCell>
                    <TableCell className="text-right">{s.daysSinceLastSale < 999 ? s.daysSinceLastSale + "d ago" : "Never"}</TableCell>
                    <TableCell className="text-right">{s.daysSinceLastPayment < 999 ? s.daysSinceLastPayment + "d ago" : "Never"}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="credit">
          <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2 text-destructive"><Shield className="h-4 w-4" />Credit Limit Exceeded — Outstanding greater than allowed credit</CardTitle></CardHeader><CardContent>
            {d.creditExceededStores.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No stores exceeding credit limit 🎉</p> : (
              <Table><TableHeader><TableRow>
                <TableHead>#</TableHead><TableHead>Store</TableHead><TableHead>Type</TableHead><TableHead>Customer</TableHead><TableHead>Phone</TableHead>
                <TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Credit Limit</TableHead><TableHead className="text-right">Excess</TableHead>
              </TableRow></TableHeader><TableBody>
                {d.creditExceededStores.map((s, i) => (
                  <TableRow key={s.id} className="bg-destructive/5">
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell><Badge variant="outline">{s.type}</Badge></TableCell>
                    <TableCell>{s.customerName}</TableCell>
                    <TableCell>{s.customerPhone}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">{fmt(s.outstanding)}</TableCell>
                    <TableCell className="text-right">{s.creditLimit > 0 ? fmt(s.creditLimit) : "—"}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">{s.creditLimit > 0 ? fmt(s.outstanding - s.creditLimit) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="noorders">
          <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2 text-warning"><Clock className="h-4 w-4" />No Orders in Last 15 Days — Outstanding with no recent activity</CardTitle></CardHeader><CardContent>
            {d.noRecentOrdersStores.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">All active stores have recent orders</p> : (
              <Table><TableHeader><TableRow>
                <TableHead>#</TableHead><TableHead>Store</TableHead><TableHead>Type</TableHead><TableHead>Customer</TableHead>
                <TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Last Order</TableHead><TableHead className="text-right">Last Sale</TableHead>
              </TableRow></TableHeader><TableBody>
                {d.noRecentOrdersStores.map((s, i) => (
                  <TableRow key={s.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell><Badge variant="outline">{s.type}</Badge></TableCell>
                    <TableCell>{s.customerName}</TableCell>
                    <TableCell className="text-right font-bold">{fmt(s.outstanding)}</TableCell>
                    <TableCell className="text-right">{s.daysSinceLastOrder < 999 ? s.daysSinceLastOrder + "d ago" : "Never"}</TableCell>
                    <TableCell className="text-right">{s.daysSinceLastSale < 999 ? s.daysSinceLastSale + "d ago" : "Never"}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="inactive">
          <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><UserX className="h-4 w-4" />Inactive — Outstanding but no orders in {inactiveDays}+ days</CardTitle></CardHeader><CardContent>
            {d.inactiveCustomers.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No inactive customers</p> : (
              <Table><TableHeader><TableRow>
                <TableHead>#</TableHead><TableHead>Store</TableHead><TableHead>Type</TableHead>
                <TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Last Sale</TableHead>
                <TableHead className="text-right">Last Payment</TableHead>
              </TableRow></TableHeader><TableBody>
                {d.inactiveCustomers.map((s, i) => (
                  <TableRow key={s.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell><Badge variant="outline">{s.type}</Badge></TableCell>
                    <TableCell className="text-right font-bold">{fmt(s.outstanding)}</TableCell>
                    <TableCell className="text-right">{s.daysSinceLastSale < 999 ? s.daysSinceLastSale + "d ago" : "Never"}</TableCell>
                    <TableCell className="text-right">{s.daysSinceLastPayment < 999 ? s.daysSinceLastPayment + "d ago" : "Never"}</TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="all">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow>
              <TableHead>#</TableHead><TableHead>Store</TableHead><TableHead>Type</TableHead><TableHead>Customer</TableHead>
              <TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Credit Limit</TableHead>
              <TableHead className="text-right">Last Payment</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader><TableBody>
              {d.storeAnalysis.slice(0, 50).map((s, i) => (
                <TableRow key={s.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell><Badge variant="outline">{s.type}</Badge></TableCell>
                  <TableCell>{s.customerName}</TableCell>
                  <TableCell className="text-right font-bold">{fmt(s.outstanding)}</TableCell>
                  <TableCell className="text-right">{fmt(s.openingBalance)}</TableCell>
                  <TableCell className="text-right">{s.daysSinceLastPayment < 999 ? s.daysSinceLastPayment + "d" : "-"}</TableCell>
                  <TableCell>
                    {s.isDanger && <Badge variant="destructive" className="text-[10px]">Danger</Badge>}
                    {s.isInactive && !s.isDanger && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="aging">
          <Card><CardHeader><CardTitle className="text-sm">Outstanding Aging Analysis</CardTitle></CardHeader><CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={d.agingData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Outstanding">
                    {d.agingData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-3 py-4">
                {d.agingData.map((a, i) => (
                  <div key={a.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                      <span className="text-sm font-medium">{a.name} days</span>
                    </div>
                    <span className="font-bold">{fmt(a.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="trend">
          <Card><CardHeader><CardTitle className="text-sm">Collection Trend (Last 30 Days)</CardTitle></CardHeader><CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={d.collectionTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} formatter={(v: number) => fmt(v)} />
                <Line type="monotone" dataKey="amount" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} name="Collections" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="bytype">
          <Card><CardHeader><CardTitle className="text-sm">Outstanding by Store Type</CardTitle></CardHeader><CardContent>
            {d.outstandingByType.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data</p> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={d.outstandingByType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="value" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} name="Outstanding" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
