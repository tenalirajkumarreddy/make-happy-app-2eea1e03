# Admin APK Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 critical admin APK issues: inventory not loading, missing purchase actions, inconsistent handovers UI, missing transaction returns, and add native mobile invoice generation

**Architecture:** Each fix targets independent files in `src/mobile/pages/admin/` with shared components in `src/mobile/components/`. All use existing Supabase tables, RPCs, and React Query patterns consistent with the admin page conventions.

**Tech Stack:** React + TypeScript + shadcn/ui + Supabase + React Query

---

### Task 1: Fix Inventory Data Loading

**Files:**
- Modify: `src/mobile/pages/admin/AdminInventory.tsx`
- Test: none (visual fix, no pure logic to unit test)

- [ ] **Step 1: Fix the column names in the query and interface**

The `product_stock` table has no `created_at` column — use `updated_at`. The `products` table uses `base_price` not `price`, and `min_stock_level` not `reorder_level`.

Change the `StockItem` interface:
```typescript
interface StockItem {
  id: string
  product_id: string
  quantity: number
  warehouse_id: string
  products?: {
    name: string
    sku: string
    base_price: number
    unit: string
    category: string
    min_stock_level: number
  }
}
```

Change the query in `useQuery`:
```typescript
let query = supabase
  .from("product_stock")
  .select("id, quantity, warehouse_id, product_id, product:products!product_stock_product_id_fkey(id, name, sku, base_price, unit, category, min_stock_level)", { count: "exact" })
  .order("updated_at", { ascending: false })
  .limit(200)
```

Update all references:
- `item.reorder_level` → `item.products?.min_stock_level ?? 0`
- `item.products?.price` → `item.products?.base_price`
- `p.products?.price` → `p.products?.base_price`

- [ ] **Step 2: Add `enabled` guard to useQuery**

Add `enabled: !!currentWarehouse?.id` to the useQuery options to prevent the query from firing without a warehouse.

- [ ] **Step 3: Add error state UI**

After the `isLoading` check, add:
```typescript
if (error) {
  return (
    <div>
      <AdminPageHeader title="Inventory" subtitle="Stock management" action={{ label: "Adjust", icon: <Plus className="h-4 w-4" />, onClick: () => onNavigate("/inventory") }} />
      <div className="px-4 py-12 text-center">
        <div className="h-14 w-14 rounded-2xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="h-7 w-7 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="font-semibold text-base mb-1">Failed to load inventory</h3>
        <p className="text-sm text-muted-foreground mb-4">{(error as Error).message || "An unexpected error occurred"}</p>
        <button onClick={() => refetch()} className="inline-flex items-center gap-1 h-9 px-4 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    </div>
  )
}
```

Add imports for `AlertCircle`, `RefreshCw`.

- [ ] **Step 4: Change stat count calculation to use min_stock_level**

Update `lowStockCount` and `outOfStockCount`:
```typescript
const lowStockCount = stockData.filter(
  (item) => item.quantity > 0 && item.quantity <= (item.products?.min_stock_level ?? 0)
).length

const outOfStockCount = stockData.filter(
  (item) => item.quantity === 0
).length
```

Update stat box tooltips and filter logic to use `products.min_stock_level` instead of `reorder_level`.

- [ ] **Step 5: Verify lint and build**

Run: `npm run lint`
Expected: 0 errors (pre-existing warnings only)
Run: `npm run test`
Expected: 159/159 passing

---

### Task 2: Add Transaction Returns to Mobile

**Files:**
- Create: `src/mobile/components/ReturnPaymentDialog.tsx`
- Modify: `src/mobile/pages/admin/AdminTransactions.tsx`

- [ ] **Step 1: Create ReturnPaymentDialog component**

Create a new dialog component adapted from the web's inline return logic:

