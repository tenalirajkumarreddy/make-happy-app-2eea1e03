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
  Calendar
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard, Section, Card, ListItem, QuickAction, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";

export function MarketerHome() {
  const { profile } = useAuth();
  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  });

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["mobile-v2-marketer-dashboard", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;

      // Get today's date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [ordersRes, storesRes, todayOrdersRes] = await Promise.all([
        // All orders by this marketer
        supabase
          .from("orders")
          .select("id, total_amount, status, created_at, customer:profiles!customer_id(business_name)")
          .eq("created_by", profile.id)
          .order("created_at", { ascending: false })
          .limit(10),
        // Stores assigned to this marketer
        supabase
          .from("profiles")
          .select("id, business_name, outstanding_balance, address")
          .eq("assigned_marketer_id", profile.id)
          .eq("role", "customer"),
        // Today's orders
        supabase
          .from("orders")
          .select("id, total_amount, status")
          .eq("created_by", profile.id)
          .gte("created_at", today.toISOString())
          .lt("created_at", tomorrow.toISOString()),
      ]);

      const allOrders = ordersRes.data || [];
      const stores = storesRes.data || [];
      const todayOrders = todayOrdersRes.data || [];

      const pendingOrders = allOrders.filter(o => o.status === "pending").length;
      const todayTotal = todayOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const monthlyTarget = 500000; // Example target
      const monthlyTotal = allOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const targetProgress = Math.min((monthlyTotal / monthlyTarget) * 100, 100);

      return {
        recentOrders: allOrders.slice(0, 5),
        stores,
        stats: {
          totalStores: stores.length,
          pendingOrders,
          todayOrders: todayOrders.length,
          todayTotal,
          monthlyTotal,
          targetProgress,
        },
      };
    },
    enabled: !!profile?.id,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-32 mb-4" />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Loading.Skeleton className="h-24" />
          <Loading.Skeleton className="h-24" />
        </div>
        <Loading.Skeleton className="h-48" />
      </div>
    );
  }

  const stats = dashboardData?.stats;

  return (
    <div className="mv2-page">
      {/* Hero Section */}
      <div className="mv2-hero mb-6">
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

      {/* Target Progress */}
      <Card className="mb-6 p-4">
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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard
          icon={Store}
          label="My Stores"
          value={stats?.totalStores?.toString() || "0"}
        />
        <StatCard
          icon={Package}
          label="Pending Orders"
          value={stats?.pendingOrders?.toString() || "0"}
          variant={stats?.pendingOrders ? "warning" : "default"}
        />
        <StatCard
          icon={ShoppingCart}
          label="Today's Orders"
          value={stats?.todayOrders?.toString() || "0"}
        />
        <StatCard
          icon={TrendingUp}
          label="Today's Total"
          value={formatCurrency(stats?.todayTotal || 0)}
          variant="success"
        />
      </div>

      {/* Quick Actions */}
      <Section title="Quick Actions" className="mb-6">
        <div className="grid grid-cols-4 gap-3">
          <QuickAction
            icon={Package}
            label="Orders"
            href="/marketer/orders"
          />
          <QuickAction
            icon={Store}
            label="Stores"
            href="/marketer/stores"
          />
          <QuickAction
            icon={Users}
            label="Customers"
            href="/marketer/stores"
          />
          <QuickAction
            icon={Calendar}
            label="Schedule"
            href="/marketer/orders"
          />
        </div>
      </Section>

      {/* Recent Orders */}
      <Section 
        title="Recent Orders" 
        action={{ label: "View All", href: "/marketer/orders" }}
        className="mb-6"
      >
        {dashboardData?.recentOrders && dashboardData.recentOrders.length > 0 ? (
          <Card variant="outline" className="divide-y divide-border">
            {dashboardData.recentOrders.slice(0, 4).map((order) => (
              <ListItem
                key={order.id}
                icon={Package}
                title={order.customer?.business_name || "Customer"}
                subtitle={formatDate(order.created_at)}
                trailing={
                  <div className="text-right">
                    <p className="font-semibold text-foreground">
                      {formatCurrency(order.total_amount || 0)}
                    </p>
                    <Badge 
                      variant={
                        order.status === "delivered" ? "success" : 
                        order.status === "pending" ? "warning" : 
                        "default"
                      }
                      className="text-xs"
                    >
                      {order.status}
                    </Badge>
                  </div>
                }
              />
            ))}
          </Card>
        ) : (
          <EmptyState
            icon={Package}
            title="No orders yet"
            description="Start taking orders from your stores"
          />
        )}
      </Section>

      {/* My Stores */}
      <Section 
        title="My Stores" 
        action={{ label: "View All", href: "/marketer/stores" }}
      >
        {dashboardData?.stores && dashboardData.stores.length > 0 ? (
          <Card variant="outline" className="divide-y divide-border">
            {dashboardData.stores.slice(0, 3).map((store) => (
              <ListItem
                key={store.id}
                icon={Store}
                title={store.business_name || "Store"}
                subtitle={store.address || "No address"}
                href={`/marketer/stores/${store.id}`}
                trailing={
                  <div className="flex items-center gap-2">
                    {(store.outstanding_balance || 0) > 0 && (
                      <Badge variant="warning" className="text-xs">
                        {formatCurrency(store.outstanding_balance)}
                      </Badge>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                }
              />
            ))}
          </Card>
        ) : (
          <EmptyState
            icon={Store}
            title="No stores assigned"
            description="Contact admin to get stores assigned"
          />
        )}
      </Section>
    </div>
  );
}
