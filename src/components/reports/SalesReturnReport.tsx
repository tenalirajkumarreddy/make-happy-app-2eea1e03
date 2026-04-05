import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ShoppingCart, DollarSign, Search, RotateCcw, AlertCircle } from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import * as XLSX from "xlsx";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";
import { ReportContainer, ReportKPICard } from "@/components/reports/ReportContainer";

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
  const { data: companyInfo } = useCompanySettings();

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

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };

  const filtersSection = (
    <div className="flex flex-wrap items-end gap-3">
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
  );

  const summaryCardsSection = (
    <>
      <ReportKPICard
        label="Total Sales"
        value={`₹${summary.total_sales.toLocaleString()}`}
        subValue={`${summary.total_transactions} orders`}
        icon={ShoppingCart}
        highlight
      />
      <ReportKPICard
        label="Total Returns"
        value={`₹${summary.total_returns.toLocaleString()}`}
        subValue={`${summary.total_return_transactions} returns`}
        icon={RotateCcw}
        trend="down"
      />
      <ReportKPICard
        label="Net Sales"
        value={`₹${summary.net_sales.toLocaleString()}`}
        icon={DollarSign}
        trend="up"
        highlight
      />
      <ReportKPICard
        label="Return Rate"
        value={`${summary.return_rate.toFixed(1)}%`}
        icon={AlertCircle}
      />
    </>
  );

  const generateHTML = () => {
    const returnRows = filteredReturns.map((r: SaleReturnData) => `
      <tr>
        <td class="font-medium">${format(new Date(r.return_date), "dd MMM yyyy")}</td>
        <td class="font-mono text-xs">${r.display_id}</td>
        <td class="font-medium">${r.customer_name}</td>
        <td>${r.store_name}</td>
        <td class="text-right font-mono font-bold text-neg">₹${r.total_amount.toLocaleString()}</td>
        <td class="text-center">
          <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; font-weight: 500; border: 1px solid #e5e7eb;">
            ${r.status.toUpperCase()}
          </span>
        </td>
        <td class="text-xs">${r.reason || "—"}</td>
      </tr>
    `).join("");

    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card highlight">
          <div class="kpi-label">Total Sales</div>
          <div class="kpi-value text-blue-600">₹${summary.total_sales.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Returns</div>
          <div class="kpi-value text-neg">₹${summary.total_returns.toLocaleString()}</div>
        </div>
        <div class="kpi-card highlight">
          <div class="kpi-label">Net Sales</div>
          <div class="kpi-value text-pos">₹${summary.net_sales.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Return Rate</div>
          <div class="kpi-value text-warn">${summary.return_rate.toFixed(1)}%</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Return ID</th>
            <th>Customer</th>
            <th>Store</th>
            <th class="text-right">Amount</th>
            <th class="text-center">Status</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          ${returnRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" class="font-bold text-right">TOTAL COMPLETED RETURNS</td>
            <td class="text-right font-mono font-bold text-neg">₹${summary.total_returns.toLocaleString()}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    `;

    return generatePrintHTML({
      title: "Sales Returns Report",
      dateRange: `${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`,
      companyInfo: companyInfo || { companyName: "System", address: "", phone: "", email: "", gstin: "" },
      htmlContent,
    });
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
    <ReportContainer
      title="Sales Returns Report"
      subtitle="Return analysis, trends & reason breakdown"
      icon={RotateCcw}
      dateRange={`${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`}
      onPrint={generateHTML}
      onExportExcel={exportExcel}
      isLoading={isLoading}
      filters={filtersSection}
      summaryCards={summaryCardsSection}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Returns Trend */}
        {trendData.length > 1 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Returns Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" orientation="left" />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v: number, name: string) => 
                    name === "amount" ? `₹${v.toLocaleString()}` : v
                  } />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="returns" name="Count" stroke="#3b82f6" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="amount" name="Amount" stroke="#ef4444" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Returns by Reason */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Returns by Reason</CardTitle>
          </CardHeader>
          <CardContent>
            {reasonBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={reasonBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="reason" width={120} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                  <Bar dataKey="amount" name="Amount" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status Breakdown */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Returns by Status</CardTitle>
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
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Return Details ({filteredReturns.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredReturns.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No returns found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-semibold text-xs">Date</th>
                    <th className="text-left p-3 font-semibold text-xs">Return ID</th>
                    <th className="text-left p-3 font-semibold text-xs">Customer</th>
                    <th className="text-left p-3 font-semibold text-xs hidden md:table-cell">Store</th>
                    <th className="text-right p-3 font-semibold text-xs">Amount</th>
                    <th className="text-center p-3 font-semibold text-xs">Status</th>
                    <th className="text-left p-3 font-semibold text-xs hidden lg:table-cell">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReturns.slice(0, 50).map((r: SaleReturnData) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 text-muted-foreground text-xs">
                        {format(new Date(r.return_date), "dd/MM/yy")}
                      </td>
                      <td className="p-3 font-mono text-xs">{r.display_id}</td>
                      <td className="p-3 font-medium text-sm">{r.customer_name}</td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">{r.store_name}</td>
                      <td className="p-3 text-right font-semibold text-red-600">
                        ₹{r.total_amount.toLocaleString()}
                      </td>
                      <td className="p-3 text-center">
                        <Badge className={statusColors[r.status]} variant="secondary">
                          {r.status}
                        </Badge>
                      </td>
                      <td className="p-3 hidden lg:table-cell text-muted-foreground truncate max-w-[200px] text-xs">
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
    </ReportContainer>
  );
}