```typescript
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/integrations/supabase/client"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, RotateCcw } from "lucide-react"
import { fmtINR } from "@/lib/utils"

interface Transaction {
  id: string
  display_id: string
  total_amount: number
  cash_amount: number
  upi_amount: number
  store_id: string
  customer_id: string
  stores?: { name: string }
  customers?: { name: string }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction
  warehouseId?: string
}

const RETURN_REASONS = [
  { value: "duplicate_payment", label: "Duplicate Payment" },
  { value: "wrong_amount", label: "Wrong Amount" },
  { value: "cancelled_order", label: "Cancelled Order" },
  { value: "refund", label: "Refund" },
  { value: "other", label: "Other" },
]

export function ReturnPaymentDialog({ open, onOpenChange, transaction, warehouseId }: Props) {
  const [returnAmount, setReturnAmount] = useState("")
  const [returnType, setReturnType] = useState("cash")
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const qc = useQueryClient()

  const maxReturn = transaction.total_amount

  const handleSubmit = async () => {
    const amount = Number.parseFloat(returnAmount)
    if (!amount || amount <= 0) return
    if (amount > maxReturn) return

    setSubmitting(true)
    try {
      const { error } = await supabase.rpc("record_payment_return", {
        p_original_transaction_id: transaction.id,
        p_store_id: transaction.store_id,
        p_customer_id: transaction.customer_id,
        p_return_amount: amount,
        p_return_type: returnType,
        p_reason: reason,
        p_notes: notes || null,
        p_recorded_by: (await supabase.auth.getUser()).data.user?.id,
      })
      if (error) throw error

      qc.invalidateQueries({ queryKey: ["mobile-transactions"] })
      qc.invalidateQueries({ queryKey: ["mobile-admin-dashboard"] })
      qc.invalidateQueries({ queryKey: ["mobile-recent-activity"] })
      onOpenChange(false)
    } catch (err) {
      console.error("Return payment failed:", err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Return Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl bg-muted/50 p-3 space-y-1">
            <p className="text-sm font-medium">{transaction.display_id}</p>
            <p className="text-xs text-muted-foreground">{transaction.stores?.name}</p>
            <p className="text-xs text-muted-foreground">Max return: {fmtINR(maxReturn)}</p>
          </div>

          <div className="space-y-1.5">
            <Label>Return Amount</Label>
            <Input type="number" placeholder="0" value={returnAmount} onChange={(e) => setReturnAmount(e.target.value)} max={maxReturn} />
            {Number.parseFloat(returnAmount) > maxReturn && (
              <p className="text-xs text-red-500">Amount cannot exceed {fmtINR(maxReturn)}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Return Type</Label>
            <Select value={returnType} onValueChange={setReturnType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                {RETURN_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea placeholder="Additional details..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <Button onClick={handleSubmit} disabled={!returnAmount || !reason || submitting} className="w-full rounded-xl">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Process Return
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Add Return button to transaction cards**

In AdminTransactions.tsx:
1. Import `ReturnPaymentDialog`
2. Add state: `const [returnTxn, setReturnTxn] = useState<Transaction | null>(null)`
3. Add a "Return" (`RotateCcw`) button after the Receipt button in the card action row, visible for transactions with `total_amount > 0`
4. Replace the `Receipt` button's current navigation with the Return dialog

The action row becomes:
```typescript
<div className="flex border-t border-slate-100 dark:border-slate-700">
  <button onClick={(e) => { e.stopPropagation(); setViewingTxn(txn) }} className="flex-1 flex items-center justify-center gap-1 h-10 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 active:bg-slate-100 transition-colors">
    <Eye className="h-3.5 w-3.5" /> View
  </button>
  <div className="w-px bg-slate-100 dark:bg-slate-700" />
  <button onClick={(e) => { e.stopPropagation(); window.open(`/transactions?receipt=${txn.id}`, "_blank") }} className="flex-1 flex items-center justify-center gap-1 h-10 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 active:bg-slate-100 transition-colors">
    <Receipt className="h-3.5 w-3.5" /> Receipt
  </button>
  {txn.total_amount > 0 && (
    <>
      <div className="w-px bg-slate-100 dark:bg-slate-700" />
      <button onClick={(e) => { e.stopPropagation(); setReturnTxn(txn) }} className="flex-1 flex items-center justify-center gap-1 h-10 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 active:bg-amber-100 transition-colors">
        <RotateCcw className="h-3.5 w-3.5" /> Return
      </button>
    </>
  )}
