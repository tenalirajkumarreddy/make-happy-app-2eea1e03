import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Trash2, Download, IndianRupee, CreditCard, Banknote, Clock, UserCircle, Store as StoreIcon, Package } from "lucide-react";
import { QrStoreSelector } from "@/components/shared/QrStoreSelector";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useState } from "react";
import { usePermission } from "@/hooks/usePermission";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";

function exportCSV(data: any[], columns: { header: string; key: string }[], filename: string) {
  const header = columns.map((c) => c.header).join(",");
  const rows = data.map((row) =>
    columns.map((c) => {
      const val = c.key.includes(".") ? c.key.split(".").reduce((o: any, k) => o?.[k], row) : row[c.key];
      const str = String(val ?? "").replace(/"/g, '""');
      return `"${str}"`;
    }).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${data.length} rows`);
}

interface SaleItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

const Sales = () => {
  const { user } = useAuth();
  const { allowed: canOverridePrice } = usePermission("price_override");
  const { allowed: canRecordBehalf } = usePermission("record_behalf");
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  const [storeId, setStoreId] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [recordedFor, setRecordedFor] = useState("");
  const [items, setItems] = useState<SaleItem[]>([{ product_id: "", quantity: 1, unit_price: 0 }]);

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, stores(name, display_id), customers(name, display_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url");
      return data || [];
    },
  });

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

  const { data: stores } = useQuery({
    queryKey: ["stores-for-sale"],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, name, outstanding, display_id, store_type_id, customer_id").eq("is_active", true);
      return data || [];
    },
  });

  const selectedStore = stores?.find((s) => s.id === storeId);
  const selectedStoreTypeId = selectedStore?.store_type_id;

  const { data: availableProducts } = useQuery({
    queryKey: ["products-for-sale", selectedStoreTypeId, storeId],
    queryFn: async () => {
      if (!selectedStoreTypeId) return [];
      const { data: accessData } = await supabase
        .from("store_type_products")
        .select("product_id, products(id, name, sku, base_price)")
        .eq("store_type_id", selectedStoreTypeId);

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
        .eq("store_type_id", selectedStoreTypeId);
      const typePriceMap: Record<string, number> = {};
      typePricing?.forEach((p) => { typePriceMap[p.product_id] = Number(p.price); });

      const { data: storePricing } = await supabase
        .from("store_pricing")
        .select("product_id, price")
        .eq("store_id", storeId);
      const storePriceMap: Record<string, number> = {};
      storePricing?.forEach((p) => { storePriceMap[p.product_id] = Number(p.price); });

      return productList.map((p) => {
        let effectivePrice = Number(p.base_price);
        let priceSource = "base";
        if (typePriceMap[p.id]) { effectivePrice = typePriceMap[p.id]; priceSource = "type"; }
        if (storePriceMap[p.id]) { effectivePrice = storePriceMap[p.id]; priceSource = "store"; }
        return { ...p, effectivePrice, priceSource };
      });
    },
    enabled: !!storeId && !!selectedStoreTypeId,
  });

  // Fetch sale items for the selected sale detail
  const { data: saleItems, isLoading: loadingSaleItems } = useQuery({
    queryKey: ["sale-items", selectedSaleId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sale_items")
        .select("*, products(name, sku)")
        .eq("sale_id", selectedSaleId!);
      return data || [];
    },
    enabled: !!selectedSaleId,
  });

  const selectedSale = sales?.find((s) => s.id === selectedSaleId);

  const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const cash = parseFloat(cashAmount) || 0;
  const upi = parseFloat(upiAmount) || 0;
  const outstandingFromSale = totalAmount - cash - upi;
  const oldOutstanding = Number(selectedStore?.outstanding || 0);
  const newOutstanding = oldOutstanding + outstandingFromSale;

  const addItem = () => setItems([...items, { product_id: "", quantity: 1, unit_price: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof SaleItem, value: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    if (field === "product_id") {
      const p = availableProducts?.find((pr: any) => pr.id === value);
      if (p) updated[idx].unit_price = p.effectivePrice;
    }
    setItems(updated);
  };

  // Fetch staff users for "record on behalf" selector
  const { data: staffUsers } = useQuery({
    queryKey: ["staff-for-behalf"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").neq("role", "customer");
      const staffIds = roles?.map((r) => r.user_id) || [];
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", staffIds);
      return profs?.filter((p) => p.user_id !== user?.id) || [];
    },
    enabled: canRecordBehalf,
  });

  const resetForm = () => {
    setStoreId(""); setCashAmount(""); setUpiAmount(""); setRecordedFor("");
    setItems([{ product_id: "", quantity: 1, unit_price: 0 }]);
  };

  const handleStoreChange = (newStoreId: string) => {
    setStoreId(newStoreId);
    setItems([{ product_id: "", quantity: 1, unit_price: 0 }]);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || items.some((i) => !i.product_id)) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);

    const customerId = selectedStore?.customer_id;
    if (!customerId) {
      toast.error("Store has no linked customer");
      setSaving(false);
      return;
    }

    const { count } = await supabase.from("sales").select("id", { count: "exact", head: true });
    const displayId = `SALE-${String((count || 0) + 1).padStart(6, "0")}`;

    const effectiveRecordedBy = recordedFor || user!.id;
    const loggedBy = recordedFor ? user!.id : null;

    const { data: sale, error } = await supabase.from("sales").insert({
      display_id: displayId,
      store_id: storeId,
      customer_id: customerId,
      recorded_by: effectiveRecordedBy,
      logged_by: loggedBy,
      total_amount: totalAmount,
      cash_amount: cash,
      upi_amount: upi,
      outstanding_amount: outstandingFromSale,
      old_outstanding: oldOutstanding,
      new_outstanding: newOutstanding,
    }).select("id").single();

    if (error) { toast.error(error.message); setSaving(false); return; }

    const saleItems = items.filter((i) => i.product_id).map((i) => ({
      sale_id: sale.id,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total_price: i.quantity * i.unit_price,
    }));
    await supabase.from("sale_items").insert(saleItems);

    logActivity(user!.id, "Recorded sale", "sale", displayId, sale.id, { total: totalAmount, store: storeId });
    await supabase.from("stores").update({ outstanding: newOutstanding }).eq("id", storeId);

    toast.success("Sale recorded successfully");
    setSaving(false);
    setShowAdd(false);
    resetForm();
    qc.invalidateQueries({ queryKey: ["sales"] });
  };

  const getRecorderName = (userId: string) => {
    const p = profileMap.get(userId);
    return p?.full_name || "Unknown";
  };

  const getRecorderAvatar = (userId: string) => {
    const p = profileMap.get(userId);
    return p?.avatar_url || null;
  };

  const columns = [
    { header: "Sale ID", accessor: "display_id" as const, className: "font-mono text-xs", hideOnMobile: true },
    { header: "Store", accessor: (row: any) => (
      <div className="flex items-center gap-2">
        <StoreIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span>{row.stores?.name || "—"}</span>
      </div>
    ), className: "font-medium" },
    { header: "Total", accessor: (row: any) => <span className="font-semibold">₹{Number(row.total_amount).toLocaleString()}</span> },
    { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}`, className: "text-sm hidden lg:table-cell" },
    { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}`, className: "text-sm hidden lg:table-cell" },
    { header: "Outstanding", accessor: (row: any) => (
      <span className={Number(row.outstanding_amount) > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
        ₹{Number(row.outstanding_amount).toLocaleString()}
      </span>
    ), className: "text-sm hidden md:table-cell" },
    { header: "Recorded By", accessor: (row: any) => (
      <div className="flex items-center gap-2">
        <Avatar className="h-6 w-6">
          <AvatarImage src={getRecorderAvatar(row.recorded_by) || undefined} />
          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{getRecorderName(row.recorded_by).charAt(0)}</AvatarFallback>
        </Avatar>
        <span className="text-xs text-muted-foreground">{getRecorderName(row.recorded_by)}</span>
      </div>
    ), className: "hidden lg:table-cell" },
    { header: "Date", accessor: (row: any) => (
      <span className="text-xs text-muted-foreground">{format(new Date(row.created_at), "dd MMM yy, hh:mm a")}</span>
    ), className: "hidden sm:table-cell" },
  ];

  if (isLoading) {
    return <TableSkeleton columns={7} />;
  }

  const getPriceLabel = (product: any) => {
    if (product.priceSource === "store") return "(store price)";
    if (product.priceSource === "type") return "(type price)";
    return "(base price)";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Sales"
        subtitle="View and record sales transactions"
        primaryAction={{ label: "Record Sale", onClick: () => setShowAdd(true) }}
        actions={[
          {
            label: "Export CSV",
            icon: Download,
            priority: 1,
            onClick: () => {
              exportCSV(
                (sales || []).map((s: any) => ({ ...s, store_name: s.stores?.name || "", customer_name: s.customers?.name || "", recorder: getRecorderName(s.recorded_by) })),
                [
                  { header: "Sale ID", key: "display_id" },
                  { header: "Store", key: "store_name" },
                  { header: "Customer", key: "customer_name" },
                  { header: "Total", key: "total_amount" },
                  { header: "Cash", key: "cash_amount" },
                  { header: "UPI", key: "upi_amount" },
                  { header: "Outstanding", key: "outstanding_amount" },
                  { header: "Recorded By", key: "recorder" },
                  { header: "Date", key: "created_at" },
                ],
                "sales-export.csv"
              );
            },
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={sales || []}
        searchKey="display_id"
        searchPlaceholder="Search by sale ID..."
        onRowClick={(row: any) => setSelectedSaleId(row.id)}
        renderMobileCard={(row: any) => (
          <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedSaleId(row.id)}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-xs text-muted-foreground">{row.display_id}</span>
              <span className="text-[11px] text-muted-foreground">{format(new Date(row.created_at), "dd MMM yy, hh:mm a")}</span>
            </div>
            <div className="mb-3">
              <div className="flex items-center gap-1.5">
                <StoreIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold text-sm text-foreground">{row.stores?.name || "—"}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
                <p className="text-sm font-bold text-foreground">₹{Number(row.total_amount).toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cash</p>
                <p className="text-sm font-medium text-foreground">₹{Number(row.cash_amount).toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">UPI</p>
                <p className="text-sm font-medium text-foreground">₹{Number(row.upi_amount).toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-1.5">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={getRecorderAvatar(row.recorded_by) || undefined} />
                  <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{getRecorderName(row.recorded_by).charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="text-[11px] text-muted-foreground">{getRecorderName(row.recorded_by)}</span>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Outstanding</p>
                <p className={`text-sm font-semibold ${Number(row.outstanding_amount) > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  ₹{Number(row.outstanding_amount).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      />

      {/* Sale Detail Dialog */}
      <Dialog open={!!selectedSaleId} onOpenChange={(v) => { if (!v) setSelectedSaleId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Sale Details</DialogTitle></DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-muted-foreground">{selectedSale.display_id}</span>
                <span className="text-xs text-muted-foreground">{format(new Date(selectedSale.created_at), "dd MMM yy, hh:mm a")}</span>
              </div>
              <div className="flex items-center gap-2">
                <StoreIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{(selectedSale as any).stores?.name || "—"}</span>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span>Total</span><span className="font-bold">₹{Number(selectedSale.total_amount).toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Cash</span><span>₹{Number(selectedSale.cash_amount).toLocaleString()}</span></div>
                <div className="flex justify-between"><span>UPI</span><span>₹{Number(selectedSale.upi_amount).toLocaleString()}</span></div>
                <div className="flex justify-between font-medium"><span>Outstanding</span><span className={Number(selectedSale.outstanding_amount) > 0 ? "text-destructive" : ""}>₹{Number(selectedSale.outstanding_amount).toLocaleString()}</span></div>
              </div>

              {/* Items */}
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1.5"><Package className="h-4 w-4 text-muted-foreground" /> Items</p>
                {loadingSaleItems ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : saleItems && saleItems.length > 0 ? (
                  <div className="space-y-1.5">
                    {saleItems.map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between rounded-lg border bg-card p-2.5 text-sm">
                        <div>
                          <p className="font-medium">{item.products?.name || "—"}</p>
                          <p className="text-[11px] text-muted-foreground">{item.products?.sku} · Qty: {Number(item.quantity)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">₹{Number(item.total_price).toLocaleString()}</p>
                          <p className="text-[11px] text-muted-foreground">@ ₹{Number(item.unit_price).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No items recorded</p>
                )}
              </div>

              {/* Recorder */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={getRecorderAvatar(selectedSale.recorded_by) || undefined} />
                  <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{getRecorderName(selectedSale.recorded_by).charAt(0)}</AvatarFallback>
                </Avatar>
               <span className="text-xs text-muted-foreground">Recorded by {getRecorderName(selectedSale.recorded_by)}</span>
              </div>
              {(selectedSale as any).logged_by && (
                <div className="flex items-center gap-2">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={getRecorderAvatar((selectedSale as any).logged_by) || undefined} />
                    <AvatarFallback className="text-[9px] bg-accent/20 text-accent-foreground">{getRecorderName((selectedSale as any).logged_by).charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground">Logged by {getRecorderName((selectedSale as any).logged_by)}</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Record Sale Dialog */}
      <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record Sale</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <Label>Store</Label>
              <div className="flex gap-2 mt-1">
                <Select value={storeId} onValueChange={handleStoreChange}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Select store" /></SelectTrigger>
                  <SelectContent>{stores?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.display_id})</SelectItem>)}</SelectContent>
                </Select>
                <QrStoreSelector onStoreSelected={handleStoreChange} />
              </div>
              {selectedStore && (
                <p className="text-xs text-muted-foreground mt-1">Current outstanding: ₹{oldOutstanding.toLocaleString()}</p>
              )}
            </div>

            {storeId && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Products</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add</Button>
                </div>
                {(!availableProducts || availableProducts.length === 0) && (
                  <p className="text-xs text-muted-foreground py-2">No products available for this store type. Configure the product access matrix first.</p>
                )}
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Select value={item.product_id} onValueChange={(v) => updateItem(idx, "product_id", v)}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Product" /></SelectTrigger>
                          <SelectContent>
                            {availableProducts?.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} className="w-16" placeholder="Qty" />
                        <Input type="number" value={item.unit_price} onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))} className={`w-24 ${!canOverridePrice ? "bg-muted cursor-not-allowed" : ""}`} placeholder="Price" readOnly={!canOverridePrice} title={!canOverridePrice ? "Price override not allowed" : undefined} />
                        {items.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        )}
                      </div>
                      {item.product_id && availableProducts && (
                        <p className="text-[11px] text-muted-foreground pl-1">
                          {(() => {
                            const p = availableProducts.find((pr: any) => pr.id === item.product_id);
                            return p ? `₹${p.effectivePrice.toLocaleString()} ${getPriceLabel(p)}` : "";
                          })()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Total</span><span className="font-semibold">₹{totalAmount.toLocaleString()}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><Label>Cash (₹)</Label><Input type="number" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="mt-1" placeholder="0" /></div>
              <div><Label>UPI (₹)</Label><Input type="number" value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)} className="mt-1" placeholder="0" /></div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Payment</span><span>₹{(cash + upi).toLocaleString()}</span></div>
              <div className="flex justify-between font-semibold"><span>New Outstanding</span><span className={newOutstanding > oldOutstanding ? "text-destructive" : "text-success"}>₹{newOutstanding.toLocaleString()}</span></div>
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Sale
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Sales;
