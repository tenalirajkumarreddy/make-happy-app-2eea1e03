import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Package,
  Plus,
  Minus,
  Trash2,
  Loader2,
  DollarSign,
  CreditCard,
  AlertCircle,
  Check,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  status: string;
  requirement_note: string | null;
  order_items?: OrderItem[];
  stores?: {
    id: string;
    name: string;
    store_type_id: string | null;
    customer_id: string | null;
  };
}

interface FulfillmentItem {
  product_id: string;
  product_name: string;
  sku: string;
  image_url?: string;
  quantity: number;
  unit_price: number;
  base_price: number;
  total: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  base_price: number;
  image_url?: string;
}

interface OrderFulfillmentDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFulfilled?: () => void;
}

export function OrderFulfillmentDialog({
  order,
  open,
  onOpenChange,
  onFulfilled,
}: OrderFulfillmentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [items, setItems] = useState<FulfillmentItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [storePricing, setStorePricing] = useState<Map<string, number>>(new Map());
  const [storeTypePricing, setStoreTypePricing] = useState<Map<string, number>>(new Map());
  const [cashAmount, setCashAmount] = useState<string>("0");
  const [upiAmount, setUpiAmount] = useState<string>("0");
  const [notes, setNotes] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [oldOutstanding, setOldOutstanding] = useState<number>(0);

  // Calculate totals
  const { subtotal, totalPaid, outstandingAmount, newOutstanding } = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const cash = parseFloat(cashAmount) || 0;
    const upi = parseFloat(upiAmount) || 0;
    const totalPaid = cash + upi;
    const outstandingAmount = Math.max(0, subtotal - totalPaid);
    const newOutstanding = oldOutstanding + outstandingAmount;
    return { subtotal, totalPaid, outstandingAmount, newOutstanding };
  }, [items, cashAmount, upiAmount, oldOutstanding]);

  // Get price for a product using hierarchy
  const getProductPrice = (productId: string, basePrice: number): number => {
    // Store-specific price takes precedence
    if (storePricing.has(productId)) {
      return storePricing.get(productId)!;
    }
    // Store type pricing is second
    if (storeTypePricing.has(productId)) {
      return storeTypePricing.get(productId)!;
    }
    // Fall back to base price
    return basePrice;
  };

  // Load data when order changes
  useEffect(() => {
    if (!order || !open) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Load products
        const { data: productsData, error: productsError } = await supabase
          .from("products")
          .select("id, name, sku, base_price, image_url")
          .eq("is_active", true)
          .order("name");

        if (productsError) throw productsError;
        setProducts(productsData || []);

        // Load store-specific pricing
        if (order.store_id) {
          const { data: storePrices, error: storePricesError } = await supabase
            .from("store_pricing")
            .select("product_id, price")
            .eq("store_id", order.store_id);

          if (!storePricesError && storePrices) {
            const priceMap = new Map<string, number>();
            storePrices.forEach((sp) => priceMap.set(sp.product_id, sp.price));
            setStorePricing(priceMap);
          }

          // Load store type pricing
          if (order.stores?.store_type_id) {
            const { data: typePrices, error: typePricesError } = await supabase
              .from("store_type_pricing")
              .select("product_id, price")
              .eq("store_type_id", order.stores.store_type_id);

            if (!typePricesError && typePrices) {
              const priceMap = new Map<string, number>();
              typePrices.forEach((tp) => priceMap.set(tp.product_id, tp.price));
              setStoreTypePricing(priceMap);
            }
          }
        }

        // Load current store outstanding directly from stores table.
        if (order.store_id) {
          const { data: storeData, error: storeError } = await supabase
            .from("stores")
            .select("outstanding")
            .eq("id", order.store_id)
            .maybeSingle();

          if (!storeError && storeData) {
            setOldOutstanding(Number(storeData.outstanding || 0));
          }
        }

        // Pre-fill items from order if detailed
        if (order.order_type === "detailed" && order.order_items?.length) {
          const productMap = new Map(productsData?.map((p) => [p.id, p]) || []);
          const initialItems: FulfillmentItem[] = [];

          for (const item of order.order_items) {
            const product = productMap.get(item.product_id) || item.products;
            if (!product) continue;

            const basePrice = product.base_price;
            const unitPrice = item.unit_price ?? getProductPrice(item.product_id, basePrice);

            initialItems.push({
              product_id: item.product_id,
              product_name: product.name,
              sku: product.sku,
              image_url: product.image_url,
              quantity: item.quantity,
              unit_price: unitPrice,
              base_price: basePrice,
              total: unitPrice * item.quantity,
            });
          }

          setItems(initialItems);
        } else {
          setItems([]);
        }

        setNotes(order.requirement_note || "");
        setCashAmount("0");
        setUpiAmount("0");
      } catch (error) {
        console.error("Error loading fulfillment data:", error);
        toast({
          title: "Error loading data",
          description: "Failed to load order details. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [order, open]);

  // Add product to items
  const handleAddProduct = () => {
    if (!selectedProduct) return;

    const product = products.find((p) => p.id === selectedProduct);
    if (!product) return;

    // Check if already in items
    if (items.some((item) => item.product_id === selectedProduct)) {
      toast({
        title: "Product already added",
        description: "Increase quantity instead of adding again.",
        variant: "destructive",
      });
      return;
    }

    const unitPrice = getProductPrice(product.id, product.base_price);

    setItems([
      ...items,
      {
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        image_url: product.image_url,
        quantity: 1,
        unit_price: unitPrice,
        base_price: product.base_price,
        total: unitPrice,
      },
    ]);
    setSelectedProduct("");
  };

  // Update item quantity
  const handleQuantityChange = (productId: string, delta: number) => {
    setItems(
      items
        .map((item) => {
          if (item.product_id !== productId) return item;
          const newQty = Math.max(0, item.quantity + delta);
          if (newQty === 0) return null;
          return {
            ...item,
            quantity: newQty,
            total: newQty * item.unit_price,
          };
        })
        .filter(Boolean) as FulfillmentItem[]
    );
  };

  // Update item price
  const handlePriceChange = (productId: string, price: string) => {
    const numPrice = parseFloat(price) || 0;
    setItems(
      items.map((item) => {
        if (item.product_id !== productId) return item;
        return {
          ...item,
          unit_price: numPrice,
          total: numPrice * item.quantity,
        };
      })
    );
  };

  // Remove item
  const handleRemoveItem = (productId: string) => {
    setItems(items.filter((item) => item.product_id !== productId));
  };

  // Set full amount as cash
  const handlePayFullCash = () => {
    setCashAmount(subtotal.toString());
    setUpiAmount("0");
  };

  // Set full amount as UPI
  const handlePayFullUpi = () => {
    setUpiAmount(subtotal.toString());
    setCashAmount("0");
  };

  // Submit fulfillment
  const handleSubmit = async () => {
    if (!order) return;
    if (items.length === 0) {
      toast({
        title: "No items",
        description: "Please add at least one item to the order.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      // Generate display ID for sale
      const { data: displayIdData, error: displayIdError } = await supabase.rpc(
        "generate_display_id",
        { prefix: "SALE", seq_name: "sale_display_seq" }
      );
      if (displayIdError) throw displayIdError;

      const saleDisplayId = displayIdData as string;

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Prepare sale items
      const saleItems = items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.quantity * item.unit_price,
      }));

      // Call record_sale RPC
      const { error: saleError } = await supabase.rpc("record_sale", {
        p_display_id: saleDisplayId,
        p_store_id: order.store_id,
        p_customer_id: order.stores?.customer_id || null,
        p_recorded_by: user.id,
        p_logged_by: null,
        p_total_amount: subtotal,
        p_cash_amount: parseFloat(cashAmount) || 0,
        p_upi_amount: parseFloat(upiAmount) || 0,
        p_outstanding_amount: outstandingAmount,
        p_sale_items: saleItems,
        p_created_at: null,
      });

      if (saleError) throw saleError;

      // Get the sale we just created to link it to the order
      const { data: newSale, error: fetchSaleError } = await supabase
        .from("sales")
        .select("id")
        .eq("display_id", saleDisplayId)
        .single();

      if (fetchSaleError) throw fetchSaleError;

      // Update the sale with order_id reference
      const { error: linkError } = await supabase
        .from("sales")
        .update({ order_id: order.id })
        .eq("id", newSale.id);

      if (linkError) throw linkError;

      // Update order status to delivered
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          status: "delivered",
          fulfilled_by: user.id,
          delivered_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (orderError) throw orderError;

      // Send notification to customer if exists
      if (order.stores?.customer_id) {
        await supabase.from("notifications").insert({
          user_id: order.stores.customer_id,
          title: "Order Delivered",
          message: `Your order ${order.display_id} has been delivered and recorded as sale ${saleDisplayId}.`,
          type: "order",
          reference_id: order.id,
          reference_type: "order",
        });
      }

      // Log activity
      await supabase.from("activity_log").insert({
        action: "order_fulfilled",
        entity_type: "order",
        entity_id: order.id,
        user_id: user.id,
        details: {
          order_display_id: order.display_id,
          sale_display_id: saleDisplayId,
          total_amount: subtotal,
          items_count: items.length,
        },
      });

      toast({
        title: "Order Fulfilled",
        description: `Sale ${saleDisplayId} created successfully.`,
      });

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balances"] });

      onOpenChange(false);
      onFulfilled?.();
    } catch (error) {
      console.error("Fulfillment error:", error);
      toast({
        title: "Fulfillment Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to complete order. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Available products not yet added
  const availableProducts = products.filter(
    (p) => !items.some((item) => item.product_id === p.id)
  );

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Fulfill Order {order.display_id}
          </DialogTitle>
          <DialogDescription>
            Edit items, prices, and payment before completing delivery.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 pb-4">
              {/* Order Info */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {order.order_type === "detailed" ? "Detailed Order" : "Simple Order"}
                </Badge>
                <Badge variant="secondary">{order.stores?.name || "Unknown Store"}</Badge>
              </div>

              {/* Requirement Note */}
              {order.requirement_note && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{order.requirement_note}</AlertDescription>
                </Alert>
              )}

              {/* Add Product */}
              <div className="flex gap-2">
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Add product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - {product.sku}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddProduct} disabled={!selectedProduct}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                {items.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    {order.order_type === "simple"
                      ? "Add products to this order"
                      : "No items in order"}
                  </div>
                ) : (
                  items.map((item) => (
                    <Card key={item.product_id}>
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={item.image_url} alt={item.product_name} />
                            <AvatarFallback>
                              {item.product_name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{item.product_name}</div>
                            <div className="text-xs text-muted-foreground">{item.sku}</div>
                          </div>

                          {/* Quantity controls */}
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleQuantityChange(item.product_id, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center font-medium">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleQuantityChange(item.product_id, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>

                          {/* Price input */}
                          <div className="w-24">
                            <Input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) =>
                                handlePriceChange(item.product_id, e.target.value)
                              }
                              className="h-8 text-right"
                              min={0}
                              step={0.01}
                            />
                          </div>

                          {/* Total */}
                          <div className="w-20 text-right font-medium">
                            ₹{item.total.toFixed(2)}
                          </div>

                          {/* Remove */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleRemoveItem(item.product_id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              <Separator />

              {/* Subtotal */}
              <div className="flex justify-between items-center text-lg font-semibold">
                <span>Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>

              {/* Payment Section */}
              <div className="space-y-4">
                <Label className="text-base font-medium">Payment</Label>

                <div className="flex gap-2 mb-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePayFullCash}
                    className="flex-1"
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Full Cash
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePayFullUpi}
                    className="flex-1"
                  >
                    <CreditCard className="h-4 w-4 mr-1" />
                    Full UPI
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cash">Cash Amount</Label>
                    <Input
                      id="cash"
                      type="number"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                      min={0}
                      step={0.01}
                    />
                  </div>
                  <div>
                    <Label htmlFor="upi">UPI Amount</Label>
                    <Input
                      id="upi"
                      type="number"
                      value={upiAmount}
                      onChange={(e) => setUpiAmount(e.target.value)}
                      min={0}
                      step={0.01}
                    />
                  </div>
                </div>

                {/* Outstanding Info */}
                <div className="bg-muted p-3 rounded-lg space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Previous Outstanding</span>
                    <span>₹{oldOutstanding.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">This Order Outstanding</span>
                    <span>₹{outstandingAmount.toFixed(2)}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between font-medium">
                    <span>New Total Outstanding</span>
                    <span className={newOutstanding > 0 ? "text-orange-600" : "text-green-600"}>
                      ₹{newOutstanding.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any delivery notes..."
                  className="mt-1"
                />
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || submitting || items.length === 0}
            className="gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Complete Fulfillment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OrderFulfillmentDialog;
