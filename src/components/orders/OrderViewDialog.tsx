import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Package, 
  Store, 
  User, 
  Calendar, 
  Clock, 
  FileText,
  ShoppingCart,
  MapPin,
  Phone,
  Mail,
  XCircle,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number | null;
  products?: {
    id: string;
    name: string;
    sku: string;
    base_price: number;
    image_url?: string;
  };
}

interface Order {
  id: string;
  display_id: string;
  store_id: string;
  customer_id: string | null;
  order_type: "simple" | "detailed";
  status: "pending" | "confirmed" | "delivered" | "cancelled";
  requirement_note: string | null;
  source: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  assigned_to: string | null;
  fulfilled_by_sale_id: string | null;
  delivered_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  stores?: {
    id: string;
    name: string;
    address?: string;
    phone?: string;
  };
  customers?: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
  };
  order_items?: OrderItem[];
  assigned_to_user?: {
    id: string;
    full_name: string;
    email: string;
  };
  fulfilled_by_sale?: {
    id: string;
    display_id: string;
    total_amount: number;
  };
}

interface OrderViewDialogProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewSale?: (saleId: string) => void;
  onCreateInvoice?: (orderId: string) => void;
}

export function OrderViewDialog({
  orderId,
  open,
  onOpenChange,
  onViewSale,
  onCreateInvoice,
}: OrderViewDialogProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  useEffect(() => {
    if (open && orderId) {
      loadOrderDetails(orderId);
    } else {
      setOrder(null);
    }
  }, [open, orderId]);

  const loadOrderDetails = async (id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          stores(id, name, address, phone),
          customers(id, name, phone, email),
          order_items(
            id,
            product_id,
            quantity,
            unit_price,
            products(id, name, sku, base_price, image_url)
          ),
          fulfilled_by_sale:fulfilled_by_sale_id(id, display_id, total_amount),
          assigned_to_user:assigned_to(id, full_name, email)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      setOrder(data as unknown as Order);
    } catch (error) {
      console.error("Error loading order:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "N/A";
    return format(new Date(date), "dd MMM yyyy, hh:mm a");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-5 w-5 text-amber-500" />;
      case "confirmed":
        return <CheckCircle2 className="h-5 w-5 text-blue-500" />;
      case "delivered":
        return <Package className="h-5 w-5 text-green-500" />;
      case "cancelled":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "confirmed":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "delivered":
        return "bg-green-100 text-green-800 border-green-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const calculateTotal = () => {
    if (!order?.order_items) return 0;
    return order.order_items.reduce((sum, item) => {
      const price = item.unit_price || item.products?.base_price || 0;
      return sum + price * item.quantity;
    }, 0);
  };

  if (loading || !order) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon(order.status)}
              <div>
                <DialogTitle className="flex items-center gap-2">
                  Order {order.display_id}
                  <Badge className={getStatusColor(order.status)}>
                    {order.status}
                  </Badge>
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {order.order_type === "simple" ? "Simple Order" : "Detailed Order"}
                </p>
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="items">
              Items ({order.order_items?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            {/* Store Info Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  Store Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="font-medium">{order.stores?.name || "N/A"}</p>
                  {order.stores?.address && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {order.stores.address}
                    </p>
                  )}
                  {order.stores?.phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {order.stores.phone}
                    </p>
                  )}
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Customer: {order.customers?.name || "N/A"}
                  </p>
                  {order.customers?.phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {order.customers.phone}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Order Info Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Order Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Source</p>
                    <p className="font-medium capitalize">{order.source}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created At</p>
                    <p className="text-sm">{formatDate(order.created_at)}</p>
                  </div>
                  {order.assigned_to_user && (
                    <div>
                      <p className="text-xs text-muted-foreground">Assigned To</p>
                      <p className="text-sm">{order.assigned_to_user.full_name}</p>
                    </div>
                  )}
                </div>

                {order.requirement_note && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground">Notes</p>
                      <p className="text-sm mt-1 whitespace-pre-wrap bg-muted/50 p-2 rounded">
                        {order.requirement_note}
                      </p>
                    </div>
                  </>
                )}

                {order.cancellation_reason && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground text-red-600">Cancellation Reason</p>
                      <p className="text-sm mt-1 text-red-600 whitespace-pre-wrap bg-red-50 p-2 rounded border border-red-200">
                        {order.cancellation_reason}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Sale Info (if fulfilled) */}
            {order.fulfilled_by_sale && (
              <Card className="bg-green-50 border-green-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-800">
                    <ShoppingCart className="h-4 w-4" />
                    Fulfilled Sale
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Sale ID:</span>{" "}
                    <span className="font-mono font-medium">{order.fulfilled_by_sale.display_id}</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Amount:</span>{" "}
                    <span className="font-medium">₹{order.fulfilled_by_sale.total_amount.toLocaleString()}</span>
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 border-green-600 text-green-700 hover:bg-green-100"
                    onClick={() => onViewSale?.(order.fulfilled_by_sale!.id)}
                  >
                    <ShoppingCart className="h-4 w-4 mr-1" />
                    View Sale
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="items" className="space-y-4 mt-4">
            {order.order_type === "simple" ? (
              <Card>
                <CardContent className="p-6">
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>This is a simple order</p>
                    <p className="text-sm mt-1">Only a requirement note was provided:</p>
                    <p className="text-sm mt-3 bg-muted/50 p-3 rounded text-left">
                      {order.requirement_note || "No notes provided"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : order.order_items && order.order_items.length > 0 ? (
              <div className="space-y-3">
                {order.order_items.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium">{item.products?.name || "Unknown Product"}</p>
                          <p className="text-xs text-muted-foreground">
                            SKU: {item.products?.sku || "N/A"}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-sm">
                            <span className="flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              {item.quantity} units
                            </span>
                            <span className="text-muted-foreground">
                              × ₹{(item.unit_price || item.products?.base_price || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">
                            ₹{(
                              item.quantity * (item.unit_price || item.products?.base_price || 0)
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <Separator />
                <div className="flex justify-between items-center py-2">
                  <p className="text-sm text-muted-foreground">
                    {order.order_items.length} items
                  </p>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Estimated Total</p>
                    <p className="text-xl font-bold">₹{calculateTotal().toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No items in this order</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="timeline" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Order Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <div className="w-px h-full bg-border" />
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="font-medium">Order Created</p>
                    <p className="text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3 inline mr-1" />
                      {formatDate(order.created_at)}
                    </p>
                  </div>
                </div>

                {order.confirmed_at && (
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      <div className="w-px h-full bg-border" />
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="font-medium">Order Confirmed</p>
                      <p className="text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3 inline mr-1" />
                        {formatDate(order.confirmed_at)}
                      </p>
                    </div>
                  </div>
                )}

                {order.delivered_at && (
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-2 w-2 rounded-full bg-green-600" />
                      <div className="w-px h-full bg-border" />
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="font-medium">Order Delivered</p>
                      <p className="text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3 inline mr-1" />
                        {formatDate(order.delivered_at)}
                      </p>
                    </div>
                  </div>
                )}

                {order.cancelled_at && (
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-2 w-2 rounded-full bg-red-500" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-red-600">Order Cancelled</p>
                      <p className="text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3 inline mr-1" />
                        {formatDate(order.cancelled_at)}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex justify-between items-center">
          <div>
            {order.status === "delivered" && !order.fulfilled_by_sale_id && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCreateInvoice?.(order.id)}
              >
                <FileText className="h-4 w-4 mr-1" />
                Create Invoice
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OrderViewDialog;
