import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, ArrowUpRight, ArrowDownRight, CreditCard, PiggyBank } from "lucide-react";
import { format, subMonths, startOfMonth, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, isSameDay, isSameWeek, isSameMonth } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell } from "recharts";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";
import * as XLSX from "xlsx";
import { ReportContainer, ReportKPICard } from "@/components/reports/ReportContainer";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

type GroupBy = "day" | "week" | "month";

export default function PaymentFlowReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(subMonths(new Date(), 2)),
    to: new Date(),
  });
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const { data: companySettings } = useCompanySettings();

  // Fetch customer payments (transactions)
  const { data: customerPayments = [], isLoading: cpLoading } = useQuery({
    queryKey: ["payment-flow-customer", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, display_id, total_amount, cash_amount, upi_amount, payment_date")
        .gte("payment_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("payment_date", format(dateRange.to, "yyyy-MM-dd"));
      return data || [];
    },
  });

  // Fetch vendor payments
  const { data: vendorPayments = [], isLoading: vpLoading } = useQuery({
    queryKey: ["payment-flow-vendor", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("vendor_payments")
        .select("id, display_id, amount, payment_method, payment_date")
        .gte("payment_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("payment_date", format(dateRange.to, "yyyy-MM-dd"));
      return data || [];
    },
  });

  // Fetch expenses
  const { data: expenses = [], isLoading: expLoading } = useQuery({
    queryKey: ["payment-flow-expenses", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("expenses")
        .select("id, display_id, amount, payment_method, expense_date, expense_categories(name)")
        .gte("expense_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("expense_date", format(dateRange.to, "yyyy-MM-dd"));
      return data || [];
    },
  });

  // Fetch worker payments
  const { data: workerPayments = [], isLoading: wpLoading } = useQuery({
    queryKey: ["payment-flow-worker", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("worker_payments")
        .select("id, amount, payment_method, payment_date")
        .gte("payment_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("payment_date", format(dateRange.to, "yyyy-MM-dd"));
      return data || [];
    },
  });

  const isLoading = cpLoading || vpLoading || expLoading || wpLoading;

  // Summary calculations
  const summary = useMemo(() => {
    const totalInflow = customerPayments.reduce((sum: number, p: any) => sum + Number(p.total_amount || 0), 0);
    
    const vendorOutflow = vendorPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
    const expenseOutflow = expenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
    const workerOutflow = workerPayments.reduce((sum: number, w: any) => sum + Number(w.amount), 0);
    const totalOutflow = vendorOutflow + expenseOutflow + workerOutflow;

    const netCashFlow = totalInflow - totalOutflow;

    // By payment method
    const inflowByMethod: Record<string, number> = {};
    customerPayments.forEach((p: any) => {
      const cash = Number(p.cash_amount || 0);
      const upi = Number(p.upi_amount || 0);
      if (cash > 0) inflowByMethod.cash = (inflowByMethod.cash || 0) + cash;
      if (upi > 0) inflowByMethod.upi = (inflowByMethod.upi || 0) + upi;
      if (cash === 0 && upi === 0) {
        inflowByMethod.other = (inflowByMethod.other || 0) + Number(p.total_amount || 0);
      }
    });

    const outflowByMethod: Record<string, number> = {};
    [...vendorPayments, ...expenses, ...workerPayments].forEach((p: any) => {
      const method = p.payment_method || "other";
      outflowByMethod[method] = (outflowByMethod[method] || 0) + Number(p.amount);
    });

    return {
      totalInflow,
      totalOutflow,
      vendorOutflow,
      expenseOutflow,
      workerOutflow,
      netCashFlow,
      inflowByMethod,
      outflowByMethod,
    };
  }, [customerPayments, vendorPayments, expenses, workerPayments]);

  // Time-series data
  const timeSeriesData = useMemo(() => {
    let intervals: Date[];
    let formatStr: string;
    let isSamePeriod: (d1: Date, d2: Date) => boolean;

    switch (groupBy) {
      case "week":
        intervals = eachWeekOfInterval({ start: dateRange.from, end: dateRange.to });
        formatStr = "MMM d";
        isSamePeriod = isSameWeek;
        break;
      case "month":
        intervals = eachMonthOfInterval({ start: dateRange.from, end: dateRange.to });
        formatStr = "MMM yyyy";
        isSamePeriod = isSameMonth;
        break;
      default:
        intervals = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
        formatStr = "MMM d";
        isSamePeriod = isSameDay;
    }

    return intervals.map((date) => {
      const inflow = customerPayments
        .filter((p: any) => isSamePeriod(new Date(p.payment_date), date))
        .reduce((sum: number, p: any) => sum + Number(p.total_amount || 0), 0);

      const outflow = 
        vendorPayments.filter((p: any) => isSamePeriod(new Date(p.payment_date), date)).reduce((sum: number, p: any) => sum + Number(p.amount), 0) +
        expenses.filter((e: any) => isSamePeriod(new Date(e.expense_date), date)).reduce((sum: number, e: any) => sum + Number(e.amount), 0) +
        workerPayments.filter((w: any) => isSamePeriod(new Date(w.payment_date), date)).reduce((sum: number, w: any) => sum + Number(w.amount), 0);

      return {
        date: format(date, formatStr),
        inflow,
        outflow,
        net: inflow - outflow,
      };
    });
  }, [customerPayments, vendorPayments, expenses, workerPayments, dateRange, groupBy]);

  // Outflow breakdown pie chart
  const outflowBreakdown = useMemo(() => {
    return [
      { name: "Vendor Payments", value: summary.vendorOutflow },
      { name: "Expenses", value: summary.expenseOutflow },
      { name: "Worker Payments", value: summary.workerOutflow },
    ].filter(x => x.value > 0);
  }, [summary]);

  // Payment method breakdown
  const methodBreakdown = useMemo(() => {
    const methods = new Set([...Object.keys(summary.inflowByMethod), ...Object.keys(summary.outflowByMethod)]);
    return Array.from(methods).map(method => ({
      method: method.toUpperCase(),
      inflow: summary.inflowByMethod[method] || 0,
      outflow: summary.outflowByMethod[method] || 0,
    }));
  }, [summary]);

  const summaryCards = [
    { label: "Total Inflow", value: `₹${summary.totalInflow.toLocaleString()}`, icon: ArrowUpRight, iconColor: "green" },
    { label: "Total Outflow", value: `₹${summary.totalOutflow.toLocaleString()}`, icon: ArrowDownRight, iconColor: "red" },
    { label: "Net Cash Flow", value: `₹${summary.netCashFlow.toLocaleString()}`, icon: summary.netCashFlow >= 0 ? PiggyBank : Wallet, iconColor: summary.netCashFlow >= 0 ? "blue" : "yellow" },
    { label: "Transactions", value: (customerPayments.length + vendorPayments.length + expenses.length + workerPayments.length).toString(), icon: CreditCard, iconColor: "purple" },
  ];

  const filtersSection = (
    <div className="flex flex-wrap items-end gap-3">
      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} />
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
        <Badge 
          variant={groupBy === "month" ? "default" : "outline"} 
          className="cursor-pointer"
          onClick={() => setGroupBy("month")}
        >
          Monthly
        </Badge>
      </div>
    </div>
  );

  const summaryCardsSection = (
    <>
      <ReportKPICard
        label="Total Inflow"
        value={`₹${summary.totalInflow.toLocaleString()}`}
        subValue={`${customerPayments.length} payments`}
        icon={ArrowUpRight}
        trend="up"
        highlight
      />
      <ReportKPICard
        label="Total Outflow"
        value={`₹${summary.totalOutflow.toLocaleString()}`}
        subValue={`${vendorPayments.length + expenses.length + workerPayments.length} payments`}
        icon={ArrowDownRight}
        trend="down"
      />
      <ReportKPICard
        label="Net Cash Flow"
        value={`₹${summary.netCashFlow.toLocaleString()}`}
        icon={summary.netCashFlow >= 0 ? PiggyBank : Wallet}
        trend={summary.netCashFlow >= 0 ? "up" : "down"}
        highlight
      />
      <ReportKPICard
        label="Total Transactions"
        value={(customerPayments.length + vendorPayments.length + expenses.length + workerPayments.length).toString()}
        icon={CreditCard}
      />
    </>
  );

  const handlePrintHTML = () => {
    if (!companySettings) return "";
    const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-label">Total Inflow</div><div class="kpi-value text-pos">${fmt(summary.totalInflow)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Total Outflow</div><div class="kpi-value text-neg">${fmt(summary.totalOutflow)}</div></div>
        <div class="kpi-card highlight"><div class="kpi-label">Net Cash Flow</div><div class="kpi-value">${fmt(summary.netCashFlow)}</div></div>
      </div>

      <h2>Outflow Breakdown</h2>
      <table>
        <thead><tr><th>Category</th><th class="text-right">Amount</th><th class="text-right">% of Total</th></tr></thead>
        <tbody>
          <tr><td>Vendor Payments</td><td class="text-right font-semibold">${fmt(summary.vendorOutflow)}</td><td class="text-right">${summary.totalOutflow > 0 ? ((summary.vendorOutflow / summary.totalOutflow) * 100).toFixed(1) : 0}%</td></tr>
          <tr><td>Expenses</td><td class="text-right font-semibold">${fmt(summary.expenseOutflow)}</td><td class="text-right">${summary.totalOutflow > 0 ? ((summary.expenseOutflow / summary.totalOutflow) * 100).toFixed(1) : 0}%</td></tr>
          <tr><td>Worker Payments</td><td class="text-right font-semibold">${fmt(summary.workerOutflow)}</td><td class="text-right">${summary.totalOutflow > 0 ? ((summary.workerOutflow / summary.totalOutflow) * 100).toFixed(1) : 0}%</td></tr>
        </tbody>
        <tfoot><tr style="background:var(--accent);color:white;font-weight:700;"><td>TOTAL OUTFLOW</td><td class="text-right">${fmt(summary.totalOutflow)}</td><td></td></tr></tfoot>
      </table>

      <h2>Cash Flow Timeline (${groupBy})</h2>
      <table>
        <thead><tr><th>Period</th><th class="text-right">Inflow</th><th class="text-right">Outflow</th><th class="text-right">Net</th></tr></thead>
        <tbody>
          ${timeSeriesData.filter(d => d.inflow > 0 || d.outflow > 0).map(d => `
            <tr>
              <td>${d.date}</td>
              <td class="text-right text-pos">${fmt(d.inflow)}</td>
              <td class="text-right text-neg">${fmt(d.outflow)}</td>
              <td class="text-right font-semibold ${d.net >= 0 ? 'text-pos' : 'text-neg'}">${fmt(d.net)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <h2>By Payment Method</h2>
      <table>
        <thead><tr><th>Method</th><th class="text-right">Inflow</th><th class="text-right">Outflow</th><th class="text-right">Net</th></tr></thead>
        <tbody>
          ${methodBreakdown.map(m => `
            <tr>
              <td class="font-semibold">${m.method}</td>
              <td class="text-right text-pos">${fmt(m.inflow)}</td>
              <td class="text-right text-neg">${fmt(m.outflow)}</td>
              <td class="text-right font-semibold">${fmt(m.inflow - m.outflow)}</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot><tr style="background:var(--accent);color:white;font-weight:700;"><td>TOTAL</td><td class="text-right">${fmt(summary.totalInflow)}</td><td class="text-right">${fmt(summary.totalOutflow)}</td><td class="text-right">${fmt(summary.netCashFlow)}</td></tr></tfoot>
      </table>
    `;
    return generatePrintHTML({
      title: "Payment Flow Report",
      dateRange: `${format(dateRange.from, "MMM d, yyyy")} — ${format(dateRange.to, "MMM d, yyyy")}`,
      metadata: { "Inflow": fmt(summary.totalInflow), "Outflow": fmt(summary.totalOutflow), "Net": fmt(summary.netCashFlow) },
      companyInfo: companySettings,
      htmlContent,
    });
  };

  const exportExcel = () => {
    // Summary sheet
    const summaryData = [
      { Metric: "Total Inflow", Value: summary.totalInflow },
      { Metric: "Total Outflow", Value: summary.totalOutflow },
      { Metric: "Net Cash Flow", Value: summary.netCashFlow },
      { Metric: "Vendor Payments", Value: summary.vendorOutflow },
      { Metric: "Expenses", Value: summary.expenseOutflow },
      { Metric: "Worker Payments", Value: summary.workerOutflow },
    ];

    // Timeline sheet
    const timelineData = timeSeriesData.map(d => ({
      Period: d.date,
      Inflow: d.inflow,
      Outflow: d.outflow,
      "Net Cash Flow": d.net,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(timelineData), "Timeline");
    XLSX.writeFile(wb, `payment-flow-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.xlsx`);
  };

  return (
    <ReportContainer
      title="Payment Flow Report"
      subtitle="Cash inflows, outflows & net position analysis"
      icon={Wallet}
      dateRange={`${format(dateRange.from, "MMM d, yyyy")} — ${format(dateRange.to, "MMM d, yyyy")}`}
      onPrint={handlePrintHTML}
      onExportExcel={exportExcel}
      isLoading={isLoading}
      filters={filtersSection}
      summaryCards={summaryCardsSection}
    >
      {/* Cash Flow Chart */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Cash Flow Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={groupBy === "day" ? Math.floor(timeSeriesData.length / 10) : 0} />
              <YAxis tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="inflow" name="Inflow" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outflow" name="Outflow" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Net Cash Flow Trend */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Cash Flow Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.floor(timeSeriesData.length / 6)} />
                <YAxis tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                <Line type="monotone" dataKey="net" name="Net Cash Flow" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Outflow Breakdown */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Outflow Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {outflowBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={outflowBreakdown}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {outflowBreakdown.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">No outflow data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Method Breakdown */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">By Payment Method</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-semibold text-xs">Payment Method</th>
                  <th className="text-right p-3 font-semibold text-xs">Inflow</th>
                  <th className="text-right p-3 font-semibold text-xs">Outflow</th>
                  <th className="text-right p-3 font-semibold text-xs">Net</th>
                </tr>
              </thead>
              <tbody>
                {methodBreakdown.map((m) => (
                  <tr key={m.method} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{m.method}</td>
                    <td className="p-3 text-right text-green-600">₹{m.inflow.toLocaleString()}</td>
                    <td className="p-3 text-right text-red-600">₹{m.outflow.toLocaleString()}</td>
                    <td className="p-3 text-right">
                      <span className={m.inflow - m.outflow >= 0 ? "text-blue-600 font-semibold" : "text-amber-600 font-semibold"}>
                        ₹{(m.inflow - m.outflow).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-semibold">
                  <td className="p-3">TOTAL</td>
                  <td className="p-3 text-right text-green-600">₹{summary.totalInflow.toLocaleString()}</td>
                  <td className="p-3 text-right text-red-600">₹{summary.totalOutflow.toLocaleString()}</td>
                  <td className="p-3 text-right text-blue-600">₹{summary.netCashFlow.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </ReportContainer>
  );
}
