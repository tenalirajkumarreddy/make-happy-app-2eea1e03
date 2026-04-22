import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Plus,
  Trash2,
  Printer,
  Download,
  FileText,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Package,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

interface InvoiceItem {
  id?: string;
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
}

interface OrderData {
  id: string;
  display_id: string;
  store_id: string;
  customer_id: string | null;
  order_type: "simple" | "detailed";
  status: string;
  requirement_note: string | null;
  stores?: {
    id: string;
    name: string;
    address?: string;
    phone?: string;
    customer_id?: string | null;
  };
  customers?: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
  };
  order_items?: Array<{
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
  }>;
}

interface InvoiceData {
  id: string;
  display_id: string;
  order_ref: string | null;
  sale_ref: string | null;
  store_id: string;
  customer_id: string | null;
  invoice_type: "proforma" | "tax" | "credit_note";
  status: "draft" | "issued" | "paid" | "cancelled" | "voided";
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_status: "pending" | "partial" | "paid" | "overdue";
  amount_paid: number;
  amount_due: number;
  invoice_date: string;
  due_date: string | null;
  notes: string | null;
  terms: string | null;
  reference_number: string | null;
  stores?: {
    id: string;
    name: string;
  };
  customers?: {
    id: string;
    name: string;
  };
  invoice_items?: Array<{
    id: string;
    product_id: string;
    description: string;
    quantity: number;
    unit_price: number;
    discount_percent: number;
    tax_percent: number;
    total_amount: number;
    products?: {
      id: string;
      name: string;
    };
  }>;
}

