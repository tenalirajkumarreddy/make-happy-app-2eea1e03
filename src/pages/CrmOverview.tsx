import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useStoreHealth } from "@/hooks/useStoreHealth";
import { StoreHealth } from "@/utils/storeHealth";
import { useAuth } from "@/contexts/AuthContext";
import {
  Loader2,
  Search,
  Download,
  ArrowRight,
  Store,
  Users,
  Target,
  TrendingUp,
  AlertCircle,
  Settings,
  ClipboardCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

function getHealthBadge(health: StoreHealth) {
  const colorMap: Record<string, string> = {
    green: "bg-green-500",
    lightGreen: "bg-emerald-400",
    yellow: "bg-yellow-500",
    orange: "bg-orange-500",
    red: "bg-red-500",
  };

  const borderMap: Record<string, string> = {
    green: "border-green-500",
    lightGreen: "border-emerald-400",
    yellow: "border-yellow-500",
    orange: "border-orange-500",
    red: "border-red-500",
  };

  return {
    bg: colorMap[health.healthColor] || "bg-gray-500",
    border: borderMap[health.healthColor] || "border-gray-500",
    label: health.healthLabel,
  };
}

function StoreHealthTable({
  data,
  loading,
  searchTerm,
  filter,
}: {
  data: StoreHealth[];
  loading: boolean;
  searchTerm: string;
  filter: string;
}) {
  const navigate = useNavigate();

  const filtered = data.filter((item) => {
    const matchesSearch =
      item.storeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.marketerName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filter === "all" ||
      (filter === "critical" && item.healthColor === "red") ||
      (filter === "atrisk" && item.healthColor === "orange") ||
      (filter === "attention" && item.healthColor === "yellow") ||
      (filter === "healthy" &&
        (item.healthColor === "green" || item.healthColor === "lightGreen"));

    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No stores found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Store</TableHead>
            <TableHead>Marketer</TableHead>
            <TableHead>Health</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Actual</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Last Order</TableHead>
            <TableHead>Outstanding</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((item) => {
            const healthBadge = getHealthBadge(item);
            const progress =
              item.target > 0
                ? Math.min(Math.round((item.actual / item.target) * 100), 100)
                : 0;

            return (
              <TableRow key={item.storeId} className="group">
                <TableCell className="font-medium">{item.storeName}</TableCell>
                <TableCell>{item.marketerName}</TableCell>
                <TableCell>
                  <div className={"flex items-center gap-2"}>
                    <div
                      className={`h-3 w-3 rounded-full ${healthBadge.bg}`}
                    />
                    <span className="text-sm font-medium">
                      {item.healthScore}
                    </span>
                    <Badge variant="outline" className={`border ${healthBadge.border}`}>
                      {healthBadge.label}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>₹{item.target.toLocaleString()}</TableCell>
                <TableCell>₹{item.actual.toLocaleString()}</TableCell>
                <TableCell>
                  {item.target > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            progress >= 80
                              ? "bg-green-500"
                              : progress >= 50
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs">{progress}%</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No target</span>
                  )}
                </TableCell>
                <TableCell>
                  {item.lastOrderDate ? (
                    <span className="text-sm">
                      {Math.ceil(
                        (new Date().getTime() - new Date(item.lastOrderDate).getTime()) /
                          (1000 * 60 * 60 * 24)
                      )}{" "}
                      days ago
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Never</span>
                  )}
                </TableCell>
                <TableCell>
                  <span
                    className={
                      item.outstanding > 0 ? "text-destructive font-medium" : "text-muted-foreground"
                    }
                  >
                    ₹{item.outstanding.toLocaleString()}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => window.location.href = `/stores/${item.storeId}`}
                  >
                    View <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function CrmOverview() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");

  const { data: storeHealthData, isLoading: storeHealthLoading } = useStoreHealth();

  // Overview stats
  const { data: overviewStats, isLoading: overviewLoading } = useQuery({
    queryKey: ["crm-overview-stats", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      
      const [
        storesRes,
        marketersRes,
        totalTargetsRes,
        todayFollowUpsRes,
        pendingFollowUpsRes,
      ] = await Promise.all([
        supabase
          .from("stores")
          .select("id, outstanding", { count: "exact" })
          .eq("is_active", true),
        supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "marketer"),
        supabase
          .from("store_targets")
          .select("target_amount, store_id")
          .eq("month", new Date().getMonth() + 1)
          .eq("year", new Date().getFullYear())
          .eq("status", "active"),
        supabase
          .from("follow_up_schedule")
          .select("id", { count: "exact" })
          .eq("scheduled_date", today)
          .in("status", ["pending", "run_out", "must_order"]),
        supabase
          .from("follow_up_schedule")
          .select("id", { count: "exact" })
          .lt("scheduled_date", today)
          .in("status", ["pending", "run_out", "must_order"]),
      ]);

      const totalOutstanding = storesRes.data
        ? storesRes.data.reduce((s, st) => s + Number(st.outstanding || 0), 0)
        : 0;

      return {
        totalStores: storesRes.count || 0,
        totalMarketers: (marketersRes.data || []).length,
        totalTargetAmount: (totalTargetsRes.data || []).reduce(
          (s, t) => s + Number(t.target_amount || 0),
          0
        ),
        todayFollowUps: todayFollowUpsRes.count || 0,
        pendingFollowUps: pendingFollowUpsRes.count || 0,
        totalOutstanding,
      };
    },
    enabled: !!user,
  });

  // Marketer performance table
  const { data: marketerPerformance, isLoading: performanceLoading } = useQuery({
    queryKey: ["crm-marketer-performance", user?.id],
    queryFn: async () => {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();

      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "marketer");

      if (!roles || roles.length === 0) return [];

      const userIds = roles.map((r) => r.user_id);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const { data: targets } = await supabase
        .from("marketer_targets")
        .select("user_id, target_amount, current_progress")
        .eq("month", month)
        .eq("year", year)
        .eq("status", "active");

      const { data: followUps } = await supabase
        .from("follow_up_schedule")
        .select("marketer_id, status")
        .in("marketer_id", userIds)
        .in("status", ["pending", "run_out", "must_order"]);

      return userIds.map((id) => {
        const profile = profiles?.find((p) => p.user_id === id);
        const target = targets?.find((t) => t.user_id === id);
        const userFollowUps = (followUps || []).filter((f) => f.marketer_id === id);
        const progress = target
          ? Math.min((target.current_progress / target.target_amount) * 100, 100)
          : 0;

        return {
          userId: id,
          fullName: profile?.full_name || "Unknown",
          target: target?.target_amount || 0,
          progress: target?.current_progress || 0,
          achievement: Math.round(progress),
          pendingFollowUps: userFollowUps.length,
        };
      });
    },
    enabled: !!user,
  });

  // Follow-ups list
  const { data: followUpsList, isLoading: followUpsLoading } = useQuery({
    queryKey: ["crm-all-follow-ups", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("follow_up_schedule")
        .select(
          "id, store_id, reason, priority, status, scheduled_date, depletion_date, stores(name)"
        )
        .in("status", ["pending", "run_out", "must_order"])
        .order("priority", { ascending: false })
        .order("scheduled_date", { ascending: true })
        .limit(50);

      if (error) throw error;
      return (data || []).map((item: any) => ({
        ...item,
        store_name: item.stores?.name,
      }));
    },
    enabled: !!user,
  });

  const handleExportCSV = () => {
    if (!storeHealthData) return;
    const headers = ["Store", "Marketer", "Health Score", "Health Status", "Target", "Actual", "Outstanding", "Last Order Date"];
    const rows = storeHealthData.map((item) => [
      item.storeName,
      item.marketerName,
      String(item.healthScore),
      item.healthLabel,
      String(item.target),
      String(item.actual),
      String(item.outstanding),
      item.lastOrderDate ? item.lastOrderDate.toISOString().split("T")[0] : "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `store-health-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast({ title: "CSV exported successfully" });
  };

  const renderOverview = () => {
    if (overviewLoading) {
      return (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    const s = overviewStats || {
      totalStores: 0,
      totalMarketers: 0,
      totalTargetAmount: 0,
      todayFollowUps: 0,
      pendingFollowUps: 0,
      totalOutstanding: 0,
    };

    return (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Stores</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.totalStores}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Marketers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.totalMarketers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monthly Target</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{s.totalTargetAmount.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today's Follow-ups</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.todayFollowUps}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Follow-ups</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.pendingFollowUps}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
            <TrendingUp className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              ₹{s.totalOutstanding.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Button
          variant="outline"
          className="h-auto min-h-24 flex-col gap-2 py-4"
          onClick={() => navigate("/crm/settings")}
        >
          <Settings className="h-5 w-5" />
          CRM Settings
        </Button>
        <Button
          variant="outline"
          className="h-auto min-h-24 flex-col gap-2 py-4"
          onClick={() => navigate("/crm/target-approvals")}
        >
          <ClipboardCheck className="h-5 w-5" />
          Target Approvals
        </Button>
      </div>
      </>
    );
  };

  const renderPerformance = () => {
    if (performanceLoading) {
      return (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Marketer Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marketer</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Pending Follow-ups</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(marketerPerformance || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No marketer data available.
                  </TableCell>
                </TableRow>
              )}
              {(marketerPerformance || []).map((m) => (
                <TableRow key={m.userId}>
                  <TableCell className="font-medium">{m.fullName}</TableCell>
                  <TableCell>₹{m.target.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${m.achievement}%` }}
                        />
                      </div>
                      <span className="text-xs">{m.achievement}%</span>
                    </div>
                  </TableCell>
                  <TableCell>{m.pendingFollowUps}</TableCell>
                  <TableCell>
                    {m.achievement >= 80 ? (
                      <Badge variant="default" className="bg-green-500">On Track</Badge>
                    ) : m.achievement >= 50 ? (
                      <Badge variant="default" className="bg-yellow-500">Behind</Badge>
                    ) : (
                      <Badge variant="destructive">At Risk</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const renderFollowUps = () => {
    if (followUpsLoading) {
      return (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Active Follow-ups</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(followUpsList || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No active follow-ups.
                  </TableCell>
                </TableRow>
              )}
              {(followUpsList || []).map((fu: any) => (
                <TableRow key={fu.id}>
                  <TableCell className="font-medium">{fu.store_name || fu.store_id}</TableCell>
                  <TableCell className="capitalize">{fu.reason?.replace(/_/g, " ")}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        fu.priority === "critical"
                          ? "destructive"
                          : fu.priority === "high"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {fu.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>{fu.scheduled_date}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{fu.status?.replace(/_/g, " ")}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="CRM Overview"
        subtitle="Monitor marketer performance, follow-ups, and store health."
        actions={[
          {
            label: "Settings",
            icon: Settings,
            onClick: () => navigate("/crm/settings"),
            variant: "outline",
            priority: 1,
          },
          {
            label: "Target Approvals",
            icon: ClipboardCheck,
            onClick: () => navigate("/crm/target-approvals"),
            variant: "outline",
            priority: 2,
          },
        ]}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups</TabsTrigger>
          <TabsTrigger value="stores">Stores</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {renderOverview()}
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          {renderPerformance()}
        </TabsContent>

        <TabsContent value="followups" className="space-y-6">
          {renderFollowUps()}
        </TabsContent>

        <TabsContent value="stores" className="space-y-6">
          {/* Stores Tab - Store Health Overview */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search stores or marketers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All Health</option>
                  <option value="critical">Critical</option>
                  <option value="atrisk">At Risk</option>
                  <option value="attention">Needs Attention</option>
                  <option value="healthy">Healthy</option>
                </select>
                <Button variant="outline" size="sm" onClick={handleExportCSV}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Export CSV
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Store Health Overview</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Stores sorted by health score (most critical first).
                </p>
              </CardHeader>
              <CardContent>
                <StoreHealthTable
                  data={storeHealthData || []}
                  loading={storeHealthLoading}
                  searchTerm={searchTerm}
                  filter={filter}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
