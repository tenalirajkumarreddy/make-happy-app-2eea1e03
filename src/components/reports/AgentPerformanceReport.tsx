import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/shared/StatCard";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Users, DollarSign, Banknote, TrendingUp, Award,
  FileText, FileSpreadsheet, MapPin, HandCoins,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function AgentPerformanceReport() {
  const today = new Date();
  const thirtyAgo = new Date(today); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const [from, setFrom] = useState(thirtyAgo.toISOString().split("T")[0]);
  const [to, setTo] = useState(today.toISOString().split("T")[0]);

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

  const exportPDF = () => {
    if (!data) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, pw, 18, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(14);
    doc.text("Agent Performance Report", 10, 12);
    doc.setFontSize(9); doc.text(`${from} to ${to}`, pw - 10, 12, { align: "right" });

    doc.setTextColor(0, 0, 0);
    autoTable(doc, {
      startY: 24,
      head: [["#", "Agent", "Sales", "Sales #", "Collections", "Collect #", "Total", "Credit Given", "Cash", "UPI"]],
      body: data.agentList.map((a, i) => [
        i + 1, a.name, fmt(a.salesAmount), a.salesCount, fmt(a.collectAmount), a.collectCount,
        fmt(a.totalValue), fmt(a.creditGiven), fmt(a.cashCollected), fmt(a.upiCollected),
      ]),
      theme: "grid", styles: { fontSize: 6, cellPadding: 1.2 }, headStyles: { fillColor: [30, 41, 59] },
      margin: { left: 10, right: 10 },
    });
    doc.save(`agent-performance-${from}-to-${to}.pdf`);
    toast.success("PDF downloaded");
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" /></div>
        <Button variant="outline" size="sm" onClick={exportPDF}><FileText className="h-4 w-4 mr-1" />PDF</Button>
        <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Total Sales" value={fmt(d.totalSalesAll)} icon={DollarSign} iconColor="primary" />
        <StatCard title="Total Collections" value={fmt(d.totalCollectAll)} icon={HandCoins} iconColor="success" />
        <StatCard title="Combined Value" value={fmt(d.totalValueAll)} icon={TrendingUp} iconColor="purple" />
        <StatCard title="Active Agents" value={String(d.agentCount)} icon={Users} iconColor="info" />
      </div>

      <Tabs defaultValue="ranking">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="ranking">Rankings</TabsTrigger>
          <TabsTrigger value="comparison">Comparison</TabsTrigger>
          <TabsTrigger value="details">Detailed View</TabsTrigger>
        </TabsList>

        <TabsContent value="ranking">
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow>
              <TableHead>#</TableHead><TableHead>Agent</TableHead>
              <TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Sales #</TableHead>
              <TableHead className="text-right">Collections</TableHead><TableHead className="text-right"># Collect</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Credit</TableHead>
            </TableRow></TableHeader><TableBody>
              {d.agentList.map((a, i) => (
                <TableRow key={a.id}>
                  <TableCell><Badge variant={i < 3 ? "default" : "secondary"}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</Badge></TableCell>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-right">{fmt(a.salesAmount)}</TableCell>
                  <TableCell className="text-right">{a.salesCount}</TableCell>
                  <TableCell className="text-right">{fmt(a.collectAmount)}</TableCell>
                  <TableCell className="text-right">{a.collectCount}</TableCell>
                  <TableCell className="text-right font-bold">{fmt(a.totalValue)}</TableCell>
                  <TableCell className="text-right text-destructive">{fmt(a.creditGiven)}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="comparison">
          <Card><CardHeader><CardTitle className="text-sm">Sales vs Collections (Top 10)</CardTitle></CardHeader><CardContent>
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
          <Card><CardContent className="pt-4">
            <Table><TableHeader><TableRow>
              <TableHead>Agent</TableHead><TableHead className="text-right">Cash</TableHead>
              <TableHead className="text-right">UPI</TableHead><TableHead className="text-right">Handover Done</TableHead>
              <TableHead className="text-right">Handover Pending</TableHead><TableHead className="text-right">Avg Daily Sales</TableHead>
            </TableRow></TableHeader><TableBody>
              {d.agentList.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-right">{fmt(a.cashCollected)}</TableCell>
                  <TableCell className="text-right">{fmt(a.upiCollected)}</TableCell>
                  <TableCell className="text-right text-success">{fmt(a.handoverAmount)}</TableCell>
                  <TableCell className="text-right text-warning">{fmt(a.handoverPending)}</TableCell>
                  <TableCell className="text-right">{fmt(a.avgDailySales)}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