</div>
```

Add the dialog at the bottom of the JSX:
```typescript
<ReturnPaymentDialog open={!!returnTxn} onOpenChange={(open) => !open && setReturnTxn(null)} transaction={returnTxn!} warehouseId={currentWarehouse?.id} />
```

- [ ] **Step 3: Add receipt navigation to detail modal**

In the detail modal, change the "View Full" button to navigate instead of being a placeholder. Add a "Receipt" button that navigates:
```typescript
<button onClick={() => onNavigate(`/transactions?receipt=${selectedTxn.id}`)} className="...">Receipt</button>
```

- [ ] **Step 4: Verify lint and build**

Run: `npm run lint`
Expected: 0 errors

---

### Task 3: Add Native Mobile Invoice Form

**Files:**
- Create: `src/mobile/pages/admin/AdminInvoiceForm.tsx`
- Modify: `src/mobile/pages/admin/AdminSales.tsx`
- Modify: `src/mobile/MobileApp.tsx` (add route)

- [ ] **Step 1: Create AdminInvoiceForm component**

Create a new page component at `src/mobile/pages/admin/AdminInvoiceForm.tsx`:

```typescript
import { useState, useEffect } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { AdminPageHeader } from "@/mobile/components/AdminPageHeader"
import { fmtINR } from "@/lib/utils"
import type { Database } from "@/integrations/supabase/types"

// ... full implementation
```

The component needs:
- Fetch sale by ID from URL params (optional, pre-populate if coming from a sale)
- Customer search/select
- Line items table (add/remove/edit qty & price)
- Invoice type selector (tax/credit_note)
- Auto-generate invoice number via `get_next_invoice_number` RPC
- Submit: insert into `invoices`, `invoice_items`, `invoice_sales`
- Success: navigate to invoice view or back to sales

- [ ] **Step 2: Add "Invoice" button to AdminSales**

In `AdminSales.tsx`:
1. Import the invoice form route constant
2. Add an "Invoice" (`FileText`) button to each sale card's action row
3. Add an "Invoice" button in the detail modal
4. Both navigate to `/invoices/new?saleId=${sale.id}`

- [ ] **Step 3: Add route in MobileApp**

In `src/mobile/MobileApp.tsx`, add the lazy-loaded route:
```typescript
const AdminInvoiceForm = lazy(() => import("@/mobile/pages/admin/AdminInvoiceForm").then(m => ({ default: m.AdminInvoiceForm })))
```

Add route: `<Route path="/invoices/new" element={<AdminInvoiceForm />} />`

- [ ] **Step 4: Verify lint and build**

Run: `npm run lint`
Expected: 0 errors

---

### Task 4: Add Full Admin Control to Purchases

**Files:**
- Modify: `src/mobile/pages/admin/AdminPurchases.tsx`

- [ ] **Step 1: Add inline confirm/receive/cancel mutations**

Add three mutation functions:

```typescript
const confirmMutation = useMutation({
  mutationFn: async (id: string) => {
    const { error } = await supabase.from("purchases").update({ status: "confirmed" }).eq("id", id)
    if (error) throw error
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["mobile-purchases"] })
    toast({ title: "Purchase confirmed" })
  },
})

const receiveMutation = useMutation({
  mutationFn: async (id: string) => {
    const { error } = await supabase.from("purchases").update({ status: "received" }).eq("id", id)
    if (error) throw error
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["mobile-purchases"] })
    qc.invalidateQueries({ queryKey: ["mobile-inventory"] })
    toast({ title: "Purchase received" })
  },
})

