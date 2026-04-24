import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingDown, AlertTriangle, CheckCircle2, Clock, DollarSign } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { ReportContainer, ReportKPICard } from "./ReportContainer";
import { ReportFilters, DateRange } from "./ReportFilters";
import { format, subDays } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

const BUCKET_COLORS = ["hsl(142, 72%, 42%)", "hsl(38, 92%, 50%)", "hsl(280, 65%, 60%)", "hsl(0, 72%, 51%)"];
const fmt = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;

interface AgingRow {
  store_id: string;
  store_name: string;
  display_id: string;
  customer_name: string;
  outstanding: number;
  bucket_current: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
  days_since_sale: number;
}

export default function ReceivablesAgingReport() {
  const { currentWarehouse } = useWarehouse();
  const { data: companyInfo } = useCompanySettings();
  const [dateRange] = useState<DateRange>({ from: subDays(new Date(), 30), to: new Date() });
  const [sortField, setSortField] = useState<"outstanding" | "days">("outstanding");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["receivables-aging", dateRange],
    queryFn: async () => {
      const asOfDate = format(dateRange.to, "yyyy-MM-dd");

      const [storesRes, txnRes, salesRes, customersRes, storeTypesRes] = await Promise.all([
        supabase.from("stores").select("id, name, display_id, outstanding, customer_id, store_type_id, created_at").eq("is_active", true),
        supabase.from("transactions").select("store_id, transaction_date, type, amount").lte("transaction_date", asOfDate).order("transaction_date", { ascending: false }),
        supabase.from("sales").select("store_id, created_at, total_amount, outstanding_amount").lte("created_at", asOfDate + "T23:59:59").order("created_at", { ascending: false }),
        supabase.from("customers").select("id, name"),
        supabase.from("store_types").select("id, name"),
      ]);

      const stores = storesRes.data || [];
      const txns = txnRes.data || [];
      const sales = salesRes.data || [];
      const customers = customersRes.data || [];
      const storeTypes = storeTypesRes.data || [];

      const customerMap = Object.fromEntries(customers.map(c => [c.id, c.name]));
      const storeTypeMap = Object.fromEntries(storeTypes.map(t => [t.id, t.name]));

      const lastPayment: Record<string, string> = {};
      txns.forEach((t: any) => {
        if (t.type === "payment" && (!lastPayment[t.store_id] || t.transaction_date > lastPayment[t.store_id])) {
          lastPayment[t.store_id] = t.transaction_date;
        }
      });

      const lastSale: Record<string, string> = {};
      const firstSale: Record<string, string> = {};
      sales.forEach((s: any) => {
        if (!lastSale[s.store_id] || s.created_at > lastSale[s.store_id]) lastSale[s.store_id] = s.created_at;
        if (!firstSale[s.store_id] || s.created_at < firstSale[s.store_id]) firstSale[s.store_id] = s.created_at;
      });

      const asOf = new Date(asOfDate);
      const rows: AgingRow[] = stores
        .filter((s: any) => Number(s.outstanding) > 0)
        .map((s: any) => {
          const lastPay = lastPayment[s.id] ? new Date(lastPayment[s.id]) : null;
          const lastS = lastSale[s.id] ? new Date(lastSale[s.id]) : null;
          const firstS = firstSale[s.id] ? new Date(firstSale[s.id]) : null;
          const refDate = lastPay || lastS || firstS || asOf;
          const daysSince = Math.floor((asOf.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));

          let bCurrent = 0, b3160 = 0, b6190 = 0, b90p = 0;
          const outstanding = Number(s.outstanding) || 0;
          if (outstanding > 0) {
            if (daysSince <= 30) bCurrent = outstanding;
            else if (daysSince <= 60) b3160 = outstanding;
            else if (daysSince <= 90) b6190 = outstanding;
            else b90p = outstanding;
          }

          return {
            store_id: s.id,
            store_name: s.name,
            display_id: s.display_id,
            customer_name: customerMap[s.customer_id] || "—",
            outstanding,
            bucket_current: bCurrent,
            bucket_31_60: b3160,
            bucket_61_90: b6190,
            bucket_90_plus: b90p,
            days_since_sale: daysSince,
          };
        });

      return { rows, customerMap, storeTypeMap };
    },
  });

  const rows = data?.rows || [];
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = sortField === "outstanding" ? a.outstanding : a.days_since_sale;
      const vb = sortField === "outstanding" ? b.outstanding : b.days_since_sale;
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [rows, sortField, sortDir]);

  const totals = useMemo(() => {
    return {
      total: rows.reduce((s, r) => s + r.outstanding, 0),
      current: rows.reduce((s, r) => s + r.bucket_current, 0),
      d3060: rows.reduce((s, r) => s + r.bucket_31_60, 0),
      d6190: rows.reduce((s, r) => s + r.bucket_61_90, 0),
      d90p: rows.reduce((s, r) => s + r.bucket_90_plus, 0),
      count: rows.length,
    };
  }, [rows]);

  const pieData = [
    { name: "Current (0-30d)", value: totals.current, fill: BUCKET_COLORS[0] },
    { name: "31-60 days", value: totals.d3060, fill: BUCKET_COLORS[1] },
    { name: "61-90 days", value: totals.d6190, fill: BUCKET_COLORS[2] },
    { name: "90+ days", value: totals.d90p, fill: BUCKET_COLORS[3] },
  ].filter(d => d.value > 0);

  const getAgeBadge = (days: number) => {
    if (days <= 30) return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Current</Badge>;
    if (days <= 60) return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">31-60d</Badge>;
    if (days <= 90) return <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs">61-90d</Badge>;
    return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">90+d</Badge>;
  };

  const handleSort = (field: "outstanding" | "days") => {
    if (sortField === field) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortField(field); setSortDir("desc"); }
  };

  return (
    <ReportContainer title="Receivables Aging" loading={isLoading}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <ReportKPICard label="Total Outstanding" value={fmt(totals.total)} icon={DollarSign} className="lg:col-span-2" />
          <ReportKPICard label="Current (0-30d)" value={fmt(totals.current)} icon={CheckCircle2} iconClass="text-green-600" className="lg:col-span-2" />
          <ReportKPICard label="90+ Days Overdue" value={fmt(totals.d90p)} icon={AlertTriangle} iconClass="text-red-600" className="lg:col-span-2" />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Outstanding by Age Bucket</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Aging Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={pieData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `₹${(v/100000).toFixed(1)}L`} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Store-wise Aging ({totals.count} stores with outstanding)</CardTitle>
              <div className="flex gap-2 text-xs">
                <button onClick={() => handleSort("outstanding")} className={`flex items-center gap-1 px-2 py-1 rounded ${sortField === "outstanding" ? "bg-muted font-semibold" : "hover:bg-muted"}`}>
                  Outstanding {sortField === "outstanding" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </button>
                <button onClick={() => handleSort("days")} className={`flex items-center gap-1 px-2 py-1 rounded ${sortField === "days" ? "bg-muted font-semibold" : "hover:bg-muted"}`}>
                  Days Overdue {sortField === "days" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">31-60d</TableHead>
                    <TableHead className="text-right">61-90d</TableHead>
                    <TableHead className="text-right">90+d</TableHead>
                    <TableHead>Age</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((row) => (
                    <TableRow key={row.store_id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/stores/${row.store_id}`)}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{row.store_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{row.display_id}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{row.customer_name}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{fmt(row.outstanding)}</TableCell>
                      <TableCell className="text-right text-green-600">{row.bucket_current > 0 ? fmt(row.bucket_current) : "—"}</TableCell>
                      <TableCell className="text-right text-amber-600">{row.bucket_31_60 > 0 ? fmt(row.bucket_31_60) : "—"}</TableCell>
                      <TableCell className="text-right text-purple-600">{row.bucket_61_90 > 0 ? fmt(row.bucket_61_90) : "—"}</TableCell>
                      <TableCell className="text-right text-red-600">{row.bucket_90_plus > 0 ? fmt(row.bucket_90_plus) : "—"}</TableCell>
                      <TableCell>{getAgeBadge(row.days_since_sale)}</TableCell>
                    </TableRow>
                  ))}
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No outstanding balances found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
                <tfoot className="bg-muted/60 font-semibold">
                  <TableRow>
                    <TableCell colSpan={2}>TOTAL ({totals.count} stores)</TableCell>
                    <TableCell className="text-right">{fmt(totals.total)}</TableCell>
                    <TableCell className="text-right">{fmt(totals.current)}</TableCell>
                    <TableCell className="text-right">{fmt(totals.d3060)}</TableCell>
                    <TableCell className="text-right">{fmt(totals.d6190)}</TableCell>
                    <TableCell className="text-right">{fmt(totals.d90p)}</TableCell>
                    <TableCell />
                  </TableRow>
                </tfoot>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </ReportContainer>
  );
}