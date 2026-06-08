# Purchases, Vendor Bills, and Stock Returns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable direct purchase recording with bill amount/upload, fix vendor balance flow, and fix purchase return stock reduction for raw materials.

**Architecture:** 
- Add `bill_amount` and `bill_url` columns to `purchases` table
- Create `purchase-bills` storage bucket for bill uploads
- Fix `update_stock_on_purchase_return` trigger to handle raw materials (currently only handles products)
- Fix `update_outstanding_on_purchase_return` trigger to also update `vendors.total_debit`
- Wire the existing `record_vendor_purchase` RPC to a new frontend form
- Add bill upload UI to purchase recording form

**Tech Stack:** Supabase (Postgres, Storage, RPC), React + TypeScript + shadcn/ui, TanStack Query

---

## Task 1: Database — Add bill columns to purchases table

**Files:**
- Migration SQL (applied via Supabase MCP)

- [ ] **Step 1: Add bill_amount and bill_url columns**

```sql
ALTER TABLE purchases 
  ADD COLUMN IF NOT EXISTS bill_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bill_url text;

COMMENT ON COLUMN purchases.bill_amount IS 'Actual bill amount from vendor invoice (may differ from sum of line items)';
COMMENT ON COLUMN purchases.bill_url IS 'URL of uploaded bill image in purchase-bills storage bucket';
```

Run via `supabase_apply_migration` with project_id `vrhptrtgrpftycvojaqo`, name `add_bill_columns_to_purchases`.

- [ ] **Step 2: Verify columns exist**

```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'purchases' AND column_name IN ('bill_amount', 'bill_url');
```

Run via `supabase_execute_sql`. Expected: 2 rows returning `bill_amount` (numeric) and `bill_url` (text).

---

## Task 2: Database — Create purchase-bills storage bucket

**Files:**
- Storage bucket + RLS policies (applied via Supabase MCP)

- [ ] **Step 1: Create the bucket**

```sql
INSERT INTO storage.buckets (id, name, public) 
VALUES ('purchase-bills', 'purchase-bills', false)
ON CONFLICT (id) DO NOTHING;
```

Run via `supabase_execute_sql`.

- [ ] **Step 2: Add RLS policies for authenticated upload/read**

```sql
-- Allow authenticated users to upload bills
CREATE POLICY "Authenticated users can upload purchase bills"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'purchase-bills');

-- Allow authenticated users to read their own bills
CREATE POLICY "Authenticated users can read purchase bills"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'purchase-bills');

-- Allow users to delete their own bills
CREATE POLICY "Authenticated users can delete purchase bills"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'purchase-bills');
```

Run via `supabase_apply_migration` with name `create_purchase_bills_bucket`.

- [ ] **Step 3: Verify bucket exists**

```sql
SELECT id, name, public FROM storage.buckets WHERE id = 'purchase-bills';
```

Run via `supabase_execute_sql`. Expected: 1 row with `id: purchase-bills`, `public: false`.

---

## Task 3: Database — Fix purchase return triggers

**Files:**
- `update_stock_on_purchase_return` function (fix to handle raw_materials)
- `update_outstanding_on_purchase_return` function (fix to also update total_debit)

- [ ] **Step 1: Fix `update_stock_on_purchase_return` to handle raw materials**

Current function only handles `product` type. Add `raw_material` handling:

```sql
CREATE OR REPLACE FUNCTION public.update_stock_on_purchase_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item RECORD;
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    FOR item IN SELECT * FROM purchase_return_items WHERE return_id = NEW.id LOOP
      IF item.item_type = 'product' THEN
        UPDATE product_stock 
        SET quantity = quantity - item.quantity
        WHERE product_id = item.item_id AND warehouse_id = NEW.warehouse_id;
        
        INSERT INTO stock_movements (product_id, warehouse_id, quantity_change, movement_type, reference_type, reference_id, notes)
        VALUES (item.item_id, NEW.warehouse_id, -item.quantity, 'out', 'purchase_return', NEW.id, 'Stock returned to vendor via purchase return ' || NEW.display_id);
      
      ELSIF item.item_type = 'raw_material' THEN
        UPDATE raw_materials
        SET current_stock = current_stock - item.quantity,
            updated_at = now()
        WHERE id = item.item_id;
        
        INSERT INTO stock_movements (raw_material_id, warehouse_id, quantity_change, movement_type, reference_type, reference_id, notes)
        VALUES (item.item_id, NEW.warehouse_id, -item.quantity, 'out', 'purchase_return', NEW.id, 'Raw material returned to vendor via purchase return ' || NEW.display_id);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;
```

Run via `supabase_apply_migration` with name `fix_purchase_return_stock_trigger`.

- [ ] **Step 2: Fix `update_outstanding_on_purchase_return` to also update total_debit**

