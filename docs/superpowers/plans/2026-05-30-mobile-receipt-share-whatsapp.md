# Mobile Receipt: Share Image, WhatsApp, Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the broken receipt button in mobile admin screens and add Share Image (PNG via native sheet), WhatsApp (formatted text), and Print buttons to the `SaleReceipt` dialog.

**Architecture:** `SaleReceipt` (shared component) gets 3 new action buttons. Image capture via `html2canvas`, WhatsApp via `whatsapp://` deep link with Unicode box formatting. Admin sales/transactions pages switch from URL navigation to local state (existing working pattern from `AgentRecord.tsx`).

**Tech Stack:** React + TypeScript, html2canvas, @capacitor/share, Supabase

---

### Task 0: Install dependencies

- [ ] **Step 1: Install html2canvas and @capacitor/share**

```bash
npm install html2canvas
npm install @capacitor/share
npx cap sync
```

- [ ] **Step 2: Verify install**

```bash
npm ls html2canvas @capacitor/share
```

---

### Task 1: Add WhatsApp text formatter + Share Image + Print buttons to SaleReceipt

**Files:**
- Modify: `src/components/shared/SaleReceipt.tsx`

- [ ] **Step 1: Add imports and formatWhatsAppText helper**

Add after the existing imports:

```tsx
import html2canvas from "html2canvas";
import { Share } from "@capacitor/share";
import { isNativeApp } from "@/lib/capacitorUtils";
import { MessageCircle, ImageIcon } from "lucide-react";
```

Add `formatWhatsAppText()` function inside the component, after the `handlePrint` function (around line 100):

```tsx
const formatWhatsAppText = () => {
  if (!sale) return "";
  const storeName = sale.stores?.name || "N/A";
  const customerName = sale.customers?.name || "Walk-in";
  const items = (sale.sale_items || []).map(
    (item: any) => `║  ${(item.products?.name || "Item").padEnd(14)} ×${String(item.quantity).padStart(2)}  ${fmtINR(item.quantity * item.unit_price).padStart(7)} ║`
  ).join("\n");
  const amountPaid = Number(sale.cash_amount || 0) + Number(sale.upi_amount || 0);
  const previousBalance = Number((sale as any).old_outstanding || 0);
  const totalDue = previousBalance + Number(sale.outstanding_amount || 0);
  const recorderName = (sale as any).recorded_by?.full_name || "N/A";
  const date = format(new Date(sale.created_at), "dd MMM yyyy");

  return [
    `╔══════════════════════════════╗`,
    `║        ★ AQUA PRIME ★        ║`,
    `╠══════════════════════════════╣`,
    `║  Receipt: ${(sale.display_id || "").padEnd(25)}║`,
    `║  Date:    ${date.padEnd(24)}║`,
    `║  Store:   ${storeName.padEnd(24)}║`,
    `╠══════════════════════════════╣`,
    items,
    `║  ───────────────────         ║`,
    `║  Total               ${fmtINR(sale.total_amount).padStart(7)} ║`,
    `╠══════════════════════════════╣`,
    `║  Cash Given           ${fmtINR(Number(sale.cash_amount || 0)).padStart(7)} ║`,
    `║  UPI Given            ${fmtINR(Number(sale.upi_amount || 0)).padStart(7)} ║`,
    `╠══════════════════════════════╣`,
    `║  Old Balance          ${fmtINR(previousBalance).padStart(7)} ║`,
    `║  *Total Due*          ${fmtINR(totalDue).padStart(7)} ║`,
    `╠══════════════════════════════╣`,
    `║  Delivered by: ${recorderName.padEnd(18)}║`,
    `╠══════════════════════════════╣`,
    `║       Thank you!             ║`,
    `╚══════════════════════════════╝`,
  ].join("\n");
};
```

- [ ] **Step 2: Add WhatsApp handler**

