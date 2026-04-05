import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ShoppingBag, DollarSign, TrendingUp, Search, RotateCcw, AlertCircle, Truck } from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import * as XLSX from "xlsx";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";
import { ReportContainer, ReportKPICard } from "@/components/reports/ReportContainer";

interface PurchaseReturnData {
  id: string;
  display_id: string;
  vendor_name: string;
  warehouse_name: string;
  return_date: string;
  total_amount: number;
  status: string;
  reason: string;
  items_count: number;
}

export default function PurchaseReturnReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(subMonths(new Date(), 3)),
    to: new Date(),
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "completed" | "rejected">("all");
  const { data: companySettings } = useCompanySettings();

  // Fetch purchase returns
  const { data: purchaseReturns = [], isLoading: prLoading } = useQuery({
    queryKey: ["purchase-return-report", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_returns")
        .select(`
          id, display_id, return_date, total_amount, status, reason,
          vendors(name),
          warehouses(name),
          purchase_return_items(id)
        `)
        .gte("return_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("return_date", format(dateRange.to, "yyyy-MM-dd"))
        .order("return_date", { ascending: false });
      
      return (data || []).map((pr: any) => ({
        id: pr.id,
        display_id: pr.display_id,
        vendor_name: pr.vendors?.name || "Unknown",
        warehouse_name: pr.warehouses?.name || "Default",
        return_date: pr.return_date,
        total_amount: Number(pr.total_amount),
        status: pr.status,
        reason: pr.reason || "",
        items_count: pr.purchase_return_items?.length || 0,
      }));
    },
  });

  // Fetch purchases for comparison
  const { data: purchases = [], isLoading: purchLoading } = useQuery({
    queryKey: ["purchase-return-report-purchases", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchases")
        .select("id, total_amount, purchase_date")
        .gte("purchase_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("purchase_date", format(dateRange.to, "yyyy-MM-dd"));
      return data || [];
    },
  });

  const isLoading = prLoading || purchLoading;

  // Filter
  const filteredReturns = useMemo(() => {
    let filtered = purchaseReturns;
    
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter((r: PurchaseReturnData) =>
        r.vendor_name.toLowerCase().includes(s) ||
        r.warehouse_name.toLowerCase().includes(s) ||
        r.display_id.toLowerCase().includes(s) ||
        r.reason.toLowerCase().includes(s)
      );
    }
    
    if (statusFilter !== "all") {
      filtered = filtered.filter((r: PurchaseReturnData) => r.status === statusFilter);
    }
    
    return filtered;
  }, [purchaseReturns, search, statusFilter]);

  // Summary
  const summary = useMemo(() => {
    const totalPurchases = purchases.reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);
    const totalReturns = filteredReturns
      .filter((r: PurchaseReturnData) => r.status === "completed")
      .reduce((sum, r) => sum + r.total_amount, 0);
    
    return {
      total_purchases: totalPurchases,
      total_returns: totalReturns,
      net_purchases: totalPurchases - totalReturns,
      return_rate: totalPurchases > 0 ? (totalReturns / totalPurchases) * 100 : 0,
      total_transactions: purchases.length,
      total_return_transactions: filteredReturns.length,
    };
  }, [purchases, filteredReturns]);

  // Returns by vendor
  const vendorBreakdown = useMemo(() => {
    const byVendor: Record<string, { count: number; amount: number }> = {};
    
    filteredReturns.forEach((r: PurchaseReturnData) => {
      const vendor = r.vendor_name;
      if (!byVendor[vendor]) byVendor[vendor] = { count: 0, amount: 0 };
      byVendor[vendor].count++;
      byVendor[vendor].amount += r.total_amount;
    });
    
    return Object.entries(byVendor)
      .map(([vendor, data]) => ({ vendor, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [filteredReturns]);

  // Returns by reason
  const reasonBreakdown = useMemo(() => {
    const byReason: Record<string, { count: number; amount: number }> = {};
    
    filteredReturns.forEach((r: PurchaseReturnData) => {
      const reason = r.reason || "Not specified";
      if (!byReason[reason]) byReason[reason] = { count: 0, amount: 0 };
      byReason[reason].count++;
      byReason[reason].amount += r.total_amount;
    });
    
    return Object.entries(byReason)
      .map(([reason, data]) => ({ reason, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [filteredReturns]);

  // Trend over time
  const trendData = useMemo(() => {
    const byDate: Record<string, { date: string; returns: number; amount: number }> = {};
    
    filteredReturns.forEach((r: PurchaseReturnData) => {
      const date = format(new Date(r.return_date), "MMM d");
      if (!byDate[date]) byDate[date] = { date, returns: 0, amount: 0 };
      byDate[date].returns++;
      byDate[date].amount += r.total_amount;
    });
    
    return Object.values(byDate).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [filteredReturns]);

  // Status breakdown
  const statusBreakdown = useMemo(() => {
    const byStatus: Record<string, number> = {};
    
    purchaseReturns.forEach((r: PurchaseReturnData) => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    });
    
    return Object.entries(byStatus).map(([status, count]) => ({ status, count }));
  }, [purchaseReturns]);

  const summaryCards = [
    { label: "Total Purchases", value: `₹${(summary.total_purchases / 1000).toFixed(0)}K`, icon: ShoppingBag, iconColor: "blue" },
    { label: "Total Returns", value: `₹${(summary.total_returns / 1000).toFixed(0)}K`, icon: RotateCcw, iconColor: "red" },
    { label: "Net Purchases", value: `₹${(summary.net_purchases / 1000).toFixed(0)}K`, icon: DollarSign, iconColor: "green" },
    { label: "Return Rate", value: `${summary.return_rate.toFixed(1)}%`, icon: AlertCircle, iconColor: "yellow" },
  ];

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };

  const handlePrintHTML = () => {
    if (!companySettings) return "";

    const statusPillClass = (status: string) => {
      switch (status) {
        case "completed": return "pill-success";
        case "rejected": return "pill-danger";
        case "pending": return "pill-warning";
        default: return "";
      }
    };

    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-label">Total Purchases</div>
          <div class="kpi-value">₹${summary.total_purchases.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Returns</div>
          <div class="kpi-value text-neg">₹${summary.total_returns.toLocaleString()}</div>
        </div>
        <div class="kpi-card highlight">
          <div class="kpi-label">Net Purchases</div>
          <div class="kpi-value">₹${summary.net_purchases.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Return Rate</div>
          <div class="kpi-value">${summary.return_rate.toFixed(1)}%</div>
        </div>
      </div>

      <h2>Return Details</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Return ID</th>
            <th>Vendor</th>
            <th>Warehouse</th>
            <th class="text-right">Amount</th>
            <th class="text-center">Status</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          ${filteredReturns.map((r: PurchaseReturnData) => `
            <tr>
              <td class="font-mono">${format(new Date(r.return_date), "dd/MM/yyyy")}</td>
              <td class="font-mono">${r.display_id}</td>
              <td class="font-semibold">${r.vendor_name}</td>
              <td>${r.warehouse_name}</td>
              <td class="text-right font-semibold text-neg">₹${r.total_amount.toLocaleString()}</td>
              <td class="text-center"><span class="pill ${statusPillClass(r.status)}">${r.status}</span></td>
              <td>${r.reason || "—"}</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr style="background: var(--accent); color: white; font-weight: 700;">
            <td colspan="4">TOTAL (${filteredReturns.length} returns)</td>
            <td class="text-right">₹${filteredReturns.reduce((s, r) => s + r.total_amount, 0).toLocaleString()}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>

      ${vendorBreakdown.length > 0 ? `
        <h2>Returns by Vendor</h2>
        <table>
          <thead><tr><th>Vendor</th><th class="text-right">Count</th><th class="text-right">Amount</th></tr></thead>
          <tbody>
            ${vendorBreakdown.map(v => `
              <tr>
                <td class="font-semibold">${v.vendor}</td>
                <td class="text-right">${v.count}</td>
                <td class="text-right font-semibold">₹${v.amount.toLocaleString()}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : ""}

      ${reasonBreakdown.length > 0 ? `
        <h2>Returns by Reason</h2>
        <table>
          <thead><tr><th>Reason</th><th class="text-right">Count</th><th class="text-right">Amount</th></tr></thead>
          <tbody>
            ${reasonBreakdown.map(r => `
              <tr>
                <td>${r.reason}</td>
                <td class="text-right">${r.count}</td>
                <td class="text-right font-semibold">₹${r.amount.toLocaleString()}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : ""}
    `;

    return generatePrintHTML({
      title: "Purchase Returns Report",
      dateRange: `${format(dateRange.from, "dd MMM yyyy")} — ${format(dateRange.to, "dd MMM yyyy")}`,
      metadata: {
        "Total Returns": `₹${summary.total_returns.toLocaleString()}`,
        "Return Rate": `${summary.return_rate.toFixed(1)}%`,
        "Transactions": `${summary.total_return_transactions}`,
      },
      companyInfo: companySettings,
      htmlContent,
    });
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredReturns.map((r: PurchaseReturnData) => ({
      "Date": r.return_date,
      "Return ID": r.display_id,
      "Vendor": r.vendor_name,
      "Warehouse": r.warehouse_name,
      "Amount": r.total_amount,
      "Status": r.status,
      "Items": r.items_count,
      "Reason": r.reason,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Purchase Returns");
    XLSX.writeFile(wb, `purchase-return-report-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.xlsx`);
  };

  const filtersSection = (
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
  );

  const summaryCardsSection = (
    <>
      <ReportKPICard
        label="Total Purchases"
        value={`₹${(summary.total_purchases / 1000).toFixed(0)}K`}
        icon={ShoppingBag}
      />
      <ReportKPICard
        label="Total Returns"
        value={`₹${(summary.total_returns / 1000).toFixed(0)}K`}
        icon={RotateCcw}
        trend="down"
      />
      <ReportKPICard
        label="Net Purchases"
        value={`₹${(summary.net_purchases / 1000).toFixed(0)}K`}
        icon={DollarSign}
        highlight
      />
      <ReportKPICard
        label="Return Rate"
        value={`${summary.return_rate.toFixed(1)}%`}
        icon={AlertCircle}
      />
    </>
  );

  return (
    <ReportContainer
      title="Purchase Returns"
      subtitle="Vendor purchase return analysis"
      icon={RotateCcw}
      dateRange={`${format(dateRange.from, "dd MMM yyyy")} — ${format(dateRange.to, "dd MMM yyyy")}`}
      onPrint={handlePrintHTML}
      onExportExcel={exportExcel}
      isLoading={isLoading}
      filters={filtersSection}
      summaryCards={summaryCardsSection}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Returns by Vendor */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Returns by Vendor</CardTitle>
          </CardHeader>
          <CardContent>
            {vendorBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={vendorBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="vendor" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                  <Bar dataKey="amount" name="Amount" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">No data</p>
            )}
          </CardContent>
        </Card>

        {/* Returns by Reason */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Returns by Reason</CardTitle>
          </CardHeader>
          <CardContent>
            {reasonBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={reasonBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="reason" width={120} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                  <Bar dataKey="amount" name="Amount" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Returns Trend */}
      {trendData.length > 1 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Returns Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
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
        <CardContent className="p-0">
          {filteredReturns.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No returns found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-xs">Date</th>
                    <th className="text-left p-3 font-semibold text-xs">Return ID</th>
                    <th className="text-left p-3 font-semibold text-xs">Vendor</th>
                    <th className="text-left p-3 font-semibold text-xs hidden md:table-cell">Warehouse</th>
                    <th className="text-right p-3 font-semibold text-xs">Amount</th>
                    <th className="text-center p-3 font-semibold text-xs">Status</th>
                    <th className="text-left p-3 font-semibold text-xs hidden lg:table-cell">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReturns.slice(0, 50).map((r: PurchaseReturnData) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 text-muted-foreground text-xs">
                        {format(new Date(r.return_date), "dd/MM/yy")}
                      </td>
                      <td className="p-3 font-mono text-xs">{r.display_id}</td>
                      <td className="p-3 font-medium">{r.vendor_name}</td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground">{r.warehouse_name}</td>
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
            <p className="text-center text-muted-foreground py-4 text-sm">
              Showing 50 of {filteredReturns.length} returns. Export to see all.
            </p>
          )}
        </CardContent>
      </Card>
    </ReportContainer>
  );
}
