import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Package, TrendingUp, TrendingDown, DollarSign, Search, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";
import * as XLSX from "xlsx";
import { ReportContainer, ReportKPICard } from "@/components/reports/ReportContainer";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

interface ProductPL {
  id: string;
  name: string;
  display_id: string;
  category: string;
  mrp: number;
  gst_rate: number;
  quantitySold: number;
  revenue: number;
  costPrice: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  quantityReturned: number;
  returnValue: number;
  netProfit: number;
}

export default function ItemWisePLReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(subMonths(new Date(), 1)),
    to: new Date(),
  });
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"revenue" | "profit" | "margin">("profit");
  const { data: companySettings } = useCompanySettings();

  // Fetch products
  const { data: products = [], isLoading: prodLoading } = useQuery({
    queryKey: ["itemwise-pl-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, display_id, mrp, gst_rate, product_categories(name)")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  // Fetch sale items in date range
  const { data: saleItems = [], isLoading: saleLoading } = useQuery({
    queryKey: ["itemwise-pl-sales", dateRange],
    queryFn: async () => {
      // First get sales in date range
      const { data: salesInRange } = await supabase
        .from("sales")
        .select("id")
        .gte("created_at", format(dateRange.from, "yyyy-MM-dd"))
        .lte("created_at", format(dateRange.to, "yyyy-MM-dd") + "T23:59:59");
      
      if (!salesInRange || salesInRange.length === 0) return [];
      
      const saleIds = salesInRange.map((s: any) => s.id);
      
      const { data } = await supabase
        .from("sale_items")
        .select("id, product_id, quantity, unit_price, total, sale_id")
        .in("sale_id", saleIds);
      return data || [];
    },
  });

  // Fetch purchase items for cost calculation
  const { data: purchaseItems = [], isLoading: purchLoading } = useQuery({
    queryKey: ["itemwise-pl-purchases", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_items")
        .select("id, item_type, item_id, quantity, unit_price, total, purchases(purchase_date)")
        .eq("item_type", "product")
        .gte("purchases.purchase_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("purchases.purchase_date", format(dateRange.to, "yyyy-MM-dd"));
      return (data || []).filter((p: any) => p.purchases);
    },
  });

  // Fetch sale returns
  const { data: returnItems = [], isLoading: retLoading } = useQuery({
    queryKey: ["itemwise-pl-returns", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("sale_return_items")
        .select("id, product_id, quantity, unit_price, total, sale_returns(return_date, status)")
        .eq("sale_returns.status", "completed")
        .gte("sale_returns.return_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("sale_returns.return_date", format(dateRange.to, "yyyy-MM-dd"));
      return (data || []).filter((r: any) => r.sale_returns);
    },
  });

  const isLoading = prodLoading || saleLoading || purchLoading || retLoading;

  // Calculate item-wise P&L
  const productPL = useMemo(() => {
    // Calculate average cost price per product
    const costTracker: Record<string, { total: number; qty: number }> = {};
    purchaseItems.forEach((pi: any) => {
      if (pi.item_id) {
        if (!costTracker[pi.item_id]) {
          costTracker[pi.item_id] = { total: 0, qty: 0 };
        }
        costTracker[pi.item_id].total += Number(pi.total);
        costTracker[pi.item_id].qty += Number(pi.quantity);
      }
    });

    return products.map((p: any) => {
      // Sales data
      const productSales = saleItems.filter((si: any) => si.product_id === p.id);
      const quantitySold = productSales.reduce((sum: number, si: any) => sum + Number(si.quantity), 0);
      const revenue = productSales.reduce((sum: number, si: any) => sum + Number(si.total), 0);

      // Cost data - use purchase avg or estimate from MRP
      const avgCostData = costTracker[p.id];
      const costPrice = avgCostData 
        ? avgCostData.total / avgCostData.qty 
        : Number(p.mrp) * 0.7; // Estimate 30% margin if no purchase data
      const cogs = quantitySold * costPrice;

      // Returns
      const productReturns = returnItems.filter((ri: any) => ri.product_id === p.id);
      const quantityReturned = productReturns.reduce((sum: number, ri: any) => sum + Number(ri.quantity), 0);
      const returnValue = productReturns.reduce((sum: number, ri: any) => sum + Number(ri.total), 0);

      // Profit calculations
      const grossProfit = revenue - cogs;
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
      const netProfit = grossProfit - returnValue;

      return {
        id: p.id,
        name: p.name,
        display_id: p.display_id,
        category: p.product_categories?.name || "Uncategorized",
        mrp: Number(p.mrp),
        gst_rate: Number(p.gst_rate),
        quantitySold,
        revenue,
        costPrice,
        cogs,
        grossProfit,
        grossMargin,
        quantityReturned,
        returnValue,
        netProfit,
      };
    }).filter((p: ProductPL) => p.quantitySold > 0 || p.quantityReturned > 0);
  }, [products, saleItems, purchaseItems, returnItems]);

  // Filter and sort
  const filteredProducts = useMemo(() => {
    let filtered = productPL;
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter((p: ProductPL) => 
        p.name.toLowerCase().includes(s) || 
        p.display_id?.toLowerCase().includes(s) ||
        p.category.toLowerCase().includes(s)
      );
    }

    // Sort
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "revenue": return b.revenue - a.revenue;
        case "profit": return b.netProfit - a.netProfit;
        case "margin": return b.grossMargin - a.grossMargin;
        default: return 0;
      }
    });
  }, [productPL, search, sortBy]);

  // Summary
  const summary = useMemo(() => {
    const totalRevenue = filteredProducts.reduce((sum, p) => sum + p.revenue, 0);
    const totalCOGS = filteredProducts.reduce((sum, p) => sum + p.cogs, 0);
    const totalGrossProfit = filteredProducts.reduce((sum, p) => sum + p.grossProfit, 0);
    const totalReturns = filteredProducts.reduce((sum, p) => sum + p.returnValue, 0);
    const totalNetProfit = filteredProducts.reduce((sum, p) => sum + p.netProfit, 0);
    const avgMargin = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

    return { totalRevenue, totalCOGS, totalGrossProfit, totalReturns, totalNetProfit, avgMargin };
  }, [filteredProducts]);

  // Charts
  const topProfitChart = useMemo(() => {
    return [...filteredProducts]
      .sort((a, b) => b.netProfit - a.netProfit)
      .slice(0, 10)
      .map(p => ({
        name: p.name.length > 15 ? p.name.substring(0, 15) + "..." : p.name,
        profit: p.netProfit,
        revenue: p.revenue,
      }));
  }, [filteredProducts]);

  const categoryProfitChart = useMemo(() => {
    const byCategory: Record<string, number> = {};
    filteredProducts.forEach(p => {
      byCategory[p.category] = (byCategory[p.category] || 0) + p.netProfit;
    });
    return Object.entries(byCategory)
      .filter(([_, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));
  }, [filteredProducts]);

  const summaryCards = [
    { label: "Total Revenue", value: `₹${summary.totalRevenue.toLocaleString()}`, icon: DollarSign, iconColor: "blue" },
    { label: "Total COGS", value: `₹${summary.totalCOGS.toLocaleString()}`, icon: Package, iconColor: "yellow" },
    { label: "Gross Profit", value: `₹${summary.totalGrossProfit.toLocaleString()}`, icon: TrendingUp, iconColor: "green" },
    { label: "Avg Margin", value: `${summary.avgMargin.toFixed(1)}%`, icon: summary.avgMargin > 20 ? ArrowUpRight : ArrowDownRight, iconColor: summary.avgMargin > 20 ? "green" : "red" },
  ];

  const handlePrintHTML = () => {
    if (!companySettings) return "";
    const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-label">Revenue</div><div class="kpi-value">${fmt(summary.totalRevenue)}</div></div>
        <div class="kpi-card"><div class="kpi-label">COGS</div><div class="kpi-value">${fmt(summary.totalCOGS)}</div></div>
        <div class="kpi-card highlight"><div class="kpi-label">Net Profit</div><div class="kpi-value text-pos">${fmt(summary.totalNetProfit)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Avg Margin</div><div class="kpi-value">${summary.avgMargin.toFixed(1)}%</div></div>
      </div>

      <h2>Item-wise Profit & Loss (${filteredProducts.length} items)</h2>
      <table>
        <thead><tr><th>#</th><th>Product</th><th>Category</th><th class="text-right">Qty</th><th class="text-right">Revenue</th><th class="text-right">COGS</th><th class="text-right">Profit</th><th class="text-right">Margin</th></tr></thead>
        <tbody>
          ${filteredProducts.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="font-semibold">${p.name}</td>
              <td>${p.category}</td>
              <td class="text-right">${p.quantitySold}</td>
              <td class="text-right">${fmt(p.revenue)}</td>
              <td class="text-right">${fmt(p.cogs)}</td>
              <td class="text-right font-semibold ${p.netProfit >= 0 ? 'text-pos' : 'text-neg'}">${fmt(p.netProfit)}</td>
              <td class="text-right">${p.grossMargin.toFixed(1)}%</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr style="background:var(--accent);color:white;font-weight:700;">
            <td colspan="3">TOTAL</td>
            <td class="text-right">${filteredProducts.reduce((s, p) => s + p.quantitySold, 0)}</td>
            <td class="text-right">${fmt(summary.totalRevenue)}</td>
            <td class="text-right">${fmt(summary.totalCOGS)}</td>
            <td class="text-right">${fmt(summary.totalNetProfit)}</td>
            <td class="text-right">${summary.avgMargin.toFixed(1)}%</td>
          </tr>
        </tfoot>
      </table>
    `;
    return generatePrintHTML({
      title: "Item-wise Profit & Loss Report",
      dateRange: `${format(dateRange.from, "MMM d, yyyy")} — ${format(dateRange.to, "MMM d, yyyy")}`,
      metadata: { "Revenue": fmt(summary.totalRevenue), "Profit": fmt(summary.totalNetProfit), "Margin": `${summary.avgMargin.toFixed(1)}%` },
      companyInfo: companySettings,
      htmlContent,
    });
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredProducts.map(p => ({
      "Product ID": p.display_id,
      "Product Name": p.name,
      "Category": p.category,
      "MRP": p.mrp,
      "GST Rate": p.gst_rate,
      "Qty Sold": p.quantitySold,
      "Revenue": p.revenue,
      "Cost Price": p.costPrice.toFixed(2),
      "COGS": p.cogs,
      "Gross Profit": p.grossProfit,
      "Gross Margin %": p.grossMargin.toFixed(2),
      "Qty Returned": p.quantityReturned,
      "Return Value": p.returnValue,
      "Net Profit": p.netProfit,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Item P&L");
    XLSX.writeFile(wb, `item-pl-report-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.xlsx`);
  };

  const filtersSection = (
    <div className="flex flex-col lg:flex-row lg:items-end gap-4">
      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} />
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="flex gap-2">
        <Badge 
          variant={sortBy === "profit" ? "default" : "outline"} 
          className="cursor-pointer"
          onClick={() => setSortBy("profit")}
        >
          By Profit
        </Badge>
        <Badge 
          variant={sortBy === "revenue" ? "default" : "outline"} 
          className="cursor-pointer"
          onClick={() => setSortBy("revenue")}
        >
          By Revenue
        </Badge>
        <Badge 
          variant={sortBy === "margin" ? "default" : "outline"} 
          className="cursor-pointer"
          onClick={() => setSortBy("margin")}
        >
          By Margin
        </Badge>
      </div>
    </div>
  );

  const summaryCardsSection = (
    <>
      <ReportKPICard
        label="Total Revenue"
        value={`₹${summary.totalRevenue.toLocaleString()}`}
        icon={DollarSign}
      />
      <ReportKPICard
        label="Cost of Goods"
        value={`₹${summary.totalCOGS.toLocaleString()}`}
        icon={Package}
      />
      <ReportKPICard
        label="Net Profit"
        value={`₹${summary.totalNetProfit.toLocaleString()}`}
        icon={TrendingUp}
        trend={summary.totalNetProfit >= 0 ? "up" : "down"}
        highlight
      />
      <ReportKPICard
        label="Avg Margin"
        value={`${summary.avgMargin.toFixed(1)}%`}
        icon={summary.avgMargin > 20 ? ArrowUpRight : ArrowDownRight}
        trend={summary.avgMargin > 20 ? "up" : "down"}
      />
    </>
  );

  return (
    <ReportContainer
      title="Item-wise P&L"
      subtitle="Product-level profit and loss analysis"
      icon={Package}
      dateRange={`${format(dateRange.from, "MMM d, yyyy")} — ${format(dateRange.to, "MMM d, yyyy")}`}
      onPrint={handlePrintHTML}
      onExportExcel={exportExcel}
      isLoading={isLoading}
      filters={filtersSection}
      summaryCards={summaryCardsSection}
    >
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Products by Profit</CardTitle>
          </CardHeader>
          <CardContent>
            {topProfitChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topProfitChart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="profit" name="Net Profit" fill="#10b981" />
                  <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">No data available</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Profit by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryProfitChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={categoryProfitChart}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {categoryProfitChart.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">No category data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Product Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Product Details ({filteredProducts.length} items)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-semibold text-xs">Product</th>
                  <th className="text-left p-3 font-semibold text-xs hidden md:table-cell">Category</th>
                  <th className="text-right p-3 font-semibold text-xs">Qty</th>
                  <th className="text-right p-3 font-semibold text-xs">Revenue</th>
                  <th className="text-right p-3 font-semibold text-xs hidden lg:table-cell">COGS</th>
                  <th className="text-right p-3 font-semibold text-xs">Profit</th>
                  <th className="text-right p-3 font-semibold text-xs">Margin</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.slice(0, 50).map((p) => (
                  <tr key={p.id} className="border-b hover:bg-muted/30">
                    <td className="p-3">
                      <p className="font-medium text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.display_id}</p>
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">{p.category}</td>
                    <td className="p-3 text-right">{p.quantitySold}</td>
                    <td className="p-3 text-right font-medium">₹{p.revenue.toLocaleString()}</td>
                    <td className="p-3 text-right hidden lg:table-cell text-muted-foreground">₹{p.cogs.toLocaleString()}</td>
                    <td className="p-3 text-right">
                      <span className={p.netProfit >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                        ₹{p.netProfit.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <Badge variant={p.grossMargin >= 25 ? "default" : p.grossMargin >= 15 ? "secondary" : "destructive"}>
                        {p.grossMargin.toFixed(1)}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/50 font-semibold">
                <tr>
                  <td className="p-3">TOTAL</td>
                  <td className="p-3 hidden md:table-cell"></td>
                  <td className="p-3 text-right">{filteredProducts.reduce((s, p) => s + p.quantitySold, 0)}</td>
                  <td className="p-3 text-right">₹{summary.totalRevenue.toLocaleString()}</td>
                  <td className="p-3 text-right hidden lg:table-cell">₹{summary.totalCOGS.toLocaleString()}</td>
                  <td className="p-3 text-right text-green-600">₹{summary.totalNetProfit.toLocaleString()}</td>
                  <td className="p-3 text-right">{summary.avgMargin.toFixed(1)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {filteredProducts.length > 50 && (
            <p className="text-center text-muted-foreground py-4 text-sm">
              Showing 50 of {filteredProducts.length} products. Export to see all.
            </p>
          )}
        </CardContent>
      </Card>
    </ReportContainer>
  );
}
