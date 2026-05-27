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
import { Loader2, Plus, XCircle, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

interface EditItem {
  product_id: string;
  quantity: number;
}

interface EditOrderSheetProps {
  order: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditOrderSheet({ order, open, onOpenChange, onSaved }: EditOrderSheetProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [requirementNote, setRequirementNote] = useState("");
  const [orderItems, setOrderItems] = useState<EditItem[]>([]);

  useEffect(() => {
    if (!order) return;
    setRequirementNote(order.requirement_note || "");
    if (order.order_type === "detailed" && order.order_items) {
      setOrderItems(
        order.order_items.map((item: any) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        }))
      );
    } else {
      setOrderItems([{ product_id: "", quantity: 1 }]);
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
        .select("id, name, base_price")
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
        effective_price: storePriceMap.get(p.id) ?? typePriceMap.get(p.id) ?? Number(p.base_price) ?? 0,
      }));
    },
    enabled: open && !!storeTypeId,
  });

  const addItem = () => setOrderItems((prev) => [...prev, { product_id: "", quantity: 1 }]);
  const removeItem = (index: number) => setOrderItems((prev) => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!order || !user) return;
    if (order.order_type === "simple" && !requirementNote.trim()) {
      toast.error("Requirement note cannot be empty");
      return;
    }
    if (order.order_type === "detailed" && !orderItems.some((item) => item.product_id)) {
      toast.error("Add at least one product");
      return;
    }
    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          requirement_note: order.order_type === "simple" ? requirementNote : (requirementNote || null),
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      if (updateError) throw updateError;

      if (order.order_type === "detailed") {
        const { error: deleteError } = await supabase
          .from("order_items")
          .delete()
          .eq("order_id", order.id);
        if (deleteError) throw deleteError;

        const validItems = orderItems.filter((item) => item.product_id);
        if (validItems.length > 0) {
          const { error: insertError } = await supabase
            .from("order_items")
            .insert(
              validItems.map((item) => ({
                order_id: order.id,
                product_id: item.product_id,
                quantity: item.quantity,
              }))
            );
          if (insertError) throw insertError;
        }
      }

      toast.success("Order updated");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0 max-h-[90vh] overflow-y-auto">
        <div className="px-6">
          <SheetHeader className="mb-5 text-left">
            <SheetTitle className="text-lg font-bold">Edit Order {order?.display_id}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            {order?.order_type === "simple" ? (
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                  Requirement Note
                </Label>
                <Textarea
                  value={requirementNote}
                  onChange={(e) => setRequirementNote(e.target.value)}
                  placeholder="What does the store need?"
                  rows={3}
                  className="rounded-xl resize-none border-slate-200 dark:border-slate-600"
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Products</Label>
                  <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={addItem}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Add
                  </Button>
                </div>
                {products.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No products available for this store</p>
                ) : (
                  <div className="space-y-2">
                    {orderItems.map((item, index) => (
                      <div key={index} className="grid grid-cols-[1fr_90px_36px] gap-2">
                        <Select
                          value={item.product_id}
                          onValueChange={(value) => {
                            setOrderItems((prev) =>
                              prev.map((row, i) => (i === index ? { ...row, product_id: value } : row))
                            );
                          }}
                        >
                          <SelectTrigger className="rounded-xl h-10 border-slate-200 dark:border-slate-600">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} — ₹{p.effective_price}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => {
                            const qty = Math.max(1, Number(e.target.value || 1));
                            setOrderItems((prev) =>
                              prev.map((row, i) => (i === index ? { ...row, quantity: qty } : row))
                            );
                          }}
                          className="h-10 rounded-xl"
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-10 w-9 rounded-xl"
                          onClick={() => removeItem(index)}
                          disabled={orderItems.length === 1}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                    Requirement Note (optional)
                  </Label>
                  <Textarea
                    value={requirementNote}
                    onChange={(e) => setRequirementNote(e.target.value)}
                    placeholder="Additional notes..."
                    rows={2}
                    className="rounded-xl resize-none border-slate-200 dark:border-slate-600"
                  />
                </div>
              </div>
            )}

            <Button
              className="w-full h-11 rounded-xl"
              onClick={handleSave}
              disabled={saving}
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
