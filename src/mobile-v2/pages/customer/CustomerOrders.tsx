import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Package, 
  Search, 
  Filter, 
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  AlertCircle,
  Plus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Section, Card, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export function CustomerOrders() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["mobile-v2-customer-orders", profile?.id, statusFilter],
    queryFn: async () => {
      if (!profile?.id) return [];

      let query = supabase
        .from("orders")
        .select(`
          id,
          display_id,
          total_amount,
          status,
          created_at,
          delivery_date,
          notes,
          order_items:order_items(
            id,
            quantity,
            unit_price,
            product:products(name, sku)
          )
        `)
        .eq("customer_id", profile.id)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", orderId)
        .eq("customer_id", profile?.id)
        .eq("status", "pending"); // Can only cancel pending orders

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-v2-customer-orders"] });
      toast.success("Order cancelled successfully");
    },
    onError: () => {
      toast.error("Failed to cancel order");
    },
  });

  const filteredOrders = orders?.filter(order => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      order.display_id?.toLowerCase().includes(search) ||
      order.order_items?.some(item => 
        item.product?.name?.toLowerCase().includes(search)
      )
    );
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered": return CheckCircle;
      case "pending": return Clock;
      case "processing": return Package;
      case "shipped": return Truck;
      case "cancelled": return XCircle;
      default: return AlertCircle;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "delivered": return "success";
      case "pending": return "warning";
      case "processing": return "info";
      case "shipped": return "info";
      case "cancelled": return "danger";
      default: return "default";
    }
  };

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-12 mb-4" />
        <Loading.Skeleton className="h-12 mb-4" />
        {[1, 2, 3].map(i => (
          <Loading.Skeleton key={i} className="h-32 mb-3" />
        ))}
      </div>
    );
  }

  return (
    <div className="mv2-page">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">My Orders</h1>
          <p className="text-sm text-muted-foreground">Track your orders</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 mv2-input"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="mv2-input">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Order Stats */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-amber-600">
            {orders?.filter(o => o.status === "pending").length || 0}
          </p>
          <p className="text-xs text-muted-foreground">Pending</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-blue-600">
            {orders?.filter(o => ["processing", "shipped"].includes(o.status || "")).length || 0}
          </p>
          <p className="text-xs text-muted-foreground">In Transit</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-green-600">
            {orders?.filter(o => o.status === "delivered").length || 0}
          </p>
          <p className="text-xs text-muted-foreground">Delivered</p>
        </Card>
      </div>

      {/* Orders List */}
      <Section title="Your Orders">
        {filteredOrders && filteredOrders.length > 0 ? (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const StatusIcon = getStatusIcon(order.status || "pending");
              const canCancel = order.status === "pending";

              return (
                <Card key={order.id} variant="outline" className="overflow-hidden">
                  {/* Order Header */}
                  <div className="p-4 border-b border-border">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-foreground">
                          {order.display_id || `#${order.id.slice(0, 8)}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(order.created_at)}
                        </p>
                      </div>
                      <Badge variant={getStatusVariant(order.status || "pending")}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {order.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Order Items */}
                  <div className="p-4 bg-muted/30">
                    <div className="space-y-2">
                      {order.order_items?.slice(0, 3).map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center">
                              <Package className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-foreground font-medium">
                                {item.product?.name || "Product"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Qty: {item.quantity}
                              </p>
                            </div>
                          </div>
                          <span className="text-muted-foreground">
                            {formatCurrency(item.unit_price * item.quantity)}
                          </span>
                        </div>
                      ))}
                      {(order.order_items?.length || 0) > 3 && (
                        <p className="text-xs text-muted-foreground text-center pt-2">
                          +{order.order_items!.length - 3} more items
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Order Footer */}
                  <div className="p-4 border-t border-border">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-muted-foreground">Total Amount</span>
                      <span className="font-bold text-lg text-primary">
                        {formatCurrency(order.total_amount || 0)}
                      </span>
                    </div>

                    {order.delivery_date && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                        <Calendar className="w-4 h-4" />
                        <span>Expected: {formatDate(order.delivery_date)}</span>
                      </div>
                    )}

                    {canCancel && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => cancelOrderMutation.mutate(order.id)}
                        disabled={cancelOrderMutation.isPending}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Cancel Order
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Package}
            title="No orders found"
            description={searchQuery ? "Try adjusting your search" : "Place your first order"}
          />
        )}
      </Section>
    </div>
  );
}
