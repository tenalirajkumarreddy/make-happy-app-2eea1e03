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
  Store
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

export function AdminOrders() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["mobile-v2-admin-orders", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(`
          id,
          display_id,
          total_amount,
          status,
          created_at,
          delivery_date,
          customer:profiles!customer_id(business_name, full_name, address),
          order_items:order_items(id, quantity, unit_price, product:products(name))
        `)
        .order("created_at", { ascending: false })
        .limit(50);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Update order status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-v2-admin-orders"] });
      toast.success("Order status updated");
    },
    onError: () => {
      toast.error("Failed to update order");
    },
  });

  const filteredOrders = orders?.filter(order => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      order.display_id?.toLowerCase().includes(search) ||
      order.customer?.business_name?.toLowerCase().includes(search)
    );
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered": return CheckCircle;
      case "pending": return Clock;
      case "processing": return Package;
      case "shipped": return Truck;
      case "cancelled": return XCircle;
      default: return Clock;
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
        <div className="grid grid-cols-4 gap-2 mb-4">
          <Loading.Skeleton className="h-16" />
          <Loading.Skeleton className="h-16" />
          <Loading.Skeleton className="h-16" />
          <Loading.Skeleton className="h-16" />
        </div>
        {[1, 2, 3].map(i => (
          <Loading.Skeleton key={i} className="h-32 mb-3" />
        ))}
      </div>
    );
  }

  return (
    <div className="mv2-page">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Orders</h1>
        <p className="text-sm text-muted-foreground">Manage all orders</p>
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

      {/* Status Stats */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <Card className="p-2 text-center">
          <p className="text-lg font-bold text-amber-600">
            {orders?.filter(o => o.status === "pending").length || 0}
          </p>
          <p className="text-xs text-muted-foreground">Pending</p>
        </Card>
        <Card className="p-2 text-center">
          <p className="text-lg font-bold text-blue-600">
            {orders?.filter(o => o.status === "processing").length || 0}
          </p>
          <p className="text-xs text-muted-foreground">Processing</p>
        </Card>
        <Card className="p-2 text-center">
          <p className="text-lg font-bold text-indigo-600">
            {orders?.filter(o => o.status === "shipped").length || 0}
          </p>
          <p className="text-xs text-muted-foreground">Shipped</p>
        </Card>
        <Card className="p-2 text-center">
          <p className="text-lg font-bold text-green-600">
            {orders?.filter(o => o.status === "delivered").length || 0}
          </p>
          <p className="text-xs text-muted-foreground">Delivered</p>
        </Card>
      </div>

      {/* Orders List */}
      <Section title="All Orders">
        {filteredOrders && filteredOrders.length > 0 ? (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const StatusIcon = getStatusIcon(order.status || "pending");

              return (
                <Card key={order.id} variant="outline" className="overflow-hidden">
                  {/* Header */}
                  <div className="p-4 border-b border-border">
                    <div className="flex items-start justify-between mb-2">
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

                    <div className="flex items-center gap-2 text-sm">
                      <Store className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">
                        {order.customer?.business_name || order.customer?.full_name || "Customer"}
                      </span>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="p-4 bg-muted/30">
                    <div className="space-y-1">
                      {order.order_items?.slice(0, 2).map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <span>{item.product?.name} ×{item.quantity}</span>
                          <span className="text-muted-foreground">
                            {formatCurrency(item.unit_price * item.quantity)}
                          </span>
                        </div>
                      ))}
                      {(order.order_items?.length || 0) > 2 && (
                        <p className="text-xs text-muted-foreground">
                          +{order.order_items!.length - 2} more
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="p-4 border-t border-border">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-muted-foreground">Total</span>
                      <span className="font-bold text-lg text-primary">
                        {formatCurrency(order.total_amount || 0)}
                      </span>
                    </div>

                    {/* Status Actions */}
                    {order.status !== "delivered" && order.status !== "cancelled" && (
                      <div className="flex gap-2">
                        {order.status === "pending" && (
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => updateStatusMutation.mutate({ 
                              orderId: order.id, 
                              status: "processing" 
                            })}
                          >
                            Process
                          </Button>
                        )}
                        {order.status === "processing" && (
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => updateStatusMutation.mutate({ 
                              orderId: order.id, 
                              status: "shipped" 
                            })}
                          >
                            Ship
                          </Button>
                        )}
                        {order.status === "shipped" && (
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => updateStatusMutation.mutate({ 
                              orderId: order.id, 
                              status: "delivered" 
                            })}
                          >
                            Delivered
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          onClick={() => updateStatusMutation.mutate({ 
                            orderId: order.id, 
                            status: "cancelled" 
                          })}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
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
            description="Orders will appear here"
          />
        )}
      </Section>
    </div>
  );
}
