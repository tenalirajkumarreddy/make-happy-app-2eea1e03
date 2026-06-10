import { memo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Printer, MessageCircle, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Share } from "@capacitor/share";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { isNativeApp } from "@/lib/capacitorUtils";
import { fmtINR } from "@/lib/utils";
import { TXN_RECEIPT_CSS } from "@/lib/printTokens";

const escapeHtml = (str: string): string => {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
};

interface TransactionReceiptProps {
  transactionId: string;
  open: boolean;
  onClose: () => void;
}

export const TransactionReceipt = memo(function TransactionReceipt({
  transactionId,
  open,
  onClose,
}: TransactionReceiptProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const { data: txn, isLoading } = useQuery({
    queryKey: ["txn-receipt", transactionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .single();
      if (error) throw error;

      const [storeRes, customerRes, userRes] = await Promise.all([
        data.store_id
          ? supabase.from("stores").select("name, address").eq("id", data.store_id).single()
          : Promise.resolve({ data: null }),
        data.customer_id
          ? supabase.from("customers").select("name, phone").eq("id", data.customer_id).single()
          : Promise.resolve({ data: null }),
        data.recorded_by
          ? supabase.from("profiles").select("full_name").eq("id", data.recorded_by).single()
          : Promise.resolve({ data: null }),
      ]);

      return {
        ...data,
        stores: storeRes.data,
        customers: customerRes.data,
        recorded_by_profile: userRes.data,
      };
    },
    enabled: open && !!transactionId,
  });

  const { data: settings = {} } = useQuery({
    queryKey: ["company-settings-receipt"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("key, value");
      const map: Record<string, string> = {};
      data?.forEach((s: any) => {
        map[s.key] = s.value;
      });
      return map;
    },
  });

  const amountPaid = Number(txn?.total_amount || 0);
  const previousBalance = Number(txn?.old_outstanding || 0);
  const newBalance = Number(txn?.new_outstanding || 0);
  const isReturned = txn?.is_fully_returned;

  const handlePrint = () => {
    if (!txn) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to print");
      return;
    }

    const content = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Receipt ${escapeHtml(txn.display_id || "")}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            ${TXN_RECEIPT_CSS}
            body { font-family: 'Courier New', monospace; font-size: 12px; padding: 10px; max-width: 80mm; }
            .center { text-align: center; }
            .divider { border-top: 1px dashed var(--receipt-divider); margin: 12px 0; }
            .row { display: flex; justify-content: space-between; margin: 4px 0; }
            .bold { font-weight: bold; }
            h1 { font-size: 16px; margin-bottom: 4px; }
            .small { font-size: 10px; color: var(--receipt-muted); }
            .returned { text-align: center; margin: 8px 0; }
            .returned span { font-size: 10px; font-weight: bold; color: var(--receipt-danger); border: 1px solid var(--receipt-danger); padding: 2px 8px; text-transform: uppercase; }
          </style>
        </head>
        <body>
          ${isReturned ? '<div class="returned"><span>CANCELLED — Fully Returned</span></div>' : ""}
          <div class="center">
            <h1>${escapeHtml(settings.business_name || "BizManager")}</h1>
            ${settings.business_address ? `<p class="small">${escapeHtml(settings.business_address)}</p>` : ""}
            ${settings.business_phone ? `<p class="small">Tel: ${escapeHtml(settings.business_phone)}</p>` : ""}
          </div>
          <div class="divider"></div>
          <div>
            <div class="row"><span>Receipt No:</span><span class="bold">${escapeHtml(txn.display_id || "")}</span></div>
            <div class="row"><span>Date:</span><span>${new Date(txn.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
            ${txn.stores?.name ? `<div class="row"><span>Store:</span><span>${escapeHtml(txn.stores.name)}</span></div>` : ""}
            ${txn.customers?.name ? `<div class="row"><span>Customer:</span><span>${escapeHtml(txn.customers.name)}</span></div>` : ""}
          </div>
          <div class="divider"></div>
          <div>
            <div class="row bold" style="font-size: 14px;"><span>AMOUNT PAID:</span><span>₹${amountPaid.toLocaleString()}</span></div>
            ${Number(txn.cash_amount) > 0 ? `<div class="row"><span>Cash:</span><span>₹${Number(txn.cash_amount).toLocaleString()}</span></div>` : ""}
            ${Number(txn.upi_amount) > 0 ? `<div class="row"><span>UPI:</span><span>₹${Number(txn.upi_amount).toLocaleString()}</span></div>` : ""}
          </div>
          <div class="divider"></div>
          <div>
            <div class="row"><span>Previous Balance:</span><span>₹${previousBalance.toLocaleString()}</span></div>
            <div class="row bold"><span>Amount Paid:</span><span style="color: var(--receipt-success);">-₹${amountPaid.toLocaleString()}</span></div>
            <div class="row bold border-t" style="border-top: 1px solid var(--receipt-divider); padding-top: 4px;"><span>New Balance:</span><span>₹${newBalance.toLocaleString()}</span></div>
          </div>
          <div class="divider"></div>
          <div class="center">
            <p class="bold">${isReturned ? "This payment has been fully returned" : "Thank you for your payment!"}</p>
            ${txn.recorded_by_profile?.full_name ? `<p class="small">Recorded by: ${escapeHtml(txn.recorded_by_profile.full_name)}</p>` : ""}
            <p class="small" style="margin-top: 8px;">This is a computer generated receipt</p>
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
  };

  const formatWhatsAppText = () => {
    if (!txn) return "";
    const div = "─".repeat(24);
    const date = format(new Date(txn.created_at), "dd MMM yyyy");
    return [
      `💧 ${settings.business_name || "BIZMANAGER"} ®`,
      div,
      `Date       : ${date}`,
      `Receipt No : ${txn.display_id || ""}`,
      `Store      : ${txn.stores?.name || "N/A"}`,
      `Customer   : ${txn.customers?.name || "Walk-in"}`,
      div,
      `AMOUNT PAID: ${fmtINR(amountPaid)}`,
      `Cash  : ${fmtINR(Number(txn.cash_amount || 0))}   UPI : ${fmtINR(Number(txn.upi_amount || 0))}`,
      div,
      `Prev Bal  : ${fmtINR(previousBalance)}`,
      `Paid      : -${fmtINR(amountPaid)}`,
      `New Bal   : ${fmtINR(newBalance)}`,
      div,
      `Recorded  : ${txn.recorded_by_profile?.full_name || "N/A"}`,
      `Thank you • ${settings.business_name || "BizManager"} 💧`,
    ].join("\n");
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(formatWhatsAppText());
    const url = `whatsapp://send?text=${text}`;
    try {
      window.open(url, isNativeApp() ? "_system" : "_blank");
    } catch {
      navigator.clipboard.writeText(formatWhatsAppText());
      toast.success("Receipt copied to clipboard");
    }
  };

  const handleShareImage = async () => {
    if (!printRef.current) {
      toast.error("Receipt not yet rendered");
      return;
    }
    const toastId = toast.loading("Capturing receipt…");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const dataUrl = canvas.toDataURL("image/png");
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const fileName = `payment-receipt-${txn?.display_id || "txn"}.png`;

      if (isNativeApp()) {
        const result = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache,
        });
        await Share.share({
          title: `Payment Receipt ${txn?.display_id || ""}`,
          files: [result.uri],
        });
      } else if (navigator.share) {
        const blob = await new Promise<Blob>((resolve) => {
          const bin = atob(base64Data);
          const buf = new ArrayBuffer(bin.length);
          const view = new Uint8Array(buf);
          for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
          resolve(new Blob([buf], { type: "image/png" }));
        });
        const file = new File([blob], fileName, { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: `Payment Receipt ${txn?.display_id || ""}` });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(url);
        }
      } else {
        const blob = await new Promise<Blob>((resolve) => {
          const bin = atob(base64Data);
          const buf = new ArrayBuffer(bin.length);
          const view = new Uint8Array(buf);
          for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
          resolve(new Blob([buf], { type: "image/png" }));
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.dismiss(toastId);
    } catch (err) {
      console.error("Share image failed:", err);
      toast.dismiss(toastId);
      toast.error("Failed to share receipt image");
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Payment Receipt</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : txn ? (
          <>
            <div ref={printRef} className="font-mono text-sm bg-card p-4 rounded-lg border">
              {isReturned && (
                <div className="text-center mb-2">
                  <span className="inline-block text-2xs font-bold text-destructive bg-destructive/10 border border-destructive/30 rounded px-2 py-0.5 uppercase tracking-wider">
                    CANCELLED — Fully Returned
                  </span>
                </div>
              )}

              {/* Header */}
              <div className="text-center mb-4">
                <h1 className="font-bold text-lg">{settings.business_name || "BizManager"}</h1>
                {settings.business_address && (
                  <p className="text-xs text-muted-foreground">{settings.business_address}</p>
                )}
                {settings.business_phone && (
                  <p className="text-xs text-muted-foreground">Tel: {settings.business_phone}</p>
                )}
              </div>

              <div className="border-t border-dashed border-border my-3" />

              {/* Receipt Info */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Receipt No:</span>
                  <span className="font-bold">{txn.display_id}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span>
                    {new Date(txn.created_at).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {txn.stores?.name && (
                  <div className="flex justify-between">
                    <span>Store:</span>
                    <span>{txn.stores.name}</span>
                  </div>
                )}
                {txn.customers?.name && (
                  <div className="flex justify-between">
                    <span>Customer:</span>
                    <span>{txn.customers.name}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-border my-3" />

              {/* Payment Details */}
              <div className="space-y-1">
                <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-300">
                  <span>AMOUNT PAID:</span>
                  <span className={isReturned ? "line-through text-muted-foreground" : ""}>
                    ₹{amountPaid.toLocaleString()}
                  </span>
                </div>
                {Number(txn.cash_amount) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span>Cash:</span>
                    <span>₹{Number(txn.cash_amount).toLocaleString()}</span>
                  </div>
                )}
                {Number(txn.upi_amount) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span>UPI:</span>
                    <span>₹{Number(txn.upi_amount).toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-border my-3" />

              {/* Balance Summary */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Previous Balance:</span>
                  <span>₹{previousBalance.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Amount Paid:</span>
                  <span className="text-success">-₹{amountPaid.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-gray-300 pt-1">
                  <span>New Balance:</span>
                  <span className={newBalance > 0 ? "text-destructive" : "text-success"}>
                    ₹{newBalance.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="border-t border-dashed border-border my-3" />

              {/* Footer */}
              <div className="text-center text-xs space-y-1">
                <p className="font-semibold">
                  {isReturned ? "This payment has been fully returned" : "Thank you for your payment!"}
                </p>
                {txn.recorded_by_profile?.full_name && (
                  <p className="text-muted-foreground">Recorded by: {txn.recorded_by_profile.full_name}</p>
                )}
                <p className="text-2xs text-muted-foreground/60 mt-2">This is a computer generated receipt</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handleShareImage} disabled={isLoading}>
                <ImageIcon className="h-4 w-4" />
                Share
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
              <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handlePrint} disabled={isLoading}>
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>
          </>
        ) : (
          <p className="text-center text-muted-foreground py-8">Receipt not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
});

export default TransactionReceipt;
