import { useState } from "react";
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
import { Users, DollarSign, TrendingUp, HandCoins } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import * as XLSX from "xlsx";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";
import { ReportContainer, ReportKPICard } from "@/components/reports/ReportContainer";

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function AgentPerformanceReport() {
  const today = new Date();
  const thirtyAgo = new Date(today); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const [from, setFrom] = useState(thirtyAgo.toISOString().split("T")[0]);
  const [to, setTo] = useState(today.toISOString().split("T")[0]);
  const { data: companyInfo } = useCompanySettings();

  const { data, isLoading } = useQuery({
    queryKey: ["agent-perf-report", from, to],
    queryFn: async () => {
      const start = from + "T00:00:00", end = to + "T23:59:59";
      const [salesRes, txnRes, profilesRes, rolesRes, handoversRes, visitsRes] = await Promise.all([
        supabase.from("sales").select("recorded_by, total_amount, cash_amount, upi_amount, outstanding_amount, created_at").gte("created_at", start).lte("created_at", end),
        supabase.from("transactions").select("recorded_by, total_amount, cash_amount, upi_amount, created_at").gte("created_at", start).lte("created_at", end),
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("user_roles").select("user_id, role").neq("role", "customer"),
        supabase.from("handovers").select("user_id, cash_amount, upi_amount, status, handover_date").gte("handover_date", from).lte("handover_date", to),
        supabase.from("store_visits").select("session_id, store_id, visited_at").gte("visited_at", start).lte("visited_at", end),
      ]);

      const sales = salesRes.data || [];
      const txns = txnRes.data || [];
      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];
      const handovers = handoversRes.data || [];
      const visits = visitsRes.data || [];

      const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.full_name]));
      const staffIds = [...new Set(roles.map(r => r.user_id))];

      // Per-agent metrics
      const agents: Record<string, {
        name: string; salesAmount: number; salesCount: number; collectAmount: number; collectCount: number;
        creditGiven: number; cashCollected: number; upiCollected: number;
        handoverAmount: number; handoverPending: number; visitCount: number;
        dailySales: Record<string, number>; dailyCollections: Record<string, number>;
      }> = {};

      const ensureAgent = (uid: string) => {
        if (!agents[uid]) agents[uid] = {
          name: profileMap[uid] || "Unknown", salesAmount: 0, salesCount: 0,
          collectAmount: 0, collectCount: 0, creditGiven: 0, cashCollected: 0, upiCollected: 0,
          handoverAmount: 0, handoverPending: 0, visitCount: 0,
          dailySales: {}, dailyCollections: {},
        };
      };

      sales.forEach(s => {
        ensureAgent(s.recorded_by);
        const a = agents[s.recorded_by];
        a.salesAmount += Number(s.total_amount);
        a.salesCount += 1;
        a.creditGiven += Number(s.outstanding_amount);
        a.cashCollected += Number(s.cash_amount);
        a.upiCollected += Number(s.upi_amount);
        const day = s.created_at.split("T")[0];
        a.dailySales[day] = (a.dailySales[day] || 0) + Number(s.total_amount);
      });

      txns.forEach(t => {
        ensureAgent(t.recorded_by);
        const a = agents[t.recorded_by];
        a.collectAmount += Number(t.total_amount);
        a.collectCount += 1;
        a.cashCollected += Number(t.cash_amount);
        a.upiCollected += Number(t.upi_amount);
        const day = t.created_at.split("T")[0];
        a.dailyCollections[day] = (a.dailyCollections[day] || 0) + Number(t.total_amount);
      });

      handovers.forEach(h => {
        ensureAgent(h.user_id);
        const a = agents[h.user_id];
        const amt = Number(h.cash_amount) + Number(h.upi_amount);
        if (h.status === "confirmed") a.handoverAmount += amt;
        else if (h.status === "pending") a.handoverPending += amt;
      });

      // Visit count per agent (approximate via visits - we don't have user_id directly, skip if empty)
      // visits are linked to sessions, we'd need sessions to get user_id - skip for now

      const agentList = Object.entries(agents)
        .map(([id, a]) => ({
          id, ...a,
          totalValue: a.salesAmount + a.collectAmount,
          avgDailySales: Object.keys(a.dailySales).length > 0 ? a.salesAmount / Object.keys(a.dailySales).length : 0,
        }))
        .sort((a, b) => b.totalValue - a.totalValue);

      // Top metrics
      const totalSalesAll = agentList.reduce((s, a) => s + a.salesAmount, 0);
      const totalCollectAll = agentList.reduce((s, a) => s + a.collectAmount, 0);
      const totalValueAll = totalSalesAll + totalCollectAll;

      // Chart data for comparison
      const comparisonData = agentList.slice(0, 10).map(a => ({
        name: a.name.split(" ")[0],
        sales: a.salesAmount,
        collections: a.collectAmount,
      }));

      // Daily breakdown for selected range
      const allDays = new Set<string>();
      agentList.forEach(a => {
        Object.keys(a.dailySales).forEach(d => allDays.add(d));
        Object.keys(a.dailyCollections).forEach(d => allDays.add(d));
      });
      const sortedDays = [...allDays].sort();

      return {
        agentList, totalSalesAll, totalCollectAll, totalValueAll,
        agentCount: agentList.length, comparisonData, sortedDays,
      };
    },
  });

  const generateHTML = () => {
    if (!data) return "";
    
    // Create rows
    const rowsHtml = data.agentList.map((a: any, i: number) => `
      <tr>
        <td class="text-right">${i + 1}</td>
        <td class="font-medium">${a.name}</td>
        <td class="text-right font-mono">${fmt(a.salesAmount)}</td>
        <td class="text-right font-mono">${fmt(a.collectAmount)}</td>
        <td class="text-right font-mono font-bold">${fmt(a.totalValue)}</td>
        <td class="text-right font-mono text-neg">${fmt(a.creditGiven)}</td>
        <td class="text-right font-mono">${fmt(a.cashCollected)}</td>
        <td class="text-right font-mono">${fmt(a.upiCollected)}</td>
      </tr>
    `).join("");

    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card highlight">
          <div class="kpi-label">Total Sales</div>
          <div class="kpi-value">${fmt(data.totalSalesAll)}</div>
        </div>
        <div class="kpi-card highlight text-success">
          <div class="kpi-label">Total Collections</div>
          <div class="kpi-value text-success">${fmt(data.totalCollectAll)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Combined Value</div>
          <div class="kpi-value">${fmt(data.totalValueAll)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Active Agents</div>
          <div class="kpi-value">${data.agentCount}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="text-right">#</th>
            <th>Agent</th>
            <th class="text-right">Sales</th>
            <th class="text-right">Collections</th>
            <th class="text-right">Total</th>
            <th class="text-right">Credit</th>
            <th class="text-right">Cash</th>
            <th class="text-right">UPI</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;

    return generatePrintHTML({
      title: "Agent Performance Report",
      dateRange: `${from} to ${to}`,
      companyInfo: companyInfo || { companyName: "System", address: "", phone: "", email: "", gstin: "" },
      htmlContent,
    });
  };

  const exportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.agentList.map((a, i) => ({
      Rank: i + 1, Name: a.name, Sales: a.salesAmount, SalesCount: a.salesCount,
      Collections: a.collectAmount, CollectCount: a.collectCount, Total: a.totalValue,
      CreditGiven: a.creditGiven, Cash: a.cashCollected, UPI: a.upiCollected,
      HandoverDone: a.handoverAmount, HandoverPending: a.handoverPending,
    }))), "Agents");
    XLSX.writeFile(wb, `agent-performance-${from}-to-${to}.xlsx`);
    toast.success("Excel downloaded");
  };

  if (isLoading) return <TableSkeleton />;
  if (!data) return null;
  const d = data;

  return (
    <ReportContainer
      title="Agent Performance Report"
      subtitle="Sales and collections performance by team member"
      icon={<Users className="h-5 w-5" />}
      dateRange={`${from} to ${to}`}
      onPrint={() => {
        const html = generateHTML();
        const w = window.open("", "_blank");
        if (w) { w.document.write(html); w.document.close(); }
      }}
      onExportExcel={exportExcel}
      isLoading={false}
      filters={
        <div className="flex items-end gap-3">
          <div><Label className="text-xs text-muted-foreground">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40 h-9" /></div>
          <div><Label className="text-xs text-muted-foreground">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40 h-9" /></div>
        </div>
      }
      summaryCards={
        <>
          <ReportKPICard label="Total Sales" value={fmt(d.totalSalesAll)} highlight icon={<DollarSign className="h-4 w-4" />} />
          <ReportKPICard label="Total Collections" value={fmt(d.totalCollectAll)} trend="up" icon={<HandCoins className="h-4 w-4" />} />
          <ReportKPICard label="Combined Value" value={fmt(d.totalValueAll)} icon={<TrendingUp className="h-4 w-4" />} />
          <ReportKPICard label="Active Agents" value={String(d.agentCount)} icon={<Users className="h-4 w-4" />} />
        </>
      }
    >
      <Tabs defaultValue="ranking" className="space-y-4">
        <TabsList className="bg-muted/50 p-1 flex-wrap h-auto">
          <TabsTrigger value="ranking" className="text-xs">Rankings</TabsTrigger>
          <TabsTrigger value="comparison" className="text-xs">Comparison</TabsTrigger>
          <TabsTrigger value="details" className="text-xs">Detailed View</TabsTrigger>
        </TabsList>

        <TabsContent value="ranking">
          <Card className="border-0 shadow-sm"><CardContent className="pt-4 p-0">
            <Table><TableHeader><TableRow className="bg-muted/50">
              <TableHead className="font-semibold">#</TableHead><TableHead className="font-semibold">Agent</TableHead>
              <TableHead className="text-right font-semibold">Sales</TableHead><TableHead className="text-right font-semibold">Sales #</TableHead>
              <TableHead className="text-right font-semibold">Collections</TableHead><TableHead className="text-right font-semibold"># Collect</TableHead>
              <TableHead className="text-right font-semibold">Total</TableHead><TableHead className="text-right font-semibold">Credit</TableHead>
            </TableRow></TableHeader><TableBody>
              {d.agentList.map((a, i) => (
                <TableRow key={a.id} className="hover:bg-muted/30">
                  <TableCell><Badge variant={i < 3 ? "default" : "secondary"}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</Badge></TableCell>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-right">{fmt(a.salesAmount)}</TableCell>
                  <TableCell className="text-right">{a.salesCount}</TableCell>
                  <TableCell className="text-right text-green-600">{fmt(a.collectAmount)}</TableCell>
                  <TableCell className="text-right">{a.collectCount}</TableCell>
                  <TableCell className="text-right font-bold">{fmt(a.totalValue)}</TableCell>
                  <TableCell className="text-right text-red-600">{fmt(a.creditGiven)}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="comparison">
          <Card className="border-0 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Sales vs Collections (Top 10)</CardTitle></CardHeader><CardContent>
            {d.comparisonData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No data</p> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={d.comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Legend />
                  <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Sales" />
                  <Bar dataKey="collections" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Collections" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="details">
          <Card className="border-0 shadow-sm"><CardContent className="pt-4 p-0">
            <Table><TableHeader><TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Agent</TableHead><TableHead className="text-right font-semibold">Cash</TableHead>
              <TableHead className="text-right font-semibold">UPI</TableHead><TableHead className="text-right font-semibold">Handover Done</TableHead>
              <TableHead className="text-right font-semibold">Handover Pending</TableHead><TableHead className="text-right font-semibold">Avg Daily Sales</TableHead>
            </TableRow></TableHeader><TableBody>
              {d.agentList.map((a) => (
                <TableRow key={a.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-right">{fmt(a.cashCollected)}</TableCell>
                  <TableCell className="text-right">{fmt(a.upiCollected)}</TableCell>
                  <TableCell className="text-right text-green-600">{fmt(a.handoverAmount)}</TableCell>
                  <TableCell className="text-right text-amber-600">{fmt(a.handoverPending)}</TableCell>
                  <TableCell className="text-right">{fmt(a.avgDailySales)}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </ReportContainer>
  );
}
