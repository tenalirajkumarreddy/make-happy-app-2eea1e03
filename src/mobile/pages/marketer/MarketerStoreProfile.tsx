import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ClipboardList,
  Download,
  MapPin,
  Navigation2,
  Phone,
  Receipt,
  Share2,
  Store,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo, formatDate } from "@/lib/utils";
import { useLiveStoreBalance } from "@/hooks/useLiveStoreBalance";
import { isNativeApp } from "@/lib/capacitorUtils";
import type { StoreOption } from "@/mobile/components/StorePickerSheet";

interface Props {
  store: StoreOption;
  onBack: () => void;
  onGoRecord: (store: StoreOption) => void;
  onGoOrders?: (store: StoreOption) => void;
}

interface StoreProfileRow {
  id: string;
  name: string;
  display_id: string;
  photo_url: string | null;
  outstanding: number;
  opening_balance: number;
  created_at: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  route_id: string | null;
  last_activity_at: string | null;
  customers: { name: string; phone: string | null } | null;
  store_types: { name: string } | null;
  routes: { name: string } | null;
}

type LedgerEntry = {
  id: string;
  type: "sale" | "payment" | "correction" | "return";
  date: string;
  display_id: string;
  description: string;
  total_amount: number;
  outstanding: number;
  delta: number;
  notes: string | null;
  raw: any;
};

