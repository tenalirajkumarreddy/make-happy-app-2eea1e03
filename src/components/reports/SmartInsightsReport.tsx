import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, TrendingDown, Clock, AlertOctagon, ArrowRight, PackageX, Printer } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";

const SmartInsightsReport = () => {
  const navigate = useNavigate();
  const { data: companySettings } = useCompanySettings();

  // Fetch logic for insights
  const { data: insights, isLoading } = useQuery({
    queryKey: ["smart-insights"],
    queryFn: async () => {
      const today = new Date();
      const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30);
      const fortyFiveDaysAgo = new Date(today); fortyFiveDaysAgo.setDate(today.getDate() - 45);
      const sixtyDaysAgo = new Date(today); sixtyDaysAgo.setDate(today.getDate() - 60);

      // 1. Fetch Stores with Outstanding
      const { data: stores } = await supabase
        .from("stores")
        .select("id, name, outstanding, last_payment_date, last_order_date, route_id, routes(name)")
        .gt("outstanding", 0)
        .eq("is_active", true);

      // 2. Fetch Products & Stock
      // We need to join product_stock. Since connection is complex, we fetch separate and map
      const { data: products } = await supabase
        .from("products")
        .select("id, name, base_price");
      
      const { data: stock } = await supabase
        .from("product_stock")
        .select("product_id, quantity");

      // 3. Fetch Recent Sales (last 30 days) to identify dead stock
      const { data: recentSalesItems } = await supabase
        .from("sale_items")
        .select("product_id")
        .gte("created_at", thirtyDaysAgo.toISOString());

      // --- Process Risk 1: Debt at Risk (Zombie Debt) ---
      // Outstanding > 0 AND No payment in 45 days
      const storesWithDebt = stores || [];
      const debtAtRisk = storesWithDebt.filter(s => {
        if (!s.last_payment_date) return true; // Never paid!
        return new Date(s.last_payment_date) < fortyFiveDaysAgo;
      }).sort((a, b) => b.outstanding - a.outstanding);

      // --- Process Risk 2: Churn Risk ---
      // Had orders before, but no orders in last 30 days
      const churnRisk = storesWithDebt.filter(s => {
          if (!s.last_order_date) return false;
          // Only care if they owe money OR if we want to track pure churn
           return new Date(s.last_order_date) < thirtyDaysAgo;
      }).sort((a, b) =>  new Date(a.last_order_date || 0).getTime() - new Date(b.last_order_date || 0).getTime()); // Longest inactive first

      // --- Process Risk 3: Dead Stock ---
      // Stock > 0 AND No sales in 30 days
      const soldProductIds = new Set(recentSalesItems?.map(i => i.product_id));
      const productStockMap: Record<string, number> = {};
      stock?.forEach(s => {
          productStockMap[s.product_id] = (productStockMap[s.product_id] || 0) + s.quantity;
      });

      const deadStock = (products || []).filter(p => {
          const qty = productStockMap[p.id] || 0;
          return qty > 0 && !soldProductIds.has(p.id);
      }).map(p => ({
          ...p,
          stock: productStockMap[p.id],
          value: (productStockMap[p.id] * p.base_price)
      })).sort((a, b) => b.value - a.value);

      return {
          debtAtRisk,
          churnRisk,
          deadStock,
          totalAtRiskAmount: debtAtRisk.reduce((acc, s) => acc + s.outstanding, 0),
          totalDeadStockValue: deadStock.reduce((acc, s) => acc + s.value, 0)
      };
    }
  });

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const d = insights!;

  const handlePrintHTML = () => {
    if (!companySettings) return;
    const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card" style="border-left:3px solid #ef4444;"><div class="kpi-label">At Risk Amount</div><div class="kpi-value text-neg">${fmt(d.totalAtRiskAmount)}</div></div>
        <div class="kpi-card" style="border-left:3px solid #f59e0b;"><div class="kpi-label">Churn Risk Stores</div><div class="kpi-value">${d.churnRisk.length}</div></div>
        <div class="kpi-card" style="border-left:3px solid #64748b;"><div class="kpi-label">Dead Stock Value</div><div class="kpi-value">${fmt(d.totalDeadStockValue)}</div></div>
      </div>

      <h2>High Risk Collections (${d.debtAtRisk.length} stores)</h2>
      <table>
        <thead><tr><th>#</th><th>Store</th><th>Route</th><th class="text-right">Outstanding</th><th>Last Payment</th></tr></thead>
        <tbody>
          ${d.debtAtRisk.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:16px;opacity:0.6;">All clear!</td></tr>' : d.debtAtRisk.map((s: any, i: number) => `
            <tr>
              <td>${i + 1}</td>
              <td class="font-semibold">${s.name}</td>
              <td>${s.routes?.name || '—'}</td>
              <td class="text-right font-semibold text-neg">${fmt(s.outstanding)}</td>
              <td>${s.last_payment_date ? formatDistanceToNow(new Date(s.last_payment_date), { addSuffix: true }) : '<span style="color:#ef4444;font-weight:600;">Never</span>'}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <h2>Dead / Slow-Moving Inventory (${d.deadStock.length} products)</h2>
      <table>
        <thead><tr><th>#</th><th>Product</th><th class="text-right">Stock</th><th class="text-right">Value</th></tr></thead>
        <tbody>
          ${d.deadStock.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:16px;opacity:0.6;">Inventory moving fast!</td></tr>' : d.deadStock.map((p: any, i: number) => `
            <tr>
              <td>${i + 1}</td>
              <td class="font-semibold">${p.name}</td>
              <td class="text-right">${p.stock}</td>
              <td class="text-right font-semibold">${fmt(p.value)}</td>
            </tr>
          `).join("")}
        </tbody>
        ${d.deadStock.length > 0 ? `<tfoot><tr style="background:var(--accent);color:white;font-weight:700;"><td colspan="3">TOTAL DEAD STOCK VALUE</td><td class="text-right">${fmt(d.totalDeadStockValue)}</td></tr></tfoot>` : ''}
      </table>

      <h2>Churn Risk — Inactive Accounts (${d.churnRisk.length} stores)</h2>
      <table>
        <thead><tr><th>#</th><th>Store</th><th class="text-right">Outstanding</th><th>Last Order</th></tr></thead>
        <tbody>
          ${d.churnRisk.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:16px;opacity:0.6;">No churn risk detected.</td></tr>' : d.churnRisk.map((s: any, i: number) => `
            <tr>
              <td>${i + 1}</td>
              <td class="font-semibold">${s.name}</td>
              <td class="text-right font-semibold text-neg">${fmt(s.outstanding)}</td>
              <td>${s.last_order_date ? formatDistanceToNow(new Date(s.last_order_date), { addSuffix: true }) : 'N/A'}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    const html = generatePrintHTML({
      title: "Smart Business Insights",
      dateRange: `Generated ${format(new Date(), "MMM d, yyyy 'at' HH:mm")}`,
      metadata: { "At Risk": fmt(d.totalAtRiskAmount), "Churn": `${d.churnRisk.length} stores`, "Dead Stock": fmt(d.totalDeadStockValue) },
      companyInfo: companySettings,
      htmlContent,
    });
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); win.onload = () => { win.print(); }; }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handlePrintHTML}>
          <Printer className="h-4 w-4 mr-2" />
          Print / PDF
        </Button>
      </div>
      
      {/* Top Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-red-50/50 border-red-100">
            <CardHeader className="pb-2">
                <CardTitle className="text-xl font-bold text-red-600 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    ₹{d.totalAtRiskAmount.toLocaleString()}
                </CardTitle>
                <CardDescription>Critically Overdue (45+ days)</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">{d.debtAtRisk.length} stores have outstanding balances but haven't made a payment in over 45 days.</p>
            </CardContent>
        </Card>

        <Card className="bg-amber-50/50 border-amber-100">
            <CardHeader className="pb-2">
                <CardTitle className="text-xl font-bold text-amber-600 flex items-center gap-2">
                    <TrendingDown className="h-5 w-5" />
                    {d.churnRisk.length} Stores
                </CardTitle>
                <CardDescription>Drifting Away (30+ days inactive)</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Active stores with outstanding balance that haven't placed an order in the last 30 days.</p>
            </CardContent>
        </Card>

        <Card className="bg-slate-50/50 border-slate-100">
            <CardHeader className="pb-2">
                <CardTitle className="text-xl font-bold text-slate-700 flex items-center gap-2">
                    <PackageX className="h-5 w-5" />
                    ₹{d.totalDeadStockValue.toLocaleString()}
                </CardTitle>
                <CardDescription>Dead Inventory Value</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">{d.deadStock.length} products have stock but zero sales in the last 30 days.</p>
            </CardContent>
        </Card>
      </div>

      {/* Main Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Section 1: Debt at Risk */}
          <Card className="col-span-1 border-l-4 border-l-red-500 shadow-sm">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <AlertOctagon className="h-5 w-5 text-red-500" />
                            High Risk Collections
                        </CardTitle>
                        <CardDescription>Stores with debt & no recent payments</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigate("/reports/outstanding")}>
                        View All
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="h-[350px]">
                    <Table>
                        <TableHeader className="bg-muted/40 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="w-[180px]">Store</TableHead>
                                <TableHead>Balance</TableHead>
                                <TableHead>Last Paid</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {d.debtAtRisk.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">All clear! No risky debts found.</TableCell>
                                </TableRow>
                            ) : (
                                d.debtAtRisk.map((store) => (
                                    <TableRow key={store.id}>
                                        <TableCell>
                                            <div className="font-medium text-sm truncate max-w-[160px]" title={store.name}>{store.name}</div>
                                            <div className="text-xs text-muted-foreground">{store.routes?.name || "No Route"}</div>
                                        </TableCell>
                                        <TableCell className="font-bold text-red-600">₹{store.outstanding.toLocaleString()}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {store.last_payment_date ? formatDistanceToNow(new Date(store.last_payment_date), { addSuffix: true }) : <Badge variant="destructive" className="text-[10px]">Never</Badge>}
                                        </TableCell>
                                        <TableCell>
                                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate(`/stores/${store.id}`)}>
                                                <ArrowRight className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
          </Card>

          {/* Section 2: Dead Stock */}
          <Card className="col-span-1 border-l-4 border-l-slate-400 shadow-sm">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <PackageX className="h-5 w-5 text-slate-500" />
                            Slow Moving Inventory
                        </CardTitle>
                        <CardDescription>Unsold products in last 30 days</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigate("/inventory")}>
                        Manage
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="h-[350px]">
                    <Table>
                        <TableHeader className="bg-muted/40 sticky top-0 z-10">
                            <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>Stock</TableHead>
                                <TableHead>Value</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                             {d.deadStock.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Inventory is moving fast!</TableCell>
                                </TableRow>
                            ) : (
                                d.deadStock.map((prod) => (
                                    <TableRow key={prod.id}>
                                        <TableCell>
                                            <div className="font-medium text-sm">{prod.name}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary">{prod.stock}</Badge>
                                        </TableCell>
                                        <TableCell className="text-sm font-medium">
                                            ₹{prod.value.toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
          </Card>

          {/* Section 3: Inactive Customers (Bottom Full Width) */}
          <Card className="col-span-1 lg:col-span-2 border-l-4 border-l-amber-500 shadow-sm">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Clock className="h-5 w-5 text-amber-500" />
                            Inactive Accounts (Churn Risk)
                        </CardTitle>
                        <CardDescription>Stores with outstanding balances that haven't ordered recently</CardDescription>
                    </div>
                </div>
            </CardHeader>
             <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {d.churnRisk.slice(0, 6).map(store => (
                        <div key={store.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/stores/${store.id}`)}>
                            <div className="min-w-0">
                                <div className="font-medium text-sm truncate">{store.name}</div>
                                <div className="text-xs text-muted-foreground flex gap-2 mt-1">
                                    <span>Due: ₹{store.outstanding.toLocaleString()}</span>
                                    <span>•</span>
                                    <span>Last Order: {store.last_order_date ? formatDistanceToNow(new Date(store.last_order_date), { addSuffix: true }) : "N/A"}</span>
                                </div>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                    ))}
                    {d.churnRisk.length === 0 && (
                        <div className="col-span-3 text-center py-8 text-muted-foreground">
                            No inactive accounts with debt found. Use the "Outstanding" report for a full list.
                        </div>
                    )}
                </div>
            </CardContent>
          </Card>
      </div>
    </div>
  );
};

export default SmartInsightsReport;


