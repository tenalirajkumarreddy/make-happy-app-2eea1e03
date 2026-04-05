import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, DollarSign, Search, History } from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";
import * as XLSX from "xlsx";
import { ReportContainer, ReportKPICard } from "@/components/reports/ReportContainer";

interface PriceChange {
  id: string;
  product_id: string;
  product_name: string;
  product_display_id: string;
  old_mrp: number;
  new_mrp: number;
  old_gst_rate: number;
  new_gst_rate: number;
  price_change: number;
  price_change_percent: number;
  changed_by_name: string;
  reason: string;
  changed_at: string;
}

export default function PriceChangeReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(subMonths(new Date(), 3)),
    to: new Date(),
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "increased" | "decreased">("all");
  const { data: companySettings } = useCompanySettings();

  // Fetch price change history
  const { data: priceChanges = [], isLoading } = useQuery({
    queryKey: ["price-change-history", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("price_change_history")
        .select(`
          id,
          product_id,
          old_mrp,
          new_mrp,
          old_gst_rate,
          new_gst_rate,
          reason,
          changed_at,
          products(name, display_id),
          profiles:changed_by(full_name)
        `)
        .gte("changed_at", format(dateRange.from, "yyyy-MM-dd"))
        .lte("changed_at", format(dateRange.to, "yyyy-MM-dd") + "T23:59:59")
        .order("changed_at", { ascending: false });
      
      return (data || []).map((pc: any) => ({
        id: pc.id,
        product_id: pc.product_id,
        product_name: pc.products?.name || "Unknown",
        product_display_id: pc.products?.display_id || "",
        old_mrp: Number(pc.old_mrp),
        new_mrp: Number(pc.new_mrp),
        old_gst_rate: Number(pc.old_gst_rate || 0),
        new_gst_rate: Number(pc.new_gst_rate || 0),
        price_change: Number(pc.new_mrp) - Number(pc.old_mrp),
        price_change_percent: Number(pc.old_mrp) > 0 
          ? ((Number(pc.new_mrp) - Number(pc.old_mrp)) / Number(pc.old_mrp)) * 100 
          : 0,
        changed_by_name: pc.profiles?.full_name || "System",
        reason: pc.reason || "",
        changed_at: pc.changed_at,
      }));
    },
  });

  // Filter and search
  const filteredChanges = useMemo(() => {
    let filtered = priceChanges;

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter((pc: PriceChange) =>
        pc.product_name.toLowerCase().includes(s) ||
        pc.product_display_id.toLowerCase().includes(s) ||
        pc.reason?.toLowerCase().includes(s)
      );
    }

    if (filter === "increased") {
      filtered = filtered.filter((pc: PriceChange) => pc.price_change > 0);
    } else if (filter === "decreased") {
      filtered = filtered.filter((pc: PriceChange) => pc.price_change < 0);
    }

    return filtered;
  }, [priceChanges, search, filter]);

  // Summary
  const summary = useMemo(() => {
    const totalChanges = filteredChanges.length;
    const increases = filteredChanges.filter((pc: PriceChange) => pc.price_change > 0);
    const decreases = filteredChanges.filter((pc: PriceChange) => pc.price_change < 0);
    
    const avgIncrease = increases.length > 0 
      ? increases.reduce((sum, pc) => sum + pc.price_change_percent, 0) / increases.length 
      : 0;
    const avgDecrease = decreases.length > 0 
      ? Math.abs(decreases.reduce((sum, pc) => sum + pc.price_change_percent, 0) / decreases.length)
      : 0;

    // Unique products changed
    const uniqueProducts = new Set(filteredChanges.map((pc: PriceChange) => pc.product_id)).size;

    return {
      totalChanges,
      increases: increases.length,
      decreases: decreases.length,
      avgIncrease,
      avgDecrease,
      uniqueProducts,
    };
  }, [filteredChanges]);

  // Price change trend by day
  const trendData = useMemo(() => {
    const byDate: Record<string, { date: string; increases: number; decreases: number }> = {};

    filteredChanges.forEach((pc: PriceChange) => {
      const date = format(new Date(pc.changed_at), "MMM d");
      if (!byDate[date]) {
        byDate[date] = { date, increases: 0, decreases: 0 };
      }
      if (pc.price_change > 0) {
        byDate[date].increases++;
      } else if (pc.price_change < 0) {
        byDate[date].decreases++;
      }
    });

    return Object.values(byDate).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [filteredChanges]);

  const summaryCards = [
    { label: "Total Changes", value: summary.totalChanges.toString(), icon: History, iconColor: "blue" as const },
    { label: "Price Increases", value: summary.increases.toString(), icon: TrendingUp, iconColor: "green" as const },
    { label: "Price Decreases", value: summary.decreases.toString(), icon: TrendingDown, iconColor: "red" as const },
    { label: "Products Affected", value: summary.uniqueProducts.toString(), icon: DollarSign, iconColor: "yellow" as const },
  ];

  const handlePrintHTML = () => {
    if (!companySettings) return "";
    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-label">Total Changes</div><div class="kpi-value">${summary.totalChanges}</div></div>
        <div class="kpi-card"><div class="kpi-label">Increases</div><div class="kpi-value text-pos">${summary.increases}</div></div>
        <div class="kpi-card"><div class="kpi-label">Decreases</div><div class="kpi-value text-neg">${summary.decreases}</div></div>
        <div class="kpi-card"><div class="kpi-label">Products Affected</div><div class="kpi-value">${summary.uniqueProducts}</div></div>
      </div>
      <div class="kpi-row">
        <div class="kpi-card highlight"><div class="kpi-label">Avg Increase</div><div class="kpi-value text-pos">+${summary.avgIncrease.toFixed(1)}%</div></div>
        <div class="kpi-card"><div class="kpi-label">Avg Decrease</div><div class="kpi-value text-neg">-${summary.avgDecrease.toFixed(1)}%</div></div>
      </div>

      <h2>Price Change History</h2>
      <table>
        <thead><tr><th>Date</th><th>Product</th><th class="text-right">Old Price</th><th class="text-right">New Price</th><th class="text-right">Change %</th><th>Changed By</th><th>Reason</th></tr></thead>
        <tbody>
          ${filteredChanges.map((pc: PriceChange) => `
            <tr>
              <td>${format(new Date(pc.changed_at), "dd/MM/yy HH:mm")}</td>
              <td class="font-semibold">${pc.product_name}</td>
              <td class="text-right">₹${pc.old_mrp.toLocaleString()}</td>
              <td class="text-right font-semibold">₹${pc.new_mrp.toLocaleString()}</td>
              <td class="text-right ${pc.price_change > 0 ? 'text-pos' : 'text-neg'}">${pc.price_change_percent.toFixed(1)}%</td>
              <td>${pc.changed_by_name}</td>
              <td>${pc.reason || '—'}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    return generatePrintHTML({
      title: "Price Change Report",
      dateRange: `${format(dateRange.from, "MMM d, yyyy")} — ${format(dateRange.to, "MMM d, yyyy")}`,
      metadata: { "Changes": `${summary.totalChanges}`, "Increases": `${summary.increases}`, "Decreases": `${summary.decreases}` },
      companyInfo: companySettings,
      htmlContent,
    });
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredChanges.map((pc: PriceChange) => ({
      "Date": format(new Date(pc.changed_at), "yyyy-MM-dd HH:mm"),
      "Product ID": pc.product_display_id,
      "Product Name": pc.product_name,
      "Old MRP": pc.old_mrp,
      "New MRP": pc.new_mrp,
      "Price Change": pc.price_change,
      "Change %": pc.price_change_percent.toFixed(2),
      "Old GST Rate": pc.old_gst_rate,
      "New GST Rate": pc.new_gst_rate,
      "Changed By": pc.changed_by_name,
      "Reason": pc.reason,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Price Changes");
    XLSX.writeFile(wb, `price-change-report-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.xlsx`);
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
          variant={filter === "all" ? "default" : "outline"} 
          className="cursor-pointer"
          onClick={() => setFilter("all")}
        >
          All
        </Badge>
        <Badge 
          variant={filter === "increased" ? "default" : "outline"} 
          className="cursor-pointer"
          onClick={() => setFilter("increased")}
        >
          <ArrowUpRight className="h-3 w-3 mr-1" />
          Increased
        </Badge>
        <Badge 
          variant={filter === "decreased" ? "default" : "outline"} 
          className="cursor-pointer"
          onClick={() => setFilter("decreased")}
        >
          <ArrowDownRight className="h-3 w-3 mr-1" />
          Decreased
        </Badge>
      </div>
    </div>
  );

  const summaryCardsSection = (
    <>
      <ReportKPICard
        label="Total Changes"
        value={summary.totalChanges.toString()}
        icon={History}
      />
      <ReportKPICard
        label="Price Increases"
        value={summary.increases.toString()}
        icon={TrendingUp}
        trend="up"
      />
      <ReportKPICard
        label="Price Decreases"
        value={summary.decreases.toString()}
        icon={TrendingDown}
        trend="down"
      />
      <ReportKPICard
        label="Products Affected"
        value={summary.uniqueProducts.toString()}
        icon={DollarSign}
      />
    </>
  );

  return (
    <ReportContainer
      title="Price Change Report"
      subtitle="Historical product price modifications"
      icon={History}
      dateRange={`${format(dateRange.from, "MMM d, yyyy")} — ${format(dateRange.to, "MMM d, yyyy")}`}
      onPrint={handlePrintHTML}
      onExportExcel={exportExcel}
      isLoading={isLoading}
      filters={filtersSection}
      summaryCards={summaryCardsSection}
    >
      {/* Trend Chart */}
      {trendData.length > 1 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Price Change Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="increases" name="Increases" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="decreases" name="Decreases" stroke="#ef4444" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Average Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-green-100">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Average Price Increase</p>
                <p className="text-2xl font-bold text-green-600">+{summary.avgIncrease.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-red-100">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Average Price Decrease</p>
                <p className="text-2xl font-bold text-red-600">-{summary.avgDecrease.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Price Change List */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Price Change History ({filteredChanges.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredChanges.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No price changes found for the selected period</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-xs">Date</th>
                    <th className="text-left p-3 font-semibold text-xs">Product</th>
                    <th className="text-right p-3 font-semibold text-xs">Old Price</th>
                    <th className="text-right p-3 font-semibold text-xs">New Price</th>
                    <th className="text-right p-3 font-semibold text-xs">Change</th>
                    <th className="text-left p-3 font-semibold text-xs hidden md:table-cell">Changed By</th>
                    <th className="text-left p-3 font-semibold text-xs hidden lg:table-cell">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredChanges.slice(0, 100).map((pc: PriceChange) => (
                    <tr key={pc.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 text-muted-foreground text-xs">
                        {format(new Date(pc.changed_at), "dd/MM/yy HH:mm")}
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-sm">{pc.product_name}</p>
                        <p className="text-xs text-muted-foreground">{pc.product_display_id}</p>
                      </td>
                      <td className="p-3 text-right">₹{pc.old_mrp.toLocaleString()}</td>
                      <td className="p-3 text-right font-medium">₹{pc.new_mrp.toLocaleString()}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {pc.price_change > 0 ? (
                            <ArrowUpRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-red-600" />
                          )}
                          <span className={pc.price_change > 0 ? "text-green-600" : "text-red-600"}>
                            {pc.price_change_percent.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground">{pc.changed_by_name}</td>
                      <td className="p-3 hidden lg:table-cell text-muted-foreground truncate max-w-[200px]">
                        {pc.reason || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filteredChanges.length > 100 && (
            <p className="text-center text-muted-foreground py-4 text-sm">
              Showing 100 of {filteredChanges.length} changes. Export to see all.
            </p>
          )}
        </CardContent>
      </Card>
    </ReportContainer>
  );
}
