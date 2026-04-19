import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  Store,
  TrendingUp,
  Clock,
  ChevronRight,
  Target,
  Users,
  ShoppingCart,
  Calendar,
  Banknote,
  AlertCircle,
  Phone,
  Receipt,
  CheckCircle2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard, Section, Card, ListItem, QuickAction, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function MarketerHome() {
  const { profile, user } = useAuth();
  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  });

  const today = new Date().toISOString().split("T")[0];

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["mobile-v2-marketer-dashboard-v2", profile?.id, today],
    queryFn: async () => {
      if (!profile?.id || !user?.id) return null;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const [
        todayOrdersRes,
        allOrdersRes,
        storesRes,
        paymentsRes,
        followUpsRes,
      ] = await Promise.all([
        // Today's orders placed by this marketer
        supabase
          .from("orders")
          .select("id, total_amount, status, created_at, stores(name), customers(name)")
          .eq("created_by", profile.id)
          .gte("created_at", todayStart.toISOString())
          .lt("created_at", todayEnd.toISOString())
          .order("created_at", { ascending: false }),
        // All orders
        supabase
          .from("orders")
          .select("id, total_amount, status, created_at, stores(name), customers(name)")
          .eq("created_by", profile.id)
          .order("created_at", { ascending: false })
          .limit(20),
        // Stores assigned to this marketer
        supabase
          .from("stores")
          .select("id, name, outstanding, address, phone, customers(name)")
          .eq("assigned_marketer_id", profile.id)
          .eq("is_active", true)
          .order("name"),
        // Payments collected today (transactions)
        supabase
          .from("transactions")
          .select("total_amount, cash_amount, upi_amount, created_at, stores(name)")
          .eq("recorded_by", user.id)
          .eq("transaction_type", "payment")
          .gte("created_at", todayStart.toISOString())
          .lt("created_at", todayEnd.toISOString()),
        // Stores needing follow-up (outstanding > 0, last visit > 7 days)
        supabase
          .from("stores")
          .select("id, name, outstanding, last_visit_date, customers(name), customers(phone)")
          .eq("assigned_marketer_id", profile.id)
          .gt("outstanding", 0)
          .order("outstanding", { ascending: false })
          .limit(10),
      ]);

      const todayOrders = todayOrdersRes.data || [];
      const allOrders = allOrdersRes.data || [];
      const stores = storesRes.data || [];
      const payments = paymentsRes.data || [];
      const followUps = followUpsRes.data || [];

      // Calculate stats
      const todayTotal = todayOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const todayCount = todayOrders.length;
      const totalOrders = allOrders.length;
      const pendingOrders = allOrders.filter(o => o.status === "pending").length;
      const completedOrders = allOrders.filter(o => o.status === "completed").length;

      // Payments collected
      const totalCash = payments.reduce((sum, p) => sum + (p.cash_amount || 0), 0);
      const totalUpi = payments.reduce((sum, p) => sum + (p.upi_amount || 0), 0);
      const totalPayments = totalCash + totalUpi;
      const paymentCount = payments.length;

      // Monthly target calculation
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const monthlyOrders = allOrders.filter(o => {
        const orderDate = new Date(o.created_at);
        return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
      });
      const monthlyTotal = monthlyOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const monthlyTarget = 500000;
      const targetProgress = Math.min((monthlyTotal / monthlyTarget) * 100, 100);

      // Filter follow-ups needing attention (last visit > 7 days ago or no visit)
      const needsFollowUp = followUps.filter((s: any) => {
        if (!s.last_visit_date) return true;
        const lastVisit = new Date(s.last_visit_date);
        const daysSince = (Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 7;
      });

      return {
        todayOrders,
        todayTotal,
        todayCount,
        totalOrders,
        pendingOrders,
        completedOrders,
        recentOrders: allOrders.slice(0, 5),
        stores,
        storeCount: stores.length,
        stats: {
          todayOrders: todayCount,
          todayTotal,
          totalOrders,
          pendingOrders,
          completedOrders,
          monthlyTotal,
          targetProgress,
          totalPayments,
          paymentCount,
          totalCash,
          totalUpi,
        },
        followUps: needsFollowUp,
      };
    },
    enabled: !!profile?.id && !!user?.id,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-32 mb-4" />
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Loading.Skeleton className="h-20" />
          <Loading.Skeleton className="h-20" />
          <Loading.Skeleton className="h-20" />
        </div>
        <Loading.Skeleton className="h-48" />
      </div>
    );
  }

  const stats = dashboardData?.stats;
  const s = stats;

  return (
    <div className="mv2-page">
      {/* Hero Section */}
      <div className="mv2-hero mb-4">
        <div className="mv2-hero-content">
          <p className="text-white/80 text-sm">{greeting}</p>
          <h1 className="text-xl font-bold text-white mt-1">
            {profile?.full_name || "Marketer"}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge className="bg-white/20 text-white border-0">
              <Target className="w-3 h-3 mr-1" />
              Marketer
            </Badge>
          </div>
        </div>
      </div>

      {/* Today's Stats - 3 cards */}
      <Section title="Today" className="mb-4">
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            icon={ShoppingCart}
            label="Orders"
            value={String(s?.todayOrders || 0)}
            variant={s?.todayOrders ? "success" : "default"}
            className="text-xs"
          />
          <StatCard
            icon={TrendingUp}
            label="Total"
            value={formatCurrency(s?.todayTotal || 0)}
            variant="success"
            className="text-xs"
          />
          <StatCard
            icon={Banknote}
            label="Collected"
            value={formatCurrency(s?.totalPayments || 0)}
            variant={s?.totalPayments ? "success" : "default"}
            className="text-xs"
          />
        </div>
      </Section>

      {/* Payment Breakdown */}
      {s?.totalPayments > 0 && (
        <Section title="Payments Collected" className="mb-4">
          <Card className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Total Collected</span>
              <span className="text-lg font-bold text-success">
                {formatCurrency(s.totalPayments)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                  <Banknote className="w-4 h-4 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cash</p>
                  <p className="font-semibold text-sm">{formatCurrency(s.totalCash || 0)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                <div className="w-8 h-8 rounded-full bg-info/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-info" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <path d="M2 10h20" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">UPI</p>
                  <p className="font-semibold text-sm">{formatCurrency(s.totalUpi || 0)}</p>
                </div>
              </div>
            </div>
          </Card>
        </Section>
      )}

      {/* Quick Actions */}
      <Section title="Quick Actions" className="mb-4">
        <div className="grid grid-cols-4 gap-2">
          <QuickAction
            icon={ShoppingCart}
            label="New Order"
            href="/marketer/orders"
            variant="primary"
          />
          <QuickAction
            icon={Store}
            label="My Stores"
            href="/marketer/stores"
          />
          <QuickAction
            icon={Users}
            label="Customers"
            href="/marketer/stores"
          />
          <QuickAction
            icon={Receipt}
            label="History"
            href="/marketer/orders"
          />
        </div>
      </Section>

      {/* Today's Orders */}
      <Section title="Orders Today" className="mb-4">
        {dashboardData?.todayOrders && dashboardData.todayOrders.length > 0 ? (
          <div className="space-y-2">
            {dashboardData.todayOrders.slice(0, 5).map((order: any) => (
              <Card key={order.id} variant="outline" className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {order.stores?.name || order.customers?.name || "Customer"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(order.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">
                      {formatCurrency(order.total_amount || 0)}
                    </p>
                    <Badge
                      variant={
                        order.status === "completed" ? "success" :
                        order.status === "pending" ? "warning" :
                        "default"
                      }
                      className="text-xs"
                    >
                      {order.status}
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ShoppingCart}
            title="No orders today"
            description="Start taking orders from your stores"
          />
        )}
      </Section>

      {/* Follow-up Reminders */}
      <Section title="Follow-up Needed" className="mb-4">
        {dashboardData?.followUps && dashboardData.followUps.length > 0 ? (
          <div className="space-y-2">
            {dashboardData.followUps.slice(0, 5).map((store: any) => (
              <Card key={store.id} variant="outline" className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {store.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {store.customers?.name || "No customer"}
                      {store.last_visit_date 
                        ? ` • Last visit: ${formatDate(store.last_visit_date)}`
                        : " • Never visited"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="warning" className="text-xs">
                      {formatCurrency(store.outstanding || 0)}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="No follow-ups needed"
            description="All stores are up to date!"
          />
        )}
      </Section>

      {/* My Stores Summary */}
      <Section title="My Stores" className="mb-4">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <StatCard
            icon={Store}
            label="Total Stores"
            value={String(stats?.storeCount || 0)}
          />
          <StatCard
            icon={Package}
            label="All Orders"
            value={String(s?.totalOrders || 0)}
          />
        </div>
        
        {dashboardData?.stores && dashboardData.stores.length > 0 ? (
          <div className="space-y-2">
            {dashboardData.stores.slice(0, 3).map((store: any) => (
              <ListItem
                key={store.id}
                icon={Store}
                title={store.name || "Store"}
                subtitle={store.address || "No address"}
                href={`/marketer/stores/${store.id}`}
                trailing={
                  <div className="flex items-center gap-2">
                    {(store.outstanding || 0) > 0 && (
                      <Badge variant="warning" className="text-xs">
                        {formatCurrency(store.outstanding)}
                      </Badge>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                }
              />
            ))}
            {dashboardData.stores.length > 3 && (
              <Button 
                variant="ghost" 
                className="w-full text-sm mt-2" 
                onClick={() => window.location.href = "/marketer/stores"}
              >
                View all {dashboardData.stores.length} stores
              </Button>
            )}
          </div>
        ) : (
          <EmptyState
            icon={Store}
            title="No stores assigned"
            description="Contact admin to get stores assigned"
          />
        )}
      </Section>

      {/* Monthly Target */}
      <Section title="Monthly Progress" className="mb-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <span className="font-medium text-foreground">Monthly Target</span>
            </div>
            <span className="text-sm font-semibold text-primary">
              {stats?.targetProgress?.toFixed(0) || 0}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500"
              style={{ width: `${stats?.targetProgress || 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{formatCurrency(stats?.monthlyTotal || 0)}</span>
            <span>Target: {formatCurrency(500000)}</span>
          </div>
        </Card>
      </Section>
    </div>
  );
}
