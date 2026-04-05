import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package, Receipt, Wallet, BarChart2 } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell } from "recharts";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";
import { ReportContainer, ReportKPICard } from "@/components/reports/ReportContainer";

const EXPENSE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function ProfitLossReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const { data: companyInfo } = useCompanySettings();

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

  const generateHTML = () => {
    const expensesHtml = Object.entries(plData.expensesByCategory)
      .map(([cat, amt]) => `
        <tr>
          <td style="padding-left: 20pt; color: #64748b;">${cat}</td>
          <td></td>
          <td class="text-right text-neg">(₹${amt.toLocaleString()})</td>
        </tr>
      `).join("");

    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card highlight">
          <div class="kpi-label">Gross Revenue</div>
          <div class="kpi-value">₹${plData.grossRevenue.toLocaleString()}</div>
        </div>
        <div class="kpi-card highlight">
          <div class="kpi-label">Gross Profit</div>
          <div class="kpi-value">₹${plData.grossProfit.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Expenses</div>
          <div class="kpi-value text-neg">₹${plData.totalExpenses.toLocaleString()}</div>
        </div>
        <div class="kpi-card ${plData.netProfit >= 0 ? "highlight" : ""}">
          <div class="kpi-label">Net Profit</div>
          <div class="kpi-value ${plData.netProfit >= 0 ? "text-pos" : "text-neg"}">₹${plData.netProfit.toLocaleString()}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="text-right" style="width: 100px;">Margin</th>
            <th class="text-right" style="width: 150px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="font-medium">Gross Revenue</td>
            <td></td>
            <td class="text-right font-mono">₹${plData.grossRevenue.toLocaleString()}</td>
          </tr>
          <tr>
            <td class="text-muted">Less: Sales Returns</td>
            <td></td>
            <td class="text-right font-mono text-neg">(₹${plData.totalReturns.toLocaleString()})</td>
          </tr>
          <tr class="total-row">
            <td class="font-bold">Net Revenue</td>
            <td></td>
            <td class="text-right font-mono font-bold">₹${plData.netRevenue.toLocaleString()}</td>
          </tr>
          <tr><td colspan="3" style="height: 10pt;"></td></tr>
          
          <tr>
            <td class="text-muted">Less: Cost of Goods Sold</td>
            <td></td>
            <td class="text-right font-mono text-neg">(₹${plData.cogs.toLocaleString()})</td>
          </tr>
          <tr class="total-row">
            <td class="font-bold">Gross Profit</td>
            <td class="text-right text-muted">${plData.grossMargin.toFixed(1)}%</td>
            <td class="text-right font-mono font-bold">₹${plData.grossProfit.toLocaleString()}</td>
          </tr>
          <tr><td colspan="3" style="height: 10pt;"></td></tr>
          
          <tr>
            <td class="font-bold">Operating Expenses:</td>
            <td></td>
            <td></td>
          </tr>
          ${expensesHtml}
          <tr class="total-row">
            <td class="font-bold">Total Operating Expenses</td>
            <td></td>
            <td class="text-right font-mono font-bold text-neg">(₹${plData.totalExpenses.toLocaleString()})</td>
          </tr>
          <tr><td colspan="3" style="height: 10pt;"></td></tr>
          
          <tr class="total-row" style="background-color: #f8fafc;">
            <td class="font-bold text-lg">Operating Profit (EBIT)</td>
            <td class="text-right text-muted">${plData.operatingMargin.toFixed(1)}%</td>
            <td class="text-right font-mono font-bold text-lg">₹${plData.operatingProfit.toLocaleString()}</td>
          </tr>
          <tr><td colspan="3" style="height: 10pt;"></td></tr>

          <tr class="total-row" style="background-color: #f0fdf4;">
            <td class="font-bold text-lg">Net Profit</td>
            <td class="text-right text-muted">${plData.netMargin.toFixed(1)}%</td>
            <td class="text-right font-mono font-bold text-lg ${plData.netProfit >= 0 ? "text-pos" : "text-neg"}">₹${plData.netProfit.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
    `;

    return generatePrintHTML({
      title: "Profit & Loss Statement",
      dateRange: `${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`,
      companyInfo: companyInfo || { companyName: "System", address: "", phone: "", email: "", gstin: "" },
      htmlContent,
    });
  };

  const summaryCards = [
    { label: "Net Revenue", value: `₹${plData.netRevenue.toLocaleString()}`, icon: ShoppingCart, iconColor: "green" },
    { label: "COGS", value: `₹${plData.cogs.toLocaleString()}`, icon: Package, iconColor: "orange" },
    { label: "Gross Profit", value: `₹${plData.grossProfit.toLocaleString()}`, subValue: `${plData.grossMargin.toFixed(1)}% margin`, icon: TrendingUp, iconColor: "blue" },
    { label: "Expenses", value: `₹${plData.totalExpenses.toLocaleString()}`, icon: Receipt, iconColor: "red" },
    { label: "Net Profit", value: `₹${plData.netProfit.toLocaleString()}`, subValue: `${plData.netMargin.toFixed(1)}% margin`, icon: Wallet, iconColor: plData.netProfit >= 0 ? "green" : "red" },
  ];

  return (
    <ReportContainer
      title="Profit & Loss Statement"
      subtitle="Revenue, costs, and profitability analysis"
      icon={<BarChart2 className="h-5 w-5" />}
      dateRange={`${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`}
      onPrint={() => {
        const html = generateHTML();
        const w = window.open("", "_blank");
        if (w) { w.document.write(html); w.document.close(); }
      }}
      isLoading={isLoading}
      filters={<ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} />}
      summaryCards={
        <>
          <ReportKPICard label="Net Revenue" value={`₹${(plData.netRevenue / 1000).toFixed(0)}K`} icon={<ShoppingCart className="h-4 w-4" />} />
          <ReportKPICard label="COGS" value={`₹${(plData.cogs / 1000).toFixed(0)}K`} icon={<Package className="h-4 w-4" />} />
          <ReportKPICard label="Gross Profit" value={`₹${(plData.grossProfit / 1000).toFixed(0)}K`} subValue={`${plData.grossMargin.toFixed(1)}% margin`} highlight icon={<TrendingUp className="h-4 w-4" />} />
          <ReportKPICard label="Expenses" value={`₹${(plData.totalExpenses / 1000).toFixed(0)}K`} trend="down" icon={<Receipt className="h-4 w-4" />} />
          <ReportKPICard label="Net Profit" value={`₹${(plData.netProfit / 1000).toFixed(0)}K`} subValue={`${plData.netMargin.toFixed(1)}% margin`} trend={plData.netProfit >= 0 ? "up" : "down"} highlight={plData.netProfit >= 0} icon={<Wallet className="h-4 w-4" />} />
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid lg:grid-cols-2 gap-6">
          {/* P&L Breakdown Chart */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">P&L Breakdown</CardTitle>
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
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Expense Breakdown</CardTitle>
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
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardHeader className="pb-2 bg-muted/30">
            <CardTitle className="text-base font-semibold">Detailed Statement</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-sm">Description</th>
                    <th className="px-4 py-3 text-right font-semibold text-sm">Amount</th>
                    <th className="px-4 py-3 text-right font-semibold text-sm">% of Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  <tr className="bg-green-50 dark:bg-green-900/20">
                    <td className="px-4 py-3 font-medium">Gross Revenue</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600">₹{plData.grossRevenue.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">100%</td>
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
                    <td className="px-4 py-3 text-right text-blue-600 font-semibold">₹{plData.netRevenue.toLocaleString()}</td>
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
                    <td className="px-4 py-3 text-right text-blue-600 font-semibold">₹{plData.grossProfit.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{plData.grossMargin.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-semibold" colSpan={3}>Operating Expenses</td>
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
                    <td className="px-4 py-3 pl-8 font-semibold">Total Operating Expenses</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">(₹{plData.totalExpenses.toLocaleString()})</td>
                    <td className="px-4 py-3 text-right">
                      {plData.netRevenue > 0 ? ((plData.totalExpenses / plData.netRevenue) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                  <tr className={`font-bold text-base ${plData.netProfit >= 0 ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
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
      </div>
    </ReportContainer>
  );
}
