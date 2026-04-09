import { PageHeader } from "@/components/shared/PageHeader";
import { formatDate } from "@/lib/utils";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Trash2, Package, RotateCcw } from "lucide-react";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";

interface PurchaseItem {
  item_type: "product" | "raw_material";
  item_id: string;
  quantity: number;
  unit_cost: number;
}

const Purchases = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [vendorId, setVendorId] = useState(location.state?.vendorId || "");
  const [warehouseId, setWarehouseId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [billNumber, setBillNumber] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([{ item_type: "product", item_id: "", quantity: 1, unit_cost: 0 }]);

  const PAGE_SIZE = 100;
  const [loadedPages, setLoadedPages] = useState(1);

  const { data: purchases = [], isLoading, isFetching } = useQuery({
    queryKey: ["purchases", loadedPages],
    queryFn: async () => {
      let query = supabase
        .from("purchases")
        .select("*, vendors(name), purchase_items(*, products(name))")
        .order("purchase_date", { ascending: false });

      query = query.range(0, loadedPages * PAGE_SIZE - 1);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const hasMorePurchases = purchases.length >= loadedPages * PAGE_SIZE;

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-list"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("id, name, display_id").eq("is_active", true);
      return data || [];
    },
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-list"],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-list"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, sku").eq("is_active", true);
      return data || [];
    },
  });

  const { data: rawMaterials = [] } = useQuery({
    queryKey: ["raw-materials-list"],
    queryFn: async () => {
      // Show all active raw materials (vendor assignment is optional)
      const { data, error } = await supabase
        .from("raw_materials")
        .select("id, name, display_id, unit, vendor_id, vendors(name)")
        .eq("is_active", true)
        .order("name");
      if (error) {
        console.error("Error fetching raw materials:", error);
        return [];
      }
      return data || [];
    },
  });

  const resetForm = () => {
    setVendorId(location.state?.vendorId || "");
    setWarehouseId("");
    setPurchaseDate(new Date().toISOString().split("T")[0]);
    setBillNumber("");
    setBillAmount("");
    setTaxAmount("");
    setDiscountAmount("");
    setNotes("");
    setItems([{ item_type: "product", item_id: "", quantity: 1, unit_cost: 0 }]);
  };

  const addItem = () => {
    setItems([...items, { item_type: "product", item_id: "", quantity: 1, unit_cost: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof PurchaseItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Validate items
      const validItems = items.filter(item => item.item_id && item.quantity > 0 && item.unit_cost >= 0);
      if (validItems.length === 0) {
        toast.error("Please add at least one valid item");
        setSaving(false);
        return;
      }

      // Generate display ID
      const { data: idData } = await supabase.rpc("generate_display_id", {
        prefix: "PUR",
        seq_name: "purchases_display_id_seq"
      });

      // Create purchase
      const { data: purchase, error: purchaseError } = await supabase
        .from("purchases")
        .insert({
          display_id: idData,
          vendor_id: vendorId,
          warehouse_id: warehouseId || null,
          purchase_date: purchaseDate,
          bill_number: billNumber.trim() || null,
          bill_amount: parseFloat(billAmount),
          tax_amount: taxAmount ? parseFloat(taxAmount) : 0,
          discount_amount: discountAmount ? parseFloat(discountAmount) : 0,
          notes: notes.trim() || null,
          status: "completed",
          created_by: user!.id
        })
        .select()
        .single();

      if (purchaseError) throw purchaseError;

      // Create purchase items (product or raw material)
      const itemsData = validItems.map(item => ({
        purchase_id: purchase.id,
        product_id: item.item_type === "product" ? item.item_id : null,
        raw_material_id: item.item_type === "raw_material" ? item.item_id : null,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
      }));

      const { error: itemsError } = await supabase
        .from("purchase_items")
        .insert(itemsData);

      if (itemsError) throw itemsError;

      toast.success("Purchase recorded successfully");
      logActivity(user!.id, `Created purchase ${idData}`, "purchase");
      
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["vendors"] });
      qc.invalidateQueries({ queryKey: ["product_stock"] });
      qc.invalidateQueries({ queryKey: ["raw-materials"] });
      
      setShowAdd(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to create purchase");
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = () => {
    const bill = parseFloat(billAmount) || 0;
    const tax = parseFloat(taxAmount) || 0;
    const discount = parseFloat(discountAmount) || 0;
    return bill + tax - discount;
  };

  const columns = [
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Date", accessor: (row: any) => formatDate(row.purchase_date), className: "text-sm" },
    { header: "Vendor", accessor: (row: any) => row.vendors?.name || "—", className: "text-sm" },
    { header: "Bill #", accessor: (row: any) => row.bill_number || "—", className: "text-xs text-muted-foreground" },
    { 
      header: "Items", 
      accessor: (row: any) => (
        <span className="text-xs text-muted-foreground">
          {row.purchase_items?.length || 0} item(s)
        </span>
      )
    },
    { header: "Amount", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.status === "completed" ? "active" : row.status as any} label={row.status} /> },
  ];

  if (isLoading) {
    return <TableSkeleton columns={7} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Purchases"
        subtitle="Record inventory purchases from vendors"
        primaryAction={{ label: "New Purchase", onClick: () => { resetForm(); setShowAdd(true); } }}
        actions={[
          {
            label: "Returns",
            icon: RotateCcw,
            onClick: () => navigate("/purchase-returns"),
            priority: 0,
          },
          {
            label: "Raw Materials",
            icon: Package,
            onClick: () => navigate("/raw-materials"),
            priority: 1,
            variant: "outline"
          }
        ]}
      />

      <DataTable
        columns={columns}
        data={purchases}
        searchKey="display_id"
        searchPlaceholder="Search purchases..."
        emptyMessage="No purchases recorded yet"
        renderMobileCard={(row: any) => (
          <div className="entity-card-mobile">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm truncate">{row.vendors?.name || "Unknown Vendor"}</h3>
                  <p className="entity-card-subtitle">{row.display_id}</p>
                </div>
                <StatusBadge status={row.status === "completed" ? "active" : row.status as any} label={row.status} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDate(row.purchase_date)}</span>
                  <span>•</span>
                  <span>{row.purchase_items?.length || 0} items</span>
                </div>
                <span className="font-bold text-sm">₹{Number(row.total_amount).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      />

      {hasMorePurchases && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setLoadedPages((p) => p + 1)} disabled={isFetching} className="gap-1.5">
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}

      {/* Add Purchase Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { setShowAdd(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record New Purchase</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vendor *</Label>
                <Select value={vendorId} onValueChange={setVendorId} required>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} ({v.display_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Warehouse</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select warehouse (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w: any) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Purchase Date *</Label>
                <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} required className="mt-1" />
              </div>
              <div>
                <Label>Bill Number</Label>
                <Input value={billNumber} onChange={e => setBillNumber(e.target.value)} className="mt-1" placeholder="Vendor's invoice #" />
              </div>
            </div>

            {/* Purchase Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label>Purchase Items *</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              <div className="space-y-3 border rounded-lg p-3">
                {items.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end">
                    {/* Type selector - 2 cols */}
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground mb-1 block">Type</Label>
                      <Select value={item.item_type} onValueChange={(value) => {
                        const newType = value as "product" | "raw_material";
                        // Update both item_type and clear item_id in a single state update
                        setItems(prevItems => {
                          const newItems = [...prevItems];
                          newItems[index] = { ...newItems[index], item_type: newType, item_id: "" };
                          return newItems;
                        });
                      }}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={4}>
                          <SelectItem value="product">Product</SelectItem>
                          <SelectItem value="raw_material">Raw Material</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Item selector - 4 cols */}
                    <div className="col-span-4">
                      <Label className="text-xs text-muted-foreground mb-1 block">Item</Label>
                      <Select key={`${index}-${item.item_type}`} value={item.item_id} onValueChange={(value) => updateItem(index, "item_id", value)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder={item.item_type === "product" ? "Select product" : "Select raw material"} />
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={4}>
                          {item.item_type === "product" ? (
                            products.length > 0 ? products.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} {p.sku && `(${p.sku})`}
                              </SelectItem>
                            )) : (
                              <div className="py-2 px-3 text-sm text-muted-foreground">No products available</div>
                            )
                          ) : (
                            rawMaterials.length > 0 ? rawMaterials.map((rm: any) => (
                              <SelectItem key={rm.id} value={rm.id}>
                                {rm.name} ({rm.display_id})
                                {rm.vendors?.name && ` - ${rm.vendors.name}`}
                              </SelectItem>
                            )) : (
                              <div className="py-2 px-3 text-sm text-muted-foreground">No raw materials available</div>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Quantity - 2 cols */}
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground mb-1 block">Qty</Label>
                      <Input 
                        type="number" 
                        min="1" 
                        value={item.quantity}
                        onChange={e => updateItem(index, "quantity", parseInt(e.target.value) || 1)}
                        className="h-9"
                      />
                    </div>
                    {/* Unit Cost - 2 cols */}
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground mb-1 block">Unit Cost</Label>
                      <Input 
                        type="number" 
                        step="0.01" 
                        min="0"
                        value={item.unit_cost} 
                        onChange={e => updateItem(index, "unit_cost", parseFloat(e.target.value) || 0)}
                        className="h-9"
                      />
                    </div>
                    {/* Total + Delete - 2 cols */}
                    <div className="col-span-2 flex items-center justify-between gap-1">
                      <span className="text-sm font-medium whitespace-nowrap">
                        ₹{(item.quantity * item.unit_cost).toLocaleString()}
                      </span>
                      <Button 
                        type="button" 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeItem(index)}
                        disabled={items.length === 1}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bill Details */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Bill Amount *</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  value={billAmount} 
                  onChange={e => setBillAmount(e.target.value)} 
                  required 
                  className="mt-1" 
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Tax Amount</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  value={taxAmount} 
                  onChange={e => setTaxAmount(e.target.value)} 
                  className="mt-1" 
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Discount Amount</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  value={discountAmount} 
                  onChange={e => setDiscountAmount(e.target.value)} 
                  className="mt-1" 
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <span className="font-semibold">Total Amount:</span>
              <span className="text-2xl font-bold">₹{totalAmount().toLocaleString()}</span>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" rows={3} />
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => { setShowAdd(false); resetForm(); }} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record Purchase
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Purchases;
