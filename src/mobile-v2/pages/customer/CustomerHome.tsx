import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  ShoppingBag, 
  Receipt, 
  CreditCard, 
  Clock, 
  Package,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Wallet
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard, Section, Card, ListItem, QuickAction, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";

export function CustomerHome() {
  const { profile } = useAuth();
  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  });

  // Fetch customer dashboard data
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["mobile-v2-customer-dashboard", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;

      const [salesRes, ordersRes, transactionsRes] = await Promise.all([
        supabase
          .from("sales")
          .select("id, total_amount, created_at, status")
          .eq("customer_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("orders")
          .select("id, total_amount, status, created_at")
          .eq("customer_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("transactions")
          .select("id, amount, type, created_at, description")
          .eq("customer_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      // Calculate totals
      const allSales = salesRes.data || [];
      const allOrders = ordersRes.data || [];
      const allTransactions = transactionsRes.data || [];

      const totalPurchases = allSales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
      const pendingOrders = allOrders.filter(o => o.status === "pending").length;
      const totalPayments = allTransactions
        .filter(t => t.type === "payment")
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      return {
        recentSales: salesRes.data || [],
        recentOrders: ordersRes.data || [],
        recentTransactions: transactionsRes.data || [],
        stats: {
          totalPurchases,
          pendingOrders,
          totalPayments,
          outstandingBalance: profile.outstanding_balance || 0,
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
  const hasOutstanding = (stats?.outstandingBalance || 0) > 0;

  return (
    <div className="mv2-page">
      {/* Hero Section */}
      <div className="mv2-hero mb-6">
        <div className="mv2-hero-content">
          <p className="text-white/80 text-sm">{greeting}</p>
          <h1 className="text-xl font-bold text-white mt-1">
            {profile?.full_name || profile?.business_name || "Customer"}
          </h1>
          {profile?.business_name && (
            <p className="text-white/70 text-sm mt-1">{profile.business_name}</p>
          )}
        </div>
      </div>

      {/* Outstanding Balance Alert */}
      {hasOutstanding && (
        <Card variant="outline" className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-800 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Outstanding Balance
              </p>
              <p className="text-lg font-bold text-amber-900 dark:text-amber-100">
                {formatCurrency(stats?.outstandingBalance || 0)}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-amber-600" />
          </div>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard
          icon={ShoppingBag}
          label="Total Purchases"
          value={formatCurrency(stats?.totalPurchases || 0)}
          trend={stats?.totalPurchases > 0 ? { value: "+12%", positive: true } : undefined}
        />
        <StatCard
          icon={Package}
          label="Pending Orders"
          value={stats?.pendingOrders?.toString() || "0"}
          variant={stats?.pendingOrders ? "warning" : "default"}
        />
        <StatCard
          icon={Wallet}
          label="Total Payments"
          value={formatCurrency(stats?.totalPayments || 0)}
        />
        <StatCard
          icon={CreditCard}
          label="Outstanding"
          value={formatCurrency(stats?.outstandingBalance || 0)}
          variant={hasOutstanding ? "danger" : "success"}
        />
      </div>

      {/* Quick Actions */}
      <Section title="Quick Actions" className="mb-6">
        <div className="grid grid-cols-4 gap-3">
          <QuickAction
            icon={Package}
            label="Orders"
            href="/customer/orders"
          />
          <QuickAction
            icon={Receipt}
            label="Sales"
            href="/customer/sales"
          />
          <QuickAction
            icon={CreditCard}
            label="Payments"
            href="/customer/transactions"
          />
          <QuickAction
            icon={Clock}
            label="History"
            href="/customer/transactions"
          />
        </div>
      </Section>

      {/* Recent Sales */}
      <Section 
        title="Recent Purchases" 
        action={{ label: "View All", href: "/customer/sales" }}
        className="mb-6"
      >
        {dashboardData?.recentSales && dashboardData.recentSales.length > 0 ? (
          <Card variant="outline" className="divide-y divide-border">
            {dashboardData.recentSales.slice(0, 3).map((sale) => (
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
            title="No purchases yet"
            description="Your purchase history will appear here"
          />
        )}
      </Section>

      {/* Recent Orders */}
      <Section 
        title="Recent Orders" 
        action={{ label: "View All", href: "/customer/orders" }}
        className="mb-6"
      >
        {dashboardData?.recentOrders && dashboardData.recentOrders.length > 0 ? (
          <Card variant="outline" className="divide-y divide-border">
            {dashboardData.recentOrders.slice(0, 3).map((order) => (
              <ListItem
                key={order.id}
                icon={Package}
                title={formatCurrency(order.total_amount || 0)}
                subtitle={formatDate(order.created_at)}
                trailing={
                  <Badge 
                    variant={
                      order.status === "delivered" ? "success" : 
                      order.status === "pending" ? "warning" : 
                      "default"
                    }
                  >
                    {order.status}
                  </Badge>
                }
              />
            ))}
          </Card>
        ) : (
          <EmptyState
            icon={Package}
            title="No orders yet"
            description="Place your first order"
          />
        )}
      </Section>

      {/* Recent Transactions */}
      <Section 
        title="Recent Transactions" 
        action={{ label: "View All", href: "/customer/transactions" }}
      >
        {dashboardData?.recentTransactions && dashboardData.recentTransactions.length > 0 ? (
          <Card variant="outline" className="divide-y divide-border">
            {dashboardData.recentTransactions.slice(0, 3).map((txn) => (
              <ListItem
                key={txn.id}
                icon={txn.type === "payment" ? TrendingDown : TrendingUp}
                iconColor={txn.type === "payment" ? "text-green-600" : "text-red-600"}
                title={txn.description || txn.type}
                subtitle={formatDate(txn.created_at)}
                trailing={
                  <span className={`font-semibold ${
                    txn.type === "payment" ? "text-green-600" : "text-red-600"
                  }`}>
                    {txn.type === "payment" ? "-" : "+"}{formatCurrency(txn.amount || 0)}
                  </span>
                }
              />
            ))}
          </Card>
        ) : (
          <EmptyState
            icon={CreditCard}
            title="No transactions yet"
            description="Your transaction history will appear here"
          />
        )}
      </Section>
    </div>
  );
}
