import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Building2, TrendingUp, TrendingDown, Package, DollarSign, Search } from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import * as XLSX from "xlsx";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";
import { ReportContainer, ReportKPICard } from "@/components/reports/ReportContainer";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function VendorReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(subMonths(new Date(), 2)),
    to: new Date(),
  });
  const [search, setSearch] = useState("");
  const { data: companyInfo } = useCompanySettings();

  // Fetch vendors
  const { data: vendors = [], isLoading: vendorsLoading } = useQuery({
    queryKey: ["vendor-report-vendors"],
    queryFn: async () => {
      const { data } = await supabase
        .from("vendors")
        .select("id, name, display_id, phone, email, outstanding, is_active")
        .order("name");
      return data || [];
    },
  });

  // Fetch purchases in date range
  const { data: purchases = [], isLoading: purchLoading } = useQuery({
    queryKey: ["vendor-report-purchases", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchases")
        .select("id, vendor_id, total_amount, purchase_date")
        .gte("purchase_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("purchase_date", format(dateRange.to, "yyyy-MM-dd"));
      return data || [];
    },
  });

  // Fetch vendor payments in date range
  const { data: payments = [], isLoading: payLoading } = useQuery({
    queryKey: ["vendor-report-payments", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("vendor_payments")
        .select("id, vendor_id, amount, payment_date")
        .gte("payment_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("payment_date", format(dateRange.to, "yyyy-MM-dd"));
      return data || [];
    },
  });

  // Fetch purchase returns
  const { data: returns = [], isLoading: retLoading } = useQuery({
    queryKey: ["vendor-report-returns", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_returns")
        .select("id, vendor_id, total_amount, return_date, status")
        .gte("return_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("return_date", format(dateRange.to, "yyyy-MM-dd"))
        .eq("status", "completed");
      return data || [];
    },
  });

  const isLoading = vendorsLoading || purchLoading || payLoading || retLoading;

  // Aggregate data by vendor
  const vendorStats = useMemo(() => {
    return vendors.map((v: any) => {
      const vendorPurchases = purchases.filter((p: any) => p.vendor_id === v.id);
      const vendorPayments = payments.filter((p: any) => p.vendor_id === v.id);
      const vendorReturns = returns.filter((r: any) => r.vendor_id === v.id);

      const totalPurchases = vendorPurchases.reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);
      const totalPayments = vendorPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const totalReturns = vendorReturns.reduce((sum: number, r: any) => sum + Number(r.total_amount), 0);
      const purchaseCount = vendorPurchases.length;

      return {
        ...v,
        totalPurchases,
        totalPayments,
        totalReturns,
        purchaseCount,
        netPurchases: totalPurchases - totalReturns,
      };
    }).filter((v: any) => v.totalPurchases > 0 || v.outstanding > 0);
  }, [vendors, purchases, payments, returns]);

  // Filter by search
  const filteredVendors = useMemo(() => {
    if (!search) return vendorStats;
    const s = search.toLowerCase();
    return vendorStats.filter((v: any) => 
      v.name?.toLowerCase().includes(s) || 
      v.display_id?.toLowerCase().includes(s)
    );
  }, [vendorStats, search]);

  // Summary calculations
  const summary = useMemo(() => {
    const totalPurchases = filteredVendors.reduce((sum: number, v: any) => sum + v.totalPurchases, 0);
    const totalPayments = filteredVendors.reduce((sum: number, v: any) => sum + v.totalPayments, 0);
    const totalReturns = filteredVendors.reduce((sum: number, v: any) => sum + v.totalReturns, 0);
    const totalOutstanding = filteredVendors.reduce((sum: number, v: any) => sum + Number(v.outstanding || 0), 0);
    const activeVendors = filteredVendors.filter((v: any) => v.is_active).length;

    return { totalPurchases, totalPayments, totalReturns, totalOutstanding, activeVendors, totalVendors: filteredVendors.length };
  }, [filteredVendors]);

  // Top vendors by purchase
  const topVendorsChart = useMemo(() => {
    return [...filteredVendors]
      .sort((a: any, b: any) => b.totalPurchases - a.totalPurchases)
      .slice(0, 10)
      .map((v: any) => ({
        name: v.name?.length > 15 ? v.name.substring(0, 15) + "..." : v.name,
        purchases: v.totalPurchases,
        payments: v.totalPayments,
      }));
  }, [filteredVendors]);

  // Outstanding distribution
  const outstandingChart = useMemo(() => {
    return [...filteredVendors]
      .filter((v: any) => Number(v.outstanding) > 0)
      .sort((a: any, b: any) => Number(b.outstanding) - Number(a.outstanding))
      .slice(0, 8)
      .map((v: any) => ({
        name: v.name?.length > 12 ? v.name.substring(0, 12) + "..." : v.name,
        value: Number(v.outstanding),
      }));
  }, [filteredVendors]);

  const generateHTML = () => {
    const vendorRows = filteredVendors.map((v: any) => `
      <tr>
        <td class="font-medium">${v.name}</td>
        <td class="text-right font-mono">₹${v.totalPurchases.toLocaleString()}</td>
        <td class="text-right font-mono text-pos">₹${v.totalPayments.toLocaleString()}</td>
        <td class="text-right font-mono" style="color: #ca8a04;">₹${v.totalReturns.toLocaleString()}</td>
        <td class="text-right font-mono ${v.outstanding > 0 ? 'text-neg font-bold' : ''}">₹${Number(v.outstanding).toLocaleString()}</td>
      </tr>
    `).join("");

    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card highlight">
          <div class="kpi-label">Total Purchases</div>
          <div class="kpi-value" style="color: #2563eb;">₹${summary.totalPurchases.toLocaleString()}</div>
        </div>
        <div class="kpi-card highlight">
          <div class="kpi-label">Total Payments</div>
          <div class="kpi-value text-pos">₹${summary.totalPayments.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Returns</div>
          <div class="kpi-value" style="color: #ca8a04;">₹${summary.totalReturns.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Outstanding</div>
          <div class="kpi-value text-neg">₹${summary.totalOutstanding.toLocaleString()}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Vendor</th>
            <th class="text-right">Purchases</th>
            <th class="text-right">Payments</th>
            <th class="text-right">Returns</th>
            <th class="text-right">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          ${vendorRows}
        </tbody>
        <tfoot>
          <tr>
            <td class="font-bold">TOTAL (${filteredVendors.length} vendors)</td>
            <td class="text-right font-mono font-bold">₹${summary.totalPurchases.toLocaleString()}</td>
            <td class="text-right font-mono font-bold text-pos">₹${summary.totalPayments.toLocaleString()}</td>
            <td class="text-right font-mono font-bold" style="color: #ca8a04;">₹${summary.totalReturns.toLocaleString()}</td>
            <td class="text-right font-mono font-bold text-neg">₹${summary.totalOutstanding.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    `;

    return generatePrintHTML({
      title: "Vendor Report",
      dateRange: `${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`,
      companyInfo: companyInfo || { companyName: "System", address: "", phone: "", email: "", gstin: "" },
      htmlContent,
    });
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredVendors.map((v: any) => ({
      "Vendor ID": v.display_id,
      "Vendor Name": v.name,
      "Total Purchases": v.totalPurchases,
      "Total Payments": v.totalPayments,
      "Total Returns": v.totalReturns,
      "Outstanding": Number(v.outstanding),
      "Purchase Count": v.purchaseCount,
      "Status": v.is_active ? "Active" : "Inactive",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendor Report");
    XLSX.writeFile(wb, `vendor-report-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.xlsx`);
  };

  const filtersSection = (
    <div className="flex flex-wrap items-end gap-3">
      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} />
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search vendors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );

  const summaryCardsSection = (
    <>
      <ReportKPICard
        label="Total Purchases"
        value={`₹${summary.totalPurchases.toLocaleString()}`}
        icon={Package}
        highlight
      />
      <ReportKPICard
        label="Total Payments"
        value={`₹${summary.totalPayments.toLocaleString()}`}
        subValue={`${summary.totalVendors} vendors`}
        icon={DollarSign}
        trend="up"
        highlight
      />
      <ReportKPICard
        label="Total Returns"
        value={`₹${summary.totalReturns.toLocaleString()}`}
        icon={TrendingDown}
      />
      <ReportKPICard
        label="Outstanding"
        value={`₹${summary.totalOutstanding.toLocaleString()}`}
        subValue={`${summary.activeVendors} active`}
        icon={TrendingUp}
        trend="down"
      />
    </>
  );

  return (
    <ReportContainer
      title="Vendor Report"
      subtitle="Supplier analysis, payments & outstanding balances"
      icon={Building2}
      dateRange={`${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`}
      onPrint={generateHTML}
      onExportExcel={exportExcel}
      isLoading={isLoading}
      filters={filtersSection}
      summaryCards={summaryCardsSection}
    >
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Vendors */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Vendors by Purchase</CardTitle>
          </CardHeader>
          <CardContent>
            {topVendorsChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topVendorsChart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="purchases" name="Purchases" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="payments" name="Payments" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">No data available</p>
            )}
          </CardContent>
        </Card>

        {/* Outstanding Distribution */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {outstandingChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={outstandingChart}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {outstandingChart.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">No outstanding balances</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vendor List */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Vendor Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-semibold text-xs">Vendor</th>
                  <th className="text-right p-3 font-semibold text-xs">Purchases</th>
                  <th className="text-right p-3 font-semibold text-xs">Payments</th>
                  <th className="text-right p-3 font-semibold text-xs">Returns</th>
                  <th className="text-right p-3 font-semibold text-xs">Outstanding</th>
                  <th className="text-center p-3 font-semibold text-xs">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredVendors.map((v: any) => (
                  <tr key={v.id} className="border-b hover:bg-muted/30">
                    <td className="p-3">
                      <div>
                        <p className="font-medium text-sm">{v.name}</p>
                        <p className="text-xs text-muted-foreground">{v.display_id}</p>
                      </div>
                    </td>
                    <td className="p-3 text-right font-medium">₹{v.totalPurchases.toLocaleString()}</td>
                    <td className="p-3 text-right text-green-600">₹{v.totalPayments.toLocaleString()}</td>
                    <td className="p-3 text-right text-amber-600">₹{v.totalReturns.toLocaleString()}</td>
                    <td className="p-3 text-right">
                      <span className={Number(v.outstanding) > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}>
                        ₹{Number(v.outstanding).toLocaleString()}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant={v.is_active ? "default" : "secondary"}>
                        {v.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-semibold">
                  <td className="p-3 text-sm">TOTAL ({filteredVendors.length} vendors)</td>
                  <td className="p-3 text-right">₹{summary.totalPurchases.toLocaleString()}</td>
                  <td className="p-3 text-right text-green-600">₹{summary.totalPayments.toLocaleString()}</td>
                  <td className="p-3 text-right text-amber-600">₹{summary.totalReturns.toLocaleString()}</td>
                  <td className="p-3 text-right text-red-600">₹{summary.totalOutstanding.toLocaleString()}</td>
                  <td className="p-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </ReportContainer>
  );
}
