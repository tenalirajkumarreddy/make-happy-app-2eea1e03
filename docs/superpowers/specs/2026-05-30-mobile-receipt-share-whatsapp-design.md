# Mobile Receipt: Share Image, WhatsApp, Print

## Problem
The Receipt button in `AdminSales.tsx` navigates to `/sales?receipt=ID` but no code reads URL query params to open a receipt dialog — dead navigation. There is no native share (image) or WhatsApp share for mobile sale receipts.

## Solution
Fix receipt button to use local state (existing working pattern from `AgentRecord.tsx`). Add a 3-button action bar inside the `SaleReceipt` dialog:
- **Share Image** — capture DOM as PNG via `html2canvas`, share via native share sheet
- **WhatsApp** — deep-link `whatsapp://send?text=` with formatted plain text receipt
- **Print** — existing `window.print()` from `SaleReceipt.handlePrint`

## Design Decisions

### Roles
All sales-handling roles see the buttons (`super_admin`, `manager`, `agent`, `marketer`, `pos`). Permission check via `usePermission("view_sales")` added where needed.

### Receipt dialog integration
`SaleReceipt` component (shared between web and mobile) gets the 3-button action bar. Web-only views (`Sales.tsx`) get it automatically. Mobile-only files (`AdminSales.tsx`, `AgentRecord.tsx`, `AgentHistory.tsx`) also get it since they all use `SaleReceipt`.

### WhatsApp text format
Plain text with box-drawing characters (Unicode `═║╔╗╚╝╠╣╗╔`), wrapped in a single unified box. Total Due bolded via WhatsApp `*asterisk*` syntax.

```
╔══════════════════════════════╗
║        ★ AQUA PRIME ★        ║
╠══════════════════════════════╣
║  Receipt: SP-20260530-001   ║
║  Date:    30 May 2026        ║
║  Store:   Main Street        ║
╠══════════════════════════════╣
║  ── ITEMS ──                 ║
║  Product A  × 2       ₹200  ║
║  Product B  × 1       ₹350  ║
║  ───────────────────         ║
║  Total                ₹550  ║
╠══════════════════════════════╣
║  ── PAYMENT ──               ║
║  Cash Given           ₹200  ║
║  UPI Given            ₹350  ║
╠══════════════════════════════╣
║  ── BALANCE ──               ║
║  Old Balance         ₹1,200 ║
║  *Total Due*         ₹1,850 ║
╠══════════════════════════════╣
║  Delivered by: Amit S.       ║
╠══════════════════════════════╣
║       Thank you!             ║
╚══════════════════════════════╝
```

### Image capture approach
`html2canvas` captures the receipt DOM element (including the scrollable content) to a PNG blob. `@capacitor/share` plugin shares the image file via the Android native share sheet. Fallback: `navigator.share()` (Web Share API) on non-Capacitor environments.

### New packages
- `html2canvas` — DOM element to canvas/PNG capture
- `@capacitor/share` — native Android share sheet for file sharing

## Architecture

### Files to modify
| File | Change |
|------|--------|
| `src/components/shared/SaleReceipt.tsx` | Add Share Image + WhatsApp buttons; formatWhatsAppText() helper; captureReceiptImage() helper; install html2canvas |
| `src/mobile/pages/admin/AdminSales.tsx` | Add `receiptSaleId` state; wire SaleReceipt; call from Receipt button (stop URL navigation) |
| `src/mobile/pages/admin/AdminTransactions.tsx` | Same fix as AdminSales (receipt button dead navigation) |

### Component tree
```
SaleReceipt
├── receipt content (existing HTML display)
├── [New] Action bar
│   ├── Share Image button → captureReceiptImage() → Capacitor Share
│   ├── WhatsApp button → formatWhatsAppText() → whatsapp://send?text=
│   └── Print button → handlePrint() (existing, renamed)
└── Close button
```

### Data flow
1. Receipt button click → set `receiptSaleId` state → `<SaleReceipt open={true} saleId={id} />`
2. `SaleReceipt` fetches sale, items, store, customer, recorder via `useQuery` (existing)
3. User clicks action button → corresponding handler fires
4. WhatsApp: builds text string, encodes, opens URI
5. Share Image: `html2canvas(printRef.current)` → canvas.toBlob() → navigator.share({files: [blob]}) or Capacitor Share
6. Print: existing `window.open()` → `document.write()` print template → `window.print()`

## Edge Cases & Error Handling
- **WhatsApp not installed**: `whatsapp://` URL will fail silently — Android shows "no app found". Catch with try/catch, fallback to Web Share API text share.
- **html2canvas fails** (cross-origin image, large DOM): Show toast "Failed to capture image" — fallback to text-only share.
- **Capacitor Share not available**: Fallback to `navigator.share()` for text, `navigator.clipboard.writeText()` for plain text.
- **No sale data** (query not loaded yet): Buttons disabled while `isLoading` is true.
- **Missing fields** (no store name, no customer): Show "N/A" in WhatsApp text.

## Testing
- Manual: Click Share Image → native share sheet opens with PNG
- Manual: Click WhatsApp → WhatsApp opens with formatted text
- Manual: Click Print → print dialog opens
- Verify: Receipt opens from AdminSales card row (no URL navigation)
- Verify: Receipt opens from AgentRecord after sale (regression)
- Verify: Receipt opens from AgentHistory detail (regression)