const cancelMutation = useMutation({
  mutationFn: async (id: string) => {
    const { error } = await supabase.from("purchases").update({ status: "cancelled" }).eq("id", id)
    if (error) throw error
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["mobile-purchases"] })
    toast({ title: "Purchase cancelled" })
  },
})
```

- [ ] **Step 2: Replace navigation buttons with inline mutations**

Card action row changes:
- Confirm: calls `confirmMutation.mutate(purchase.id)` instead of navigating
- Receive: calls `receiveMutation.mutate(purchase.id)` instead of navigating
- Cancel: new button visible for pending/confirmed purchases, calls `cancelMutation.mutate(purchase.id)` with an AlertDialog confirmation

```typescript
<div className="flex border-t border-slate-100 dark:border-slate-700">
  <button onClick={(e) => { e.stopPropagation(); setViewingPO(po) }} className="flex-1 flex items-center justify-center gap-1 h-10 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
    <Eye className="h-3.5 w-3.5" /> View
  </button>
  {po.status === "pending" && (
    <>
      <div className="w-px bg-slate-100 dark:bg-slate-700" />
      <button onClick={(e) => { e.stopPropagation(); handleConfirm(po) }} className="flex-1 flex items-center justify-center gap-1 h-10 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
        <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
      </button>
      <div className="w-px bg-slate-100 dark:bg-slate-700" />
      <button onClick={(e) => { e.stopPropagation(); setCancellingPO(po) }} className="flex-1 flex items-center justify-center gap-1 h-10 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
        <X className="h-3.5 w-3.5" /> Cancel
      </button>
    </>
  )}
  {po.status === "confirmed" && (
    <>
      <div className="w-px bg-slate-100 dark:bg-slate-700" />
      <button onClick={(e) => { e.stopPropagation(); handleReceive(po) }} className="flex-1 flex items-center justify-center gap-1 h-10 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
        <Truck className="h-3.5 w-3.5" /> Receive
      </button>
      <div className="w-px bg-slate-100 dark:bg-slate-700" />
      <button onClick={(e) => { e.stopPropagation(); setCancellingPO(po) }} className="flex-1 flex items-center justify-center gap-1 h-10 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
        <X className="h-3.5 w-3.5" /> Cancel
      </button>
    </>
  )}
</div>
```

- [ ] **Step 3: Add AlertDialog for cancel confirmation**

```typescript
const [cancellingPO, setCancellingPO] = useState<Purchase | null>(null)

<AlertDialog open={!!cancellingPO} onOpenChange={(open) => !open && setCancellingPO(null)}>
  <AlertDialogContent className="rounded-2xl max-w-sm">
    <AlertDialogHeader>
      <AlertDialogTitle>Cancel Purchase?</AlertDialogTitle>
      <AlertDialogDescription>
        This will cancel {cancellingPO?.display_id} from {cancellingPO?.vendor_name}. This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Keep</AlertDialogCancel>
      <AlertDialogAction onClick={() => { if (cancellingPO) cancelMutation.mutate(cancellingPO.id); setCancellingPO(null) }} className="bg-red-600 hover:bg-red-700">
        Yes, Cancel
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 4: Add `enabled` guard to useQuery**

```typescript
enabled: !!currentWarehouse?.id
```

Also add the `useToast` import and the error state UI (matching inventory pattern).

- [ ] **Step 5: Verify lint**

Run: `npm run lint`
Expected: 0 errors

---

### Task 5: Fix Handovers UI Consistency

**Files:**
- Modify: `src/mobile/pages/admin/AdminHandovers.tsx`
- Components referenced: `AdminPageHeader` (already available)

This is the largest task. The approach:
1. Replace inline sticky header with `<AdminPageHeader>`
2. Restyle tabs to be under the gradient header
3. Restyle stat cards to match admin page pattern
4. Restyle handover/expense/income cards with consistent card pattern
5. Replace hardcoded pastel colors with theme-aware classes
6. Use profileMap lookup pattern instead of inline `staffProfiles.find()`
7. Move pull-to-refresh to wrap content only (not header)

- [ ] **Step 1: Replace the sticky header with AdminPageHeader**

Remove lines 637-709 (the entire inline sticky header). Replace with:
```typescript
<AdminPageHeader title="Handovers" subtitle="Staff handovers, expenses & income" action={{ label: "Claims", icon: <FileText className="h-4 w-4" />, onClick: () => setActiveTab("expenses") }} />
```

Move the stat cards below the gradient:
```typescript
<div className="px-4 -mt-3 mb-3">
  <div className="grid grid-cols-3 gap-2">
    <StatCard label="Pending" value={pendingCount} color="amber" />
    <StatCard label="Confirmed" value={confirmedCount} color="emerald" />
    <StatCard label="Total" value={totalCount} color="blue" />
  </div>
</div>
```

- [ ] **Step 2: Restyle filter area**

