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
  Plus,
  Store
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

export function MarketerOrders() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["mobile-v2-marketer-orders", profile?.id, statusFilter, dateFilter],
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
          customer:profiles!customer_id(id, business_name, address),
          order_items:order_items(
            id,
            quantity,
            unit_price,
            product:products(name)
          )
        `)
        .eq("created_by", profile.id)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      // Date filtering
      if (dateFilter !== "all") {
        const now = new Date();
        let startDate: Date;
        
        switch (dateFilter) {
          case "today":
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
          case "week":
            startDate = new Date(now.setDate(now.getDate() - 7));
            break;
          case "month":
            startDate = new Date(now.setMonth(now.getMonth() - 1));
            break;
          default:
            startDate = new Date(0);
        }
        query = query.gte("created_at", startDate.toISOString());
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
        .eq("created_by", profile?.id)
        .eq("status", "pending");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-v2-marketer-orders"] });
      toast.success("Order cancelled");
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
        <div className="grid grid-cols-3 gap-2 mb-4">
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">My Orders</h1>
          <p className="text-sm text-muted-foreground">Manage customer orders</p>
        </div>
        <Button size="sm" className="mv2-btn-primary">
          <Plus className="w-4 h-4 mr-1" />
          New Order
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search orders or stores..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 mv2-input"
          />
        </div>

        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 mv2-input">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="flex-1 mv2-input">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
          <p className="text-xs text-muted-foreground">In Progress</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-green-600">
            {orders?.filter(o => o.status === "delivered").length || 0}
          </p>
          <p className="text-xs text-muted-foreground">Delivered</p>
        </Card>
      </div>

      {/* Orders List */}
      <Section title="Orders">
        {filteredOrders && filteredOrders.length > 0 ? (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const StatusIcon = getStatusIcon(order.status || "pending");
              const canCancel = order.status === "pending";

              return (
                <Card key={order.id} variant="outline" className="overflow-hidden">
                  {/* Order Header */}
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

                    {/* Customer Info */}
                    <div className="flex items-center gap-2 text-sm">
                      <Store className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground font-medium">
                        {order.customer?.business_name || "Customer"}
                      </span>
                    </div>
                  </div>

                  {/* Order Items Preview */}
                  <div className="p-4 bg-muted/30">
                    <div className="space-y-2">
                      {order.order_items?.slice(0, 2).map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <span className="text-foreground">
                            {item.product?.name || "Product"} ×{item.quantity}
                          </span>
                          <span className="text-muted-foreground">
                            {formatCurrency(item.unit_price * item.quantity)}
                          </span>
                        </div>
                      ))}
                      {(order.order_items?.length || 0) > 2 && (
                        <p className="text-xs text-muted-foreground">
                          +{order.order_items!.length - 2} more items
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Order Footer */}
                  <div className="p-4 border-t border-border">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-muted-foreground">Total</span>
                      <span className="font-bold text-lg text-primary">
                        {formatCurrency(order.total_amount || 0)}
                      </span>
                    </div>

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
            description={searchQuery ? "Try adjusting your filters" : "Start taking orders from your stores"}
          />
        )}
      </Section>
    </div>
  );
}
