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
  Package, TrendingUp, TrendingDown, BarChart3,
  FileText, FileSpreadsheet, Layers,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const COLORS = ["hsl(217, 91%, 50%)", "hsl(142, 72%, 42%)", "hsl(38, 92%, 50%)", "hsl(280, 65%, 60%)", "hsl(0, 72%, 51%)", "hsl(190, 80%, 45%)", "hsl(330, 70%, 50%)"];

export default function ProductReport() {
  const today = new Date();
  const thirtyAgo = new Date(today); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const [from, setFrom] = useState(thirtyAgo.toISOString().split("T")[0]);
  const [to, setTo] = useState(today.toISOString().split("T")[0]);

  const { data, isLoading } = useQuery({
    queryKey: ["product-report", from, to],
    queryFn: async () => {
      const start = from + "T00:00:00", end = to + "T23:59:59";
      const [saleItemsRes, salesRes, productsRes, storesRes, storeTypesRes] = await Promise.all([
        supabase.from("sale_items").select("*, products(name, unit, category, product_group)").gte("created_at", start).lte("created_at", end),
        supabase.from("sales").select("id, store_id, created_at").gte("created_at", start).lte("created_at", end),
        supabase.from("products").select("id, name, sku, unit, category, product_group, base_price, is_active"),
        supabase.from("stores").select("id, name, store_type_id"),
        supabase.from("store_types").select("id, name"),
      ]);

      const saleItems = saleItemsRes.data || [];
      const sales = salesRes.data || [];
      const products = productsRes.data || [];
      const stores = storesRes.data || [];
      const storeTypes = storeTypesRes.data || [];

      const storeTypeMap = Object.fromEntries(storeTypes.map(t => [t.id, t.name]));
      const storeMap = Object.fromEntries(stores.map(s => [s.id, s]));
      const saleStoreMap = Object.fromEntries(sales.map(s => [s.id, s.store_id]));

      // Product performance
      const prodPerf: Record<string, { name: string; unit: string; category: string; group: string; qty: number; revenue: number; saleCount: number }> = {};
      saleItems.forEach(item => {
        const key = item.product_id;
        const p = item.products as any;
        if (!prodPerf[key]) prodPerf[key] = { name: p?.name || "Unknown", unit: p?.unit || "PCS", category: p?.category || "Uncategorized", group: p?.product_group || "-", qty: 0, revenue: 0, saleCount: 0 };
        prodPerf[key].qty += Number(item.quantity);
        prodPerf[key].revenue += Number(item.total_price);
        prodPerf[key].saleCount += 1;
      });

      const productList = Object.entries(prodPerf).map(([id, p]) => ({ id, ...p, avgQty: p.saleCount > 0 ? p.qty / p.saleCount : 0 }));
      const fastMovers = [...productList].sort((a, b) => b.qty - a.qty);
      const slowMovers = [...productList].sort((a, b) => a.qty - b.qty);

      // Products not sold
      const soldIds = new Set(Object.keys(prodPerf));
      const notSold = products.filter(p => p.is_active && !soldIds.has(p.id)).map(p => ({ name: p.name, sku: p.sku, category: p.category || "-" }));

      // Category breakdown
      const catPerf: Record<string, { qty: number; revenue: number }> = {};
      productList.forEach(p => {
        if (!catPerf[p.category]) catPerf[p.category] = { qty: 0, revenue: 0 };
        catPerf[p.category].qty += p.qty;
        catPerf[p.category].revenue += p.revenue;
      });
      const categoryData = Object.entries(catPerf).sort((a, b) => b[1].revenue - a[1].revenue).map(([name, v]) => ({ name, ...v }));

      // Store type vs product (top 5 products x store types)
      const storeTypeProd: Record<string, Record<string, number>> = {};
      saleItems.forEach(item => {
        const saleId = item.sale_id;
        const storeId = saleStoreMap[saleId];
        if (!storeId) return;
        const st = storeMap[storeId];
        const typeName = st ? storeTypeMap[st.store_type_id] || "Other" : "Other";
        const pName = (item.products as any)?.name || "Unknown";
        if (!storeTypeProd[typeName]) storeTypeProd[typeName] = {};
        storeTypeProd[typeName][pName] = (storeTypeProd[typeName][pName] || 0) + Number(item.quantity);
      });

      // Flatten for chart: top 5 products across all types
      const top5Products = fastMovers.slice(0, 5).map(p => p.name);
      const storeTypeProductData = Object.entries(storeTypeProd).map(([type, prods]) => {
        const row: any = { type };
        top5Products.forEach(p => { row[p] = prods[p] || 0; });
        return row;
      });

      const totalQty = productList.reduce((s, p) => s + p.qty, 0);
      const totalRevenue = productList.reduce((s, p) => s + p.revenue, 0);

      return {
        fastMovers, slowMovers, notSold, categoryData, storeTypeProductData, top5Products,
        totalQty, totalRevenue, uniqueProducts: productList.length,
      };
    },
  });

  const exportPDF = () => {
    if (!data) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, pw, 18, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(14);
    doc.text("Product Report", 10, 12);
    doc.setFontSize(9); doc.text(`${from} to ${to}`, pw - 10, 12, { align: "right" });

    doc.setTextColor(0, 0, 0);
    autoTable(doc, {
      startY: 24,
      head: [["#", "Product", "Category", "Qty Sold", "Revenue", "Avg/Sale"]],
      body: data.fastMovers.map((p, i) => [i + 1, p.name, p.category, p.qty, fmt(p.revenue), p.avgQty.toFixed(1)]),
      theme: "grid", styles: { fontSize: 6, cellPadding: 1.2 }, headStyles: { fillColor: [30, 41, 59] },
      margin: { left: 10 }, tableWidth: 140,
    });

    if (data.notSold.length > 0) {
      autoTable(doc, {
        startY: 24, head: [["Not Sold Products", "SKU", "Category"]],
        body: data.notSold.map(p => [p.name, p.sku, p.category]),
        theme: "grid", styles: { fontSize: 6, cellPadding: 1.2 }, headStyles: { fillColor: [150, 40, 40] },
        margin: { left: 160 }, tableWidth: 127,
      });
    }
    doc.save(`product-report-${from}-to-${to}.pdf`);
    toast.success("PDF downloaded");
  };

  const exportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.fastMovers), "Products");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.categoryData), "Categories");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.notSold), "Not Sold");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.storeTypeProductData), "Store Type Products");
    XLSX.writeFile(wb, `product-report-${from}-to-${to}.xlsx`);
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Total Qty Sold" value={String(d.totalQty)} icon={Package} iconColor="bg-primary" />
        <StatCard title="Total Revenue" value={fmt(d.totalRevenue)} icon={TrendingUp} iconColor="bg-success" />
        <StatCard title="Products Sold" value={String(d.uniqueProducts)} icon={Layers} iconColor="bg-accent" />
        <StatCard title="Not Sold" value={String(d.notSold.length)} icon={TrendingDown} iconColor="bg-destructive" />
      </div>

      <Tabs defaultValue="fast">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="fast">Fast Movers</TabsTrigger>
          <TabsTrigger value="slow">Slow Movers</TabsTrigger>
          <TabsTrigger value="category">By Category</TabsTrigger>
          <TabsTrigger value="storetype">Store Type × Product</TabsTrigger>
          <TabsTrigger value="notsold">Not Sold</TabsTrigger>
        </TabsList>

        <TabsContent value="fast">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow>
              <TableHead>#</TableHead><TableHead>Product</TableHead><TableHead>Category</TableHead>
              <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Avg/Sale</TableHead>
            </TableRow></TableHeader><TableBody>
              {d.fastMovers.slice(0, 25).map((p, i) => (
                <TableRow key={p.id}>
                  <TableCell><Badge variant={i < 3 ? "default" : "secondary"}>{i + 1}</Badge></TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                  <TableCell className="text-right font-bold">{p.qty}</TableCell>
                  <TableCell className="text-right">{fmt(p.revenue)}</TableCell>
                  <TableCell className="text-right">{p.avgQty.toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="slow">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow>
              <TableHead>#</TableHead><TableHead>Product</TableHead><TableHead>Category</TableHead>
              <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead>
            </TableRow></TableHeader><TableBody>
              {d.slowMovers.slice(0, 25).map((p, i) => (
                <TableRow key={p.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                  <TableCell className="text-right text-destructive font-bold">{p.qty}</TableCell>
                  <TableCell className="text-right">{fmt(p.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="category">
          <Card><CardHeader><CardTitle className="text-sm">Revenue by Category</CardTitle></CardHeader><CardContent>
            {d.categoryData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data</p> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={d.categoryData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip /><Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart><Pie data={d.categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={90} dataKey="revenue" label={({ name }) => name}>
                    {d.categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie><Tooltip formatter={(v: number) => fmt(v)} /></PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="storetype">
          <Card><CardHeader><CardTitle className="text-sm">Top 5 Products by Store Type (Qty)</CardTitle></CardHeader><CardContent>
            {d.storeTypeProductData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data</p> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={d.storeTypeProductData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="type" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip /><Legend />
                  {d.top5Products.map((p, i) => (
                    <Bar key={p} dataKey={p} fill={COLORS[i % COLORS.length]} stackId="a" name={p} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="notsold">
          <Card><CardContent className="pt-4">
            {d.notSold.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">All products were sold!</p> : (
              <Table><TableHeader><TableRow>
                <TableHead>#</TableHead><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead>Category</TableHead>
              </TableRow></TableHeader><TableBody>
                {d.notSold.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.sku}</TableCell>
                    <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody></Table>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