interface InvoiceDialogProps {
  order: OrderData | null;
  invoice: InvoiceData | null;
  mode: "create" | "edit" | "view";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function InvoiceDialog({
  order,
  invoice,
  mode,
  open,
  onOpenChange,
  onSuccess,
}: InvoiceDialogProps) {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("details");
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [invoiceType, setInvoiceType] = useState<"proforma" | "tax" | "credit_note">("proforma");
  const [invoiceDate, setInvoiceDate] = useState(formatDate(new Date()));
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Payment due within 15 days");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([]);

  // Load invoice data when editing/viewing
  useEffect(() => {
    if (invoice && (mode === "edit" || mode === "view")) {
      setInvoiceType(invoice.invoice_type);
      setInvoiceDate(formatDate(new Date(invoice.invoice_date)));
      setDueDate(invoice.due_date ? formatDate(new Date(invoice.due_date)) : "");
      setNotes(invoice.notes || "");
      setTerms(invoice.terms || "Payment due within 15 days");
      setReferenceNumber(invoice.reference_number || "");
      setItems(
        invoice.invoice_items?.map((item) => ({
          id: item.id,
          product_id: item.product_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent,
          tax_percent: item.tax_percent,
        })) || []
      );
    } else if (order && mode === "create") {
      // Pre-fill from order
      setInvoiceType(order.status === "delivered" ? "tax" : "proforma");
      setNotes(`Order Reference: ${order.display_id}\n${order.requirement_note || ""}`);
      
      // Pre-fill items from order
      if (order.order_items && order.order_items.length > 0) {
        setItems(
          order.order_items.map((item) => ({
            product_id: item.product_id,
            description: item.products?.name || "Item",
            quantity: item.quantity,
            unit_price: item.unit_price || item.products?.base_price || 0,
            discount_percent: 0,
            tax_percent: 18, // Default GST 18%
          }))
        );
      } else {
        // Simple order - add placeholder
        setItems([{
          product_id: "",
          description: order.requirement_note || "Order Item",
          quantity: 1,
          unit_price: 0,
          discount_percent: 0,
          tax_percent: 18,
        }]);
      }
    }
  }, [invoice, order, mode, open]);

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ["products-for-invoice"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, base_price")
        .eq("is_active", true);
      return data || [];
    },
    enabled: mode !== "view",
  });

  // Calculate totals
  const calculateItemTotal = (item: InvoiceItem) => {
    const subtotal = item.quantity * item.unit_price;
    const discountAmount = (subtotal * item.discount_percent) / 100;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = (taxableAmount * item.tax_percent) / 100;
    return taxableAmount + taxAmount;
  };

  const totals = items.reduce(
    (acc, item) => {
      const subtotal = item.quantity * item.unit_price;
      const discountAmount = (subtotal * item.discount_percent) / 100;
      const taxableAmount = subtotal - discountAmount;
      const taxAmount = (taxableAmount * item.tax_percent) / 100;
      
      return {
        subtotal: acc.subtotal + subtotal,
        discountAmount: acc.discountAmount + discountAmount,
        taxAmount: acc.taxAmount + taxAmount,
        total: acc.total + taxableAmount + taxAmount,
      };
    },
    { subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 }
  );

  // Add item
  const addItem = () => {
    setItems([
      ...items,
      {
        product_id: "",
        description: "",
        quantity: 1,
        unit_price: 0,
        discount_percent: 0,
        tax_percent: 18,
      },
    ]);
  };

  // Remove item
  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Update item
  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Auto-fill description if product selected
    if (field === "product_id" && value) {
      const product = products?.find((p) => p.id === value);
      if (product) {
        newItems[index].description = product.name;
        newItems[index].unit_price = product.base_price;
      }
    }
    
    setItems(newItems);
  };

  // Save invoice mutation
  const saveInvoice = useMutation({
    mutationFn: async () => {
      setSaving(true);
      
      const invoiceData: any = {
        invoice_type: invoiceType,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        notes: notes || null,
        terms: terms || null,
        reference_number: referenceNumber || null,
        store_id: order?.store_id || invoice?.store_id,
        customer_id: order?.customer_id || invoice?.customer_id,
      };

      if (mode === "create") {
        // Generate invoice number
        const { data: invoiceNum } = await supabase.rpc("generate_invoice_number");
        invoiceData.display_id = invoiceNum;
        invoiceData.order_ref = order?.id || null;
        invoiceData.status = "draft";
        invoiceData.created_by = user?.id;
        
        const { data, error } = await supabase
          .from("invoices")
          .insert(invoiceData)
          .select("id")
          .single();
        
        if (error) throw error;
        
        // Insert items
        if (items.length > 0) {
          const invoiceItems = items.map((item) => ({
            invoice_id: data.id,
            product_id: item.product_id || null,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount_percent: item.discount_percent,
            tax_percent: item.tax_percent,
            subtotal: item.quantity * item.unit_price,
            discount_amount: (item.quantity * item.unit_price * item.discount_percent) / 100,
            tax_amount: ((item.quantity * item.unit_price) - ((item.quantity * item.unit_price * item.discount_percent) / 100)) * item.tax_percent / 100,
            total_amount: calculateItemTotal(item),
          }));
          
          await supabase.from("invoice_items").insert(invoiceItems);
        }
        
        return data;
      } else if (mode === "edit" && invoice) {
        // Update invoice
        const { error } = await supabase
          .from("invoices")
          .update({
            ...invoiceData,
            updated_by: user?.id,
          })
          .eq("id", invoice.id);
        
        if (error) throw error;
        
        // Delete old items and insert new ones
        await supabase.from("invoice_items").delete().eq("invoice_id", invoice.id);
        
        if (items.length > 0) {
          const invoiceItems = items.map((item) => ({
            invoice_id: invoice.id,
            product_id: item.product_id || null,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount_percent: item.discount_percent,
            tax_percent: item.tax_percent,
            subtotal: item.quantity * item.unit_price,
            discount_amount: (item.quantity * item.unit_price * item.discount_percent) / 100,
            tax_amount: ((item.quantity * item.unit_price) - ((item.quantity * item.unit_price * item.discount_percent) / 100)) * item.tax_percent / 100,
            total_amount: calculateItemTotal(item),
          }));
          
          await supabase.from("invoice_items").insert(invoiceItems);
        }
        
        return { id: invoice.id };
      }
    },
  onSuccess: (data) => {
    setSaving(false);
    toast.success(mode === "create" ? "Invoice created successfully" : "Invoice updated");
    // Invalidate all related queries
    qc.invalidateQueries({ queryKey: ["invoices"], exact: false });
    qc.invalidateQueries({ queryKey: ["orders"], exact: false });
    // Call the onSuccess callback if provided
    onSuccess?.();
    onOpenChange(false);
  },
    onError: (error) => {
      setSaving(false);
      toast.error(error.message || "Failed to save invoice");
    },
  });

  // Issue invoice
  const issueInvoice = async () => {
    if (!invoice) return;
    
    const { error } = await supabase
      .from("invoices")
      .update({ 
        status: "issued",
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Invoice issued");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      onSuccess?.();
    }
  };

  // Cancel invoice
  const cancelInvoice = async () => {
    if (!invoice) return;
    
    const { error } = await supabase
      .from("invoices")
      .update({ 
        status: "cancelled",
        cancelled_by: user?.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Invoice cancelled");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      onSuccess?.();
      onOpenChange(false);
    }
  };

  // Delete invoice
  const deleteInvoice = async () => {
    if (!invoice) return;
    
    const { error } = await supabase
      .from("invoices")
      .update({ 
        deleted_at: new Date().toISOString(),
        updated_by: user?.id,
      })
      .eq("id", invoice.id);
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Invoice deleted");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      onSuccess?.();
      onOpenChange(false);
    }
  };

  const canEdit = mode === "create" || (mode === "edit" && invoice?.status === "draft");
  const isViewOnly = mode === "view";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {mode === "create" ? "Create Invoice" : mode === "edit" ? "Edit Invoice" : "View Invoice"}
            {invoice && (
              <Badge 
                variant={
                  invoice.status === "paid" ? "success" :
                  invoice.status === "issued" ? "info" :
                  invoice.status === "cancelled" ? "destructive" :
                  "secondary"
                }
              >
                {invoice.status}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Invoice Details</TabsTrigger>
            <TabsTrigger value="items">Items ({items.length})</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Invoice Type</Label>
                <Select 
                  value={invoiceType} 
                  onValueChange={(v) => setInvoiceType(v as any)}
                  disabled={!canEdit}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proforma">Proforma Invoice</SelectItem>
                    <SelectItem value="tax">Tax Invoice</SelectItem>
                    <SelectItem value="credit_note">Credit Note</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Invoice Date</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  disabled={!canEdit}
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={!canEdit}
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label>Reference Number</Label>
                <Input
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  disabled={!canEdit}
                  placeholder="PO/Order reference"
                  className="mt-1"
                />
              </div>
            </div>
            
            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canEdit}
                placeholder="Additional notes..."
                className="mt-1"
                rows={3}
              />
            </div>
            
            <div>
              <Label>Terms & Conditions</Label>
              <Textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                disabled={!canEdit}
                className="mt-1"
                rows={2}
              />
            </div>
          </TabsContent>

          <TabsContent value="items" className="space-y-4">
            {canEdit && (
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            )}
            
            <div className="space-y-3">
              {items.map((item, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-5">
                        <Label className="text-xs">Description</Label>
                        {canEdit ? (
                          <Select
                            value={item.product_id}
                            onValueChange={(v) => updateItem(index, "product_id", v)}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products?.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} ({p.sku})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="mt-1 text-sm font-medium">{item.description}</div>
                        )}
                      </div>
                      
                      <div className="col-span-2">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                          disabled={!canEdit}
                          className="mt-1"
                        />
                      </div>
                      
                      <div className="col-span-2">
                        <Label className="text-xs">Price</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateItem(index, "unit_price", Number(e.target.value))}
                          disabled={!canEdit}
                          className="mt-1"
                        />
                      </div>
                      
                      <div className="col-span-2">
                        <Label className="text-xs">Disc%</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={item.discount_percent}
                          onChange={(e) => updateItem(index, "discount_percent", Number(e.target.value))}
                          disabled={!canEdit}
                          className="mt-1"
                        />
                      </div>
                      
                      <div className="col-span-1">
                        {canEdit && items.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(index)}
                            className="mt-5"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-2 text-right text-sm text-muted-foreground">
                      Line Total: {formatCurrency(calculateItemTotal(item))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {items.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No items added yet</p>
                {canEdit && <p className="text-sm">Click "Add Item" to start</p>}
              </div>
            )}
          </TabsContent>

          <TabsContent value="preview" className="space-y-4">
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-center">INVOICE</CardTitle>
                <div className="text-center text-sm text-muted-foreground">
                  {invoice?.display_id || "Draft Invoice"}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <div>
                    <p className="font-medium">Bill To:</p>
                    <p className="text-sm">{order?.stores?.name || invoice?.stores?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {order?.customers?.name || invoice?.customers?.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">
                      <span className="text-muted-foreground">Date:</span>{" "}
                      {formatDate(new Date(invoiceDate))}
                    </p>
                    {dueDate && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Due:</span>{" "}
                        {formatDate(new Date(dueDate))}
                      </p>
                    )}
                  </div>
                </div>
                
                <Separator />
                
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Description</th>
                      <th className="text-right py-2">Qty</th>
                      <th className="text-right py-2">Price</th>
                      <th className="text-right py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={i} className="border-b border-muted">
                        <td className="py-2">{item.description}</td>
                        <td className="text-right py-2">{item.quantity}</td>
                        <td className="text-right py-2">{formatCurrency(item.unit_price)}</td>
                        <td className="text-right py-2">{formatCurrency(calculateItemTotal(item))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                <div className="space-y-1 text-right">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>{" "}
                    {formatCurrency(totals.subtotal)}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Discount:</span>{" "}
                    {formatCurrency(totals.discountAmount)}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Tax:</span>{" "}
                    {formatCurrency(totals.taxAmount)}
                  </p>
                  <Separator />
                  <p className="text-lg font-bold">
                    <span className="text-muted-foreground">Total:</span>{" "}
                    {formatCurrency(totals.total)}
                  </p>
                </div>
                
                {notes && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium">Notes:</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{notes}</p>
                    </div>
                  </>
                )}
                
                {terms && (
                  <div>
                    <p className="text-sm font-medium">Terms:</p>
                    <p className="text-sm text-muted-foreground">{terms}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex justify-between">
          <div className="flex gap-2">
            {mode === "view" && invoice?.status === "draft" && (
              <Button variant="outline" onClick={() => {}}>
                Edit
              </Button>
            )}
            
            {mode === "view" && invoice?.status === "draft" && (
              <Button variant="default" onClick={issueInvoice}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Issue
              </Button>
            )}
            
            {mode === "view" && (invoice?.status === "draft" || invoice?.status === "issued") && (
              <Button variant="destructive" onClick={cancelInvoice}>
                <XCircle className="h-4 w-4 mr-1" /> Cancel
              </Button>
            )}
            
            {mode === "view" && invoice?.status === "cancelled" && (
              <Button variant="destructive" onClick={deleteInvoice}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            )}
          </div>
          
          <div className="flex gap-2">
            {mode === "view" && (
              <Button variant="outline" onClick={() => {}}>
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
            )}
            
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {mode === "view" ? "Close" : "Cancel"}
            </Button>
            
            {canEdit && (
              <Button 
  onClick={() => {
                // Validate items before saving
                if (items.length === 0) {
                  toast.error("Please add at least one item");
                  return;
                }
                const invalidItems = items.filter(item => 
                  item.quantity <= 0 || item.unit_price < 0
                );
                if (invalidItems.length > 0) {
                  toast.error("Please check item quantities and prices");
                  return;
                }
                saveInvoice.mutate();
              }}
              disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-1" />
                    {mode === "create" ? "Create Invoice" : "Update Invoice"}
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
