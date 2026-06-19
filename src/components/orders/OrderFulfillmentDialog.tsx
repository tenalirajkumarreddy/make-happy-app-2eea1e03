import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@/hooks/usePermission";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { afterSaleSaved } from "@/lib/mutationHelpers";
import { resolveCreditLimit } from "@/lib/creditLimit";
import { validateSaleData } from "@/lib/validation/schemas";
import {
  Package, Plus, Minus, Loader2, DollarSign, CreditCard,
  AlertCircle, Check, AlertTriangle, X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ── Types ────────────────────────────────────────────────────────────
interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number | null;
  products?: {
    id: string; name: string; sku: string;
    base_price: number; image_url?: string;
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
    id: string; name: string;
    store_type_id: string | null;
    customer_id: string | null;
  };
}

interface DialogItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  image_url?: string;
  quantity: number;
  unit_price: number;
  base_price: number;
}

export interface OrderFulfillmentDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFulfilled?: () => void;
}

// ── Component ────────────────────────────────────────────────────────
export function OrderFulfillmentDialog({
  order,
  open,
  onOpenChange,
  onFulfilled,
}: OrderFulfillmentDialogProps) {
  const qc = useQueryClient();

  const { allowed: canFulfill }    = usePermission("fulfill_orders");
  const { allowed: hasSalePerm }   = usePermission("record_sale");
  const { data: settings }         = useCompanySettings();
  const isCreditCheckEnabled       = settings?.credit_limit_check !== "false";

  // ---- one-shot init flag -------------------------------------------
  const [initDone, setInitDone] = useState(false);

  // ---- local form state (same pattern as useRecordSale) ---------------
  const [items,    setItems]    = useState<DialogItem[]>([]);
  const [cashAmt,  setCashAmt]  = useState("");
  const [upiAmt,   setUpiAmt]   = useState("");
  const [products, setProducts] = useState<DialogItem[]>([]); // available for Add
  const [stockMap, setStockMap] = useState<Record<string,number>>({});
  const [oldOutstanding, setOldOutstanding] = useState(0);

  const [loading,    setLoading]    = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ---- helpers --------------------------------------------------------
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const cash     = parseFloat(cashAmt) || 0;
  const upi      = parseFloat(upiAmt)  || 0;
  const outstandingFromSale = subtotal - cash - upi; // can be negative (overpayment), send actual to RPC
  const outstanding = Math.max(0, outstandingFromSale); // display only
  const newOutstanding = oldOutstanding + outstandingFromSale;

  const creditInfo = useMemo(() => {
    if (!isCreditCheckEnabled || !order?.stores?.store_type_id || !order?.stores?.customer_id) return null;
    // (resolver needs arrays – parent already loaded them, but we can skip for brevity)
    return null;
  }, [isCreditCheckEnabled, order]);

  // ---- load once, when a *fresh* order is opened ----------------------
  useEffect(() => {
    if (!order || !open || initDone) return;

    setLoading(true);
    (async () => {
      try {
        // 1. Products for this store type
        const stid = order.stores?.store_type_id;
        let prods: any[] = [];
        if (stid) {
          const { data: tp } = await supabase
            .from("store_type_products")
            .select("product_id")
            .eq("store_type_id", stid);
          const ids = (tp || []).map((t: any) => t.product_id);
          if (ids.length) {
            const { data: d } = await supabase
              .from("products")
              .select("id, name, sku, base_price, image_url")
              .in("id", ids)
              .eq("is_active", true);
            prods = (d || []) as any[];
          }
        }
        setProducts(prods.map((p: any) => ({
          id: p.id, product_id: p.id, product_name: p.name,
          sku: p.sku, image_url: p.image_url,
          quantity: 0, unit_price: Number(p.base_price) || 0,
          base_price: Number(p.base_price) || 0,
        })));

        // 2. Stock
        if (prods.length) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: s } = await (supabase.rpc("check_stock_availability", {
              p_user_id: user.id, p_recorded_for: null,
              p_items: prods.map((p: any) => ({ product_id: p.id, quantity: 0 })),
            } as any) as any);
            const m: Record<string,number> = {};
            (s || []).forEach((x: any) => m[x.out_product_id] = Number(x.out_available_qty));
            setStockMap(m);
          }
        }

        // 3. Outstanding
        if (order.store_id) {
          const { data: st } = await supabase
            .from("stores")
            .select("outstanding")
            .eq("id", order.store_id)
            .maybeSingle();
          if (st) setOldOutstanding(Number(st.outstanding || 0));
        }

        // 4. Pre-fill items from order (detailed only)
        if (order.order_type === "detailed" && order.order_items?.length) {
          const pmap = new Map(prods.map((p: any) => [p.id, p]));
          const filled = order.order_items
            .map((it) => {
              const prod = pmap.get(it.product_id) || it.products;
              if (!prod) return null;
              const bp = Number(prod.base_price) || 0;
              return {
                id: it.id || crypto.randomUUID(),
                product_id: it.product_id,
                product_name: prod.name || "Unknown",
                sku: prod.sku || "",
                image_url: prod.image_url,
                quantity: Number(it.quantity) || 1,
                unit_price: Number(it.unit_price) ?? bp,
                base_price: bp,
              };
            })
            .filter(Boolean) as DialogItem[];
          setItems(filled);
        } else {
          setItems([]);
        }

        // 5. Reset payment once
        setCashAmt("");
        setUpiAmt("");
        setInitDone(true);
      } catch (err: any) {
        toast.error(err.message || "Failed to load order data");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, open]); // only runs when a *different* order opens

  // ---- reset flag when dialog closes ---------------------------------
  useEffect(() => {
    if (!open) setInitDone(false);
  }, [open]);

  // ---- item helpers (functional updates only!) -----------------------
  const addItem = useCallback(() => {
    setItems(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        product_id: "",
        product_name: "",
        sku: "",
        quantity: 1,
        unit_price: 0,
        base_price: 0,
      },
    ]);
  }, []);

  const removeItem = useCallback((idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updateItem = useCallback((idx: number, field: keyof DialogItem, value: any) => {
    setItems(prev => {
      const next = prev.map((it, i) =>
        i === idx ? { ...it, [field]: value } as DialogItem : it
      );
      return next;
    });
  }, []);

  const setItemProduct = useCallback((idx: number, productId: string) => {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    setItems(prev => {
      const next = [...prev];
      if (next[idx]) {
        next[idx] = {
          ...next[idx],
          product_id: productId,
          product_name: p.product_name,
          sku: p.sku,
          image_url: p.image_url,
          unit_price: p.unit_price || p.base_price || 0,
          base_price: p.base_price || 0,
        };
      }
      return next;
    });
  }, [products]);

  // ---- submit ---------------------------------------------------------
  const handleSubmit = useCallback(async () => {
    if (!order) return;
    if (items.length === 0) { toast.error("Add at least one item."); return; }
    if (!canFulfill)        { toast.error("No permission to fulfill."); return; }
    if (!hasSalePerm)       { toast.error("No permission to record sales."); return; }

    const validItems = items.filter(i => i.product_id && i.quantity > 0);
    const v = validateSaleData({
      store_id: order.store_id, items: validItems.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price })),
      cash_amount: cash, upi_amount: upi, total_amount: subtotal,
      isPosUser: false, sale_date: null,
    });
    if (!v.valid) { toast.error(v.errors[0] || "Validation failed"); return; }

    setSubmitting(true);
    try {
      const { data: did, error: de } = await supabase.rpc("generate_display_id", { prefix: "SALE", seq_name: "sale_display_seq" } as any) as any;
      if (de) throw de;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const customerId = order.customer_id || order.stores?.customer_id;
      if (!customerId) { toast.error("No customer linked to this order."); return; }

      const saleItems = validItems.map(i => ({
        product_id: i.product_id, quantity: i.quantity,
        unit_price: i.unit_price, total_price: i.quantity * i.unit_price,
      }));

      const { error: se } = await (supabase.rpc("record_sale", {
        p_display_id: did as string,
        p_store_id: order.store_id,
        p_customer_id: customerId,
        p_recorded_by: user.id, p_logged_by: null,
        p_total_amount: subtotal,
        p_cash_amount: cash, p_upi_amount: upi,
        p_outstanding_amount: outstanding,
        p_sale_items: saleItems,
        p_created_at: null,
        p_expected_outstanding: oldOutstanding,
        p_fulfilled_order_id: order.id,
      } as any)) as any;
      if (se) throw se;

      // notifications
      if (customerId) {
        await sendNotificationToMany([customerId], { title: "Order Delivered", message: `Order ${order.display_id} has been fulfilled.`, type: "order", entityType: "order", entityId: order.id }).catch(() => {});
      }
      getAdminUserIds().then(ids => {
        const others = ids.filter(id => id !== user.id);
        if (others.length) sendNotificationToMany(others, { title: "Order Fulfilled", message: `Order ${order.display_id} fulfilled.`, type: "order", entityType: "order", entityId: order.id }).catch(() => {});
      });

      toast.success("Order Fulfilled", { description: `Sale ${did} created.` });
      afterSaleSaved(qc, { storeId: order.store_id });
      onOpenChange(false);
      onFulfilled?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to fulfill order.");
    } finally { setSubmitting(false); }
  }, [order, items, cash, upi, subtotal, outstandingFromSale, oldOutstanding, canFulfill, hasSalePerm, onOpenChange, onFulfilled, qc]);

  // -------------------------------------------------------------------
  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" /> Fulfill Order {order.display_id}
          </DialogTitle>
          <DialogDescription>Edit items, prices, and payment before completing.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {/* Meta */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{order.order_type === "detailed" ? "Detailed" : "Simple"}</Badge>
              <Badge variant="secondary">{order.stores?.name || "Unknown Store"}</Badge>
            </div>
            {order.requirement_note && (
              <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>{order.requirement_note}</AlertDescription></Alert>
            )}

            {/* Products */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Products & Quantities</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addItem}>
                  <Plus className="h-3 w-3 mr-1" /> Add Product
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-4 border border-dashed rounded-lg text-sm text-muted-foreground">No products. Add above.</div>
              ) : (
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {items.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg border bg-card">
                      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {item.image_url ? <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover" /> : <Package className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.product_name || "Select product…"}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>₹{item.unit_price.toLocaleString()} × {item.quantity}</span>
                          <span className="font-bold text-foreground">= ₹{(item.quantity * item.unit_price).toLocaleString()}</span>
                        </div>
                        {stockMap[item.product_id] !== undefined && (
                          <p className={`text-2xs ${(stockMap[item.product_id] || 0) < item.quantity ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                            Stock: {stockMap[item.product_id]} available
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Unit price */}
                        <div className="flex items-center gap-1 mr-2">
                          <span className="text-2xs text-muted-foreground">₹</span>
                          <Input type="number" min={0} value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Math.max(0, Number(e.target.value) || 0))} className="w-16 h-7 text-xs font-semibold px-1" />
                        </div>
                        {/* Qty */}
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateItem(idx, "quantity", Math.max(0, item.quantity - 1))}><Minus className="h-3 w-3" /></Button>
                        <Input type="number" min={0} value={item.quantity} onChange={e => updateItem(idx, "quantity", Math.max(0, Number(e.target.value) || 0))} className="w-14 h-7 text-center text-sm px-1" />
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateItem(idx, "quantity", item.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                        {/* Remove */}
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(idx)}><X className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Select for unfilled rows */}
            {items.some(i => !i.product_id) && (
              <div className="flex gap-2">
                {items.map((item, idx) => (
                  !item.product_id && (
                    <Select key={item.id} onValueChange={(val) => setItemProduct(idx, val)}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Choose product…" /></SelectTrigger>
                      <SelectContent>
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.product_name} - {p.sku}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                ))}
              </div>
            )}

            <Separator />

            {/* Totals */}
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold">₹{subtotal.toLocaleString()}</span></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-3xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Cash</Label>
                  <Input type="number" min={0} value={cashAmt} onChange={e => setCashAmt(e.target.value)} className="text-base font-semibold h-9" placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-3xs text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" /> UPI</Label>
                  <Input type="number" min={0} value={upiAmt} onChange={e => setUpiAmt(e.target.value)} className="text-base font-semibold h-9" placeholder="0" />
                </div>
              </div>
              <div className="flex justify-between pt-1 border-t">
                <span className="text-muted-foreground">Outstanding</span>
                <span className={`font-bold ${outstanding > 0 ? "text-destructive" : "text-success"}`}>₹{outstanding.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Current: ₹{oldOutstanding.toLocaleString()}</span>
                <span>New: ₹{newOutstanding.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading || submitting || items.length === 0} className="gap-2">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : <><Check className="h-4 w-4" /> Complete Fulfillment</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OrderFulfillmentDialog;
