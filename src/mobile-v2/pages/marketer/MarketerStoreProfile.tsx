import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { 
  Store, 
  MapPin, 
  Phone, 
  Mail,
  ArrowLeft,
  Package,
  CreditCard,
  ShoppingBag,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Section, Card, StatCard, ListItem, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function MarketerStoreProfile() {
  const { storeId } = useParams();
  const navigate = useNavigate();

  const { data: store, isLoading: storeLoading } = useQuery({
    queryKey: ["mobile-v2-marketer-store", storeId],
    queryFn: async () => {
      if (!storeId) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", storeId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!storeId,
  });

  const { data: storeData, isLoading: dataLoading } = useQuery({
    queryKey: ["mobile-v2-marketer-store-data", storeId],
    queryFn: async () => {
      if (!storeId) return null;

      const [ordersRes, salesRes, transactionsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, total_amount, status, created_at")
          .eq("customer_id", storeId)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("sales")
          .select("id, total_amount, status, created_at")
          .eq("customer_id", storeId)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("transactions")
          .select("id, amount, type, created_at")
          .eq("customer_id", storeId)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const allOrders = ordersRes.data || [];
      const allSales = salesRes.data || [];

      return {
        recentOrders: ordersRes.data || [],
        recentSales: salesRes.data || [],
        recentTransactions: transactionsRes.data || [],
        stats: {
          totalOrders: allOrders.length,
          pendingOrders: allOrders.filter(o => o.status === "pending").length,
          totalSales: allSales.reduce((sum, s) => sum + (s.total_amount || 0), 0),
        },
      };
    },
    enabled: !!storeId,
  });

  const isLoading = storeLoading || dataLoading;

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

  if (!store) {
    return (
      <div className="mv2-page">
        <EmptyState
          icon={Store}
          title="Store not found"
          description="The store you're looking for doesn't exist"
          action={{ label: "Go Back", onClick: () => navigate(-1) }}
        />
      </div>
    );
  }

  const hasBalance = (store.outstanding_balance || 0) > 0;
  const isVerified = store.kyc_status === "verified" || store.kyc_status === "approved";

  return (
    <div className="mv2-page">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 -ml-2"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back
      </Button>

      {/* Store Header */}
      <Card className="mb-6 overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary to-primary/70" />
        <div className="p-4 -mt-10">
          <div className="flex items-end gap-4">
            <div className={`w-20 h-20 rounded-xl flex items-center justify-center border-4 border-background ${
              hasBalance ? "bg-amber-100 dark:bg-amber-900/30" : "bg-card"
            }`}>
              <Store className={`w-10 h-10 ${
                hasBalance ? "text-amber-600" : "text-primary"
              }`} />
            </div>
            <div className="flex-1 pb-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-foreground">
                  {store.business_name || store.full_name || "Store"}
                </h1>
                {isVerified && (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                ID: {store.display_id || store.id.slice(0, 8)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Outstanding Balance Alert */}
      {hasBalance && (
        <Card className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Outstanding Balance
              </p>
              <p className="text-xl font-bold text-amber-900 dark:text-amber-100">
                {formatCurrency(store.outstanding_balance || 0)}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard
          icon={Package}
          label="Total Orders"
          value={storeData?.stats.totalOrders?.toString() || "0"}
        />
        <StatCard
          icon={Clock}
          label="Pending Orders"
          value={storeData?.stats.pendingOrders?.toString() || "0"}
          variant={storeData?.stats.pendingOrders ? "warning" : "default"}
        />
        <StatCard
          icon={ShoppingBag}
          label="Total Sales"
          value={formatCurrency(storeData?.stats.totalSales || 0)}
        />
        <StatCard
          icon={CreditCard}
          label="Outstanding"
          value={formatCurrency(store.outstanding_balance || 0)}
          variant={hasBalance ? "danger" : "success"}
        />
      </div>

      {/* Contact Information */}
      <Section title="Contact Information" className="mb-6">
        <Card variant="outline" className="divide-y divide-border">
          {store.phone && (
            <ListItem
              icon={Phone}
              title="Phone"
              subtitle={store.phone}
              href={`tel:${store.phone}`}
            />
          )}
          {store.email && (
            <ListItem
              icon={Mail}
              title="Email"
              subtitle={store.email}
              href={`mailto:${store.email}`}
            />
          )}
          {store.address && (
            <ListItem
              icon={MapPin}
              title="Address"
              subtitle={store.address}
            />
          )}
        </Card>
      </Section>

      {/* Quick Actions */}
      <Section title="Quick Actions" className="mb-6">
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-auto py-3 flex-col gap-1">
            <Package className="w-5 h-5" />
            <span className="text-sm">New Order</span>
          </Button>
          <Button variant="outline" className="h-auto py-3 flex-col gap-1">
            <CreditCard className="w-5 h-5" />
            <span className="text-sm">Record Payment</span>
          </Button>
        </div>
      </Section>

      {/* Recent Orders */}
      <Section title="Recent Orders" className="mb-6">
        {storeData?.recentOrders && storeData.recentOrders.length > 0 ? (
          <Card variant="outline" className="divide-y divide-border">
            {storeData.recentOrders.map((order) => (
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
            description="Create the first order for this store"
          />
        )}
      </Section>

      {/* Recent Sales */}
      <Section title="Recent Sales">
        {storeData?.recentSales && storeData.recentSales.length > 0 ? (
          <Card variant="outline" className="divide-y divide-border">
            {storeData.recentSales.map((sale) => (
              <ListItem
                key={sale.id}
                icon={ShoppingBag}
                title={formatCurrency(sale.total_amount || 0)}
                subtitle={formatDate(sale.created_at)}
                trailing={
                  <Badge 
                    variant={sale.status === "completed" ? "success" : "warning"}
                  >
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
            description="Sales history will appear here"
          />
        )}
      </Section>
    </div>
  );
}
