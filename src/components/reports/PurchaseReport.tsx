import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ShoppingBag, DollarSign, TrendingUp, Package, Search, Truck } from "lucide-react";
import { format, subMonths, startOfMonth, eachDayOfInterval } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import * as XLSX from "xlsx";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";
import { ReportContainer, ReportKPICard } from "@/components/reports/ReportContainer";

interface PurchaseData {
  id: string;
  display_id: string;
  vendor_name: string;
  warehouse_name: string;
  purchase_date: string;
  total_amount: number;
  items_count: number;
  payment_status: string;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

export default function PurchaseReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(subMonths(new Date(), 1)),
    to: new Date(),
  });
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "vendor">("date");
  const { data: companyInfo } = useCompanySettings();

  // Fetch purchases
  const { data: purchases = [], isLoading: purchLoading } = useQuery({
    queryKey: ["purchase-report", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchases")
        .select(`
          id, display_id, purchase_date, total_amount, payment_status,
          vendors(name),
          warehouses(name),
          purchase_items(id)
        `)
        .gte("purchase_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("purchase_date", format(dateRange.to, "yyyy-MM-dd"))
        .order("purchase_date", { ascending: false });
      
      return (data || []).map((p: any) => ({
        id: p.id,
        display_id: p.display_id,
        vendor_name: p.vendors?.name || "Unknown",
        warehouse_name: p.warehouses?.name || "Default",
        purchase_date: p.purchase_date,
        total_amount: Number(p.total_amount),
        items_count: p.purchase_items?.length || 0,
        payment_status: p.payment_status || "pending",
      }));
    },
  });

  // Fetch vendor payments
  const { data: vendorPayments = [], isLoading: payLoading } = useQuery({
    queryKey: ["purchase-report-payments", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("vendor_payments")
        .select("id, amount, payment_date")
        .gte("payment_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("payment_date", format(dateRange.to, "yyyy-MM-dd"));
      return data || [];
    },
  });

  const isLoading = purchLoading || payLoading;

  // Filter
  const filteredPurchases = useMemo(() => {
    let filtered = purchases;
    
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter((p: PurchaseData) =>
        p.vendor_name.toLowerCase().includes(s) ||
        p.warehouse_name.toLowerCase().includes(s) ||
        p.display_id.toLowerCase().includes(s)
      );
    }
    
    // Sort
    if (sortBy === "amount") {
      filtered = [...filtered].sort((a, b) => b.total_amount - a.total_amount);
    } else if (sortBy === "vendor") {
      filtered = [...filtered].sort((a, b) => a.vendor_name.localeCompare(b.vendor_name));
    }
    
    return filtered;
  }, [purchases, search, sortBy]);

  // Summary
  const summary = useMemo(() => {
    const totalPurchases = filteredPurchases.reduce((sum, p) => sum + p.total_amount, 0);
    const totalPayments = vendorPayments.reduce((sum: number, vp: any) => sum + Number(vp.amount), 0);
    const totalItems = filteredPurchases.reduce((sum, p) => sum + p.items_count, 0);
    const uniqueVendors = new Set(filteredPurchases.map(p => p.vendor_name)).size;
    
    const paidPurchases = filteredPurchases.filter(p => p.payment_status === "paid");
    const paidAmount = paidPurchases.reduce((sum, p) => sum + p.total_amount, 0);
    
    return {
      totalPurchases,
      totalPayments,
      totalItems,
      uniqueVendors,
      purchaseCount: filteredPurchases.length,
      pendingAmount: totalPurchases - paidAmount,
    };
  }, [filteredPurchases, vendorPayments]);

  // Purchases by vendor
  const vendorBreakdown = useMemo(() => {
    const byVendor: Record<string, number> = {};
    
    filteredPurchases.forEach((p: PurchaseData) => {
      byVendor[p.vendor_name] = (byVendor[p.vendor_name] || 0) + p.total_amount;
    });
    
    return Object.entries(byVendor)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredPurchases]);

  // Daily trend
  const dailyTrend = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    
    return days.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayPurchases = filteredPurchases.filter(p => p.purchase_date === dayStr);
      const dayPayments = vendorPayments.filter((vp: any) => vp.payment_date === dayStr);
      
      return {
        date: format(day, "MMM d"),
        purchases: dayPurchases.reduce((sum, p) => sum + p.total_amount, 0),
        payments: dayPayments.reduce((sum: number, vp: any) => sum + Number(vp.amount), 0),
      };
    }).filter(d => d.purchases > 0 || d.payments > 0);
  }, [filteredPurchases, vendorPayments, dateRange]);

  // Payment status breakdown
  const paymentStatusData = useMemo(() => {
    const byStatus: Record<string, number> = {};
    
    filteredPurchases.forEach((p: PurchaseData) => {
      const status = p.payment_status || "pending";
      byStatus[status] = (byStatus[status] || 0) + p.total_amount;
    });
    
    return Object.entries(byStatus).map(([name, value]) => ({ name, value }));
  }, [filteredPurchases]);

  const paymentStatusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    partial: "bg-blue-100 text-blue-800",
    paid: "bg-green-100 text-green-800",
  };

  const generateHTML = () => {
    const paymentStatusColors: Record<string, { bg: string, text: string }> = {
      pending: { bg: "#fef3c7", text: "#92400e" },
      partial: { bg: "#dbeafe", text: "#1e40af" },
      paid: { bg: "#dcfce3", text: "#166534" },
    };

    const purchaseRows = filteredPurchases.map((p: PurchaseData) => {
      const statusStyle = paymentStatusColors[p.payment_status?.toLowerCase()] || { bg: "#f3f4f6", text: "#374151" };
      return `
      <tr>
        <td class="font-medium">${format(new Date(p.purchase_date), "dd MMM yyyy")}</td>
        <td class="font-mono text-xs">${p.display_id}</td>
        <td class="font-medium">${p.vendor_name}</td>
        <td>${p.warehouse_name}</td>
        <td class="text-right">${p.items_count}</td>
        <td class="text-right font-mono font-bold">₹${p.total_amount.toLocaleString()}</td>
        <td class="text-center">
          <span style="background-color: ${statusStyle.bg}; color: ${statusStyle.text}; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 500;">
            ${p.payment_status.toUpperCase()}
          </span>
        </td>
      </tr>
      `;
    }).join("");

    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card highlight">
          <div class="kpi-label">Total Purchases</div>
          <div class="kpi-value text-blue-600">₹${summary.totalPurchases.toLocaleString()}</div>
        </div>
        <div class="kpi-card highlight">
          <div class="kpi-label">Paid to Vendors</div>
          <div class="kpi-value text-pos">₹${summary.totalPayments.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Pending Amount</div>
          <div class="kpi-value text-neg">₹${summary.pendingAmount.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Vendors / Orders</div>
          <div class="kpi-value">${summary.uniqueVendors} / ${summary.purchaseCount}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Purchase ID</th>
            <th>Vendor</th>
            <th>Warehouse</th>
            <th class="text-right">Items</th>
            <th class="text-right">Amount</th>
            <th class="text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${purchaseRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" class="font-bold text-right">TOTAL</td>
            <td class="text-right font-bold">${summary.totalItems}</td>
            <td class="text-right font-mono font-bold text-blue-600">₹${summary.totalPurchases.toLocaleString()}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    `;

    return generatePrintHTML({
      title: "Purchase Report",
      dateRange: `${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`,
      companyInfo: companyInfo || { companyName: "System", address: "", phone: "", email: "", gstin: "" },
      htmlContent,
    });
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredPurchases.map((p: PurchaseData) => ({
      "Date": p.purchase_date,
      "Purchase ID": p.display_id,
      "Vendor": p.vendor_name,
      "Warehouse": p.warehouse_name,
      "Items": p.items_count,
      "Amount": p.total_amount,
      "Payment Status": p.payment_status,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Purchases");
    XLSX.writeFile(wb, `purchase-report-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.xlsx`);
  };

  const filtersSection = (
    <div className="flex flex-wrap items-end gap-3">
      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} />
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search purchases..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="flex gap-2">
        <Badge 
          variant={sortBy === "date" ? "default" : "outline"} 
          className="cursor-pointer"
          onClick={() => setSortBy("date")}
        >
          By Date
        </Badge>
        <Badge 
          variant={sortBy === "amount" ? "default" : "outline"} 
          className="cursor-pointer"
          onClick={() => setSortBy("amount")}
        >
          By Amount
        </Badge>
        <Badge 
          variant={sortBy === "vendor" ? "default" : "outline"} 
          className="cursor-pointer"
          onClick={() => setSortBy("vendor")}
        >
          By Vendor
        </Badge>
      </div>
    </div>
  );

  const summaryCards = (
    <>
      <ReportKPICard
        label="Total Purchases"
        value={`₹${summary.totalPurchases.toLocaleString()}`}
        icon={ShoppingBag}
        highlight
      />
      <ReportKPICard
        label="Paid to Vendors"
        value={`₹${summary.totalPayments.toLocaleString()}`}
        subValue={`${summary.purchaseCount} orders`}
        icon={DollarSign}
        trend="up"
        highlight
      />
      <ReportKPICard
        label="Pending Amount"
        value={`₹${summary.pendingAmount.toLocaleString()}`}
        icon={TrendingUp}
        trend="down"
      />
      <ReportKPICard
        label="Active Vendors"
        value={summary.uniqueVendors.toString()}
        subValue={`${summary.totalItems} items`}
        icon={Truck}
      />
    </>
  );

  return (
    <ReportContainer
      title="Purchase Report"
      subtitle="Vendor purchases, payments & outstanding analysis"
      icon={ShoppingBag}
      dateRange={`${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`}
      onPrint={generateHTML}
      onExportExcel={exportExcel}
      isLoading={isLoading}
      filters={filtersSection}
      summaryCards={summaryCards}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trend */}
        {dailyTrend.length > 1 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Purchase & Payment Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                  <Legend />
                  <Line type="monotone" dataKey="purchases" name="Purchases" stroke="#3b82f6" strokeWidth={2} />
                  <Line type="monotone" dataKey="payments" name="Payments" stroke="#10b981" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Top Vendors */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Vendors by Purchase</CardTitle>
          </CardHeader>
          <CardContent>
            {vendorBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={vendorBreakdown} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                  <Bar dataKey="value" name="Amount" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Status Pie */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Payment Status Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={paymentStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {paymentStatusData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">No data</p>
          )}
        </CardContent>
      </Card>

      {/* Purchase Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Purchase Details ({filteredPurchases.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredPurchases.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No purchases found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-semibold text-xs">Date</th>
                    <th className="text-left p-3 font-semibold text-xs">Purchase ID</th>
                    <th className="text-left p-3 font-semibold text-xs">Vendor</th>
                    <th className="text-left p-3 font-semibold text-xs hidden md:table-cell">Warehouse</th>
                    <th className="text-center p-3 font-semibold text-xs hidden lg:table-cell">Items</th>
                    <th className="text-right p-3 font-semibold text-xs">Amount</th>
                    <th className="text-center p-3 font-semibold text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.slice(0, 50).map((p: PurchaseData) => (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 text-muted-foreground text-xs">
                        {format(new Date(p.purchase_date), "dd/MM/yy")}
                      </td>
                      <td className="p-3 font-mono text-xs">{p.display_id}</td>
                      <td className="p-3 font-medium text-sm">{p.vendor_name}</td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">{p.warehouse_name}</td>
                      <td className="p-3 text-center hidden lg:table-cell">{p.items_count}</td>
                      <td className="p-3 text-right font-semibold">₹{p.total_amount.toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <Badge className={paymentStatusColors[p.payment_status] || "bg-gray-100 text-gray-800"} variant="secondary">
                          {p.payment_status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filteredPurchases.length > 50 && (
            <p className="text-center text-muted-foreground mt-4 text-sm">
              Showing 50 of {filteredPurchases.length} purchases. Export to see all.
            </p>
          )}
        </CardContent>
      </Card>
    </ReportContainer>
  );
}