Place filters in `px-4 -mt-3 space-y-2 mb-3` consistent with other admin pages:
```typescript
<div className="px-4 space-y-2 mb-3">
  <div className="flex gap-2">
    <Select value={staffFilter} onValueChange={setStaffFilter}>
      <SelectTrigger className="flex-1"><SelectValue placeholder="All Staff" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Staff</SelectItem>
        {staffProfiles?.map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[130px]" />
    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[130px]" />
  </div>
  <Tabs value={statusTab} onValueChange={setStatusTab}>
    <TabsList className="w-full">
      <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
      <TabsTrigger value="pending" className="flex-1">Pending</TabsTrigger>
      <TabsTrigger value="confirmed" className="flex-1">Confirmed</TabsTrigger>
      <TabsTrigger value="awaiting" className="flex-1">Awaiting</TabsTrigger>
      <TabsTrigger value="rejected" className="flex-1">Rejected</TabsTrigger>
    </TabsList>
  </Tabs>
</div>
```

- [ ] **Step 3: Restyle handover cards**

Replace `<Card>` components with the consistent `rounded-2xl border shadow-sm` pattern:
```typescript
<div className="mx-4 mb-3 rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
  <div className="p-4">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-xs font-bold text-primary">{initials}</span>
        </div>
        <div>
          <p className="text-sm font-semibold">{fromName} → {toName}</p>
          <p className="text-xs text-muted-foreground capitalize">{type} Handover</p>
        </div>
      </div>
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(handover.status)}`}>
        {handover.status}
      </span>
    </div>
    <div className="flex gap-4 mt-2">
      <div>
        <p className="text-xs text-muted-foreground">Total</p>
        <p className="text-sm font-bold">{fmtINR(handover.total_amount || 0)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Cash</p>
        <p className="text-sm font-medium">{fmtINR(handover.cash_amount || 0)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">UPI</p>
        <p className="text-sm font-medium">{fmtINR(handover.upi_amount || 0)}</p>
      </div>
    </div>
    <p className="text-xs text-muted-foreground mt-2">{formatDate(handover.created_at)}</p>
  </div>
  {handover.status === "pending" && (
    <div className="flex border-t border-slate-100 dark:border-slate-700">
      <button onClick={() => handleConfirm(handover)} className="flex-1 flex items-center justify-center gap-1 h-10 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
        <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
      </button>
      <div className="w-px bg-slate-100 dark:bg-slate-700" />
      <button onClick={() => handleReject(handover)} className="flex-1 flex items-center justify-center gap-1 h-10 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
        <X className="h-3.5 w-3.5" /> Reject
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 4: Restyle expense cards**

Apply the same `rounded-2xl border shadow-sm` pattern with status badge, amount, category dot, staff name, action buttons.

- [ ] **Step 5: Restyle income/finalizer cards**

Apply the same card pattern with reset buttons.

- [ ] **Step 6: Create StatCard helper component**

A small inline component for the stat grid:
```typescript
function StatCard({ label, value, color }: { label: string; value: number; color: "amber" | "emerald" | "blue" }) {
  return (
    <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-3 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
```

- [ ] **Step 7: Fix pull-to-refresh to wrap content only**

Move `{...pullHandlers}` from the outermost div to wrap only the tab content sections, not the header or filters.

- [ ] **Step 8: Replace inline staff lookups with profileMap**

Create a profileMap early:
```typescript
const profileMap = useMemo(() => {
  const map: Record<string, { name: string; initials: string }> = {}
  staffProfiles?.forEach((s) => {
    const name = s.full_name || s.email || "Unknown"
    map[s.id] = {
      name,
      initials: name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2),
    }
  })
  return map
}, [staffProfiles])
```

Use `profileMap[id]?.name ?? "Unknown"` and `profileMap[id]?.initials ?? "??"` instead of inline `.find()` calls.

- [ ] **Step 9: Verify lint**

Run: `npm run lint`
Expected: 0 errors

---

### Verification

- [ ] **Final verification**

Run: `npm run lint`
Expected: 0 errors

Run: `npm run test`
Expected: 159/159 passing

Run: `npm run build`
Expected: Build succeeds
