import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Loader2, Plus, Eye, Package, ChevronRight, AlertCircle, X, CheckCircle2, Ban, Edit } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  products?: {
    name: string;
    sku: string;
    base_price: number;
  };
}

interface Order {
  id: string;
  display_id: string;
  store_id: string;
  status: string;
  order_type: "simple" | "detailed";
  requirement_note: string | null;
  total_amount: number;
  created_at: string;
  stores?: { name: string; display_id: string };
  customers?: { name: string; display_id: string };
  order_items?: OrderItem[];
  assigned_to?: string | null;
  fulfilled_by_sale_id?: string | null;
}

interface Profile {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

export function AdminOrders({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Fetch orders with complete item details
  const { data: orders, isLoading } = useQuery({
    queryKey: ["mobile-orders", currentWarehouse?.id, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select(`
          *, 
          stores(name, display_id), 
          customers(name, display_id), 
          order_items(id, product_id, quantity, products(name, sku, base_price))
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Order[];
    },
  });

  // Filter by search term
  const filteredOrders = useMemo(() => {
    return (orders || []).filter((order) =>
      order.display_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.stores?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [orders, searchTerm]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "confirmed":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "delivered":
        return "bg-green-100 text-green-800 border-green-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <AlertCircle className="h-3 w-3" />;
      case "confirmed":
        return <CheckCircle2 className="h-3 w-3" />;
      case "delivered":
        return <Package className="h-3 w-3" />;
      case "cancelled":
        return <Ban className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const formatAmount = (amount: number) => {
    return `Rs ${Math.round(amount).toLocaleString('en-IN')}`;
  };

  // Calculate order total from order_items using product base_price
  const calculateOrderTotal = (order: Order) => {
    if (order.order_items && order.order_items.length > 0) {
      return order.order_items.reduce((sum, item) => {
        const unitPrice = item.products?.base_price || 0;
        return sum + (item.quantity * unitPrice);
      }, 0);
    }
    return order.total_amount || 0;
  };

  // Calculate item total
  const calculateItemTotal = (item: OrderItem) => {
    const unitPrice = item.products?.base_price || 0;
    return item.quantity * unitPrice;
  };

  return (
    <div className="pb-6 space-y-4">
      {/* Header with actions */}
      <div className="px-4 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Orders</h2>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => onNavigate("/orders")}
          >
            <Plus className="h-4 w-4" />
            Create
          </Button>
        </div>

        {/* Search & Filter */}
        <Input
          placeholder="Search order ID or store..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="text-sm h-9"
        />

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All orders</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted-foreground">No orders found</p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {filteredOrders.map((order) => {
            const orderTotal = calculateOrderTotal(order);
            const itemCount = order.order_items?.length || 0;
            
            return (
              <div
                key={order.id}
                className="rounded-lg border bg-card overflow-hidden"
              >
                {/* Card Header */}
                <div 
                  onClick={() => {
                    setSelectedOrder(order);
                    setShowDetailModal(true);
                  }}
                  className="p-3 active:bg-muted transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-semibold text-primary">{order.display_id}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {order.stores?.name || "Unknown Store"}
                      </p>
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap flex items-center gap-1 border ${getStatusColor(order.status)}`}>
                      {getStatusIcon(order.status)}
                      {order.status}
                    </span>
                  </div>

                  {/* Order Items Preview */}
                  {order.order_type === "detailed" && order.order_items && order.order_items.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {order.order_items.slice(0, 2).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-muted-foreground truncate flex-1">
                            {item.products?.name} × {item.quantity}
                          </span>
                          <span className="font-medium tabular-nums ml-2">
                            {formatAmount(calculateItemTotal(item))}
                          </span>
                        </div>
                      ))}
                      {order.order_items.length > 2 && (
                        <p className="text-[10px] text-muted-foreground">
                          +{order.order_items.length - 2} more items
                        </p>
                      )}
                    </div>
                  )}

                  {order.order_type === "simple" && order.requirement_note && (
                    <p className="text-xs text-muted-foreground truncate mb-2">
                      Note: {order.requirement_note}
                    </p>
                  )}

                  {/* Total Amount */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {itemCount > 0 ? `${itemCount} items` : order.order_type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(order.created_at), "dd MMM, hh:mm a")}
                      </span>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-primary">
                      {formatAmount(orderTotal)}
                    </p>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div className="flex border-t border-border/50">
                  <button
                    onClick={() => onNavigate(`/orders?highlight=${order.id}`)}
                    className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors border-r border-border/50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                  {order.status === "pending" && (
                    <button
                      onClick={() => onNavigate(`/orders?fulfill=${order.id}`)}
                      className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:bg-primary/5 active:bg-primary/10 transition-colors border-r border-border/50"
                    >
                      <Package className="h-3.5 w-3.5" />
                      Fulfill
                    </button>
                  )}
                  <button
                    onClick={() => onNavigate(`/orders?edit=${order.id}`)}
                    className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Order Details</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              {/* Order Info Header */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Order ID</span>
                  <span className="font-mono text-sm font-semibold">{selectedOrder.display_id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Store</span>
                  <span className="text-sm font-medium text-right max-w-[150px] truncate">{selectedOrder.stores?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Type</span>
                  <span className="text-sm capitalize">{selectedOrder.order_type}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${getStatusColor(selectedOrder.status)}`}>
                    {getStatusIcon(selectedOrder.status)}
                    {selectedOrder.status}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Date</span>
                  <span className="text-xs">{format(new Date(selectedOrder.created_at), "dd MMM yy, hh:mm a")}</span>
                </div>
              </div>

              {/* Order Items */}
              {selectedOrder.order_type === "detailed" && selectedOrder.order_items && selectedOrder.order_items.length > 0 ? (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="bg-muted/30 px-3 py-2 border-b">
                    <p className="text-xs font-semibold text-muted-foreground">Order Items ({selectedOrder.order_items.length})</p>
                  </div>
                  <div className="divide-y">
                    {selectedOrder.order_items.map((item, idx) => {
                      const unitPrice = item.products?.base_price || 0;
                      const totalPrice = calculateItemTotal(item);
                      
                      return (
                        <div key={idx} className="px-3 py-2.5">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-sm font-medium">{item.products?.name}</span>
                            <span className="text-sm font-semibold tabular-nums">{formatAmount(totalPrice)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>SKU: {item.products?.sku || item.product_id.slice(0, 8)}</span>
                            <span>Qty: {item.quantity} × {formatAmount(unitPrice)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-3 py-2.5 border-t bg-muted/20">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-muted-foreground">Total Amount</span>
                      <span className="text-base font-bold text-primary tabular-nums">{formatAmount(calculateOrderTotal(selectedOrder))}</span>
                    </div>
                  </div>
                </div>
              ) : selectedOrder.requirement_note ? (
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Requirement</p>
                  <p className="text-sm text-foreground">{selectedOrder.requirement_note}</p>
                </div>
              ) : null}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setShowDetailModal(false);
                    onNavigate(`/orders?highlight=${selectedOrder.id}`);
                  }}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View Full
                </Button>
                {selectedOrder.status === "pending" && (
                  <Button
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setShowDetailModal(false);
                      onNavigate(`/orders?fulfill=${selectedOrder.id}`);
                    }}
                  >
                    <Package className="h-3 w-3 mr-1" />
                    Fulfill
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
