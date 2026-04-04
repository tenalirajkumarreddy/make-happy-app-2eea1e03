import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Package, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Search, History, RotateCcw } from "lucide-react";
import { format, subMonths, startOfMonth, eachDayOfInterval, eachWeekOfInterval, isSameDay, isSameWeek } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { ReportExportBar } from "./ReportExportBar";
import { ReportSummaryCards } from "./ReportSummaryCards";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface StockMovement {
  id: string;
  date: string;
  type: "sale" | "purchase" | "return" | "adjustment" | "transfer";
  direction: "in" | "out";
  product_id: string;
  product_name: string;
  quantity: number;
  warehouse_name: string;
  reference_id: string;
  notes?: string;
}

type GroupBy = "day" | "week";

export default function InventoryTimelineReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(subMonths(new Date(), 1)),
    to: new Date(),
  });
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out">("all");

  // Fetch sale items (stock out)
  const { data: saleItems = [], isLoading: saleLoading } = useQuery({
    queryKey: ["inventory-timeline-sales", dateRange],
    queryFn: async () => {
      // First get sales in date range
      const { data: salesInRange } = await supabase
        .from("sales")
        .select("id, display_id, created_at")
        .gte("created_at", format(dateRange.from, "yyyy-MM-dd"))
        .lte("created_at", format(dateRange.to, "yyyy-MM-dd") + "T23:59:59");
      
      if (!salesInRange || salesInRange.length === 0) return [];
      
      const saleIds = salesInRange.map((s: any) => s.id);
      
      const { data } = await supabase
        .from("sale_items")
        .select("id, product_id, quantity, sale_id, products(name)")
        .in("sale_id", saleIds);
      
      // Attach sale info
      return (data || []).map((si: any) => ({
        ...si,
        sales: salesInRange.find((s: any) => s.id === si.sale_id)
      }));
    },
  });

  // Fetch purchase items (stock in)
  const { data: purchaseItems = [], isLoading: purchLoading } = useQuery({
    queryKey: ["inventory-timeline-purchases", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_items")
        .select("id, item_type, item_id, quantity, purchases(display_id, purchase_date, warehouses(name)), products(name)")
        .eq("item_type", "product")
        .gte("purchases.purchase_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("purchases.purchase_date", format(dateRange.to, "yyyy-MM-dd"));
      return (data || []).filter((p: any) => p.purchases);
    },
  });

  // Fetch sale return items (stock in)
  const { data: saleReturnItems = [], isLoading: srLoading } = useQuery({
    queryKey: ["inventory-timeline-sale-returns", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("sale_return_items")
        .select("id, product_id, quantity, sale_returns(display_id, return_date, status), products(name)")
        .eq("sale_returns.status", "completed")
        .gte("sale_returns.return_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("sale_returns.return_date", format(dateRange.to, "yyyy-MM-dd"));
      return (data || []).filter((r: any) => r.sale_returns);
    },
  });

  // Fetch purchase return items (stock out)
  const { data: purchReturnItems = [], isLoading: prLoading } = useQuery({
    queryKey: ["inventory-timeline-purchase-returns", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_return_items")
        .select("id, item_type, item_id, quantity, purchase_returns(display_id, return_date, status), products(name)")
        .eq("purchase_returns.status", "completed")
        .eq("item_type", "product")
        .gte("purchase_returns.return_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("purchase_returns.return_date", format(dateRange.to, "yyyy-MM-dd"));
      return (data || []).filter((r: any) => r.purchase_returns);
    },
  });

  const isLoading = saleLoading || purchLoading || srLoading || prLoading;

  // Combine all movements
  const allMovements = useMemo(() => {
    const movements: StockMovement[] = [];

    // Sales (out)
    saleItems.forEach((si: any) => {
      movements.push({
        id: si.id,
        date: si.sales?.created_at ? format(new Date(si.sales.created_at), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
        type: "sale",
        direction: "out",
        product_id: si.product_id,
        product_name: si.products?.name || "Unknown",
        quantity: Number(si.quantity),
        warehouse_name: "Default",
        reference_id: si.sales?.display_id || "N/A",
      });
    });

    // Purchases (in)
    purchaseItems.forEach((pi: any) => {
      movements.push({
        id: pi.id,
        date: pi.purchases.purchase_date,
        type: "purchase",
        direction: "in",
        product_id: pi.item_id,
        product_name: pi.products?.name || "Unknown",
        quantity: Number(pi.quantity),
        warehouse_name: pi.purchases.warehouses?.name || "Default",
        reference_id: pi.purchases.display_id,
      });
    });

    // Sale returns (in)
    saleReturnItems.forEach((sri: any) => {
      movements.push({
        id: sri.id,
        date: sri.sale_returns.return_date,
        type: "return",
        direction: "in",
        product_id: sri.product_id,
        product_name: sri.products?.name || "Unknown",
        quantity: Number(sri.quantity),
        warehouse_name: "Default",
        reference_id: sri.sale_returns.display_id,
      });
    });

    // Purchase returns (out)
    purchReturnItems.forEach((pri: any) => {
      movements.push({
        id: pri.id,
        date: pri.purchase_returns.return_date,
        type: "return",
        direction: "out",
        product_id: pri.item_id,
        product_name: pri.products?.name || "Unknown",
        quantity: Number(pri.quantity),
        warehouse_name: "Default",
        reference_id: pri.purchase_returns.display_id,
      });
    });

    return movements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [saleItems, purchaseItems, saleReturnItems, purchReturnItems]);

  // Filter movements
  const filteredMovements = useMemo(() => {
    let filtered = allMovements;

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(m => 
        m.product_name.toLowerCase().includes(s) ||
        m.reference_id.toLowerCase().includes(s)
      );
    }

    if (typeFilter === "in") {
      filtered = filtered.filter(m => m.direction === "in");
    } else if (typeFilter === "out") {
      filtered = filtered.filter(m => m.direction === "out");
    }

    return filtered;
  }, [allMovements, search, typeFilter]);

  // Summary
  const summary = useMemo(() => {
    const totalIn = filteredMovements.filter(m => m.direction === "in").reduce((sum, m) => sum + m.quantity, 0);
    const totalOut = filteredMovements.filter(m => m.direction === "out").reduce((sum, m) => sum + m.quantity, 0);
    const netChange = totalIn - totalOut;
    const totalMovements = filteredMovements.length;
    const uniqueProducts = new Set(filteredMovements.map(m => m.product_id)).size;

    return { totalIn, totalOut, netChange, totalMovements, uniqueProducts };
  }, [filteredMovements]);

  // Time series data
  const timeSeriesData = useMemo(() => {
    const intervals = groupBy === "week" 
      ? eachWeekOfInterval({ start: dateRange.from, end: dateRange.to })
      : eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    
    const isSamePeriod = groupBy === "week" ? isSameWeek : isSameDay;
    const formatStr = groupBy === "week" ? "MMM d" : "MMM d";

    return intervals.map(date => {
      const periodMovements = filteredMovements.filter(m => isSamePeriod(new Date(m.date), date));
      const stockIn = periodMovements.filter(m => m.direction === "in").reduce((sum, m) => sum + m.quantity, 0);
      const stockOut = periodMovements.filter(m => m.direction === "out").reduce((sum, m) => sum + m.quantity, 0);

      return {
        date: format(date, formatStr),
        stockIn,
        stockOut,
        net: stockIn - stockOut,
      };
    });
  }, [filteredMovements, dateRange, groupBy]);

  // Movement type breakdown
  const typeBreakdown = useMemo(() => {
    const byType: Record<string, { in: number; out: number }> = {};
    
    filteredMovements.forEach(m => {
      const key = m.type;
      if (!byType[key]) byType[key] = { in: 0, out: 0 };
      if (m.direction === "in") {
        byType[key].in += m.quantity;
      } else {
        byType[key].out += m.quantity;
      }
    });

    return Object.entries(byType).map(([type, data]) => ({
      type: type.charAt(0).toUpperCase() + type.slice(1),
      in: data.in,
      out: data.out,
    }));
  }, [filteredMovements]);

  const summaryCards = [
    { label: "Stock In", value: summary.totalIn.toLocaleString(), icon: ArrowUpRight, iconColor: "green" as const },
    { label: "Stock Out", value: summary.totalOut.toLocaleString(), icon: ArrowDownRight, iconColor: "red" as const },
    { label: "Net Change", value: (summary.netChange >= 0 ? "+" : "") + summary.netChange.toLocaleString(), icon: summary.netChange >= 0 ? TrendingUp : TrendingDown, iconColor: summary.netChange >= 0 ? "blue" as const : "yellow" as const },
    { label: "Products Moved", value: summary.uniqueProducts.toString(), icon: Package, iconColor: "purple" as const },
  ];

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Inventory Timeline Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`, 14, 23);

    autoTable(doc, {
      startY: 30,
      head: [["Date", "Type", "Direction", "Product", "Quantity", "Reference"]],
      body: filteredMovements.slice(0, 200).map(m => [
        format(new Date(m.date), "dd/MM/yy"),
        m.type,
        m.direction.toUpperCase(),
        m.product_name,
        m.quantity.toString(),
        m.reference_id,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`inventory-timeline-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.pdf`);
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredMovements.map(m => ({
      "Date": m.date,
      "Type": m.type,
      "Direction": m.direction,
      "Product": m.product_name,
      "Quantity": m.quantity,
      "Warehouse": m.warehouse_name,
      "Reference": m.reference_id,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movements");
    XLSX.writeFile(wb, `inventory-timeline-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.xlsx`);
  };

  return (
    <div className="space-y-6">
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
            variant={groupBy === "day" ? "default" : "outline"} 
            className="cursor-pointer"
            onClick={() => setGroupBy("day")}
          >
            Daily
          </Badge>
          <Badge 
            variant={groupBy === "week" ? "default" : "outline"} 
            className="cursor-pointer"
            onClick={() => setGroupBy("week")}
          >
            Weekly
          </Badge>
        </div>
        <div className="flex gap-2">
          <Badge 
            variant={typeFilter === "all" ? "default" : "outline"} 
            className="cursor-pointer"
            onClick={() => setTypeFilter("all")}
          >
            All
          </Badge>
          <Badge 
            variant={typeFilter === "in" ? "default" : "outline"} 
            className="cursor-pointer"
            onClick={() => setTypeFilter("in")}
          >
            <ArrowUpRight className="h-3 w-3 mr-1" />In
          </Badge>
          <Badge 
            variant={typeFilter === "out" ? "default" : "outline"} 
            className="cursor-pointer"
            onClick={() => setTypeFilter("out")}
          >
            <ArrowDownRight className="h-3 w-3 mr-1" />Out
          </Badge>
        </div>
      </div>

      <ReportExportBar onExportPDF={exportPDF} onExportExcel={exportExcel} />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <ReportSummaryCards cards={summaryCards} />

          {/* Timeline Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stock Movement Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={Math.floor(timeSeriesData.length / 10)} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="stockIn" name="Stock In" stroke="#10b981" fill="#10b98133" stackId="1" />
                  <Area type="monotone" dataKey="stockOut" name="Stock Out" stroke="#ef4444" fill="#ef444433" stackId="2" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Type Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Movement by Type</CardTitle>
            </CardHeader>
            <CardContent>
              {typeBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={typeBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="type" width={80} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="in" name="Stock In" fill="#10b981" />
                    <Bar dataKey="out" name="Stock Out" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-8">No movement data</p>
              )}
            </CardContent>
          </Card>

          {/* Movement List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Movements ({filteredMovements.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredMovements.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No stock movements found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-left p-3 font-medium">Product</th>
                        <th className="text-center p-3 font-medium">Type</th>
                        <th className="text-right p-3 font-medium">Quantity</th>
                        <th className="text-left p-3 font-medium hidden md:table-cell">Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMovements.slice(0, 100).map((m) => (
                        <tr key={m.id + m.type} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-muted-foreground text-xs">
                            {format(new Date(m.date), "dd/MM/yy")}
                          </td>
                          <td className="p-3 font-medium">{m.product_name}</td>
                          <td className="p-3 text-center">
                            <Badge variant={m.direction === "in" ? "default" : "secondary"} className="text-xs">
                              {m.direction === "in" ? (
                                <ArrowUpRight className="h-3 w-3 mr-1" />
                              ) : (
                                <ArrowDownRight className="h-3 w-3 mr-1" />
                              )}
                              {m.type}
                            </Badge>
                          </td>
                          <td className="p-3 text-right">
                            <span className={m.direction === "in" ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                              {m.direction === "in" ? "+" : "-"}{m.quantity}
                            </span>
                          </td>
                          <td className="p-3 hidden md:table-cell text-muted-foreground font-mono text-xs">
                            {m.reference_id}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {filteredMovements.length > 100 && (
                <p className="text-center text-muted-foreground mt-4 text-sm">
                  Showing 100 of {filteredMovements.length} movements. Export to see all.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
