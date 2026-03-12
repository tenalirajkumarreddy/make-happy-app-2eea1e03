import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Minus, Plus, ChevronDown, Store as StoreIcon,
  IndianRupee, Banknote, CreditCard, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { addToQueue } from "@/lib/offlineQueue";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { StorePickerSheet, StoreOption } from "@/mobile/components/StorePickerSheet";
import { cn } from "@/lib/utils";

interface SaleItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

// ─── Record Sale ─────────────────────────────────────────────────────────────
function RecordSale({ preselectStore }: { preselectStore?: StoreOption | null }) {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [store, setStore] = useState<StoreOption | null>(null);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [items, setItems] = useState<SaleItem[]>([]);

  // Auto-set store when coming from QR scan
  useEffect(() => {
    if (preselectStore) {
      setStore(preselectStore);
      setItems([]);
      setCashAmount("");
      setUpiAmount("");
    }
  }, [preselectStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");

  const { data: availableProducts, isLoading: loadingProducts } = useQuery({
    queryKey: ["mobile-products-for-sale", store?.store_type_id, store?.id],
    queryFn: async () => {
      const storeTypeId = store!.store_type_id!;
      const storeId = store!.id;

      const { data: accessData } = await supabase
        .from("store_type_products")
        .select("product_id, products(id, name, sku, base_price)")
        .eq("store_type_id", storeTypeId);

      let productList: any[];
      if (accessData && accessData.length > 0) {
        productList = accessData.map((a: any) => a.products).filter(Boolean);
      } else {
        const { data } = await supabase.from("products").select("id, name, base_price, sku").eq("is_active", true);
        productList = data || [];
      }

      const { data: typePricing } = await supabase
        .from("store_type_pricing")
        .select("product_id, price")
        .eq("store_type_id", storeTypeId);
      const typePriceMap: Record<string, number> = {};
      typePricing?.forEach((p: any) => { typePriceMap[p.product_id] = Number(p.price); });

      const { data: storePricing } = await supabase
        .from("store_pricing")
        .select("product_id, price")
        .eq("store_id", storeId);
      const storePriceMap: Record<string, number> = {};
      storePricing?.forEach((p: any) => { storePriceMap[p.product_id] = Number(p.price); });

      return productList.map((p: any) => {
        let effectivePrice = Number(p.base_price);
        if (typePriceMap[p.id]) effectivePrice = typePriceMap[p.id];
        if (storePriceMap[p.id]) effectivePrice = storePriceMap[p.id];
        return { ...p, effectivePrice };
      });
    },
    enabled: !!store?.store_type_id && !!store?.id,
  });

  // Auto-populate items when products load
  const handleStoreSelect = (s: StoreOption) => {
    setStore(s);
    setItems([]);
    setCashAmount("");
    setUpiAmount("");
  };

  const addItem = (productId: string) => {
    const exists = items.find((i) => i.product_id === productId);
    if (exists) {
      setItems(items.map((i) => i.product_id === productId ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      const p = availableProducts?.find((pr: any) => pr.id === productId);
      if (p) setItems([...items, { product_id: productId, quantity: 1, unit_price: p.effectivePrice }]);
    }
  };

  const removeItem = (productId: string) => {
    setItems(items.filter((i) => i.product_id !== productId));
  };

  const updateQty = (productId: string, delta: number) => {
    setItems(items.map((i) => {
      if (i.product_id !== productId) return i;
      const newQty = Math.max(0, i.quantity + delta);
      if (newQty === 0) return null as any;
      return { ...i, quantity: newQty };
    }).filter(Boolean));
  };

  const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const cash = parseFloat(cashAmount) || 0;
  const upi = parseFloat(upiAmount) || 0;
  const outstandingFromSale = totalAmount - cash - upi;
  const oldOutstanding = Number(store?.outstanding ?? 0);
  const newOutstanding = oldOutstanding + outstandingFromSale;

  const handleSubmit = async () => {
    if (!store) { toast.error("Please select a store"); return; }
    if (items.length === 0) { toast.error("Add at least one product"); return; }
    if (totalAmount === 0) { toast.error("Sale total cannot be zero"); return; }
    if (!store.customer_id) { toast.error("Store has no linked customer"); return; }

    setSaving(true);

    if (role === "agent" && store) {
      const { data: locSetting } = await supabase
        .from("company_settings").select("value").eq("key", "location_validation").maybeSingle();
      if (locSetting?.value === "true") {
        const { checkProximity } = await import("@/lib/proximity");
        const result = await checkProximity(store.lat ?? null, store.lng ?? null);
        if (!result.withinRange) { toast.error(result.message); setSaving(false); return; }
        if (result.skippedNoGps) toast.warning("Store has no GPS — location check skipped");
      }
    }

    const saleData = {
      store_id: store.id,
      customer_id: store.customer_id,
      recorded_by: user!.id,
      logged_by: null,
      total_amount: totalAmount,
      cash_amount: cash,
      upi_amount: upi,
      outstanding_amount: outstandingFromSale,
    };
    const saleItems = items.map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price }));

    if (!navigator.onLine) {
      await addToQueue({ id: crypto.randomUUID(), type: "sale", payload: { saleData, saleItems }, createdAt: new Date().toISOString() });
      toast.warning("Offline — sale queued and will sync automatically");
      setSaving(false);
      resetSale();
      return;
    }

    const { data: displayId } = await (supabase as any).rpc("generate_display_id", { prefix: "SALE", seq_name: "sale_display_seq" });
    const { error } = await (supabase as any).rpc("record_sale", {
      p_display_id: displayId,
      p_store_id: store.id,
      p_customer_id: store.customer_id,
      p_recorded_by: user!.id,
      p_logged_by: null,
      p_total_amount: totalAmount,
      p_cash_amount: cash,
      p_upi_amount: upi,
      p_outstanding_amount: outstandingFromSale,
      p_sale_items: saleItems,
      p_created_at: null,
    });

    if (error) { toast.error(error.message); setSaving(false); return; }

    logActivity(user!.id, "Recorded sale", "sale", String(displayId), undefined, { total: totalAmount, store: store.id });
    getAdminUserIds().then((ids) => {
      const others = ids.filter((id) => id !== user!.id);
      if (others.length > 0) {
        sendNotificationToMany(others, {
          title: "New Sale Recorded",
          message: `₹${totalAmount.toLocaleString()} sale at ${store.name} (${String(displayId)})`,
          type: "system",
          entityType: "sale",
          entityId: String(displayId),
        });
      }
    });

    toast.success("Sale recorded successfully");
    setSaving(false);
    resetSale();
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["mobile-agent-sales-today"] });
  };

  const resetSale = () => {
    setStore(null);
    setItems([]);
    setCashAmount("");
    setUpiAmount("");
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Store selector */}
      <div className="px-4">
        <Label className="text-xs text-muted-foreground mb-1.5 block">Store</Label>
        <button
          className="w-full border rounded-xl p-3 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
          onClick={() => setStorePickerOpen(true)}
        >
          <StoreIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          {store ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{store.name}</p>
              <p className="text-xs text-muted-foreground">{store.display_id}</p>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm flex-1">Select store...</span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </div>

      {/* Store info card */}
      {store && (
        <div className="px-4">
          <Card className="bg-muted/30">
            <CardContent className="p-3 flex justify-between items-center">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Current Balance</p>
                <p className={cn("text-lg font-bold", oldOutstanding > 0 ? "text-destructive" : "text-green-600")}>
                  ₹{oldOutstanding.toLocaleString()}
                </p>
              </div>
              {store.customers?.name && (
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Customer</p>
                  <p className="text-sm font-semibold">{store.customers.name}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Products */}
      {store && (
        <div className="px-4">
          <Label className="text-xs text-muted-foreground mb-2 block">Products</Label>
          {loadingProducts ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {(availableProducts || []).map((product: any) => {
                const inCart = items.find((i) => i.product_id === product.id);
                return (
                  <div
                    key={product.id}
                    className={cn(
                      "border rounded-xl p-3 flex items-center gap-3 transition-colors",
                      inCart ? "border-primary/40 bg-primary/5" : "border-border"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">₹{product.effectivePrice.toLocaleString()} each</p>
                    </div>
                    {inCart ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          className="h-8 w-8 rounded-full border flex items-center justify-center hover:bg-muted"
                          onClick={() => updateQty(product.id, -1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-sm font-semibold w-6 text-center">{inCart.quantity}</span>
                        <button
                          className="h-8 w-8 rounded-full border flex items-center justify-center hover:bg-muted"
                          onClick={() => updateQty(product.id, 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="h-7 w-7 rounded-full bg-destructive/10 flex items-center justify-center ml-1"
                          onClick={() => removeItem(product.id)}
                        >
                          <span className="text-destructive text-xs font-bold">✕</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                        onClick={() => addItem(product.id)}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Payment section */}
      {items.length > 0 && (
        <div className="px-4 space-y-3">
          <div className="border-t pt-3">
            <div className="flex justify-between items-center mb-3">
              <span className="text-base font-semibold">Total</span>
              <span className="text-xl font-bold">₹{totalAmount.toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Banknote className="h-3 w-3" /> Cash
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="0"
                  className="h-11 rounded-xl text-base"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <CreditCard className="h-3 w-3" /> UPI
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={upiAmount}
                  onChange={(e) => setUpiAmount(e.target.value)}
                  placeholder="0"
                  className="h-11 rounded-xl text-base"
                />
              </div>
            </div>
          </div>

          {/* Balance summary */}
          <Card className={cn("border", outstandingFromSale > 0 ? "border-amber-400/50 bg-amber-500/5" : "border-green-400/50 bg-green-500/5")}>
            <CardContent className="p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Old Balance</span>
                <span>₹{oldOutstanding.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">From this sale</span>
                <span className={outstandingFromSale > 0 ? "text-amber-600" : "text-green-600"}>
                  {outstandingFromSale >= 0 ? "+" : ""}₹{outstandingFromSale.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t pt-1 mt-1">
                <span>New Balance</span>
                <span className={newOutstanding > 0 ? "text-destructive" : "text-green-600"}>
                  ₹{newOutstanding.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full h-13 rounded-2xl text-base font-semibold"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : `Record Sale · ₹${totalAmount.toLocaleString()}`}
          </Button>
        </div>
      )}

      <StorePickerSheet
        open={storePickerOpen}
        onOpenChange={setStorePickerOpen}
        onSelect={handleStoreSelect}
      />
    </div>
  );
}

// ─── Record Payment ───────────────────────────────────────────────────────────
function RecordPayment({ preselectStore }: { preselectStore?: StoreOption | null }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [store, setStore] = useState<StoreOption | null>(null);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [cashAmount, setCashAmount] = useState("");

  // Auto-set store when coming from QR scan
  useEffect(() => {
    if (preselectStore) {
      setStore(preselectStore);
      setCashAmount("");
      setUpiAmount("");
      setNotes("");
    }
  }, [preselectStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [upiAmount, setUpiAmount] = useState("");
  const [notes, setNotes] = useState("");

  const cash = parseFloat(cashAmount) || 0;
  const upi = parseFloat(upiAmount) || 0;
  const totalPayment = cash + upi;
  const oldOutstanding = Number(store?.outstanding ?? 0);
  const newOutstanding = Math.max(0, oldOutstanding - totalPayment);

  const handleSubmit = async () => {
    if (!store) { toast.error("Please select a store"); return; }
    if (totalPayment <= 0) { toast.error("Enter payment amount"); return; }
    if (!store.customer_id) { toast.error("Store has no linked customer"); return; }

    setSaving(true);

    const txData = {
      store_id: store.id,
      customer_id: store.customer_id,
      recorded_by: user!.id,
      logged_by: null,
      cash_amount: cash,
      upi_amount: upi,
      total_amount: totalPayment,
      old_outstanding: oldOutstanding,
      new_outstanding: newOutstanding,
      notes: notes || null,
    };

    if (!navigator.onLine) {
      await addToQueue({
        id: crypto.randomUUID(),
        type: "transaction",
        payload: { txData, storeUpdate: { outstanding: newOutstanding } },
        createdAt: new Date().toISOString(),
      });
      toast.warning("Offline — payment queued and will sync automatically");
      setSaving(false);
      resetPayment();
      return;
    }

    const { data: displayId } = await (supabase as any).rpc("generate_display_id", { prefix: "PAY", seq_name: "pay_display_seq" });
    const { error } = await supabase.from("transactions").insert({
      display_id: String(displayId),
      ...txData,
    });

    if (error) { toast.error(error.message); setSaving(false); return; }

    logActivity(user!.id, "Recorded transaction", "transaction", String(displayId), undefined, { total: totalPayment, store: store.id });
    getAdminUserIds().then((ids) => {
      const others = ids.filter((id) => id !== user!.id);
      if (others.length > 0) {
        sendNotificationToMany(others, {
          title: "Payment Collected",
          message: `₹${totalPayment.toLocaleString()} collected from ${store.name} (${String(displayId)})`,
          type: "payment",
          entityType: "transaction",
          entityId: String(displayId),
        });
      }
    });

    toast.success("Payment recorded");
    setSaving(false);
    resetPayment();
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["mobile-agent-tx-today"] });
  };

  const resetPayment = () => {
    setStore(null);
    setCashAmount("");
    setUpiAmount("");
    setNotes("");
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Store selector */}
      <div className="px-4">
        <Label className="text-xs text-muted-foreground mb-1.5 block">Store</Label>
        <button
          className="w-full border rounded-xl p-3 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
          onClick={() => setStorePickerOpen(true)}
        >
          <StoreIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          {store ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{store.name}</p>
              <p className="text-xs text-muted-foreground">{store.display_id}</p>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm flex-1">Select store...</span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </div>

      {/* Current balance info */}
      {store && (
        <div className="px-4">
          <Card className="bg-muted/30">
            <CardContent className="p-3 flex justify-between items-center">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Current Balance</p>
                <p className={cn("text-lg font-bold", oldOutstanding > 0 ? "text-destructive" : "text-green-600")}>
                  ₹{oldOutstanding.toLocaleString()}
                </p>
              </div>
              {store.customers?.name && (
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Customer</p>
                  <p className="text-sm font-semibold">{store.customers.name}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Amounts */}
      <div className="px-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Banknote className="h-3 w-3" /> Cash
            </Label>
            <Input
              type="number"
              min="0"
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              placeholder="0"
              className="h-11 rounded-xl text-base"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <CreditCard className="h-3 w-3" /> UPI
            </Label>
            <Input
              type="number"
              min="0"
              value={upiAmount}
              onChange={(e) => setUpiAmount(e.target.value)}
              placeholder="0"
              className="h-11 rounded-xl text-base"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Notes (optional)</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Cheque no, reference..."
            className="h-10 rounded-xl"
          />
        </div>
      </div>

      {/* Balance summary */}
      {store && totalPayment > 0 && (
        <div className="px-4 space-y-3">
          <Card className="border-green-400/50 bg-green-500/5">
            <CardContent className="p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Amount Collected</span>
                <span className="font-semibold text-green-600">₹{totalPayment.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Old Balance</span>
                <span>₹{oldOutstanding.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t pt-1 mt-1">
                <span>New Balance</span>
                <span className={newOutstanding > 0 ? "text-destructive" : "text-green-600"}>
                  ₹{newOutstanding.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>

          {totalPayment > oldOutstanding && oldOutstanding > 0 && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-500/10 border border-amber-400/30 rounded-xl px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-xs">Payment exceeds outstanding balance</span>
            </div>
          )}

          <Button
            className="w-full h-13 rounded-2xl text-base font-semibold"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : `Collect ₹${totalPayment.toLocaleString()}`}
          </Button>
        </div>
      )}

      <StorePickerSheet
        open={storePickerOpen}
        onOpenChange={setStorePickerOpen}
        onSelect={setStore}
      />
    </div>
  );
}

// ─── Combined Record Page ─────────────────────────────────────────────────────
interface AgentRecordProps {
  preselectStore?: StoreOption | null;
  preselectTab?: "sale" | "payment";
}
export function AgentRecord({ preselectStore, preselectTab }: AgentRecordProps) {
  const [activeTab, setActiveTab] = useState<string>(preselectTab ?? "sale");

  useEffect(() => {
    if (preselectStore && preselectTab) setActiveTab(preselectTab);
  }, [preselectStore?.id, preselectTab]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pb-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-4 pt-2 pb-3">
          <TabsList className="w-full h-11 rounded-xl">
            <TabsTrigger value="sale" className="flex-1 rounded-lg text-sm font-medium">
              <IndianRupee className="h-4 w-4 mr-1.5" />
              Record Sale
            </TabsTrigger>
            <TabsTrigger value="payment" className="flex-1 rounded-lg text-sm font-medium">
              <Banknote className="h-4 w-4 mr-1.5" />
              Collect Payment
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="sale" className="mt-0">
          <RecordSale preselectStore={preselectStore} />
        </TabsContent>
        <TabsContent value="payment" className="mt-0">
          <RecordPayment preselectStore={preselectStore} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
