import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, ShoppingCart, DollarSign, TrendingUp, Package, Search, RotateCcw, AlertCircle } from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { ReportExportBar } from "./ReportExportBar";
import { ReportSummaryCards } from "./ReportSummaryCards";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface SaleReturnData {
  id: string;
  display_id: string;
  customer_name: string;
  store_name: string;
  return_date: string;
  total_amount: number;
  status: string;
  reason: string;
  items_count: number;
}

interface SalesReportData {
  total_sales: number;
  total_returns: number;
  net_sales: number;
  return_rate: number;
  total_transactions: number;
  total_return_transactions: number;
}

export default function SalesReturnReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(subMonths(new Date(), 3)),
    to: new Date(),
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "completed" | "rejected">("all");

  // Fetch sale returns
  const { data: saleReturns = [], isLoading: srLoading } = useQuery({
    queryKey: ["sales-return-report", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("sale_returns")
        .select(`
          id, display_id, return_date, total_amount, status, reason,
          customers(name),
          stores(name),
          sale_return_items(id)
        `)
        .gte("return_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("return_date", format(dateRange.to, "yyyy-MM-dd"))
        .order("return_date", { ascending: false });
      
      return (data || []).map((sr: any) => ({
        id: sr.id,
        display_id: sr.display_id,
        customer_name: sr.customers?.name || "Unknown",
        store_name: sr.stores?.name || "Direct",
        return_date: sr.return_date,
        total_amount: Number(sr.total_amount),
        status: sr.status,
        reason: sr.reason || "",
        items_count: sr.sale_return_items?.length || 0,
      }));
    },
  });

  // Fetch sales for comparison
  const { data: sales = [], isLoading: salesLoading } = useQuery({
    queryKey: ["sales-return-report-sales", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, total_amount, created_at")
        .gte("created_at", format(dateRange.from, "yyyy-MM-dd"))
        .lte("created_at", format(dateRange.to, "yyyy-MM-dd"));
      return data || [];
    },
  });

  const isLoading = srLoading || salesLoading;

  // Filter
  const filteredReturns = useMemo(() => {
    let filtered = saleReturns;
    
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter((r: SaleReturnData) =>
        r.customer_name.toLowerCase().includes(s) ||
        r.store_name.toLowerCase().includes(s) ||
        r.display_id.toLowerCase().includes(s) ||
        r.reason.toLowerCase().includes(s)
      );
    }
    
    if (statusFilter !== "all") {
      filtered = filtered.filter((r: SaleReturnData) => r.status === statusFilter);
    }
    
    return filtered;
  }, [saleReturns, search, statusFilter]);

  // Summary
  const summary = useMemo((): SalesReportData => {
    const totalSales = sales.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);
    const totalReturns = filteredReturns
      .filter((r: SaleReturnData) => r.status === "completed")
      .reduce((sum, r) => sum + r.total_amount, 0);
    
    return {
      total_sales: totalSales,
      total_returns: totalReturns,
      net_sales: totalSales - totalReturns,
      return_rate: totalSales > 0 ? (totalReturns / totalSales) * 100 : 0,
      total_transactions: sales.length,
      total_return_transactions: filteredReturns.length,
    };
  }, [sales, filteredReturns]);

  // Returns by reason
  const reasonBreakdown = useMemo(() => {
    const byReason: Record<string, { count: number; amount: number }> = {};
    
    filteredReturns.forEach((r: SaleReturnData) => {
      const reason = r.reason || "Not specified";
      if (!byReason[reason]) byReason[reason] = { count: 0, amount: 0 };
      byReason[reason].count++;
      byReason[reason].amount += r.total_amount;
    });
    
    return Object.entries(byReason)
      .map(([reason, data]) => ({ reason, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [filteredReturns]);

  // Returns by status
  const statusBreakdown = useMemo(() => {
    const byStatus: Record<string, number> = {};
    
    saleReturns.forEach((r: SaleReturnData) => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    });
    
    return Object.entries(byStatus).map(([status, count]) => ({ status, count }));
  }, [saleReturns]);

  // Trend over time
  const trendData = useMemo(() => {
    const byDate: Record<string, { date: string; returns: number; amount: number }> = {};
    
    filteredReturns.forEach((r: SaleReturnData) => {
      const date = format(new Date(r.return_date), "MMM d");
      if (!byDate[date]) byDate[date] = { date, returns: 0, amount: 0 };
      byDate[date].returns++;
      byDate[date].amount += r.total_amount;
    });
    
    return Object.values(byDate).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [filteredReturns]);

  const summaryCards = [
    { label: "Total Sales", value: `₹${(summary.total_sales / 1000).toFixed(0)}K`, icon: ShoppingCart, iconColor: "blue" },
    { label: "Total Returns", value: `₹${(summary.total_returns / 1000).toFixed(0)}K`, icon: RotateCcw, iconColor: "red" },
    { label: "Net Sales", value: `₹${(summary.net_sales / 1000).toFixed(0)}K`, icon: DollarSign, iconColor: "green" },
    { label: "Return Rate", value: `${summary.return_rate.toFixed(1)}%`, icon: AlertCircle, iconColor: "yellow" },
  ];

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Sales Returns Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`, 14, 23);

    autoTable(doc, {
      startY: 30,
      head: [["Date", "Return ID", "Customer", "Store", "Amount", "Status", "Reason"]],
      body: filteredReturns.map((r: SaleReturnData) => [
        format(new Date(r.return_date), "dd/MM/yy"),
        r.display_id,
        r.customer_name,
        r.store_name,
        `₹${r.total_amount.toLocaleString()}`,
        r.status,
        r.reason || "—",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [239, 68, 68] },
    });

    doc.save(`sales-return-report-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.pdf`);
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredReturns.map((r: SaleReturnData) => ({
      "Date": r.return_date,
      "Return ID": r.display_id,
      "Customer": r.customer_name,
      "Store": r.store_name,
      "Amount": r.total_amount,
      "Status": r.status,
      "Items": r.items_count,
      "Reason": r.reason,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Returns");
    XLSX.writeFile(wb, `sales-return-report-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} />
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search returns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["all", "pending", "approved", "completed", "rejected"].map((status) => (
            <Badge
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              className="cursor-pointer capitalize"
              onClick={() => setStatusFilter(status as any)}
            >
              {status}
            </Badge>
          ))}
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Returns Trend */}
            {trendData.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Returns Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" orientation="left" />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                      <Tooltip formatter={(v: number, name: string) => 
                        name === "amount" ? `₹${v.toLocaleString()}` : v
                      } />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="returns" name="Count" stroke="#3b82f6" />
                      <Line yAxisId="right" type="monotone" dataKey="amount" name="Amount" stroke="#ef4444" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Returns by Reason */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Returns by Reason</CardTitle>
              </CardHeader>
              <CardContent>
                {reasonBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={reasonBreakdown} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                      <YAxis type="category" dataKey="reason" width={120} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                      <Bar dataKey="amount" name="Amount" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-12">No data</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Status Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Returns by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {statusBreakdown.map((s) => (
                  <div key={s.status} className="flex items-center gap-2">
                    <Badge className={statusColors[s.status]}>{s.status}</Badge>
                    <span className="font-semibold">{s.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Returns Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Return Details ({filteredReturns.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredReturns.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No returns found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-left p-3 font-medium">Return ID</th>
                        <th className="text-left p-3 font-medium">Customer</th>
                        <th className="text-left p-3 font-medium hidden md:table-cell">Store</th>
                        <th className="text-right p-3 font-medium">Amount</th>
                        <th className="text-center p-3 font-medium">Status</th>
                        <th className="text-left p-3 font-medium hidden lg:table-cell">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReturns.slice(0, 50).map((r: SaleReturnData) => (
                        <tr key={r.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-muted-foreground text-xs">
                            {format(new Date(r.return_date), "dd/MM/yy")}
                          </td>
                          <td className="p-3 font-mono text-xs">{r.display_id}</td>
                          <td className="p-3 font-medium">{r.customer_name}</td>
                          <td className="p-3 hidden md:table-cell text-muted-foreground">{r.store_name}</td>
                          <td className="p-3 text-right font-semibold text-red-600">
                            ₹{r.total_amount.toLocaleString()}
                          </td>
                          <td className="p-3 text-center">
                            <Badge className={statusColors[r.status]} variant="secondary">
                              {r.status}
                            </Badge>
                          </td>
                          <td className="p-3 hidden lg:table-cell text-muted-foreground truncate max-w-[200px]">
                            {r.reason || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {filteredReturns.length > 50 && (
                <p className="text-center text-muted-foreground mt-4 text-sm">
                  Showing 50 of {filteredReturns.length} returns. Export to see all.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
