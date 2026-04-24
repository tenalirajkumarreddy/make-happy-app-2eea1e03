import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportContainer, ReportKPICard } from "./ReportContainer";
import { ReportFilters, DateRange } from "./ReportFilters";
import { format, subDays } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Route, MapPin, CheckCircle2, ShoppingCart, Banknote, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const fmt = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;

export default function RouteEfficiencyReport() {
  const { currentWarehouse } = useWarehouse();
  const { role } = useAuth();
  const isAdmin = role === "super_admin" || role === "manager";
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [selectedRoute, setSelectedRoute] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["route-efficiency", dateRange, selectedRoute, currentWarehouse?.id],
    queryFn: async () => {
      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd") + "T23:59:59";

      const [routesRes, storeVisitsRes, salesRes, collectionsRes, sessionsRes] = await Promise.all([
        supabase.from("routes").select("id, name, stores(id, name, display_id, outstanding, warehouse_id)").eq("is_active", true),
        supabase.from("store_visits").select("store_id, session_id, visited_at, route_sessions(route_id)").gte("visited_at", from).lte("visited_at", to),
        supabase.from("sales").select("store_id, total_amount, outstanding_amount, created_at").gte("created_at", from).lte("created_at", to),
        supabase.from("transactions").select("store_id, amount").eq("type", "payment").gte("transaction_date", from).lte("transaction_date", to),
        supabase.from("route_sessions").select("id, route_id, status, started_at").eq("status", "completed").gte("started_at", from).lte("started_at", to),
      ]);

      const routes = routesRes.data || [];
      const visits = storeVisitsRes.data || [];
      const sales = salesRes.data || [];
      const collections = collectionsRes.data || [];
      const sessions = sessionsRes.data || [];

      const visitedStores = new Set(visits.map((v: any) => v.store_id));
      const visitedByRoute: Record<string, number> = {};
      visits.forEach((v: any) => {
        const routeId = (v.route_sessions as any)?.route_id;
        if (routeId) visitedByRoute[routeId] = (visitedByRoute[routeId] || 0) + 1;
      });

      const salesByStore: Record<string, { count: number; amount: number; credit: number }> = {};
      sales.forEach((s: any) => {
        if (!salesByStore[s.store_id]) salesByStore[s.store_id] = { count: 0, amount: 0, credit: 0 };
        salesByStore[s.store_id].count++;
        salesByStore[s.store_id].amount += Number(s.total_amount) || 0;
        salesByStore[s.store_id].credit += Number(s.outstanding_amount) || 0;
      });

      const collByStore: Record<string, number> = {};
      collections.forEach((c: any) => {
        collByStore[c.store_id] = (collByStore[c.store_id] || 0) + Number(c.amount) || 0;
      });

      const routeData = routes
        .filter((r: any) => !currentWarehouse?.id || (r.stores || []).some((s: any) => s.warehouse_id === currentWarehouse.id))
        .map((r: any) => {
          const routeStores = (r.stores || []).filter((s: any) => !currentWarehouse?.id || s.warehouse_id === currentWarehouse.id);
          const total = routeStores.length;
          const visited = routeStores.filter((s: any) => visitedStores.has(s.id)).length;
          const visitPct = total > 0 ? Math.round((visited / total) * 100) : 0;
          const routeSales = routeStores.reduce((s: number, store: any) => {
            const ds = salesByStore[store.id] || { count: 0, amount: 0, credit: 0 };
            return s + ds.amount;
          }, 0);
          const routeCredit = routeStores.reduce((s: number, store: any) => {
            const ds = salesByStore[store.id] || { count: 0, amount: 0, credit: 0 };
            return s + ds.credit;
          }, 0);
          const routeColl = routeStores.reduce((s: number, store: any) => s + (collByStore[store.id] || 0), 0);
          const completedSessions = sessions.filter((s: any) => s.route_id === r.id).length;
          return {
            id: r.id,
            name: r.name,
            totalStores: total,
            visitedStores: visited,
            visitPct,
            salesAmount: routeSales,
            creditGiven: routeCredit,
            collected: routeColl,
            collectionRate: routeCredit > 0 ? Math.round((routeColl / routeCredit) * 100) : 0,
            sessions: completedSessions,
          };
        });

      return { routeData };
    },
  });

  const routeData = data?.routeData || [];
  const filteredRoutes = selectedRoute === "all" ? routeData : routeData.filter(r => r.id === selectedRoute);

  const totals = useMemo(() => {
    return filteredRoutes.reduce((acc, r) => ({
      stores: acc.stores + r.totalStores,
      visited: acc.visited + r.visitedStores,
      sales: acc.sales + r.salesAmount,
      credit: acc.credit + r.creditGiven,
      collected: acc.collected + r.collected,
    }), { stores: 0, visited: 0, sales: 0, credit: 0, collected: 0 });
  }, [filteredRoutes]);

  const overallVisitPct = totals.stores > 0 ? Math.round((totals.visited / totals.stores) * 100) : 0;
  const overallCollRate = totals.credit > 0 ? Math.round((totals.collected / totals.credit) * 100) : 0;

  const chartData = routeData.map(r => ({
    name: r.name.length > 15 ? r.name.substring(0, 15) + "…" : r.name,
    "Visit %": r.visitPct,
    "Collection %": r.collectionRate,
  }));

  return (
    <ReportContainer title="Route Efficiency" loading={isLoading}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <ReportKPICard label="Routes Tracked" value={routeData.length} icon={Route} />
          <ReportKPICard label="Stores in Routes" value={totals.stores} icon={MapPin} />
          <ReportKPICard label="Avg Visit Rate" value={`${overallVisitPct}%`} icon={CheckCircle2} iconClass="text-green-600" />
          <ReportKPICard label="Route Sales" value={fmt(totals.sales)} icon={ShoppingCart} />
          <ReportKPICard label="Collection Rate" value={`${overallCollRate}%`} icon={Banknote} iconClass="text-blue-600" />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Visit % vs Collection % by Route</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Visit %" fill="hsl(142, 72%, 42%)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Collection %" fill="hsl(221, 83%, 53%)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Route Sales Comparison</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={routeData.map(r => ({ name: r.name.length > 12 ? r.name.substring(0, 12) + "…" : r.name, Sales: r.salesAmount })).slice(0, 8)} margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Bar dataKey="Sales" fill="hsl(142, 72%, 42%)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Route Performance ({filteredRoutes.length} routes)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-center">Stores</TableHead>
                    <TableHead className="text-center">Visited</TableHead>
                    <TableHead className="text-center">Visit %</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-center">Collection %</TableHead>
                    <TableHead className="text-center">Sessions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoutes.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/routes/${r.id}`)}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-center">{r.totalStores}</TableCell>
                      <TableCell className="text-center">{r.visitedStores}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={r.visitPct >= 80 ? "bg-green-100 text-green-700" : r.visitPct >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}>
                          {r.visitPct}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{fmt(r.salesAmount)}</TableCell>
                      <TableCell className="text-right">{fmt(r.creditGiven)}</TableCell>
                      <TableCell className="text-right text-green-600">{fmt(r.collected)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={r.collectionRate >= 80 ? "bg-green-100 text-green-700" : r.collectionRate >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}>
                          {r.collectionRate}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">{r.sessions}</TableCell>
                    </TableRow>
                  ))}
                  {filteredRoutes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No routes found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
                <tfoot className="bg-muted/60 font-semibold">
                  <TableRow>
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-center">{totals.stores}</TableCell>
                    <TableCell className="text-center">{totals.visited}</TableCell>
                    <TableCell className="text-center"><Badge>{overallVisitPct}%</Badge></TableCell>
                    <TableCell className="text-right">{fmt(totals.sales)}</TableCell>
                    <TableCell className="text-right">{fmt(totals.credit)}</TableCell>
                    <TableCell className="text-right">{fmt(totals.collected)}</TableCell>
                    <TableCell className="text-center"><Badge>{overallCollRate}%</Badge></TableCell>
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