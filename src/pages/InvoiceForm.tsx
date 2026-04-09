import { useState, useEffect, useMemo } from "react";
import { formatDate } from "@/lib/utils";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Trash2, ArrowLeft, Save, FileText } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";

interface InvoiceItem {
  id?: string;
  product_id: string | null;
  product_name: string;
  hsn_code: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  sale_item_id?: string;
}

const InvoiceForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isEdit = !!id && id !== "new";

  // Form state
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [customerId, setCustomerId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerGstin, setCustomerGstin] = useState("");
  const [customerState, setCustomerState] = useState("");
  const [isInterState, setIsInterState] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [selectedSales, setSelectedSales] = useState<string[]>(location.state?.saleIds || []);
  const [saving, setSaving] = useState(false);
  const [loadingNext, setLoadingNext] = useState(true);

  // Fetch business info for state comparison
  const { data: businessInfo } = useQuery({
    queryKey: ["business-info"],
    queryFn: async () => {
      const { data } = await supabase
        .from("business_info")
        .select("*")
        .single();
      return data;
    },
  });

  // Fetch next invoice number
  useEffect(() => {
    if (!isEdit) {
      supabase.rpc("get_next_invoice_number")
        .then(({ data }) => {
          if (data) setInvoiceNumber(data);
          setLoadingNext(false);
        })
        .catch((error) => {
          console.error("Failed to fetch next invoice number:", error);
          setLoadingNext(false);
          toast.error("Failed to generate invoice number");
        });
    } else {
      setLoadingNext(false);
    }
  }, [isEdit]);

  // Fetch customers
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-for-invoice"],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, address")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  // Fetch stores for selected customer
  const { data: stores = [] } = useQuery({
    queryKey: ["stores-for-invoice", customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const { data } = await supabase
        .from("stores")
        .select("id, name, address, phone, store_type_id")
        .eq("customer_id", customerId)
        .eq("is_active", true);
      return data || [];
    },
    enabled: !!customerId,
  });

  // Get selected store's type for product filtering
  const selectedStore = stores.find((s: any) => s.id === storeId);
  const selectedStoreTypeId = selectedStore?.store_type_id;

  // Fetch warehouses
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-for-invoice"],
    queryFn: async () => {
      const { data } = await supabase
        .from("warehouses")
        .select("id, name, address, city, state, is_default")
        .eq("is_active", true);
      return data || [];
    },
  });

  // Fetch products - filtered by store type if selected, else all active products
  const { data: products = [] } = useQuery({
    queryKey: ["products-for-invoice", selectedStoreTypeId],
    queryFn: async () => {
      // If store is selected, get products for that store type
      if (selectedStoreTypeId) {
        const { data: storeTypeProducts } = await supabase
          .from("store_type_products")
          .select("product_id, products(id, name, hsn_code, base_price, gst_rate)")
          .eq("store_type_id", selectedStoreTypeId);
        
        if (storeTypeProducts && storeTypeProducts.length > 0) {
          return storeTypeProducts.map((stp: any) => stp.products).filter(Boolean);
        }
      }
      
      // Fallback: all active products (when no store selected or no store_type_products configured)
      const { data } = await supabase
        .from("products")
        .select("id, name, hsn_code, base_price, gst_rate")
        .eq("is_active", true);
      return data || [];
    },
  });

  // Fetch uninvoiced sales for customer/store
  const { data: availableSales = [] } = useQuery({
    queryKey: ["uninvoiced-sales", customerId, storeId],
    queryFn: async () => {
      if (!customerId) return [];
      let query = supabase
        .from("sales")
        .select(`
          id, display_id, created_at, total_amount,
          sale_items(id, product_id, quantity, unit_price, total_price, products(name, hsn_code, gst_rate))
        `)
        .eq("customer_id", customerId)
        .eq("has_invoice", false);
      
      if (storeId) {
        query = query.eq("store_id", storeId);
      }
      
      const { data } = await query.order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!customerId,
  });

  // Set default warehouse
  useEffect(() => {
    if (warehouses.length > 0 && !warehouseId) {
      const defaultWh = warehouses.find((w: any) => w.is_default);
      setWarehouseId(defaultWh?.id || warehouses[0].id);
    }
  }, [warehouses, warehouseId]);

  // Auto-fill customer details
  useEffect(() => {
    if (customerId) {
      const customer = customers.find((c: any) => c.id === customerId);
      if (customer) {
        setCustomerName(customer.name);
        setCustomerPhone(customer.phone || "");
        setCustomerAddress(customer.address || "");
      }
    }
  }, [customerId, customers]);

  // Auto-fill store details (override customer if store selected)
  useEffect(() => {
    if (storeId) {
      const store = stores.find((s: any) => s.id === storeId);
      if (store) {
        setCustomerAddress(store.address || customerAddress);
        setCustomerPhone(store.phone || customerPhone);
        setCustomerGstin(store.gstin || "");
      }
    }
  }, [storeId, stores]);

  // Load items from selected sales
  useEffect(() => {
    if (selectedSales.length > 0 && availableSales.length > 0) {
      const newItems: InvoiceItem[] = [];
      selectedSales.forEach((saleId) => {
        const sale = availableSales.find((s: any) => s.id === saleId);
        if (sale?.sale_items) {
          sale.sale_items.forEach((item: any) => {
            const lineTotal = Number(item.total_price ?? (item.quantity * item.unit_price || 0));
            const taxRate = Number(item.products?.gst_rate || 0);
            const taxableAmount = taxRate > 0 ? lineTotal / (1 + taxRate / 100) : lineTotal;
            const lineTax = lineTotal - taxableAmount;

            newItems.push({
              product_id: item.product_id,
              product_name: item.products?.name || "Unknown",
              hsn_code: item.products?.hsn_code || "",
              quantity: item.quantity,
              unit_price: item.unit_price,
              tax_rate: taxRate,
              tax_amount: Math.round(lineTax * 100) / 100,
              discount_amount: 0,
              total_amount: Math.round(lineTotal * 100) / 100,
              sale_item_id: item.id,
            });
          });
        }
      });
      setItems(newItems);
    }
  }, [selectedSales, availableSales]);

  // Calculate totals with CGST/SGST/IGST breakdown
  const totals = useMemo(() => {
    // Calculate taxable amount (price / (1 + gst_rate/100) for GST-inclusive prices)
    let taxableAmount = 0;
    let totalTax = 0;
    let discountAmount = 0;
    
    items.forEach(item => {
      const lineTotal = item.quantity * item.unit_price;
      // Assume prices are GST-inclusive: base = price / (1 + gst_rate/100)
      const taxRate = item.tax_rate || 0;
      const baseAmount = taxRate > 0 ? lineTotal / (1 + taxRate / 100) : lineTotal;
      const lineTax = lineTotal - baseAmount;
      
      taxableAmount += baseAmount;
      totalTax += lineTax;
      discountAmount += item.discount_amount;
    });

    // Split tax based on inter-state or intra-state
    const cgstAmount = isInterState ? 0 : totalTax / 2;
    const sgstAmount = isInterState ? 0 : totalTax / 2;
    const igstAmount = isInterState ? totalTax : 0;
    
    const grandTotal = taxableAmount + totalTax - discountAmount;
    
    return { 
      taxableAmount: Math.round(taxableAmount * 100) / 100,
      cgstAmount: Math.round(cgstAmount * 100) / 100,
      sgstAmount: Math.round(sgstAmount * 100) / 100,
      igstAmount: Math.round(igstAmount * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100
    };
  }, [items, isInterState]);

  const handleSaleToggle = (saleId: string) => {
    setSelectedSales((prev) =>
      prev.includes(saleId) ? prev.filter((id) => id !== saleId) : [...prev, saleId]
    );
  };

  const addEmptyItem = () => {
    setItems([...items, {
      product_id: null,
      product_name: "",
      hsn_code: "",
      quantity: 1,
      unit_price: 0,
      tax_rate: 0,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: 0,
    }]);
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value };
    
    // If product selected, auto-fill details
    if (field === "product_id" && value) {
      const product = products.find((p: any) => p.id === value);
      if (product) {
        item.product_name = product.name;
        item.hsn_code = product.hsn_code || "";
        item.unit_price = product.base_price || 0;
        item.tax_rate = product.gst_rate || 0;
      }
    }
    
    // Recalculate amounts with GST-inclusive pricing.
    const grossLine = item.quantity * item.unit_price;
    const effectiveLine = Math.max(0, grossLine - (item.discount_amount || 0));
    const taxRate = item.tax_rate || 0;
    const taxableAmount = taxRate > 0 ? effectiveLine / (1 + taxRate / 100) : effectiveLine;
    item.tax_amount = effectiveLine - taxableAmount;
    item.total_amount = effectiveLine;
    
    newItems[index] = item;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (status: "draft" | "issued") => {
    if (!invoiceNumber.trim()) {
      toast.error("Invoice number is required");
      return;
    }
    if (!customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    setSaving(true);

    try {
      const warehouse = warehouses.find((w: any) => w.id === warehouseId);
      const dispatchAddress = warehouse 
        ? `${warehouse.name}, ${warehouse.address || ""}, ${warehouse.city || ""}, ${warehouse.state || ""}`.trim()
        : "";

      // Create invoice
      const invoiceData = {
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        customer_id: customerId || null,
        store_id: storeId || null,
        customer_name: customerName.trim(),
        customer_address: customerAddress.trim() || null,
        customer_phone: customerPhone.trim() || null,
        customer_gstin: customerGstin.trim() || null,
        buyer_state: customerState.trim() || null,
        dispatch_warehouse_id: warehouseId || null,
        dispatch_address: dispatchAddress || null,
        is_inter_state: isInterState,
        taxable_amount: totals.taxableAmount,
        cgst_rate: isInterState ? null : (totals.cgstAmount > 0 ? (totals.cgstAmount / totals.taxableAmount * 100) : 0),
        cgst_amount: totals.cgstAmount,
        sgst_rate: isInterState ? null : (totals.sgstAmount > 0 ? (totals.sgstAmount / totals.taxableAmount * 100) : 0),
        sgst_amount: totals.sgstAmount,
        igst_rate: isInterState ? (totals.igstAmount > 0 ? (totals.igstAmount / totals.taxableAmount * 100) : 0) : null,
        igst_amount: totals.igstAmount,
        subtotal: totals.taxableAmount,
        tax_amount: totals.totalTax,
        discount_amount: totals.discountAmount,
        total_amount: totals.grandTotal,
        status,
        notes: notes.trim() || null,
        created_by: user!.id,
      };

      const { data: invoice, error: invError } = await supabase
        .from("invoices")
        .insert(invoiceData)
        .select()
        .single();

      if (invError) throw invError;

      // Create invoice items
      const itemsData = items.map((item) => {
        const lineTotal = Math.max(0, item.quantity * item.unit_price - (item.discount_amount || 0));
        const taxRate = item.tax_rate || 0;
        const taxableAmount = taxRate > 0 ? lineTotal / (1 + taxRate / 100) : lineTotal;
        const lineTax = lineTotal - taxableAmount;
        
        return {
          invoice_id: invoice.id,
          product_id: item.product_id,
          product_name: item.product_name,
          hsn_code: item.hsn_code || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          gst_rate: taxRate,
          taxable_amount: Math.round(taxableAmount * 100) / 100,
          cgst_amount: isInterState ? 0 : Math.round(lineTax / 2 * 100) / 100,
          sgst_amount: isInterState ? 0 : Math.round(lineTax / 2 * 100) / 100,
          igst_amount: isInterState ? Math.round(lineTax * 100) / 100 : 0,
          tax_rate: taxRate,
          tax_amount: Math.round(lineTax * 100) / 100,
          discount_amount: item.discount_amount,
          total_amount: lineTotal,
          sale_item_id: item.sale_item_id || null,
        };
      });

      const { error: itemsError } = await supabase
        .from("invoice_items")
        .insert(itemsData);

      if (itemsError) throw itemsError;

      // Link sales to invoice
      if (selectedSales.length > 0) {
        const salesLinks = selectedSales.map((saleId) => ({
          invoice_id: invoice.id,
          sale_id: saleId,
        }));

        const { error: linkError } = await supabase
          .from("invoice_sales")
          .insert(salesLinks);

        if (linkError) throw linkError;
      }

      toast.success(`Invoice ${invoiceNumber} ${status === "issued" ? "issued" : "saved as draft"}`);
      logActivity(user!.id, `Created invoice ${invoiceNumber}`, "invoice");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      navigate("/invoices");
    } catch (error: any) {
      toast.error(error.message || "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  if (loadingNext) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <PageHeader
        title={isEdit ? "Edit Invoice" : "Create Invoice"}
        subtitle="Generate a tax invoice"
        backButton={{ label: "Back to Invoices", onClick: () => navigate("/invoices") }}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Invoice Number *</Label>
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-000001"
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <Label>Invoice Date *</Label>
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Customer Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bill To</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Select Customer</Label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Select Store</Label>
                  <Select value={storeId} onValueChange={setStoreId} disabled={!customerId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={customerId ? "Select store" : "Select customer first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Customer Name *</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer name"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Phone number"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Address</Label>
                  <Textarea
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Billing address"
                    className="mt-1"
                    rows={2}
                  />
                </div>
                <div>
                  <Label>GSTIN</Label>
                  <Input
                    value={customerGstin}
                    onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                    placeholder="Customer GSTIN"
                    className="mt-1 font-mono"
                    maxLength={15}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Link Sales */}
          {customerId && availableSales.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Link Sales (Optional)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {availableSales.map((sale: any) => (
                    <div
                      key={sale.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedSales.includes(sale.id) ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                      onClick={() => handleSaleToggle(sale.id)}
                    >
                      <Checkbox checked={selectedSales.includes(sale.id)} />
                      <div className="flex-1">
                        <p className="font-mono text-sm font-medium">{sale.display_id}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(sale.created_at)} • {sale.sale_items?.length || 0} items
                        </p>
                      </div>
                      <span className="font-semibold">₹{Number(sale.total_amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Invoice Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Items</CardTitle>
              <Button variant="outline" size="sm" onClick={addEmptyItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {selectedSales.length > 0 ? "Loading items from sales..." : "No items added. Select sales above or add items manually."}
                </p>
              ) : (
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 bg-muted/30 rounded-lg">
                      <div className="col-span-4">
                        <Label className="text-xs">Product</Label>
                        <Select
                          value={item.product_id || ""}
                          onValueChange={(v) => updateItem(index, "product_id", v)}
                        >
                          <SelectTrigger className="mt-1 h-9">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">HSN</Label>
                        <Input
                          value={item.hsn_code}
                          onChange={(e) => updateItem(index, "hsn_code", e.target.value)}
                          className="mt-1 h-9 font-mono text-xs"
                        />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)}
                          className="mt-1 h-9"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Price</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                          className="mt-1 h-9"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Total</Label>
                        <div className="mt-1 h-9 flex items-center font-semibold">
                          ₹{item.total_amount.toLocaleString()}
                        </div>
                      </div>
                      <div className="col-span-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes for this invoice..."
                rows={3}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Summary & Actions */}
        <div className="space-y-6">
          {/* Dispatch From */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dispatch From</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} {w.is_default && "(Default)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* GST Type Toggle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">GST Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="intra-state"
                    name="gst-type"
                    checked={!isInterState}
                    onChange={() => setIsInterState(false)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="intra-state" className="text-sm">Intra-State (CGST + SGST)</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="inter-state"
                    name="gst-type"
                    checked={isInterState}
                    onChange={() => setIsInterState(true)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="inter-state" className="text-sm">Inter-State (IGST)</label>
                </div>
              </div>
              {businessInfo?.state && (
                <p className="text-xs text-muted-foreground mt-2">
                  Business State: {businessInfo.state}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tax Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Taxable Amount</span>
                <span>₹{totals.taxableAmount.toLocaleString()}</span>
              </div>
              
              {!isInterState ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">CGST</span>
                    <span>₹{totals.cgstAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">SGST</span>
                    <span>₹{totals.sgstAmount.toLocaleString()}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IGST</span>
                  <span>₹{totals.igstAmount.toLocaleString()}</span>
                </div>
              )}
              
              {totals.discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-green-600">-₹{totals.discountAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-3 border-t">
                <span>Grand Total</span>
                <span className="text-primary">₹{totals.grandTotal.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="space-y-3">
            <Button
              className="w-full"
              onClick={() => handleSubmit("issued")}
              disabled={saving || items.length === 0}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Issue Invoice
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleSubmit("draft")}
              disabled={saving || items.length === 0}
            >
              <Save className="mr-2 h-4 w-4" />
              Save as Draft
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/invoices")}
              disabled={saving}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceForm;
