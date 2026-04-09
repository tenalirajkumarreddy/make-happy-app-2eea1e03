import { useState } from "react";
import { formatDate } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  ShoppingCart, TrendingUp, DollarSign, Banknote,
  Smartphone,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";
import { ReportContainer, ReportKPICard } from "@/components/reports/ReportContainer";
import * as XLSX from "xlsx";

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const pct = (n: number, t: number) => t > 0 ? ((n / t) * 100).toFixed(1) + "%" : "0%";
const COLORS = ["hsl(217, 91%, 50%)", "hsl(142, 72%, 42%)", "hsl(38, 92%, 50%)", "hsl(280, 65%, 60%)", "hsl(0, 72%, 51%)", "hsl(190, 80%, 45%)"];

export default function SalesReport() {
  const today = new Date();
  const thirtyAgo = new Date(today);
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const [from, setFrom] = useState(thirtyAgo.toISOString().split("T")[0]);
  const [to, setTo] = useState(today.toISOString().split("T")[0]);
  const { data: companyInfo } = useCompanySettings();

  const { data, isLoading } = useQuery({
    queryKey: ["sales-report", from, to],
    queryFn: async () => {
      const startOfDay = from + "T00:00:00";
      const endOfDay = to + "T23:59:59";

      const [salesRes, saleItemsRes, profilesRes, storesRes, storeTypesRes] = await Promise.all([
        supabase.from("sales").select("*, stores(name, store_type_id)").gte("created_at", startOfDay).lte("created_at", endOfDay).order("created_at"),
        supabase.from("sale_items").select("*, products(name, unit, category)").gte("created_at", startOfDay).lte("created_at", endOfDay),
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("stores").select("id, name, display_id, store_type_id, outstanding"),
        supabase.from("store_types").select("id, name"),
      ]);

      const sales = salesRes.data || [];
      const saleItems = saleItemsRes.data || [];
      const profiles = profilesRes.data || [];
      const stores = storesRes.data || [];
      const storeTypes = storeTypesRes.data || [];

      const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.full_name]));
      const storeTypeMap = Object.fromEntries(storeTypes.map(t => [t.id, t.name]));
      const storeMap = Object.fromEntries(stores.map(s => [s.id, s]));

      // Summary
      const totalSales = sales.reduce((s, r) => s + Number(r.total_amount), 0);
      const totalCash = sales.reduce((s, r) => s + Number(r.cash_amount), 0);
      const totalUpi = sales.reduce((s, r) => s + Number(r.upi_amount), 0);
      const totalCredit = sales.reduce((s, r) => s + Number(r.outstanding_amount), 0);
      const avgSale = sales.length > 0 ? totalSales / sales.length : 0;

      // Daily trend
      const dailyMap: Record<string, { amount: number; count: number }> = {};
      sales.forEach(s => {
        const day = s.created_at.split("T")[0];
        if (!dailyMap[day]) dailyMap[day] = { amount: 0, count: 0 };
        dailyMap[day].amount += Number(s.total_amount);
        dailyMap[day].count += 1;
      });
      const dailyTrend = Object.entries(dailyMap).sort().map(([d, v]) => ({ date: d.slice(5), amount: v.amount, count: v.count }));

      // Days in range for EOM projection
      const fromDate = new Date(from);
      const toDate = new Date(to);
      const daysInRange = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
      const dailyAvgSales = totalSales / daysInRange;
      const currentMonth = new Date();
      const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
      const dayOfMonth = currentMonth.getDate();
      const estimatedEOM = dailyAvgSales * daysInMonth;

      // Growth rate: compare first half vs second half
      const midpoint = Math.floor(dailyTrend.length / 2);
      const firstHalf = dailyTrend.slice(0, midpoint).reduce((s, d) => s + d.amount, 0);
      const secondHalf = dailyTrend.slice(midpoint).reduce((s, d) => s + d.amount, 0);
      const growthRate = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf * 100).toFixed(1) : "0";

      // Agent performance
      const agentMap: Record<string, { name: string; amount: number; count: number; cash: number; upi: number; credit: number }> = {};
      sales.forEach(s => {
        const uid = s.recorded_by;
        if (!agentMap[uid]) agentMap[uid] = { name: profileMap[uid] || "Unknown", amount: 0, count: 0, cash: 0, upi: 0, credit: 0 };
        agentMap[uid].amount += Number(s.total_amount);
        agentMap[uid].count += 1;
        agentMap[uid].cash += Number(s.cash_amount);
        agentMap[uid].upi += Number(s.upi_amount);
        agentMap[uid].credit += Number(s.outstanding_amount);
      });
      const agentRanking = Object.values(agentMap).sort((a, b) => b.amount - a.amount);

      // Store performance
      const storePerf: Record<string, { name: string; type: string; amount: number; count: number; avgSale: number }> = {};
      sales.forEach(s => {
        const sid = s.store_id;
        const st = storeMap[sid];
        const typeName = st ? storeTypeMap[st.store_type_id] || "Other" : "Unknown";
        if (!storePerf[sid]) storePerf[sid] = { name: (s.stores as any)?.name || "Unknown", type: typeName, amount: 0, count: 0, avgSale: 0 };
        storePerf[sid].amount += Number(s.total_amount);
        storePerf[sid].count += 1;
      });
      Object.values(storePerf).forEach(s => { s.avgSale = s.count > 0 ? s.amount / s.count : 0; });
      const storeRanking = Object.values(storePerf).sort((a, b) => b.amount - a.amount);

      // Store type breakdown
      const storeTypePerf: Record<string, { name: string; amount: number; count: number }> = {};
      sales.forEach(s => {
        const st = storeMap[s.store_id];
        const typeName = st ? storeTypeMap[st.store_type_id] || "Other" : "Other";
        if (!storeTypePerf[typeName]) storeTypePerf[typeName] = { name: typeName, amount: 0, count: 0 };
        storeTypePerf[typeName].amount += Number(s.total_amount);
        storeTypePerf[typeName].count += 1;
      });
      const storeTypeData = Object.values(storeTypePerf).sort((a, b) => b.amount - a.amount);

      // Payment method split
      const paymentSplit = [
        { name: "Cash", value: totalCash },
        { name: "UPI", value: totalUpi },
        { name: "Credit", value: totalCredit },
      ].filter(p => p.value > 0);

      return {
        totalSales, totalCash, totalUpi, totalCredit, avgSale, salesCount: sales.length,
        dailyTrend, dailyAvgSales, estimatedEOM, growthRate,
        agentRanking, storeRanking, storeTypeData, paymentSplit,
      };
    },
  });

  const generateHTML = () => {
    if (!data) return "";
    
    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card highlight">
          <div class="kpi-label">Total Sales</div>
          <div class="kpi-value">${fmt(data.totalSales)}</div>
        </div>
        <div class="kpi-card highlight">
          <div class="kpi-label">Avg Sale</div>
          <div class="kpi-value">${fmt(data.avgSale)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Cash</div>
          <div class="kpi-value text-pos">${fmt(data.totalCash)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">UPI</div>
          <div class="kpi-value text-pos">${fmt(data.totalUpi)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Credit Given</div>
          <div class="kpi-value text-neg">${fmt(data.totalCredit)}</div>
        </div>
      </div>

      <div style="display: flex; gap: 20pt; margin-bottom: 20pt; page-break-inside: avoid;">
        <div style="flex: 1;">
          <h2>Daily Trend</h2>
          <table>
            <thead><tr><th>Date</th><th class="text-right">Sales</th><th class="text-right">Amount</th></tr></thead>
            <tbody>
              ${data.dailyTrend.map((d: any) => `<tr>
                <td class="font-medium">${d.date}</td>
                <td class="text-right font-mono">${d.count}</td>
                <td class="text-right font-mono font-bold">${fmt(d.amount)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>

        <div style="flex: 1;">
          <h2>Agent Ranking</h2>
          <table>
            <thead><tr><th>Agent</th><th class="text-right">Sales</th><th class="text-right">Amount</th></tr></thead>
            <tbody>
              ${data.agentRanking.map((a: any) => `<tr>
                <td class="font-medium">${a.name}</td>
                <td class="text-right font-mono">${a.count}</td>
                <td class="text-right font-mono font-bold">${fmt(a.amount)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div style="page-break-inside: avoid;">
        <h2>Store Ranking (Top 20)</h2>
        <table>
          <thead><tr><th>Store</th><th>Type</th><th class="text-right">Avg Sale</th><th class="text-right">Total Amount</th></tr></thead>
          <tbody>
            ${data.storeRanking.slice(0, 20).map((s: any) => `<tr>
              <td class="font-medium">${s.name}</td>
              <td class="text-muted">${s.type}</td>
              <td class="text-right font-mono">${fmt(s.avgSale)}</td>
              <td class="text-right font-mono font-bold">${fmt(s.amount)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;

    return generatePrintHTML({
      title: "Sales Report",
      dateRange: `${formatDate(from)} to ${formatDate(to)}`,
      companyInfo: companyInfo || { companyName: "System", address: "", phone: "", email: "", gstin: "" },
      htmlContent,
      metadata: {
        "Sale Count": String(data.salesCount),
        "Daily Avg": fmt(data.dailyAvgSales),
        "Estimated EOM": fmt(data.estimatedEOM),
        "Growth Rate": `${data.growthRate}%`
      }
    });
  };

  const exportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Sales Report", `${from} to ${to}`],
      [], ["Metric", "Value"],
      ["Total Sales", data.totalSales], ["Cash", data.totalCash], ["UPI", data.totalUpi],
      ["Credit", data.totalCredit], ["Sale Count", data.salesCount], ["Avg Sale", data.avgSale],
      ["Daily Avg", data.dailyAvgSales], ["Est. EOM", data.estimatedEOM], ["Growth %", data.growthRate],
    ]), "Summary");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.agentRanking), "Agents");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.storeRanking), "Stores");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.dailyTrend), "Daily Trend");

    XLSX.writeFile(wb, `sales-report-${from}-to-${to}.xlsx`);
    toast.success("Excel downloaded");
  };

  if (isLoading) return <TableSkeleton />;
  if (!data) return null;
  const d = data;

  const dateRangeLabel = `${formatDate(from)} - ${formatDate(to)}`;

  return (
    <ReportContainer
      title="Sales Report"
      subtitle="Comprehensive sales analysis with trends and rankings"
      icon={<ShoppingCart className="h-5 w-5" />}
      dateRange={dateRangeLabel}
      onPrint={() => {
        const html = generateHTML();
        const w = window.open("", "_blank");
        if (w) { w.document.write(html); w.document.close(); }
      }}
      onExportExcel={exportExcel}
      isLoading={isLoading}
      filters={
        <>
          <div>
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36 mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36 mt-1 h-9" />
          </div>
        </>
      }
      summaryCards={
        <>
          <ReportKPICard label="Total Sales" value={fmt(d.totalSales)} highlight icon={<ShoppingCart className="h-4 w-4" />} />
          <ReportKPICard label="Sale Count" value={String(d.salesCount)} icon={<TrendingUp className="h-4 w-4" />} />
          <ReportKPICard label="Cash Collected" value={fmt(d.totalCash)} trend="up" icon={<Banknote className="h-4 w-4" />} />
          <ReportKPICard label="UPI Payments" value={fmt(d.totalUpi)} icon={<Smartphone className="h-4 w-4" />} />
          <ReportKPICard label="Credit Given" value={fmt(d.totalCredit)} trend="down" icon={<DollarSign className="h-4 w-4" />} />
          <ReportKPICard label="Avg Sale Value" value={fmt(d.avgSale)} subValue={`${d.salesCount} sales`} />
        </>
      }
    >
      <div className="space-y-6">
        {/* Projection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200/50">
            <CardContent className="pt-4 text-center">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wider">Daily Average</p>
              <p className="text-2xl font-bold mt-1 text-blue-900 dark:text-blue-100">{fmt(d.dailyAvgSales)}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 border-emerald-200/50">
            <CardContent className="pt-4 text-center">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Estimated EOM</p>
              <p className="text-2xl font-bold mt-1 text-emerald-900 dark:text-emerald-100">{fmt(d.estimatedEOM)}</p>
            </CardContent>
          </Card>
          <Card className={`bg-gradient-to-br ${Number(d.growthRate) >= 0 ? "from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 border-green-200/50" : "from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20 border-red-200/50"}`}>
            <CardContent className="pt-4 text-center">
              <p className={`text-xs font-medium uppercase tracking-wider ${Number(d.growthRate) >= 0 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>Growth Rate</p>
              <p className={`text-2xl font-bold mt-1 ${Number(d.growthRate) >= 0 ? "text-green-900 dark:text-green-100" : "text-red-900 dark:text-red-100"}`}>
                {Number(d.growthRate) >= 0 ? "↑" : "↓"} {d.growthRate}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="trend" className="space-y-4">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="trend" className="text-xs">Sales Trend</TabsTrigger>
            <TabsTrigger value="agents" className="text-xs">Agent Ranking</TabsTrigger>
            <TabsTrigger value="stores" className="text-xs">Store Ranking</TabsTrigger>
            <TabsTrigger value="types" className="text-xs">By Store Type</TabsTrigger>
            <TabsTrigger value="split" className="text-xs">Payment Split</TabsTrigger>
          </TabsList>

          <TabsContent value="trend">
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Daily Sales Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {d.dailyTrend.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">No data available for this period</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={d.dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} 
                        formatter={(value: number) => [fmt(value), "Sales"]}
                      />
                      <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} name="Amount" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agents">
            <Card className="border-border/50">
              <CardContent className="pt-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead className="text-right">Total Sales</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">Cash</TableHead>
                        <TableHead className="text-right">UPI</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.agentRanking.map((a, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Badge variant={i === 0 ? "default" : i < 3 ? "secondary" : "outline"} className="w-7 justify-center">
                              {i + 1}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{fmt(a.amount)}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{a.count}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{fmt(a.cash)}</TableCell>
                          <TableCell className="text-right font-mono text-blue-600">{fmt(a.upi)}</TableCell>
                          <TableCell className="text-right font-mono text-red-600">{fmt(a.credit)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stores">
            <Card className="border-border/50">
              <CardContent className="pt-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Store</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Total Sales</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">Avg Sale</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.storeRanking.slice(0, 30).map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{s.type}</Badge></TableCell>
                          <TableCell className="text-right font-mono font-semibold">{fmt(s.amount)}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{s.count}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(s.avgSale)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="types">
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Sales by Store Type</CardTitle>
              </CardHeader>
              <CardContent>
                {d.storeTypeData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">No data available</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={d.storeTypeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(value: number) => [fmt(value), "Sales"]}
                      />
                      <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Sales" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="split">
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Payment Method Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {d.paymentSplit.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">No data available</p>
                ) : (
                  <div className="flex flex-col md:flex-row items-center justify-center gap-8">
                    <ResponsiveContainer width={280} height={280}>
                      <PieChart>
                        <Pie 
                          data={d.paymentSplit} 
                          cx="50%" 
                          cy="50%" 
                          innerRadius={60} 
                          outerRadius={100} 
                          paddingAngle={3} 
                          dataKey="value"
                        >
                          {d.paymentSplit.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmt(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-3">
                      {d.paymentSplit.map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-sm font-medium w-16">{item.name}</span>
                          <span className="text-sm font-mono">{fmt(item.value)}</span>
                          <span className="text-xs text-muted-foreground">({pct(item.value, d.totalSales)})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ReportContainer>
  );
}
