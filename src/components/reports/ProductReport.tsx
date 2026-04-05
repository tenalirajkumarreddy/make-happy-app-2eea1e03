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
import { Package, TrendingUp, TrendingDown, Layers } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import * as XLSX from "xlsx";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";
import { ReportContainer, ReportKPICard } from "@/components/reports/ReportContainer";

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const COLORS = ["hsl(217, 91%, 50%)", "hsl(142, 72%, 42%)", "hsl(38, 92%, 50%)", "hsl(280, 65%, 60%)", "hsl(0, 72%, 51%)", "hsl(190, 80%, 45%)", "hsl(330, 70%, 50%)"];

export default function ProductReport() {
  const today = new Date();
  const thirtyAgo = new Date(today); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const [from, setFrom] = useState(thirtyAgo.toISOString().split("T")[0]);
  const [to, setTo] = useState(today.toISOString().split("T")[0]);
  const { data: companySettings } = useCompanySettings();

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

      const soldIds = new Set(Object.keys(prodPerf));
      const notSold = products.filter(p => p.is_active && !soldIds.has(p.id)).map(p => ({ name: p.name, sku: p.sku, category: p.category || "-" }));

      const catPerf: Record<string, { qty: number; revenue: number }> = {};
      productList.forEach(p => {
        if (!catPerf[p.category]) catPerf[p.category] = { qty: 0, revenue: 0 };
        catPerf[p.category].qty += p.qty;
        catPerf[p.category].revenue += p.revenue;
      });
      const categoryData = Object.entries(catPerf).sort((a, b) => b[1].revenue - a[1].revenue).map(([name, v]) => ({ name, ...v }));

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

  const handlePrintHTML = () => {
    if (!data || !companySettings) return "";

    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-label">Total Qty Sold</div><div class="kpi-value">${data.totalQty.toLocaleString()}</div></div>
        <div class="kpi-card highlight"><div class="kpi-label">Total Revenue</div><div class="kpi-value">${fmt(data.totalRevenue)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Products Sold</div><div class="kpi-value">${data.uniqueProducts}</div></div>
        <div class="kpi-card"><div class="kpi-label">Not Sold</div><div class="kpi-value text-neg">${data.notSold.length}</div></div>
      </div>

      <h2>Fast Moving Products</h2>
      <table>
        <thead><tr><th>#</th><th>Product</th><th>Category</th><th class="text-right">Qty Sold</th><th class="text-right">Revenue</th><th class="text-right">Avg/Sale</th></tr></thead>
        <tbody>
          ${data.fastMovers.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="font-semibold">${p.name}</td>
              <td>${p.category}</td>
              <td class="text-right font-semibold">${p.qty}</td>
              <td class="text-right">${fmt(p.revenue)}</td>
              <td class="text-right">${p.avgQty.toFixed(1)}</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr style="background: var(--accent); color: white; font-weight: 700;">
            <td colspan="3">TOTAL (${data.fastMovers.length} products)</td>
            <td class="text-right">${data.totalQty.toLocaleString()}</td>
            <td class="text-right">${fmt(data.totalRevenue)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      ${data.notSold.length > 0 ? `
        <h2>Products Not Sold</h2>
        <table>
          <thead><tr><th>#</th><th>Product</th><th>SKU</th><th>Category</th></tr></thead>
          <tbody>
            ${data.notSold.map((p, i) => `
              <tr><td>${i + 1}</td><td class="font-semibold">${p.name}</td><td class="font-mono">${p.sku}</td><td>${p.category}</td></tr>
            `).join("")}
          </tbody>
        </table>
      ` : ""}

      <h2>Revenue by Category</h2>
      <table>
        <thead><tr><th>Category</th><th class="text-right">Qty</th><th class="text-right">Revenue</th></tr></thead>
        <tbody>
          ${data.categoryData.map(c => `
            <tr><td class="font-semibold">${c.name}</td><td class="text-right">${c.qty}</td><td class="text-right">${fmt(c.revenue)}</td></tr>
          `).join("")}
        </tbody>
      </table>
    `;

    return generatePrintHTML({
      title: "Product Performance Report",
      dateRange: `${from} — ${to}`,
      metadata: {
        "Total Qty": data.totalQty.toLocaleString(),
        "Revenue": fmt(data.totalRevenue),
        "Products": `${data.uniqueProducts} sold, ${data.notSold.length} unsold`,
      },
      companyInfo: companySettings,
      htmlContent,
    });
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

  const filtersSection = (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label className="text-xs">From</Label>
        <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
      </div>
      <div>
        <Label className="text-xs">To</Label>
        <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
      </div>
    </div>
  );

  const summaryCards = (
    <>
      <ReportKPICard
        label="Total Qty Sold"
        value={d.totalQty.toLocaleString()}
        icon={Package}
      />
      <ReportKPICard
        label="Total Revenue"
        value={fmt(d.totalRevenue)}
        icon={TrendingUp}
        trend="up"
        highlight
      />
      <ReportKPICard
        label="Products Sold"
        value={d.uniqueProducts.toString()}
        icon={Layers}
        highlight
      />
      <ReportKPICard
        label="Not Sold"
        value={d.notSold.length.toString()}
        icon={TrendingDown}
        trend="down"
      />
    </>
  );

  return (
    <ReportContainer
      title="Product Performance Report"
      subtitle="Product sales analysis, fast/slow movers & category breakdown"
      icon={Package}
      dateRange={`${from} — ${to}`}
      onPrint={handlePrintHTML}
      onExportExcel={exportExcel}
      isLoading={false}
      filters={filtersSection}
      summaryCards={summaryCards}
    >
      <Tabs defaultValue="fast">
        <TabsList className="bg-muted/50 p-1 h-auto flex-wrap">
          <TabsTrigger value="fast" className="text-xs">Fast Movers</TabsTrigger>
          <TabsTrigger value="slow" className="text-xs">Slow Movers</TabsTrigger>
          <TabsTrigger value="category" className="text-xs">By Category</TabsTrigger>
          <TabsTrigger value="storetype" className="text-xs">Store Type × Product</TabsTrigger>
          <TabsTrigger value="notsold" className="text-xs">Not Sold</TabsTrigger>
        </TabsList>

        <TabsContent value="fast">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold text-xs">#</TableHead>
                    <TableHead className="font-semibold text-xs">Product</TableHead>
                    <TableHead className="font-semibold text-xs">Category</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Qty</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Revenue</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Avg/Sale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.fastMovers.slice(0, 25).map((p, i) => (
                    <TableRow key={p.id} className="hover:bg-muted/30">
                      <TableCell><Badge variant={i < 3 ? "default" : "secondary"}>{i + 1}</Badge></TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                      <TableCell className="text-right font-bold">{p.qty}</TableCell>
                      <TableCell className="text-right">{fmt(p.revenue)}</TableCell>
                      <TableCell className="text-right">{p.avgQty.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slow">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold text-xs">#</TableHead>
                    <TableHead className="font-semibold text-xs">Product</TableHead>
                    <TableHead className="font-semibold text-xs">Category</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Qty</TableHead>
                    <TableHead className="text-right font-semibold text-xs">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.slowMovers.slice(0, 25).map((p, i) => (
                    <TableRow key={p.id} className="hover:bg-muted/30">
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                      <TableCell className="text-right text-red-600 font-bold">{p.qty}</TableCell>
                      <TableCell className="text-right">{fmt(p.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="category">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Revenue by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {d.categoryData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No data</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={d.categoryData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={d.categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={90} dataKey="revenue" label={({ name }) => name}>
                        {d.categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storetype">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Top 5 Products by Store Type (Qty)</CardTitle>
            </CardHeader>
            <CardContent>
              {d.storeTypeProductData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={d.storeTypeProductData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="type" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip />
                    <Legend />
                    {d.top5Products.map((p, i) => (
                      <Bar key={p} dataKey={p} fill={COLORS[i % COLORS.length]} stackId="a" name={p} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notsold">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4">
              {d.notSold.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">All products were sold!</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold text-xs">#</TableHead>
                      <TableHead className="font-semibold text-xs">Product</TableHead>
                      <TableHead className="font-semibold text-xs">SKU</TableHead>
                      <TableHead className="font-semibold text-xs">Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.notSold.map((p, i) => (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                        <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </ReportContainer>
  );
}