Current function only reduces `vendors.outstanding` but not `vendors.total_debit`. Fix:

```sql
CREATE OR REPLACE FUNCTION public.update_outstanding_on_purchase_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Reduce vendor outstanding (we owe less)
    UPDATE vendors
    SET outstanding = outstanding - NEW.total_amount,
        total_debit = total_debit - NEW.total_amount,
        updated_at = now()
    WHERE id = NEW.vendor_id;
    
    -- Create vendor transaction for the return
    INSERT INTO vendor_transactions (
      vendor_id, transaction_type, amount, balance_before, balance_after,
      reference_id, reference_type, description, created_by, created_at
    )
    SELECT 
      NEW.vendor_id, 'debit_note', NEW.total_amount,
      (SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('purchase', 'debit_note') THEN amount ELSE -amount END), 0) FROM vendor_transactions WHERE vendor_id = NEW.vendor_id),
      (SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('purchase', 'debit_note') THEN amount ELSE -amount END), 0) FROM vendor_transactions WHERE vendor_id = NEW.vendor_id) - NEW.total_amount,
      NEW.id::text, 'purchase_return', 'Purchase return ' || NEW.display_id,
      NEW.created_by, NEW.created_at;
  END IF;
  RETURN NEW;
END;
$function$;
```

Run via `supabase_apply_migration` with name `fix_purchase_return_outstanding_trigger`.

- [ ] **Step 3: Verify both triggers exist and are updated**

```sql
SELECT p.proname, pg_get_functiondef(p.oid) as def
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('update_stock_on_purchase_return', 'update_outstanding_on_purchase_return');
```

Run via `supabase_execute_sql`. Expected: 2 rows with updated function definitions containing `raw_material` handling and `total_debit` update.

---

## Task 4: Database — Create `record_purchase` RPC (simplified)

**Files:**
- RPC function (applied via Supabase MCP)

- [ ] **Step 1: Create `record_purchase` RPC**

The existing `record_vendor_purchase` is complex. Create a simpler version that the frontend can call:

```sql
CREATE OR REPLACE FUNCTION public.record_purchase(
  p_vendor_id uuid,
  p_warehouse_id uuid DEFAULT NULL,
  p_items jsonb DEFAULT '[]',
  p_bill_amount numeric DEFAULT 0,
  p_bill_number text DEFAULT NULL,
  p_invoice_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_bill_url text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_purchase_id UUID;
  v_display_id TEXT;
  v_wh_id UUID;
  v_item JSONB;
  v_total_from_items NUMERIC := 0;
BEGIN
  -- Resolve warehouse
  v_wh_id := COALESCE(p_warehouse_id, (SELECT id FROM warehouses LIMIT 1));

  -- Generate display ID
  SELECT 'PUR-' || LPAD(NEXTVAL('purchases_display_id_seq')::TEXT, 6, '0')
  INTO v_display_id;

  -- Calculate total from items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_total_from_items := v_total_from_items + 
      ((v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC);
  END LOOP;

  -- Use bill_amount if provided, otherwise use items total
  -- Insert purchase (triggers: update_vendor_debit + vendor_purchase_to_transaction)
  INSERT INTO purchases (
    display_id, vendor_id, warehouse_id, purchase_date,
    bill_number, bill_amount, total_amount, status, notes, bill_url, created_by
  ) VALUES (
    v_display_id, p_vendor_id, v_wh_id, COALESCE(p_invoice_date, CURRENT_DATE),
    p_bill_number, p_bill_amount, 
    CASE WHEN p_bill_amount > 0 THEN p_bill_amount ELSE v_total_from_items END,
    'completed', p_notes, p_bill_url, p_user_id
  ) RETURNING id INTO v_purchase_id;

  -- Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO purchase_items (
      purchase_id, raw_material_id, quantity, unit_cost, total_cost
    ) VALUES (
      v_purchase_id,
      (v_item->>'raw_material_id')::UUID,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'quantity')::INTEGER * (v_item->>'unit_price')::NUMERIC
    );
  END LOOP;

  RETURN v_display_id;
END;
$function$;
```

Run via `supabase_apply_migration` with name `create_record_purchase_rpc`.

- [ ] **Step 2: Verify RPC exists**

```sql
SELECT pg_get_functiondef(p.oid) as def
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'record_purchase';
```

Run via `supabase_execute_sql`. Expected: 1 row with the function definition.

---

## Task 5: Frontend — Create Purchase Recording Form

**Files:**
- Modify: `src/components/inventory/PurchaseOrderForm.tsx`
- Or create new: `src/components/inventory/RecordPurchaseForm.tsx`

- [ ] **Step 1: Create `RecordPurchaseForm.tsx`**

