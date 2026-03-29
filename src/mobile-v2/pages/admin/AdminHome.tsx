import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, 
  Store, 
  ShoppingBag, 
  CreditCard, 
  TrendingUp,
  Package,
  Route,
  AlertCircle,
  ChevronRight,
  BarChart3,
  DollarSign
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard, Section, Card, ListItem, QuickAction, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";

export function AdminHome() {
  const { profile } = useAuth();
  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  });

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["mobile-v2-admin-dashboard"],
    queryFn: async () => {
      // Get today's date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [
        usersRes, 
        customersRes, 
        salesRes, 
        todaySalesRes,
        ordersRes,
        transactionsRes
      ] = await Promise.all([
        // Staff count
        supabase
          .from("user_roles")
          .select("id", { count: "exact" })
          .neq("role", "customer"),
        // Customer count
        supabase
          .from("profiles")
          .select("id", { count: "exact" })
          .eq("role", "customer"),
        // Total sales
        supabase
          .from("sales")
          .select("id, total_amount, created_at, status")
          .order("created_at", { ascending: false })
          .limit(20),
        // Today's sales
        supabase
          .from("sales")
          .select("id, total_amount")
          .gte("created_at", today.toISOString())
          .lt("created_at", tomorrow.toISOString()),
        // Pending orders
        supabase
          .from("orders")
          .select("id, total_amount, status, created_at, customer:profiles!customer_id(business_name)")
          .order("created_at", { ascending: false })
          .limit(10),
        // Recent transactions
        supabase
          .from("transactions")
          .select("id, amount, type, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const allSales = salesRes.data || [];
      const todaySales = todaySalesRes.data || [];
      const allOrders = ordersRes.data || [];

      const todayTotal = todaySales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
      const pendingOrders = allOrders.filter(o => o.status === "pending").length;
      const totalOutstanding = 0; // Would need a separate query

      return {
        recentSales: allSales.slice(0, 5),
        recentOrders: allOrders.slice(0, 5),
        recentTransactions: transactionsRes.data || [],
        stats: {
          totalStaff: usersRes.count || 0,
          totalCustomers: customersRes.count || 0,
          todaySales: todaySales.length,
          todayTotal,
          pendingOrders,
          totalOutstanding,
        },
      };
    },
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-32 mb-4" />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Loading.Skeleton className="h-24" />
          <Loading.Skeleton className="h-24" />
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
            {profile?.full_name || "Administrator"}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge className="bg-white/20 text-white border-0">
              <BarChart3 className="w-3 h-3 mr-1" />
              Admin Dashboard
            </Badge>
          </div>
        </div>
      </div>

      {/* Today's Summary Card */}
      <Card className="mb-6 p-4 bg-gradient-to-br from-green-500 to-green-600 text-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            <span className="font-medium">Today's Revenue</span>
          </div>
          <Badge className="bg-white/20 text-white border-0">
            {stats?.todaySales || 0} sales
          </Badge>
        </div>
        <p className="text-3xl font-bold">
          {formatCurrency(stats?.todayTotal || 0)}
        </p>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard
          icon={Users}
          label="Total Staff"
          value={stats?.totalStaff?.toString() || "0"}
        />
        <StatCard
          icon={Store}
          label="Customers"
          value={stats?.totalCustomers?.toString() || "0"}
        />
        <StatCard
          icon={Package}
          label="Pending Orders"
          value={stats?.pendingOrders?.toString() || "0"}
          variant={stats?.pendingOrders ? "warning" : "default"}
        />
        <StatCard
          icon={TrendingUp}
          label="Today's Sales"
          value={stats?.todaySales?.toString() || "0"}
          variant="success"
        />
      </div>

      {/* Quick Actions */}
      <Section title="Quick Actions" className="mb-6">
        <div className="grid grid-cols-4 gap-3">
          <QuickAction
            icon={ShoppingBag}
            label="Sales"
            href="/admin/sales"
          />
          <QuickAction
            icon={Package}
            label="Orders"
            href="/admin/orders"
          />
          <QuickAction
            icon={Store}
            label="Stores"
            href="/admin/stores"
          />
          <QuickAction
            icon={Users}
            label="Users"
            href="/admin/customers"
          />
        </div>
      </Section>

      {/* Alerts */}
      {(stats?.pendingOrders || 0) > 0 && (
        <Card className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <div className="flex-1">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Pending Orders
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                You have {stats?.pendingOrders} orders waiting for processing
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-amber-600" />
          </div>
        </Card>
      )}

      {/* Recent Sales */}
      <Section 
        title="Recent Sales" 
        action={{ label: "View All", href: "/admin/sales" }}
        className="mb-6"
      >
        {dashboardData?.recentSales && dashboardData.recentSales.length > 0 ? (
          <Card variant="outline" className="divide-y divide-border">
            {dashboardData.recentSales.map((sale) => (
              <ListItem
                key={sale.id}
                icon={ShoppingBag}
                title={formatCurrency(sale.total_amount || 0)}
                subtitle={formatDate(sale.created_at)}
                trailing={
                  <Badge variant={sale.status === "completed" ? "success" : "warning"}>
                    {sale.status}
                  </Badge>
                }
              />
            ))}
          </Card>
        ) : (
          <EmptyState
            icon={ShoppingBag}
            title="No sales yet"
            description="Sales will appear here"
          />
        )}
      </Section>

      {/* Recent Orders */}
      <Section 
        title="Recent Orders" 
        action={{ label: "View All", href: "/admin/orders" }}
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
            description="Orders will appear here"
          />
        )}
      </Section>
    </div>
  );
}
