import {
  useState, useEffect, useCallback, useMemo,
} from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Minus, Package, Wallet, Banknote, QrCode, ShoppingCart, ChevronRight, AlertCircle, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Warehouse } from "@/contexts/WarehouseContext";
import type { UserRoleString } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { validateSaleData } from "@/lib/validation/schemas";
import { resolveCreditLimit } from "@/lib/creditLimit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QrStoreSelector } from "@/components/shared/QrStoreSelector";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { usePermission } from "@/hooks/usePermission";

/* ─── Types ─── */
interface SaleItemInput {
  product_id: string;
  quantity: number;
  unit_price: number;
  product_name?: string;
  product_image?: string | null;
  effectivePrice?: number;
}

interface SaleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  userId: string;
  role: UserRoleString;
  currentWarehouse: Warehouse | null;
  isPosUser?: boolean;
  storeIdProp?: string;
  recordedForProp?: string;
}

/* ═══════════════════════════════════════
   COMPONENT: SaleFormDialog
   ═══════════════════════════════════════ */
const SaleFormDialog = ({
  open, onOpenChange, onSuccess, userId, role, currentWarehouse, isPosUser = false, storeIdProp, recordedForProp = "",
}: SaleFormDialogProps) => {
  const { allowed: canRecordBehalf } = usePermission("record_behalf");

  /* ───── State ───── */
  const [storeId, setStoreId] = useState(storeIdProp || "");
  const [items, setItems] = useState<SaleItemInput[]>([]);
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [recordedFor, setRecordedFor] = useState(recordedForProp || "");
  const [saleDate, setSaleDate] = useState("");
  const [storedAtOpen, setStoredAtOpen] = useState<number>(0);
  const [outstandingChanged, setOutstandingChanged] = useState(false);
  const [oldOutstanding, setOldOutstanding] = useState(0);
  const [saving, setSaving] = useState(false);
  const [fulfillOrderData, setFulfillOrderData] = useState<any>(null);

  /* ───── Utilities ───── */
  const addItem = (item: SaleItemInput) => setItems((prev) => [...prev, item]);
  const updateItem = (index: number, field: keyof SaleItemInput, value: any) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  };
  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  /* ───── Store Data ───── */
  const { data: stores = [] } = useQuery({
    queryKey: ["stores-for-sale"],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, name, outstanding, display_id, store_type_id, customer_id, lat, lng, is_active").order("is_active", { ascending: false }).order("name");
      return data || [];
    },
  });

  const selectedStore = stores.find((s) => s.id === storeId);

  /* ───── Store Outstanding ───── */
  useEffect(() => {
    if (open) {
      setSavedAtOpen(Number(selectedStore?.outstanding || 0));
      setOutstandingChanged(false);
    }
  }, [open, selectedStore?.outstanding]);

  /* ───── Products ───── */
  const { data: allProducts = [] } = useQuery({
    queryKey: ["all-products-sale"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, base_price, sku, image_url").eq("is_active", true);
      return data || [];
    },
  });

  const { data: storeProducts = [] } = useQuery({
    queryKey: ["store-products", storeId, selectedStore?.store_type_id],
    queryFn: async () => {
      const { data: accessData } = await supabase.from("store_type_products").select("product_id, products(*)").eq("store_type_id", selectedStore?.store_type_id);
      return (accessData || []).map((a: any) => a.products).filter(Boolean);
    },
    enabled: !!storeId && !!selectedStore?.store_type_id,
  });

  const productMap = useMemo(() => {
    const map: Record<string, any> = {};
    allProducts.forEach((p) => { if (p) map[p.id] = p; });
    return map;
  }, [allProducts]);

  /* ───── Credit Limit ───── */
  const { data: storeTypes = [] } = useQuery({
    queryKey: ["store-types-credit"],
    queryFn: async () => { const { data } = await supabase.from("store_types").select("id, name, credit_limit_kyc, credit_limit_no_kyc"); return data || []; },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-kyc"],
    queryFn: async () => { const { data } = await supabase.from("customers").select("id, kyc_status, credit_limit_override"); return data || []; },
  });

  const creditLimitInfo = useMemo(() => {
    if (!selectedStore) return null;
    const storeCustomer = customers.find((c) => c.id === selectedStore.customer_id);
    const storeType = storeTypes.find((st) => st.id === selectedStore.store_type_id);
    return resolveCreditLimit({ storeCustomer, storeType, currentOutstanding: oldOutstanding });
  }, [selectedStore, customers, storeTypes, oldOutstanding]);

  /* ───── Totals ───── */
  const totalAmount = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0), [items]);
  const cash = Number(cashAmount) || 0;
  const upi = Number(upiAmount) || 0;
  const outstandingFromSale = Math.max(totalAmount - cash - upi, 0);
  const newOutstanding = oldOutstanding + outstandingFromSale;
  const creditExceeded = creditLimitInfo != null && newOutstanding > creditLimitInfo.limit;
  const creditWarning = creditLimitInfo != null && !creditExceeded && newOutstanding > creditLimitInfo.limit * 0.8 && newOutstanding <= creditLimitInfo.limit;

  /* ───── Reset ───── */
  const resetForm = useCallback(() => {
    setItems([]);
    setCashAmount("");
    setUpiAmount(" många");
    setRecordedFor("");
    setSaleDate("");
    setStoreId("");
    setOutstandingChanged(false);
    setFulfillOrderData(null);
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  /* ───── Handlers ───── */
  const handleStoreChange = (id: string) => {
    setStoreId(id);
    const store = stores.find((s) => s.id === id);
    if (store) {
      setOldOutstanding(Number(store.outstanding || 0));
      setStoredAtOpen(Number(store.outstanding || 0));
    }
  };

  const handleAddItem = () => {
    addItem({ product_id: "", quantity: 1, unit_price: 0, product_name: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!storeId) { toast.error("Please select a store"); return; }
    if (items.length === 0) { toast.error("Please add at least one product"); return; }

    const validation = validateSaleData({ storeId, items, cash: cashAmount, upi: upiAmount, totalAmount });
    if (!validation.valid) { toast.error(validation.error); return; }
    if (outstandingChanged) { toast.error("Store outstanding has changed. Please refresh and try again."); return; }

    const payload = {
      p_store_id: storeId,
      p_items: items.filter((i) => i.product_id).map((item) => ({ product_id: item.product_id, quantity: item.quantity, unit_price: item.unit_price, total_price: item.quantity * item.unit_price })),
      p_cash_amount: cash,
      p_upi_amount: upi,
      p_expected_outstanding: storedAtOpen,
      p_notes: "",
      p_recorded_for: recordedFor || null,
      p_sale_date: saleDate || null,
      p_fulfilled_order_id: fulfillOrderData?.id || null,
      p_warehouse_id: currentWarehouse?.id || null,
      p_recorded_by: userId,
    };

    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("record_sale", payload);
      if (error) throw error;
      toast.success("Sale recorded successfully");

      await logActivity({ action: "sale_created", entityType: "sale", entityId: data.id, metadata: { storeId, totalAmount, items: items.length } });
      sendNotificationToMany(await getAdminUserIds(), { title: "New Sale", body: `Sale recorded for ₹${totalAmount.toLocaleString()}` });
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Failed to record sale");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Record Sale</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Store Selection */}
          <div>
            <Label>Store</Label>
            {isPosUser ? (
              <div className="mt-1 flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 text-sm">POS Counter (auto-selected)</div>
            ) : (
              <div className="flex gap-2 mt-1">
                <Select value={storeId} onValueChange={handleStoreChange}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Select store" /></SelectTrigger>
                  <SelectContent>{stores?.map((s: any) => <SelectItem key={s.id} value={s.id} disabled={!s.is_active}>{s.name} — {s.display_id}</SelectItem>)}</SelectContent>
                </Select>
                <QrStoreSelector onStoreSelected={handleStoreChange} />
              </div>
            )}
            {selectedStore && (
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                <p>Current outstanding: ₹{oldOutstanding.toLocaleString()}</p>
                {creditLimitInfo && creditLimitInfo.limit > 0 && (
                  <p>Credit limit: ₹{creditLimitInfo.limit.toLocaleString()} — {Math.round((oldOutstanding / creditLimitInfo.limit) * 100)}% used</p>
                )}
              </div>
            )}
          </div>

          {/* Products */}
          {storeId && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Products</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem} className="text-xs">Add Other Product</Button>
              </div>
              {items.map((item, idx) => {
                const product = item.product_id ? productMap[item.product_id] : null;
                return (
                  <div key={idx} className="flex items-center gap-3 p-2 rounded-lg border bg-card">
                    <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                      {product?.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" /> : <Package className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{product?.name || item.product_name || "Select Product"}</p>
                      <p className="text-xs text-muted-foreground">₹{item.unit_price} × {item.quantity} = ₹{(item.quantity * item.unit_price).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateItem(idx, "quantity", Math.max(0, item.quantity - 1))}><Minus className="h-3 w-3" /></Button>
                      <Input type="number" min={0} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Math.max(0, Number(e.target.value) || 0))} className="w-14 h-7 text-center text-sm px-1" />
                      <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateItem(idx, "quantity", item.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                    </div>
                    {items.length > 1 && <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}><X className="h-4 w-4 text-destructive" /></Button>}
                  </div>
                );
              })}
              {/* Product Selectors for unselected items */}
              {items.some((item) => !item.product_id) && (
                <div className="space-y-2">
                  {items.filter((item) => !item.product_id).map((item, idx) => (
                    <Select key={`empty-${idx}`} value={item.product_id} onValueChange={(val) => {
                      const p = productMap[val];
                      if (p) updateItem(items.indexOf(item), "product_id", val);
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>{allProducts.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} — ₹{p.base_price}</SelectItem>)}</SelectContent>
                    </Select>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Payment Summary */}
          {totalAmount > 0 && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-medium">₹{totalAmount.toLocaleString()}</span></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground flex items-center gap-1"><Banknote className="h-3 w-3" /> Cash</Label>
                  <Input type="number" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="text-lg font-semibold" placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground flex items-center gap-1"><QrCode className="h-3 w-3" /> UPI</Label>
                  <Input type="number" value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)} className="text-lg font-semibold" placeholder="0" />
                </div>
              </div>
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="font-semibold">New Outstanding</span>
                <span className={`text-lg font-bold ${newOutstanding > 0 ? 'text-red-600' : newOutstanding < 0 ? 'text-green-600' : ''}`}>₹{newOutstanding.toLocaleString()}</span>
              </div>
              {creditLimitInfo && creditLimitInfo.limit > 0 && (
                <div className="flex justify-between text-xs pt-1">
                  <span className="text-muted-foreground">Credit Limit</span>
                  <span className={newOutstanding > creditLimitInfo.limit ? 'text-red-600 font-medium' : ''}>₹{creditLimitInfo.limit.toLocaleString()}</span>
                </div>
              )}
              {isPosUser && (cash + upi) !== totalAmount && totalAmount > 0 && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />POS sales require full payment</p>}
            </div>
          )}

          {creditExceeded && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">🚫 <strong>Credit limit exceeded!</strong> New outstanding (₹{newOutstanding.toLocaleString()}) exceeds credit limit of ₹{creditLimitInfo?.limit.toLocaleString()}.</div>
          )}
          {creditWarning && (
            <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-700">⚠️ Outstanding approaching credit limit ({Math.round((newOutstanding / creditLimitInfo!.limit) * 100)}% used).</div>
          )}

          <Button type="submit" className="w-full" disabled={saving || (!!creditExceeded && role !== "super_admin")}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record Sale
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SaleFormDialog;