Create a new form component that:
- Selects vendor (dropdown)
- Adds multiple raw material items (quantity, unit cost)
- Shows bill amount field (separate from items total)
- Shows bill number field
- Shows invoice date field
- Has bill upload (to `purchase-bills` bucket)
- Calls `record_purchase` RPC
- Shows total from items vs bill amount

```tsx
import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useWarehouse } from '@/contexts/WarehouseContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Upload, FileText } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface PurchaseItem {
  raw_material_id: string;
  quantity: number;
  unit_price: number;
}

interface RecordPurchaseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const RecordPurchaseForm = ({ open, onOpenChange }: RecordPurchaseFormProps) => {
  const { user } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [vendorId, setVendorId] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([{ raw_material_id: '', quantity: 1, unit_price: 0 }]);
  const [billAmount, setBillAmount] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [billFile, setBillFile] = useState<File | null>(null);
  const [billPreview, setBillPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors', currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('vendors')
        .select('id, name, display_id')
        .eq('warehouse_id', currentWarehouse?.id ?? '')
        .eq('is_active', true)
        .order('name');
      return data || [];
    },
    enabled: !!currentWarehouse?.id,
  });

  const { data: materials = [] } = useQuery({
    queryKey: ['raw_materials', currentWarehouse?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('raw_materials')
        .select('id, name, unit, current_stock')
        .eq('warehouse_id', currentWarehouse?.id ?? '')
        .eq('is_active', true)
        .order('name');
      return data || [];
    },
    enabled: !!currentWarehouse?.id,
  });

  const itemsTotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const totalToVendor = billAmount ? parseFloat(billAmount) : itemsTotal;

  const handleItemChange = (index: number, field: keyof PurchaseItem, value: string | number) => {
    setItems(prev => {
      const updated = [...prev];
      if (field === 'raw_material_id') updated[index].raw_material_id = value as string;
      else if (field === 'quantity') updated[index].quantity = Math.max(1, Number(value) || 1);
      else if (field === 'unit_price') updated[index].unit_price = Math.max(0, Number(value) || 0);
      return updated;
    });
  };

  const addItem = () => {
    setItems(prev => [...prev, { raw_material_id: '', quantity: 1, unit_price: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be under 5MB');
      return;
    }
    setBillFile(file);
    const reader = new FileReader();
    reader.onload = () => setBillPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setVendorId('');
    setItems([{ raw_material_id: '', quantity: 1, unit_price: 0 }]);
    setBillAmount('');
    setBillNumber('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setBillFile(null);
    setBillPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId) { toast.error('Please select a vendor'); return; }
    if (items.every(i => !i.raw_material_id)) { toast.error('Please add at least one item'); return; }

    setSaving(true);
    try {
      let billUrl = null;

      // Upload bill if present
      if (billFile) {
        const fileExt = billFile.name.split('.').pop();
        const filePath = `bills/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('purchase-bills')
          .upload(filePath, billFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('purchase-bills').getPublicUrl(filePath);
        billUrl = urlData.publicUrl;
      }

      // Call record_purchase RPC
      const validItems = items.filter(i => i.raw_material_id);
      const { data: displayId, error: rpcError } = await supabase.rpc('record_purchase', {
        p_vendor_id: vendorId,
        p_warehouse_id: currentWarehouse?.id || null,
        p_items: validItems.map(i => ({
          raw_material_id: i.raw_material_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
        p_bill_amount: billAmount ? parseFloat(billAmount) : 0,
        p_bill_number: billNumber || null,
        p_invoice_date: invoiceDate || null,
        p_notes: notes || null,
        p_bill_url: billUrl,
        p_user_id: user?.id || null,
      });

      if (rpcError) throw rpcError;

      toast.success(`Purchase recorded: ${displayId}`);
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['vendors'] });
      qc.invalidateQueries({ queryKey: ['raw_materials'] });
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to record purchase');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Purchase</DialogTitle>
          <DialogDescription>Record a completed purchase from a vendor with bill details</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Vendor */}
          <div>
            <Label>Vendor *</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>{v.name} ({v.display_id})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Invoice Number</Label>
              <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="e.g. INV-001" className="mt-1" />
            </div>
            <div>
              <Label>Invoice Date</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Items *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select value={item.raw_material_id} onValueChange={(v) => handleItemChange(idx, 'raw_material_id', v)} className="flex-1">
                    <SelectTrigger>
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      {materials.map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} (stock: {m.current_stock})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="number" min={1} value={item.quantity} onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)} className="w-20" />
                  <Input type="number" min={0} step="0.01" value={item.unit_price} onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)} className="w-24" />
                  <span className="text-sm font-medium w-24 text-right">₹{(item.quantity * item.unit_price).toLocaleString()}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} disabled={items.length <= 1}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-2 text-sm text-muted-foreground">
              Items Total: <span className="font-semibold ml-1">₹{itemsTotal.toLocaleString()}</span>
            </div>
          </div>

          {/* Bill Amount */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div>
              <Label>Bill Amount (from vendor invoice) *</Label>
              <Input type="number" min={0} step="0.01" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} placeholder={`Default: ₹${itemsTotal.toLocaleString()}`} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Enter the actual amount from the vendor's bill. If different from items total, this amount is used for vendor outstanding.</p>
            </div>
            <div className="flex justify-between text-sm">
              <span>Amount to Vendor:</span>
              <span className="font-bold text-lg">₹{totalToVendor.toLocaleString()}</span>
            </div>
          </div>

          {/* Bill Upload */}
          <div>
            <Label>Upload Bill</Label>
            <div className="mt-1 flex items-center gap-4">
              <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Choose File
              </Button>
              {billPreview && (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm">{billFile?.name}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setBillFile(null); setBillPreview(null); }}>×</Button>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Supported: JPG, PNG, PDF (max 5MB)</p>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." className="mt-1" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !vendorId}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Record Purchase
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
```

- [ ] **Step 2: Verify file compiles**

Run: `npm run lint` from project root.
Expected: No new errors (existing warnings OK).

---

## Task 6: Frontend — Wire RecordPurchaseForm into Purchases page

**Files:**
- Modify: `src/pages/Purchases.tsx`

- [ ] **Step 1: Add RecordPurchaseForm to Purchases page**

Replace the `PurchaseOrderForm` button with a choice between PO and direct purchase, or add a separate "Record Purchase" button:

In `src/pages/Purchases.tsx`, update the imports and add the new form:

```tsx
import { RecordPurchaseForm } from '@/components/inventory/RecordPurchaseForm';
```

Add state:
```tsx
const [showRecordPurchase, setShowRecordPurchase] = useState(false);
```

Update the header section to include both buttons:
```tsx
<div className="flex items-start justify-between">
  <PageHeader title="Purchases" />
  <div className="flex gap-2">
    <PurchaseOrderForm />
    <Button onClick={() => setShowRecordPurchase(true)}>
      <Plus className="mr-2 h-4 w-4" />
      Record Purchase
    </Button>
  </div>
</div>
```

Add the dialog at the end of the return:
```tsx
<RecordPurchaseForm open={showRecordPurchase} onOpenChange={setShowRecordPurchase} />
```

- [ ] **Step 2: Verify page compiles**

Run: `npm run lint` from project root.
Expected: No new errors.

---

## Task 7: Frontend — Fix PurchaseReturns to show bill info and handle raw materials

**Files:**
- Modify: `src/pages/PurchaseReturns.tsx`

- [ ] **Step 1: Update purchase items query to include raw_materials**

In `PurchaseReturns.tsx`, the purchase items query at line ~103 currently selects:
```tsx
.select("id, item_type, item_id, quantity, unit_price, total, products(name), raw_materials(name)")
```

This is already correct — it joins `raw_materials(name)`. The items will show correctly for raw materials.

- [ ] **Step 2: Verify the return form shows raw material items correctly**

The existing form at line ~153-164 already handles both types:
```tsx
item_name: pi.item_type === "product" 
  ? (pi.products?.name || "Product") 
  : (pi.raw_materials?.name || "Raw Material"),
```

This is correct. No changes needed here.

- [ ] **Step 3: Verify PurchaseReturns page compiles**

Run: `npm run lint` from project root.
Expected: No new errors.

---

## Task 8: Verification — End-to-end test

- [ ] **Step 1: Test purchase recording flow**

1. Open the app, navigate to Purchases page
2. Click "Record Purchase"
3. Select a vendor
4. Add a raw material item (qty: 10, unit price: ₹50)
5. Enter bill amount: ₹550 (slightly different from items total of ₹500)
6. Upload a test image as bill
7. Submit
8. Verify: Purchase appears in list with bill_amount ₹550
9. Verify: Vendor's `total_debit` increased by ₹550
10. Verify: Raw material's `current_stock` increased by 10
11. Verify: `vendor_transactions` has a 'purchase' entry

- [ ] **Step 2: Test purchase return flow**

1. Navigate to Purchase Returns
2. Click "Record Return"
3. Select the purchase just created
4. Select the raw material item, set qty to 2
5. Submit with reason "damaged"
6. Approve and complete the return
7. Verify: Raw material's `current_stock` decreased by 2
8. Verify: Vendor's `outstanding` decreased by ₹100 (2 × ₹50)
9. Verify: Vendor's `total_debit` decreased by ₹100
10. Verify: `vendor_transactions` has a 'debit_note' entry

- [ ] **Step 3: Run lint one final time**

Run: `npm run lint`
Expected: No new errors.
