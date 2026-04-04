import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, ShoppingBag, DollarSign, TrendingUp, Package, Search, Truck, Warehouse } from "lucide-react";
import { format, subMonths, startOfMonth, eachDayOfInterval } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { ReportExportBar } from "./ReportExportBar";
import { ReportSummaryCards } from "./ReportSummaryCards";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

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

  const summaryCards = [
    { label: "Total Purchases", value: `₹${(summary.totalPurchases / 1000).toFixed(0)}K`, icon: ShoppingBag, iconColor: "blue" },
    { label: "Paid to Vendors", value: `₹${(summary.totalPayments / 1000).toFixed(0)}K`, icon: DollarSign, iconColor: "green" },
    { label: "Pending Amount", value: `₹${(summary.pendingAmount / 1000).toFixed(0)}K`, icon: TrendingUp, iconColor: "red" },
    { label: "Active Vendors", value: summary.uniqueVendors.toString(), icon: Truck, iconColor: "purple" },
  ];

  const paymentStatusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    partial: "bg-blue-100 text-blue-800",
    paid: "bg-green-100 text-green-800",
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Purchase Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`, 14, 23);

    autoTable(doc, {
      startY: 30,
      head: [["Date", "Purchase ID", "Vendor", "Warehouse", "Items", "Amount", "Status"]],
      body: filteredPurchases.map((p: PurchaseData) => [
        format(new Date(p.purchase_date), "dd/MM/yy"),
        p.display_id,
        p.vendor_name,
        p.warehouse_name,
        p.items_count.toString(),
        `₹${p.total_amount.toLocaleString()}`,
        p.payment_status,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`purchase-report-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.pdf`);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
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

      <ReportExportBar onExportPDF={exportPDF} onExportExcel={exportExcel} />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <ReportSummaryCards cards={summaryCards} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Trend */}
            {dailyTrend.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Purchase & Payment Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                      <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                      <Legend />
                      <Line type="monotone" dataKey="purchases" name="Purchases" stroke="#3b82f6" />
                      <Line type="monotone" dataKey="payments" name="Payments" stroke="#10b981" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Top Vendors */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Vendors by Purchase</CardTitle>
              </CardHeader>
              <CardContent>
                {vendorBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={vendorBreakdown} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                      <Bar dataKey="value" name="Amount" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-12">No data</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Payment Status Pie */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment Status Distribution</CardTitle>
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Purchase Details ({filteredPurchases.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredPurchases.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No purchases found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-left p-3 font-medium">Purchase ID</th>
                        <th className="text-left p-3 font-medium">Vendor</th>
                        <th className="text-left p-3 font-medium hidden md:table-cell">Warehouse</th>
                        <th className="text-center p-3 font-medium hidden lg:table-cell">Items</th>
                        <th className="text-right p-3 font-medium">Amount</th>
                        <th className="text-center p-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPurchases.slice(0, 50).map((p: PurchaseData) => (
                        <tr key={p.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-muted-foreground text-xs">
                            {format(new Date(p.purchase_date), "dd/MM/yy")}
                          </td>
                          <td className="p-3 font-mono text-xs">{p.display_id}</td>
                          <td className="p-3 font-medium">{p.vendor_name}</td>
                          <td className="p-3 hidden md:table-cell text-muted-foreground">{p.warehouse_name}</td>
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
        </>
      )}
    </div>
  );
}