```tsx
const handleWhatsAppShare = () => {
  const text = encodeURIComponent(formatWhatsAppText());
  const url = `whatsapp://send?text=${text}`;
  try {
    if (isNativeApp()) {
      window.open(url, "_system");
    } else {
      window.open(url, "_blank");
    }
  } catch {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(formatWhatsAppText());
    toast.success("Receipt copied to clipboard");
  }
};
```

- [ ] **Step 3: Add Share Image handler**

```tsx
const handleShareImage = async () => {
  if (!printRef.current) return;
  try {
    const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) { toast.error("Failed to capture receipt"); return; }

    const file = new File([blob], `receipt-${sale?.display_id || "sale"}.png`, { type: "image/png" });

    if (isNativeApp()) {
      await Share.share({
        title: `Receipt ${sale?.display_id || ""}`,
        text: `Receipt from Aqua Prime — ${sale?.display_id || ""}`,
        files: [file],
      });
    } else if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Receipt ${sale?.display_id || ""}` });
    } else {
      // Fallback: download the image
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${sale?.display_id || "sale"}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Receipt image downloaded");
    }
  } catch (err) {
    console.error("Share image failed:", err);
    toast.error("Failed to share receipt image");
  }
};
```

- [ ] **Step 4: Add the 3 action buttons inside the dialog content**

Find the `<DialogContent>` closing area (around line ~340) and add the action button bar before the close. Locate the `handleShare` button (Share2 icon) which is the existing Web Share button — replace it with the new 3-button row:

```tsx
{/* Action Buttons */}
<div className="flex gap-2 mt-4">
  <Button
    variant="outline"
    size="sm"
    className="flex-1 gap-1.5"
    onClick={handleShareImage}
    disabled={isLoading}
  >
    <ImageIcon className="h-4 w-4" />
    Share Image
  </Button>
  <Button
    variant="outline"
    size="sm"
    className="flex-1 gap-1.5 text-green-700 border-green-300 hover:bg-green-50"
    onClick={handleWhatsAppShare}
    disabled={isLoading}
  >
    <MessageCircle className="h-4 w-4" />
    WhatsApp
  </Button>
  <Button
    variant="outline"
    size="sm"
    className="flex-1 gap-1.5"
    onClick={handlePrint}
    disabled={isLoading}
  >
    <Printer className="h-4 w-4" />
    Print
  </Button>
</div>
```

Remove the old Print button (which was a separate standalone button — it's replaced by the Print button above). The old `handleShare` button should be removed since Share Image covers and extends this functionality.

**Important:** Keep the existing `handlePrint` function — it already works. Just remove its old button trigger and let the new Print button in the action bar trigger it.

- [ ] **Step 5: Build and lint check**

```bash
npm run build 2>&1 | tail -10
```

---

### Task 2: Fix AdminSales.tsx receipt button

**Files:**
- Modify: `src/mobile/pages/admin/AdminSales.tsx`

- [ ] **Step 1: Add receiptSaleId state and SaleReceipt import**

Add import:
```tsx
import { SaleReceipt } from "@/components/shared/SaleReceipt";
```

Add state alongside existing state (around line 78):
```tsx
const [receiptSaleId, setReceiptSaleId] = useState<string | null>(null);
```

- [ ] **Step 2: Wire Receipt buttons to local state instead of URL navigation**

Replace the two `onNavigate(`/sales?receipt=...`)` calls with `setReceiptSaleId(sale.id)`. Both occurrences — the card action row button and the detail modal button.

In the card action row (around line 549):
```tsx
onClick={() => { setShowDetailModal(false); setReceiptSaleId(sale.id); }}
```

In the detail modal (around line 698):  
```tsx
<Button variant="outline" size="sm" className="text-xs"
  onClick={() => {
    setShowDetailModal(false);
    setReceiptSaleId(selectedSale.id);
  }}
>
```

- [ ] **Step 3: Add SaleReceipt component before the closing `</div>`**

Before the component's closing `</div>` (before line 868), add:
```tsx
<SaleReceipt
  saleId={receiptSaleId || ""}
  open={!!receiptSaleId}
  onClose={() => setReceiptSaleId(null)}
/>
```

---

### Task 3: Fix AdminTransactions.tsx receipt button

**Files:**
- Modify: `src/mobile/pages/admin/AdminTransactions.tsx`

- [ ] **Step 1: Add receiptTxnId state and SaleReceipt import**

Add import:
```tsx
import { SaleReceipt } from "@/components/shared/SaleReceipt";
```

Add state alongside existing state:
```tsx
const [receiptTxnId, setReceiptTxnId] = useState<string | null>(null);
```

- [ ] **Step 2: Wire Receipt buttons to local state**

Replace `onNavigate(`/transactions?receipt=...`)` with `setReceiptTxnId(selectedTxn.id)` in the detail modal.

- [ ] **Step 3: Add SaleReceipt component**

Add before the closing `</div>`:
```tsx
<SaleReceipt
  saleId={receiptTxnId || ""}
  open={!!receiptTxnId}
  onClose={() => setReceiptTxnId(null)}
/>
```

---

### Task 4: Final verification

- [ ] **Step 1: Full build**

```bash
npm run build
```

- [ ] **Step 2: Verify no lint errors**

```bash
npm run lint 2>&1 | grep -E "^src/(mobile|components)/"
```

Expected: No errors in modified files
