import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, XCircle, ShoppingCart, Package, Minus } from "lucide-react";
import { toast } from "sonner";

interface OrderItem {
  product_id: string;
  quantity: number;
  unit_price?: number;
}

interface EditOrderSheetProps {
  order: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditOrderSheet({ order, open, onOpenChange, onSaved }: EditOrderSheetProps) {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [requirementNote, setRequirementNote] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isUrgent, setIsUrgent] = useState(false);
  const [orderType, setOrderType] = useState<"simple" | "detailed">("simple");

  useEffect(() => {
    if (!order) return;
    setRequirementNote(order.requirement_note || "");
    setIsUrgent(order.is_urgent ?? false);
    setOrderType(order.order_type || "simple");

    if (order.order_type === "detailed" && order.order_items?.length) {
      setOrderItems(
        order.order_items.map((item: any) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price || 0,
        }))
      );
    } else {
      setOrderItems([]);
    }
  }, [order]);

  const storeTypeId = order?.stores?.store_type_id;
  const storeId = order?.store_id;

  const { data: products = [] } = useQuery({
    queryKey: ["edit-order-products", storeTypeId],
    queryFn: async () => {
      if (!storeTypeId) return [];
      const { data: typeProducts } = await supabase
        .from("store_type_products")
        .select("product_id")
        .eq("store_type_id", storeTypeId);
      const productIds = (typeProducts || []).map((tp: any) => tp.product_id);
      if (productIds.length === 0) return [];
      const { data: products } = await supabase
        .from("products")
        .select("id, name, base_price, sku")
        .in("id", productIds)
        .eq("is_active", true)
        .order("name");
      const { data: storePrices } = await supabase
        .from("store_pricing")
        .select("product_id, price")
        .eq("store_id", storeId);
      const storePriceMap = new Map((storePrices || []).map((sp: any) => [sp.product_id, sp.price]));
      const { data: typePrices } = await supabase
        .from("store_type_pricing")
        .select("product_id, price")
        .eq("store_type_id", storeTypeId);
      const typePriceMap = new Map((typePrices || []).map((tp: any) => [tp.product_id, tp.price]));
      return ((products || []) as any[]).map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        base_price: p.base_price,
        effective_price: storePriceMap.get(p.id) ?? typePriceMap.get(p.id) ?? Number(p.base_price) ?? 0,
      }));
    },
    enabled: open && !!storeTypeId,
  });

  const addProduct = (productId: string) => {
    const existing = orderItems.find((i) => i.product_id === productId);
    if (existing) {
      setOrderItems(orderItems.map((i) => i.product_id === productId ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      const product = products.find((p: any) => p.id === productId);
      setOrderItems([...orderItems, { product_id: productId, quantity: 1, unit_price: product?.effective_price || 0 }]);
    }
  };

  const removeItem = (idx: number) => setOrderItems(orderItems.filter((_, i) => i !== idx));

  const updateQuantity = (idx: number, qty: number) => {
    const updated = [...orderItems];
    updated[idx] = { ...updated[idx], quantity: Math.max(0, qty) };
    if (qty <= 0) {
      updated.splice(idx, 1);
    }
    setOrderItems(updated);
  };

  const updatePrice = (idx: number, price: number) => {
    const updated = [...orderItems];
    updated[idx] = { ...updated[idx], unit_price: price };
    setOrderItems(updated);
  };

  const validItems = orderItems.filter((i) => i.product_id && i.quantity > 0);
  const totalAmount = validItems.reduce((sum, i) => sum + i.quantity * (i.unit_price || products.find((p: any) => p.id === i.product_id)?.effective_price || 0), 0);

  const handleSave = async () => {
    if (!order || !user) return;
    if (!requirementNote.trim() && validItems.length === 0) {
      toast.error("Add a requirement note or at least one product");
      return;
    }
    setSaving(true);
    try {
      // Determine new order type: if products are added, convert to detailed
      const newOrderType = validItems.length > 0 ? "detailed" : "simple";

      const updatePayload: Record<string, any> = {
        requirement_note: requirementNote || null,
        order_type: newOrderType,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
      const canEditUrgent = role === "super_admin" || role === "manager" || order.created_by === user.id || order.assigned_to === user.id;
      if (canEditUrgent) {
        updatePayload.is_urgent = isUrgent;
      }
      const { error: updateError } = await supabase
        .from("orders")
        .update(updatePayload)
        .eq("id", order.id);
      if (updateError) throw updateError;

      // Soft-delete existing items
      const { error: deleteError } = await supabase
        .from("order_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("order_id", order.id)
        .is("deleted_at", null);
      if (deleteError) throw deleteError;

      // Insert new items
      if (validItems.length > 0) {
        const { error: insertError } = await supabase
          .from("order_items")
          .insert(
            validItems.map((item) => ({
              order_id: order.id,
              product_id: item.product_id,
              quantity: item.quantity,
              unit_price: item.unit_price || products.find((p: any) => p.id === item.product_id)?.effective_price || 0,
            }))
          );
        if (insertError) throw insertError;
      }

      toast.success(newOrderType === "detailed" && order.order_type === "simple"
        ? "Order converted to detailed with products"
        : "Order updated");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update order");
    } finally {
      setSaving(false);
    }
  };

  const availableProducts = products.filter(
    (p: any) => !orderItems.some((item) => item.product_id === p.id)
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0 max-h-[90vh] overflow-y-auto">
        <div className="px-6">
          <SheetHeader className="mb-5 text-left">
            <SheetTitle className="text-lg font-bold">Edit Order {order?.display_id}</SheetTitle>
          </SheetHeader>

          <div className="space-y-5">
            {/* Requirement Note — always visible */}
            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                Requirement Note
              </Label>
              <Textarea
                value={requirementNote}
                onChange={(e) => setRequirementNote(e.target.value)}
                placeholder="What does the store need?"
                rows={2}
                className="rounded-xl resize-none border-slate-200 dark:border-slate-600"
              />
            </div>

            {/* Products section — always visible */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Products {validItems.length > 0 && <span className="text-muted-foreground font-normal">({validItems.length} items, ₹{totalAmount.toLocaleString()})</span>}
                </Label>
              </div>

              {/* Add product dropdown */}
              {availableProducts.length > 0 && (
                <Select onValueChange={(v) => { addProduct(v); }}>
                  <SelectTrigger className="rounded-xl h-10 border-slate-200 dark:border-slate-600 mb-3">
                    <SelectValue placeholder="+ Add product" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — ₹{p.effective_price}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Items list */}
              {orderItems.length > 0 ? (
                <div className="space-y-2">
                  {orderItems.map((item, idx) => {
                    const product = products.find((p: any) => p.id === item.product_id);
                    const price = item.unit_price || product?.effective_price || 0;
                    return (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                        <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{product?.name || item.product_id}</p>
                          <p className="text-xs text-muted-foreground">₹{price} × {item.quantity} = ₹{(price * item.quantity).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(idx, item.quantity - 1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min={0}
                            value={item.quantity}
                            onChange={(e) => updateQuantity(idx, Math.max(0, Number(e.target.value) || 0))}
                            className="w-14 h-7 text-center text-sm px-1"
                          />
                          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(idx, item.quantity + 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="w-20">
                          <Input
                            type="number"
                            min={0}
                            value={price}
                            onChange={(e) => updatePrice(idx, Number(e.target.value) || 0)}
                            className="h-7 text-xs text-right px-1"
                          />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(idx)}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-lg">
                  No products added. Use the dropdown above to add items.
                </p>
              )}
            </div>

            {/* Urgent toggle */}
            {(() => {
              const canEditUrgent = role === "super_admin" || role === "manager" || order?.created_by === user?.id || order?.assigned_to === user?.id;
              return canEditUrgent ? (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="edit-urgent-sheet" className="text-sm cursor-pointer font-medium">Urgent Order</Label>
                  <div
                    className="relative w-11 h-6 bg-muted rounded-full cursor-pointer transition-colors"
                    style={isUrgent ? { backgroundColor: 'hsl(0 84% 60%)' } : {}}
                    onClick={() => setIsUrgent(!isUrgent)}
                  >
                    <div style={{
                      position: 'absolute', top: '2px',
                      left: isUrgent ? '22px' : '2px',
                      width: '20px', height: '20px',
                      backgroundColor: 'white', borderRadius: '50%',
                      transition: 'left 0.2s'
                    }} />
                  </div>
                </div>
              ) : null;
            })()}

            <Button
              className="w-full h-11 rounded-xl"
              onClick={handleSave}
              disabled={saving || (!requirementNote.trim() && validItems.length === 0)}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShoppingCart className="h-4 w-4 mr-1" />}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
