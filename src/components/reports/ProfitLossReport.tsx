import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package, Receipt, Wallet, PieChart } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { ReportExportBar } from "./ReportExportBar";
import { ReportSummaryCards } from "./ReportSummaryCards";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Legend } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const EXPENSE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function ProfitLossReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });

  // Fetch sales for revenue
  const { data: sales = [], isLoading: salesLoading } = useQuery({
    queryKey: ["pl-sales", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, total_amount, created_at")
        .gte("created_at", format(dateRange.from, "yyyy-MM-dd"))
        .lte("created_at", format(dateRange.to, "yyyy-MM-dd") + "T23:59:59");
      return data || [];
    },
  });

  // Fetch sale items for COGS calculation
  const { data: saleItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["pl-sale-items", dateRange],
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
        .select("id, quantity, unit_price, total, product_id, sale_id, products(mrp, gst_rate)")
        .in("sale_id", saleIds);
      return data || [];
    },
  });

  // Fetch purchases for COGS
  const { data: purchases = [], isLoading: purchLoading } = useQuery({
    queryKey: ["pl-purchases", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchases")
        .select("id, total_amount, purchase_date")
        .gte("purchase_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("purchase_date", format(dateRange.to, "yyyy-MM-dd"));
      return data || [];
    },
  });

  // Fetch expenses
  const { data: expenses = [], isLoading: expLoading } = useQuery({
    queryKey: ["pl-expenses", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("expenses")
        .select("id, amount, expense_date, expense_categories(name)")
        .gte("expense_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("expense_date", format(dateRange.to, "yyyy-MM-dd"));
      return data || [];
    },
  });

  // Fetch sale returns
  const { data: saleReturns = [], isLoading: returnsLoading } = useQuery({
    queryKey: ["pl-returns", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("sale_returns")
        .select("id, total_amount, return_date")
        .eq("status", "completed")
        .gte("return_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("return_date", format(dateRange.to, "yyyy-MM-dd"));
      return data || [];
    },
  });

  const isLoading = salesLoading || itemsLoading || purchLoading || expLoading || returnsLoading;

  // Calculate P&L
  const plData = useMemo(() => {
    // Revenue
    const grossRevenue = sales.reduce((sum, s: any) => sum + Number(s.total_amount || 0), 0);
    const totalReturns = saleReturns.reduce((sum, r: any) => sum + Number(r.total_amount || 0), 0);
    const netRevenue = grossRevenue - totalReturns;

    // COGS (using purchases as proxy - ideally would use weighted average cost)
    const cogs = purchases.reduce((sum, p: any) => sum + Number(p.total_amount || 0), 0);

    // Gross Profit
    const grossProfit = netRevenue - cogs;
    const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    // Operating Expenses by category
    const expensesByCategory: Record<string, number> = {};
    expenses.forEach((e: any) => {
      const category = e.expense_categories?.name || "Other";
      expensesByCategory[category] = (expensesByCategory[category] || 0) + Number(e.amount || 0);
    });

    const totalExpenses = expenses.reduce((sum, e: any) => sum + Number(e.amount || 0), 0);

    // Operating Profit (EBIT)
    const operatingProfit = grossProfit - totalExpenses;
    const operatingMargin = netRevenue > 0 ? (operatingProfit / netRevenue) * 100 : 0;

    // Net Profit (assuming no interest/tax for simplicity)
    const netProfit = operatingProfit;
    const netMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

    return {
      grossRevenue,
      totalReturns,
      netRevenue,
      cogs,
      grossProfit,
      grossMargin,
      expensesByCategory,
      totalExpenses,
      operatingProfit,
      operatingMargin,
      netProfit,
      netMargin,
    };
  }, [sales, saleReturns, purchases, expenses]);

  // Expense chart data
  const expenseChartData = useMemo(() => {
    return Object.entries(plData.expensesByCategory).map(([name, value]) => ({
      name,
      value,
    }));
  }, [plData]);

  // P&L breakdown for bar chart
  const plBreakdown = [
    { name: "Revenue", value: plData.netRevenue, fill: "#10b981" },
    { name: "COGS", value: -plData.cogs, fill: "#f59e0b" },
    { name: "Gross Profit", value: plData.grossProfit, fill: "#3b82f6" },
    { name: "Expenses", value: -plData.totalExpenses, fill: "#ef4444" },
    { name: "Net Profit", value: plData.netProfit, fill: plData.netProfit >= 0 ? "#10b981" : "#ef4444" },
  ];

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Profit & Loss Statement", 14, 20);
    doc.setFontSize(10);
    doc.text(`Period: ${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`, 14, 28);

    const rows = [
      ["Gross Revenue", "", `₹${plData.grossRevenue.toLocaleString()}`],
      ["Less: Sales Returns", "", `(₹${plData.totalReturns.toLocaleString()})`],
      ["Net Revenue", "", `₹${plData.netRevenue.toLocaleString()}`],
      ["", "", ""],
      ["Less: Cost of Goods Sold", "", `(₹${plData.cogs.toLocaleString()})`],
      ["Gross Profit", `${plData.grossMargin.toFixed(1)}%`, `₹${plData.grossProfit.toLocaleString()}`],
      ["", "", ""],
      ["Operating Expenses:", "", ""],
      ...Object.entries(plData.expensesByCategory).map(([cat, amt]) => [
        `  ${cat}`, "", `(₹${amt.toLocaleString()})`
      ]),
      ["Total Operating Expenses", "", `(₹${plData.totalExpenses.toLocaleString()})`],
      ["", "", ""],
      ["Operating Profit (EBIT)", `${plData.operatingMargin.toFixed(1)}%`, `₹${plData.operatingProfit.toLocaleString()}`],
      ["", "", ""],
      ["Net Profit", `${plData.netMargin.toFixed(1)}%`, `₹${plData.netProfit.toLocaleString()}`],
    ];

    autoTable(doc, {
      startY: 35,
      head: [["Description", "Margin", "Amount"]],
      body: rows,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [41, 128, 185] },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 30, halign: "right" },
        2: { cellWidth: 50, halign: "right" },
      },
    });

    doc.save(`profit-loss-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.pdf`);
  };

  const summaryCards = [
    { label: "Net Revenue", value: `₹${plData.netRevenue.toLocaleString()}`, icon: ShoppingCart, iconColor: "green" },
    { label: "COGS", value: `₹${plData.cogs.toLocaleString()}`, icon: Package, iconColor: "orange" },
    { label: "Gross Profit", value: `₹${plData.grossProfit.toLocaleString()}`, subValue: `${plData.grossMargin.toFixed(1)}% margin`, icon: TrendingUp, iconColor: "blue" },
    { label: "Expenses", value: `₹${plData.totalExpenses.toLocaleString()}`, icon: Receipt, iconColor: "red" },
    { label: "Net Profit", value: `₹${plData.netProfit.toLocaleString()}`, subValue: `${plData.netMargin.toFixed(1)}% margin`, icon: Wallet, iconColor: plData.netProfit >= 0 ? "green" : "red" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Profit & Loss Statement</h2>
          <p className="text-sm text-muted-foreground">Revenue, costs, and profitability analysis</p>
        </div>
        <ReportExportBar onExportPDF={exportPDF} showExcel={false} showCSV={false} showPrint={false} />
      </div>

      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <ReportSummaryCards cards={summaryCards} columns={5} />

          <div className="grid lg:grid-cols-2 gap-6">
            {/* P&L Breakdown Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">P&L Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={plBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" width={100} />
                    <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                    <Bar dataKey="value" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Expense Breakdown Pie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Expense Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {expenseChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPie>
                      <Pie
                        data={expenseChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {expenseChartData.map((_, idx) => (
                          <Cell key={idx} fill={EXPENSE_COLORS[idx % EXPENSE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                    </RechartsPie>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    No expenses recorded
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detailed P&L Statement */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Detailed Statement</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Description</th>
                      <th className="px-4 py-3 text-right font-medium">Amount</th>
                      <th className="px-4 py-3 text-right font-medium">% of Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr className="bg-green-50 dark:bg-green-900/20">
                      <td className="px-4 py-3 font-medium">Gross Revenue</td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">₹{plData.grossRevenue.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">100%</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 pl-8 text-muted-foreground">Less: Sales Returns</td>
                      <td className="px-4 py-3 text-right text-red-600">(₹{plData.totalReturns.toLocaleString()})</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {plData.grossRevenue > 0 ? ((plData.totalReturns / plData.grossRevenue) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                    <tr className="bg-blue-50 dark:bg-blue-900/20 font-medium">
                      <td className="px-4 py-3">Net Revenue</td>
                      <td className="px-4 py-3 text-right text-blue-600">₹{plData.netRevenue.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">—</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 pl-8 text-muted-foreground">Less: Cost of Goods Sold</td>
                      <td className="px-4 py-3 text-right text-red-600">(₹{plData.cogs.toLocaleString()})</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {plData.netRevenue > 0 ? ((plData.cogs / plData.netRevenue) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                    <tr className="bg-blue-50 dark:bg-blue-900/20 font-medium">
                      <td className="px-4 py-3">Gross Profit</td>
                      <td className="px-4 py-3 text-right text-blue-600">₹{plData.grossProfit.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{plData.grossMargin.toFixed(1)}%</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium" colSpan={3}>Operating Expenses</td>
                    </tr>
                    {Object.entries(plData.expensesByCategory).map(([category, amount]) => (
                      <tr key={category}>
                        <td className="px-4 py-3 pl-8 text-muted-foreground">{category}</td>
                        <td className="px-4 py-3 text-right text-red-600">(₹{amount.toLocaleString()})</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {plData.netRevenue > 0 ? ((amount / plData.netRevenue) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2">
                      <td className="px-4 py-3 pl-8 font-medium">Total Operating Expenses</td>
                      <td className="px-4 py-3 text-right font-medium text-red-600">(₹{plData.totalExpenses.toLocaleString()})</td>
                      <td className="px-4 py-3 text-right">
                        {plData.netRevenue > 0 ? ((plData.totalExpenses / plData.netRevenue) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                    <tr className={`font-bold text-lg ${plData.netProfit >= 0 ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                      <td className="px-4 py-4">Net Profit</td>
                      <td className={`px-4 py-4 text-right ${plData.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        ₹{plData.netProfit.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-right">{plData.netMargin.toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