/* ─── PDF generation util ────────────────────────────────────────────────── */
async function generateLedgerPdf(
  storeName: string,
  storeDisplayId: string,
  ledgerEntries: LedgerEntry[],
  liveOutstanding: number
): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW = 210;
  const margin = 14;
  const usableW = pageW - margin * 2;
  const now = new Date();
  const printedOn = now.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  // ── Header ──
  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(0, 0, pageW, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Store Ledger Statement", margin, 12);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`${storeName}  ·  ${storeDisplayId}`, margin, 19);
  doc.text(`Printed: ${printedOn}`, pageW - margin, 19, { align: "right" });

  // ── Summary box ──
  const summaryY = 32;
  doc.setFillColor(239, 246, 255); // blue-50
  doc.roundedRect(margin, summaryY, usableW, 14, 3, 3, "F");
  doc.setTextColor(30, 58, 138); // blue-900
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Current Outstanding Balance:", margin + 4, summaryY + 6);
  const outColor = liveOutstanding > 0 ? [220, 38, 38] : liveOutstanding < 0 ? [5, 150, 105] : [71, 85, 105];
  doc.setTextColor(outColor[0], outColor[1], outColor[2]);
  doc.setFontSize(11);
  doc.text(
    `₹${Math.abs(liveOutstanding).toLocaleString("en-IN")}${liveOutstanding < 0 ? " CR" : liveOutstanding > 0 ? " DR" : ""}`,
    pageW - margin - 4,
    summaryY + 7,
    { align: "right" }
  );

  // ── Table header ──
  const tableY = summaryY + 18;
  const cols = {
    date: margin,
    desc: margin + 28,
    debit: margin + usableW - 54,
    credit: margin + usableW - 32,
    balance: margin + usableW - 10,
  };

  doc.setFillColor(51, 65, 85); // slate-700
  doc.rect(margin, tableY, usableW, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("Date", cols.date + 2, tableY + 5);
  doc.text("Description", cols.desc, tableY + 5);
  doc.text("Debit (Dr)", cols.debit, tableY + 5, { align: "right" });
  doc.text("Credit (Cr)", cols.credit, tableY + 5, { align: "right" });
  doc.text("Balance", cols.balance, tableY + 5, { align: "right" });

  // ── Rows ──
  const sortedAsc = [...ledgerEntries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let y = tableY + 7;
  const rowH = 6.5;
  let rowIndex = 0;

  doc.setFont("helvetica", "normal");

  for (const entry of sortedAsc) {
    if (y + rowH > 278) {
      doc.addPage();
      y = 16;
      // repeat header on new page
      doc.setFillColor(51, 65, 85);
      doc.rect(margin, y - 7, usableW, 7, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text("Date", cols.date + 2, y);
      doc.text("Description", cols.desc, y);
      doc.text("Debit (Dr)", cols.debit, y, { align: "right" });
      doc.text("Credit (Cr)", cols.credit, y, { align: "right" });
      doc.text("Balance", cols.balance, y, { align: "right" });
      doc.setFont("helvetica", "normal");
    }

    const isEven = rowIndex % 2 === 0;
    const isSale = entry.type === "sale";
    const isPayment = entry.type === "payment";
    const isOpening = entry.id === "__opening__";

    const isInactive =
      (isSale && (entry.raw?.is_fully_returned || entry.raw?.status === "cancelled")) ||
      (isPayment && entry.raw?.is_fully_returned);

    // Row background
    if (isOpening) {
      doc.setFillColor(241, 245, 249); // slate-100
    } else if (isEven) {
      doc.setFillColor(248, 250, 252); // slate-50
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(margin, y, usableW, rowH, "F");

    // Date
    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFontSize(7);
    const dateStr = new Date(entry.date).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "2-digit",
    });
    doc.text(dateStr, cols.date + 2, y + 4.5);

    // Description
    if (isOpening) {
      doc.setTextColor(71, 85, 105);
      doc.setFont("helvetica", "bold");
    } else if (isInactive) {
      doc.setTextColor(148, 163, 184); // slate-400
      doc.setFont("helvetica", "normal");
    } else {
      doc.setTextColor(30, 41, 59); // slate-800
      doc.setFont("helvetica", "normal");
    }
    doc.setFontSize(7.5);
    const descMaxW = cols.debit - cols.desc - 4;
    const descLines = doc.splitTextToSize(
      isInactive ? `[${entry.description}]` : entry.description,
      descMaxW
    );
    doc.text(descLines[0], cols.desc, y + 4.5);

    // Debit (sale adds balance)
    if (isSale && !isInactive) {
      doc.setTextColor(185, 28, 28); // red-700
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text(`₹${entry.total_amount.toLocaleString("en-IN")}`, cols.debit, y + 4.5, { align: "right" });
    } else if (isOpening && entry.total_amount > 0) {
      doc.setTextColor(185, 28, 28);
      doc.setFont("helvetica", "bold");
      doc.text(`₹${entry.total_amount.toLocaleString("en-IN")}`, cols.debit, y + 4.5, { align: "right" });
    } else {
      doc.setTextColor(203, 213, 225);
      doc.setFont("helvetica", "normal");
      doc.text("—", cols.debit, y + 4.5, { align: "right" });
    }

    // Credit (payment reduces balance)
    if (isPayment && !isInactive) {
      doc.setTextColor(4, 120, 87); // emerald-700
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text(`₹${entry.total_amount.toLocaleString("en-IN")}`, cols.credit, y + 4.5, { align: "right" });
    } else {
      doc.setTextColor(203, 213, 225);
      doc.setFont("helvetica", "normal");
      doc.text("—", cols.credit, y + 4.5, { align: "right" });
    }

    // Balance
    const bal = entry.outstanding;
    const balColor = bal > 0 ? [185, 28, 28] : bal < 0 ? [4, 120, 87] : [71, 85, 105];
    doc.setTextColor(balColor[0], balColor[1], balColor[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(`₹${Math.abs(bal).toLocaleString("en-IN")}`, cols.balance, y + 4.5, { align: "right" });

    // Row separator
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + rowH, margin + usableW, y + rowH);

    y += rowH;
    rowIndex++;
  }

  // ── Footer ──
  const footerY = y + 6;
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, footerY, usableW, 8, "F");
  doc.setTextColor(30, 58, 138);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(`Total Entries: ${sortedAsc.length}`, margin + 4, footerY + 5.5);
  const finalOutColor =
    liveOutstanding > 0 ? [185, 28, 28] : liveOutstanding < 0 ? [4, 120, 87] : [71, 85, 105];
  doc.setTextColor(finalOutColor[0], finalOutColor[1], finalOutColor[2]);
  doc.text(
    `Closing Balance: ₹${Math.abs(liveOutstanding).toLocaleString("en-IN")}${liveOutstanding < 0 ? " CR" : liveOutstanding > 0 ? " DR" : ""}`,
    pageW - margin - 4,
    footerY + 5.5,
    { align: "right" }
  );

  // page numbers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin, 292, { align: "right" });
  }

  return doc.output("arraybuffer") as unknown as Uint8Array;
}

/* ─── Share / Download ────────────────────────────────────────────────────── */
async function sharePdf(
  storeName: string,
  storeDisplayId: string,
  ledgerEntries: LedgerEntry[],
  liveOutstanding: number
) {
  const pdfBytes = await generateLedgerPdf(storeName, storeDisplayId, ledgerEntries, liveOutstanding);
  const fileName = `ledger_${storeDisplayId}_${Date.now()}.pdf`;

  if (isNativeApp()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");

    // Convert to base64
    const uint8Array = new Uint8Array(pdfBytes as unknown as ArrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);

    // Write to cache dir
    const fileResult = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache,
    });

    await Share.share({
      title: `Ledger – ${storeName}`,
      text: `Store ledger statement for ${storeName} (${storeDisplayId})`,
      url: fileResult.uri,
      dialogTitle: "Share Ledger PDF",
    });
  } else {
    // Web: trigger download
    const blob = new Blob([pdfBytes as unknown as ArrayBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export function MarketerStoreProfile({ store, onBack, onGoRecord, onGoOrders }: Props) {
  const liveOutstanding = useLiveStoreBalance(store.id);
  const [exporting, setExporting] = useState(false);

  const { data: storeRow } = useQuery({
    queryKey: ["mobile-marketer-store-profile", store.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, display_id, photo_url, outstanding, opening_balance, created_at, address, phone, lat, lng, route_id, last_activity_at, customers(name, phone), store_types(name), routes(name)")
        .eq("id", store.id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as StoreProfileRow | null) || null;
    },
    enabled: !!store.id,
  });

  // ── Ledger queries ──────────────────────────────────────────────────────
  const { data: ledgerSales = [] } = useQuery({
    queryKey: ["store-ledger-sales", store.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, created_at, display_id, total_amount, cash_amount, upi_amount, old_outstanding, new_outstanding, status, notes, recorded_by, is_fully_returned, deleted_at")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!store.id,
  });

  const { data: ledgerTxns = [] } = useQuery({
    queryKey: ["store-ledger-txns", store.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, created_at, display_id, total_amount, cash_amount, upi_amount, old_outstanding, new_outstanding, notes, recorded_by, is_fully_returned, deleted_at")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!store.id,
  });

  const { data: ledgerReturns = [] } = useQuery({
    queryKey: ["store-ledger-returns", store.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payment_returns")
        .select("id, created_at, display_id, return_amount, reason, original_transaction_id")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!store.id,
  });

  const storeOpeningBalance = storeRow?.opening_balance ?? 0;
  const storeCreatedAt = storeRow?.created_at ?? new Date().toISOString();

  const ledgerEntries = useMemo(() => {
    const entries: LedgerEntry[] = [];

    const returnByTxnId = new Map<string, any>();
    for (const r of ledgerReturns) {
      returnByTxnId.set(r.original_transaction_id, r);
    }

    const activeSales = ledgerSales.filter((s: any) => !s.deleted_at);
    const activeTxns = ledgerTxns.filter((t: any) => !t.deleted_at);

    for (const s of activeSales) {
      const isCancelled = s.status === "cancelled";
      entries.push({
        id: s.id,
        type: "sale",
        date: s.created_at,
        display_id: s.display_id,
        description: `Sale #${s.display_id}`,
        total_amount: Number(s.total_amount),
        outstanding: 0,
        notes: s.notes,
        raw: s,
        delta: isCancelled || s.is_fully_returned ? 0 : (Number(s.total_amount) - Number(s.cash_amount || 0) - Number(s.upi_amount || 0)),
      });
    }

    for (const t of activeTxns) {
      const isReturned = t.is_fully_returned;
      entries.push({
        id: t.id,
        type: "payment",
        date: t.created_at,
        display_id: t.display_id,
        description: `Payment #${t.display_id}`,
        total_amount: Number(t.total_amount),
        outstanding: isReturned ? Number(t.old_outstanding) : Number(t.new_outstanding),
        notes: t.notes,
        raw: t,
        delta: isReturned ? 0 : -Number(t.total_amount),
      });
    }

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = storeOpeningBalance;
    for (const entry of entries) {
      runningBalance += entry.delta;
      entry.outstanding = runningBalance;
    }

    entries.unshift({
      id: "__opening__",
      type: "correction" as const,
      date: storeCreatedAt,
      display_id: "",
      description: "Opening Balance",
      total_amount: storeOpeningBalance,
      outstanding: storeOpeningBalance,
      notes: null,
      raw: null,
      delta: 0,
    });

    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return entries;
  }, [ledgerSales, ledgerTxns, ledgerReturns, storeOpeningBalance, storeCreatedAt]);

  const currentStore: StoreOption = useMemo(() => ({
    ...store,
    ...(storeRow || {}),
    customers: storeRow?.customers || store.customers || null,
    store_types: storeRow?.store_types || store.store_types || null,
    routes: storeRow?.routes || store.routes || null,
  }), [store, storeRow]);

  const openDirections = () => {
    if (currentStore.lat != null && currentStore.lng != null) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${currentStore.lat},${currentStore.lng}`, "_blank");
      return;
    }
    if (currentStore.address) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(currentStore.address)}`, "_blank");
    }
  };

  const handleCall = () => {
    const phone = currentStore.phone || null;
    if (!phone) return;
    window.open(`tel:${phone}`, "_self");
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await sharePdf(
        currentStore.name,
        currentStore.display_id || store.id,
        ledgerEntries,
        liveOutstanding
      );
    } catch (err) {
      console.error("PDF export failed", err);
    } finally {
      setExporting(false);
    }
  };

  const phone = currentStore.phone || null;
  const canNavigate = (currentStore.lat != null && currentStore.lng != null) || !!currentStore.address;
  const native = isNativeApp();

  return (
    <div className="pb-6">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-6">
        <button
          type="button"
          className="h-9 px-3 rounded-xl bg-white/15 text-white text-sm font-semibold flex items-center gap-2"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <p className="text-blue-200 text-xs font-medium uppercase tracking-widest mt-3">Store Profile</p>
        <h2 className="text-white text-xl font-bold mt-0.5">{currentStore.name}</h2>
      </div>

      <div className="px-4 -mt-4 space-y-3">
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="h-44 w-full bg-slate-100 dark:bg-slate-700">
            {currentStore.photo_url ? (
              <img src={currentStore.photo_url} alt={currentStore.name} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Store className="h-10 w-10 text-slate-400" />
              </div>
            )}
          </div>

          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-base font-bold text-slate-800 dark:text-white">{currentStore.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{currentStore.display_id}</p>
              </div>
              <p className={`text-base font-bold ${liveOutstanding > 0 ? "text-red-500" : liveOutstanding < 0 ? "text-emerald-500" : "text-slate-500"}`}>
                {liveOutstanding < 0 ? '-' : ''}₹{Math.abs(liveOutstanding || 0).toLocaleString("en-IN")}
              </p>
            </div>

            <div className="flex gap-2 mt-2 flex-wrap">
              {currentStore.store_types?.name && <Badge variant="outline" className="text-xs font-semibold">{currentStore.store_types.name}</Badge>}
              {currentStore.routes?.name && <Badge variant="outline" className="text-xs font-semibold">{currentStore.routes.name}</Badge>}
              {currentStore.last_activity_at && <Badge variant="secondary" className="text-2xs font-medium">{timeAgo(currentStore.last_activity_at)}</Badge>}
            </div>

            {currentStore.address && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 flex items-start gap-1.5">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{currentStore.address}</span>
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs" onClick={openDirections} disabled={!canNavigate}>
                <Navigation2 className="h-3.5 w-3.5 mr-1.5" />
                Navigate
              </Button>
              <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs" onClick={handleCall} disabled={!phone}>
                <Phone className="h-3.5 w-3.5 mr-1.5" />
                Call
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Quick Actions</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onGoOrders?.(currentStore)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
            >
              <ClipboardList className="h-5 w-5 text-white" />
              <span className="text-xs font-bold text-white text-center">Create Order</span>
            </button>

            <button
              type="button"
              onClick={() => onGoRecord(currentStore)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
            >
              <Wallet className="h-5 w-5 text-emerald-500" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 text-center">Payment</span>
            </button>
          </div>
        </div>

        {/* ── Store Ledger – Tabular ─────────────────────────────────────── */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">

          {/* Ledger header row */}
          <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-violet-500/10 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-violet-900/20 px-3 py-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
            <Receipt className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex-1">
              Ledger
              {ledgerEntries.length > 0 && (
                <span className="ml-2 text-indigo-600 dark:text-indigo-400">{ledgerEntries.length} entries</span>
              )}
            </p>
            {ledgerEntries.length > 0 && (
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95
                  ${exporting
                    ? "bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                  }`}
              >
                {exporting ? (
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : native ? (
                  <Share2 className="h-3.5 w-3.5" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {exporting ? "Preparing…" : native ? "Share PDF" : "Export PDF"}
              </button>
            )}
          </div>

          {/* Table column headers */}
          {ledgerEntries.length > 0 && (
            <div className="grid grid-cols-[72px_1fr_64px_64px_68px] bg-slate-700 dark:bg-slate-900 px-2 py-1.5">
              <span className="text-2xs font-bold text-slate-200 uppercase tracking-wide">Date</span>
              <span className="text-2xs font-bold text-slate-200 uppercase tracking-wide">Description</span>
              <span className="text-2xs font-bold text-slate-200 uppercase tracking-wide text-right">Debit</span>
              <span className="text-2xs font-bold text-slate-200 uppercase tracking-wide text-right">Credit</span>
              <span className="text-2xs font-bold text-slate-200 uppercase tracking-wide text-right">Balance</span>
            </div>
          )}

          {ledgerEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4">
              <Receipt className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No Ledger Entries</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 text-center">Transactions and payments will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {ledgerEntries.map((entry, idx) => {
                const isOpening = entry.id === "__opening__";
                const isSale = entry.type === "sale";
                const isPayment = entry.type === "payment";
                const isInactive =
                  (isSale && (entry.raw?.is_fully_returned || entry.raw?.status === "cancelled")) ||
                  (isPayment && entry.raw?.is_fully_returned);

                const rowBg = isOpening
                  ? "bg-slate-50 dark:bg-slate-700/30"
                  : idx % 2 === 0
                  ? "bg-white dark:bg-slate-800"
                  : "bg-slate-50/60 dark:bg-slate-800/60";

                return (
                  <div
                    key={entry.id}
                    className={`grid grid-cols-[72px_1fr_64px_64px_68px] items-center px-2 py-2 ${rowBg} ${isInactive ? "opacity-50" : ""}`}
                  >
                    {/* Date */}
                    <div>
                      <p className="text-2xs font-medium text-slate-500 dark:text-slate-400 tabular-nums leading-tight">
                        {entry.date ? new Date(entry.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "--"}
                      </p>
                      <p className="text-2xs text-slate-400 dark:text-slate-500 tabular-nums leading-tight">
                        {entry.date ? new Date(entry.date).getFullYear() : "--"}
                      </p>
                    </div>

                    {/* Description */}
                    <div className="min-w-0 pr-1">
                      <p className={`text-xs font-semibold leading-tight truncate ${
                        isOpening ? "text-slate-600 dark:text-slate-300 italic" :
                        isInactive ? "line-through text-slate-400 dark:text-slate-500" :
                        "text-slate-800 dark:text-white"
                      }`}>
                        {entry.description}
                      </p>
                      {entry.notes && (
                        <p className="text-2xs text-slate-400 dark:text-slate-500 truncate leading-tight mt-0.5">
                          {entry.notes}
                        </p>
                      )}
                    </div>

                    {/* Debit */}
                    <div className="text-right">
                      {isSale && !isInactive ? (
                        <p className="text-xs font-bold text-red-600 dark:text-red-400 tabular-nums">
                          ₹{(entry.total_amount || 0).toLocaleString("en-IN")}
                        </p>
                      ) : isOpening && entry.total_amount > 0 ? (
                        <p className="text-xs font-bold text-red-600 dark:text-red-400 tabular-nums">
                          ₹{(entry.total_amount || 0).toLocaleString("en-IN")}
                        </p>
                      ) : (
                        <span className="text-2xs text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </div>

                    {/* Credit */}
                    <div className="text-right">
                      {isPayment && !isInactive ? (
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          ₹{(entry.total_amount || 0).toLocaleString("en-IN")}
                        </p>
                      ) : (
                        <span className="text-2xs text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </div>

                    {/* Balance */}
                    <div className="text-right">
                      <p className={`text-xs font-bold tabular-nums ${
                        entry.outstanding > 0 ? "text-red-600 dark:text-red-400" :
                        entry.outstanding < 0 ? "text-emerald-600 dark:text-emerald-400" :
                        "text-slate-500 dark:text-slate-400"
                      }`}>
                        ₹{Math.abs(entry.outstanding || 0).toLocaleString("en-IN")}
                      </p>
                      {entry.outstanding !== 0 && (
                        <p className="text-2xs text-slate-400 dark:text-slate-500 leading-none">
                          {entry.outstanding > 0 ? "DR" : "CR"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
