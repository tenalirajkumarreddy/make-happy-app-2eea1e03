import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Users, ShoppingCart, CreditCard, TrendingUp, TrendingDown, Search, Package, DollarSign } from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { ReportExportBar } from "./ReportExportBar";
import { ReportSummaryCards } from "./ReportSummaryCards";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface CustomerData {
  id: string;
  name: string;
  phone: string;
  display_id: string;
  store_type: string;
  total_sales: number;
  total_orders: number;
  total_payments: number;
  outstanding: number;
  last_sale_date: string | null;
  avg_order_value: number;
  payment_ratio: number;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function CustomerReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(subMonths(new Date(), 3)),
    to: new Date(),
  });
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"sales" | "orders" | "outstanding">("sales");

  // Fetch customers
  const { data: customers = [], isLoading: custLoading } = useQuery({
    queryKey: ["customer-report-customers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, display_id, outstanding_balance, store_types(name)");
      return data || [];
    },
  });

  // Fetch sales
  const { data: sales = [], isLoading: salesLoading } = useQuery({
    queryKey: ["customer-report-sales", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, customer_id, total_amount, created_at")
        .gte("created_at", format(dateRange.from, "yyyy-MM-dd"))
        .lte("created_at", format(dateRange.to, "yyyy-MM-dd") + "T23:59:59");
      return data || [];
    },
  });

  // Fetch transactions (payments)
  const { data: transactions = [], isLoading: txnLoading } = useQuery({
    queryKey: ["customer-report-transactions", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, customer_id, amount, created_at")
        .eq("type", "payment")
        .gte("created_at", format(dateRange.from, "yyyy-MM-dd"))
        .lte("created_at", format(dateRange.to, "yyyy-MM-dd") + "T23:59:59");
      return data || [];
    },
  });

  const isLoading = custLoading || salesLoading || txnLoading;

  // Combine customer data
  const customerData = useMemo(() => {
    const data: CustomerData[] = customers.map((c: any) => {
      const custSales = sales.filter((s: any) => s.customer_id === c.id);
      const custPayments = transactions.filter((t: any) => t.customer_id === c.id);
      
      const totalSales = custSales.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);
      const totalPayments = custPayments.reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      const lastSale = custSales.length > 0 
        ? custSales.reduce((latest: any, s: any) => s.created_at > latest.created_at ? s : latest).created_at
        : null;

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        display_id: c.display_id,
        store_type: c.store_types?.name || "General",
        total_sales: totalSales,
        total_orders: custSales.length,
        total_payments: totalPayments,
        outstanding: Number(c.outstanding_balance) || 0,
        last_sale_date: lastSale,
        avg_order_value: custSales.length > 0 ? totalSales / custSales.length : 0,
        payment_ratio: totalSales > 0 ? (totalPayments / totalSales) * 100 : 100,
      };
    });

    // Sort
    if (sortBy === "sales") {
      data.sort((a, b) => b.total_sales - a.total_sales);
    } else if (sortBy === "orders") {
      data.sort((a, b) => b.total_orders - a.total_orders);
    } else {
      data.sort((a, b) => b.outstanding - a.outstanding);
    }

    return data;
  }, [customers, sales, transactions, sortBy]);

  // Filter
  const filteredData = useMemo(() => {
    if (!search) return customerData;
    const s = search.toLowerCase();
    return customerData.filter((c: CustomerData) => 
      c.name.toLowerCase().includes(s) || 
      c.phone.includes(s) ||
      c.display_id.toLowerCase().includes(s)
    );
  }, [customerData, search]);

  // Summary
  const summary = useMemo(() => {
    const totalCustomers = filteredData.length;
    const activeCustomers = filteredData.filter((c: CustomerData) => c.total_orders > 0).length;
    const totalRevenue = filteredData.reduce((sum, c) => sum + c.total_sales, 0);
    const totalOutstanding = filteredData.reduce((sum, c) => sum + c.outstanding, 0);
    const totalPayments = filteredData.reduce((sum, c) => sum + c.total_payments, 0);

    return { totalCustomers, activeCustomers, totalRevenue, totalOutstanding, totalPayments };
  }, [filteredData]);

  // Top customers chart
  const topCustomersChart = useMemo(() => {
    return filteredData.slice(0, 10).map((c: CustomerData) => ({
      name: c.name.length > 15 ? c.name.substring(0, 15) + "..." : c.name,
      sales: c.total_sales,
      payments: c.total_payments,
    }));
  }, [filteredData]);

  // Outstanding distribution
  const outstandingByType = useMemo(() => {
    const byType: Record<string, number> = {};
    filteredData.forEach((c: CustomerData) => {
      const type = c.store_type;
      byType[type] = (byType[type] || 0) + c.outstanding;
    });
    return Object.entries(byType)
      .filter(([_, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [filteredData]);

  const summaryCards = [
    { label: "Total Customers", value: summary.totalCustomers.toString(), icon: Users, iconColor: "blue" },
    { label: "Active Customers", value: summary.activeCustomers.toString(), icon: ShoppingCart, iconColor: "green" },
    { label: "Total Revenue", value: `₹${(summary.totalRevenue / 1000).toFixed(0)}K`, icon: TrendingUp, iconColor: "purple" },
    { label: "Outstanding", value: `₹${(summary.totalOutstanding / 1000).toFixed(0)}K`, icon: DollarSign, iconColor: "red" },
  ];

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Customer Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`, 14, 23);

    autoTable(doc, {
      startY: 30,
      head: [["Customer", "Type", "Orders", "Sales", "Payments", "Outstanding"]],
      body: filteredData.map((c: CustomerData) => [
        c.name,
        c.store_type,
        c.total_orders.toString(),
        `₹${c.total_sales.toLocaleString()}`,
        `₹${c.total_payments.toLocaleString()}`,
        `₹${c.outstanding.toLocaleString()}`,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`customer-report-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.pdf`);
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData.map((c: CustomerData) => ({
      "Customer ID": c.display_id,
      "Name": c.name,
      "Phone": c.phone,
      "Store Type": c.store_type,
      "Total Orders": c.total_orders,
      "Total Sales": c.total_sales,
      "Total Payments": c.total_payments,
      "Outstanding": c.outstanding,
      "Avg Order Value": c.avg_order_value.toFixed(2),
      "Payment Ratio %": c.payment_ratio.toFixed(1),
      "Last Sale": c.last_sale_date || "",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, `customer-report-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} />
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Badge 
            variant={sortBy === "sales" ? "default" : "outline"} 
            className="cursor-pointer"
            onClick={() => setSortBy("sales")}
          >
            By Sales
          </Badge>
          <Badge 
            variant={sortBy === "orders" ? "default" : "outline"} 
            className="cursor-pointer"
            onClick={() => setSortBy("orders")}
          >
            By Orders
          </Badge>
          <Badge 
            variant={sortBy === "outstanding" ? "default" : "outline"} 
            className="cursor-pointer"
            onClick={() => setSortBy("outstanding")}
          >
            By Outstanding
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
            {/* Top Customers Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 10 Customers</CardTitle>
              </CardHeader>
              <CardContent>
                {topCustomersChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topCustomersChart} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                      <Legend />
                      <Bar dataKey="sales" name="Sales" fill="#3b82f6" />
                      <Bar dataKey="payments" name="Payments" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-12">No customer data</p>
                )}
              </CardContent>
            </Card>

            {/* Outstanding by Type */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Outstanding by Store Type</CardTitle>
              </CardHeader>
              <CardContent>
                {outstandingByType.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={outstandingByType}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {outstandingByType.map((_, index) => (
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

          {/* Customer Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer Details ({filteredData.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredData.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No customers found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Customer</th>
                        <th className="text-left p-3 font-medium hidden md:table-cell">Type</th>
                        <th className="text-center p-3 font-medium">Orders</th>
                        <th className="text-right p-3 font-medium">Sales</th>
                        <th className="text-right p-3 font-medium hidden lg:table-cell">Payments</th>
                        <th className="text-right p-3 font-medium">Outstanding</th>
                        <th className="text-center p-3 font-medium hidden xl:table-cell">Pay %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.slice(0, 50).map((c: CustomerData) => (
                        <tr key={c.id} className="border-b hover:bg-muted/30">
                          <td className="p-3">
                            <p className="font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.display_id}</p>
                          </td>
                          <td className="p-3 hidden md:table-cell">
                            <Badge variant="outline" className="text-xs">{c.store_type}</Badge>
                          </td>
                          <td className="p-3 text-center">{c.total_orders}</td>
                          <td className="p-3 text-right font-medium">₹{c.total_sales.toLocaleString()}</td>
                          <td className="p-3 text-right hidden lg:table-cell text-green-600">
                            ₹{c.total_payments.toLocaleString()}
                          </td>
                          <td className="p-3 text-right">
                            <span className={c.outstanding > 0 ? "text-red-600 font-semibold" : "text-green-600"}>
                              ₹{c.outstanding.toLocaleString()}
                            </span>
                          </td>
                          <td className="p-3 text-center hidden xl:table-cell">
                            <Badge variant={c.payment_ratio >= 80 ? "default" : c.payment_ratio >= 50 ? "secondary" : "destructive"}>
                              {c.payment_ratio.toFixed(0)}%
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {filteredData.length > 50 && (
                <p className="text-center text-muted-foreground mt-4 text-sm">
                  Showing 50 of {filteredData.length} customers. Export to see all.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
