import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Trash2, Download } from "lucide-react";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useState } from "react";
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
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [items, setItems] = useState<SaleItem[]>([{ product_id: "", quantity: 1, unit_price: 0 }]);

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, stores(name), customers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  const { data: stores } = useQuery({
    queryKey: ["stores-for-sale", customerId],
    queryFn: async () => {
      let q = supabase.from("stores").select("id, name, outstanding, display_id").eq("is_active", true);
      if (customerId) q = q.eq("customer_id", customerId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!customerId,
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, base_price, sku").eq("is_active", true);
      return data || [];
    },
  });

  const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const cash = parseFloat(cashAmount) || 0;
  const upi = parseFloat(upiAmount) || 0;
  const outstandingFromSale = totalAmount - cash - upi;
  const selectedStore = stores?.find((s) => s.id === storeId);
  const oldOutstanding = Number(selectedStore?.outstanding || 0);
  const newOutstanding = oldOutstanding + outstandingFromSale;

  const addItem = () => setItems([...items, { product_id: "", quantity: 1, unit_price: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof SaleItem, value: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    if (field === "product_id") {
      const p = products?.find((pr) => pr.id === value);
      if (p) updated[idx].unit_price = Number(p.base_price);
    }
    setItems(updated);
  };

  const resetForm = () => {
    setCustomerId(""); setStoreId(""); setCashAmount(""); setUpiAmount("");
    setItems([{ product_id: "", quantity: 1, unit_price: 0 }]);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || items.some((i) => !i.product_id)) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);

    const { count } = await supabase.from("sales").select("id", { count: "exact", head: true });
    const displayId = `SALE-${String((count || 0) + 1).padStart(6, "0")}`;

    const { data: sale, error } = await supabase.from("sales").insert({
      display_id: displayId,
      store_id: storeId,
      customer_id: customerId,
      recorded_by: user!.id,
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

  const columns = [
    { header: "Sale ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—", className: "font-medium" },
    { header: "Total", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}`, className: "text-sm hidden md:table-cell" },
    { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}`, className: "text-sm hidden md:table-cell" },
    { header: "Outstanding", accessor: (row: any) => `₹${Number(row.outstanding_amount).toLocaleString()}`, className: "text-sm hidden lg:table-cell" },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), className: "text-muted-foreground text-xs hidden sm:table-cell" },
  ];

  if (isLoading) {
    return <TableSkeleton columns={7} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader title="Sales" subtitle="View and record sales transactions" actionLabel="Record Sale" onAction={() => setShowAdd(true)} />
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            exportCSV(
              (sales || []).map((s: any) => ({ ...s, store_name: s.stores?.name || "", customer_name: s.customers?.name || "" })),
              [
                { header: "Sale ID", key: "display_id" },
                { header: "Store", key: "store_name" },
                { header: "Customer", key: "customer_name" },
                { header: "Total", key: "total_amount" },
                { header: "Cash", key: "cash_amount" },
                { header: "UPI", key: "upi_amount" },
                { header: "Outstanding", key: "outstanding_amount" },
                { header: "Date", key: "created_at" },
              ],
              "sales-export.csv"
            );
          }}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <DataTable columns={columns} data={sales || []} searchKey="display_id" searchPlaceholder="Search by sale ID..." />

      <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record Sale</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setStoreId(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Store</Label>
              <Select value={storeId} onValueChange={setStoreId} disabled={!customerId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select store" /></SelectTrigger>
                <SelectContent>{stores?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.display_id})</SelectItem>)}</SelectContent>
              </Select>
              {selectedStore && (
                <p className="text-xs text-muted-foreground mt-1">Current outstanding: ₹{oldOutstanding.toLocaleString()}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Products</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add</Button>
              </div>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={item.product_id} onValueChange={(v) => updateItem(idx, "product_id", v)}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Product" /></SelectTrigger>
                      <SelectContent>{products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} className="w-16" placeholder="Qty" />
                    <Input type="number" value={item.unit_price} onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))} className="w-24" placeholder="Price" />
                    {items.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

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