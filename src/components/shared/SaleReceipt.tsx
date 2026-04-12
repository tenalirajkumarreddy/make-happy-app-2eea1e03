import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Printer, Share2, Download, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";

// Simple HTML escape function to prevent XSS
const escapeHtml = (str: string): string => {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
};

interface SaleReceiptProps {
  saleId: string;
  open: boolean;
  onClose: () => void;
  onGeneratePDF?: (receiptId: string) => Promise<{ downloadUrl: string } | null>;
  onResendEmail?: (saleId: string, email: string) => Promise<void>;
  allowPdfDownload?: boolean;
  allowResend?: boolean;
}

export const SaleReceipt = ({ 
  saleId, 
  open, 
  onClose,
  onGeneratePDF,
  onResendEmail,
  allowPdfDownload = true,
  allowResend = true,
}: SaleReceiptProps) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [email, setEmail] = useState("");
  const [showResendForm, setShowResendForm] = useState(false);

  // Fetch sale details
  const { data: sale, isLoading } = useQuery({
    queryKey: ["sale-receipt", saleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(`
          *,
          customers(name, phone),
          stores(name, address),
          profiles:recorded_by(full_name),
          sale_items(*, products(name, unit))
        `)
        .eq("id", saleId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!saleId,
  });

  // Fetch company settings
  const { data: settings = {} } = useQuery({
    queryKey: ["company-settings-receipt"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("key, value");
      const map: Record<string, string> = {};
      data?.forEach((s: any) => { map[s.key] = s.value; });
      return map;
    },
  });

  // Calculate amounts from sale data (since sales table uses cash_amount, upi_amount, outstanding_amount)
  const amountPaid = Number(sale?.cash_amount || 0) + Number(sale?.upi_amount || 0);
  const outstandingAmount = Number(sale?.outstanding_amount || 0);

  const handlePrint = () => {
    if (!sale) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to print");
      return;
    }

    // Generate safe HTML content using escaped values
    const itemsHtml = (sale.sale_items || []).map((item: any) => `
      <div style="margin: 8px 0;">
        <div style="display: flex; justify-content: space-between;">
          <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px;">${escapeHtml(item.products?.name || "Unknown")}</span>
          <span style="font-weight: 600;">₹${Number(item.total_amount).toLocaleString()}</span>
        </div>
        <div style="font-size: 10px; color: #666;">
          ${item.quantity} x ₹${Number(item.unit_price).toLocaleString()}
        </div>
      </div>
    `).join("");

    const safeContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt ${escapeHtml(sale.display_id || "")}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              font-size: 12px; 
              padding: 10px;
              max-width: 80mm;
            }
            .center { text-align: center; }
            .divider { border-top: 1px dashed #000; margin: 12px 0; }
            .row { display: flex; justify-content: space-between; margin: 4px 0; }
            .bold { font-weight: bold; }
            h1 { font-size: 16px; margin-bottom: 4px; }
            .small { font-size: 10px; color: #666; }
          </style>
        </head>
        <body>
          <div class="center">
            <h1>${escapeHtml(settings.business_name || "BizManager")}</h1>
            ${settings.business_address ? `<p class="small">${escapeHtml(settings.business_address)}</p>` : ""}
            ${settings.business_phone ? `<p class="small">Tel: ${escapeHtml(settings.business_phone)}</p>` : ""}
            ${settings.business_gstin ? `<p class="small">GSTIN: ${escapeHtml(settings.business_gstin)}</p>` : ""}
          </div>
          
          <div class="divider"></div>
          
          <div>
            <div class="row">
              <span>Receipt No:</span>
              <span class="bold">${escapeHtml(sale.display_id || "")}</span>
            </div>
            <div class="row">
              <span>Date:</span>
              <span>${new Date(sale.created_at).toLocaleDateString("en-IN", {
                day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
              })}</span>
            </div>
            ${sale.customers ? `<div class="row"><span>Customer:</span><span>${escapeHtml(sale.customers.name || "")}</span></div>` : ""}
            ${sale.stores?.name ? `<div class="row"><span>Store:</span><span>${escapeHtml(sale.stores.name)}</span></div>` : ""}
          </div>
          
          <div class="divider"></div>
          
          <div>
            <div class="row bold">
              <span>Item</span>
              <span>Amount</span>
            </div>
            ${itemsHtml}
          </div>
          
          <div class="divider"></div>
          
          <div>
            <div class="row bold" style="font-size: 14px; padding-top: 4px; border-top: 1px solid #000;">
              <span>TOTAL:</span>
              <span>₹${Number(sale.total_amount).toLocaleString()}</span>
            </div>
            <div class="row">
              <span>Cash:</span>
              <span>₹${Number(sale.cash_amount || 0).toLocaleString()}</span>
            </div>
            <div class="row">
              <span>UPI:</span>
              <span>₹${Number(sale.upi_amount || 0).toLocaleString()}</span>
            </div>
            ${outstandingAmount > 0 ? `<div class="row bold" style="color: #c00;"><span>Balance Due:</span><span>₹${outstandingAmount.toLocaleString()}</span></div>` : ""}
          </div>
          
          <div class="divider"></div>
          
          <div class="center">
            <p class="bold">Thank you for your business!</p>
            ${sale.profiles?.full_name ? `<p class="small">Served by: ${escapeHtml(sale.profiles.full_name)}</p>` : ""}
            <p class="small" style="margin-top: 8px;">This is a computer generated receipt</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(safeContent);
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
  };

  const handleShare = async () => {
    if (!sale) return;

    const receiptText = `
Receipt: ${sale.display_id}
Date: ${new Date(sale.created_at).toLocaleDateString("en-IN")}
Customer: ${sale.customers?.name || "Walk-in"}
${sale.stores?.name ? `Store: ${sale.stores.name}` : ""}

Items:
${sale.sale_items?.map((item: any) => 
  `${item.products?.name} x${item.quantity} = ₹${Number(item.total_amount).toLocaleString()}`
).join("\n")}

Total: ₹${Number(sale.total_amount).toLocaleString()}
Paid: ₹${amountPaid.toLocaleString()}
${outstandingAmount > 0 ? `Due: ₹${outstandingAmount.toLocaleString()}` : ""}

Thank you for your business!
${settings.business_name || ""}
`.trim();

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Receipt ${sale.display_id}`,
          text: receiptText,
        });
      } catch (err) {
        // User cancelled
      }
    } else {
      navigator.clipboard.writeText(receiptText);
      toast.success("Receipt copied to clipboard");
    }
  };

  const handlePDFDownload = async () => {
    if (!sale || !onGeneratePDF) return;
    
    setIsGeneratingPDF(true);
    try {
      // First, try to fetch existing receipt
      const { data: receiptData } = await supabase
        .from("receipts")
        .select("id, pdf_url, receipt_number")
        .eq("sale_id", saleId)
        .maybeSingle();

      if (receiptData?.pdf_url) {
        // Open existing PDF
        window.open(receiptData.pdf_url, "_blank");
        toast.success("Opening receipt PDF");
      } else if (receiptData?.id) {
        // Generate PDF using edge function
        const result = await onGeneratePDF(receiptData.id);
        if (result?.downloadUrl) {
          window.open(result.downloadUrl, "_blank");
          toast.success("Receipt PDF generated");
        } else {
          toast.error("Failed to generate PDF");
        }
      } else {
        toast.error("No receipt found for this sale");
      }
    } catch (error) {
      console.error("PDF download error:", error);
      toast.error("Failed to download PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleResend = async () => {
    if (!sale || !email || !onResendEmail) return;
    
    // Validate email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsResending(true);
    try {
      await onResendEmail(saleId, email);
      toast.success("Receipt sent to " + email);
      setShowResendForm(false);
      setEmail("");
    } catch (error) {
      console.error("Resend error:", error);
      toast.error("Failed to send receipt");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Receipt</span>
            <div className="flex gap-2">
              {allowPdfDownload && (
                <Button 
                  size="icon" 
                  variant="outline" 
                  onClick={handlePDFDownload} 
                  disabled={isLoading || isGeneratingPDF}
                  title="Download PDF"
                >
                  {isGeneratingPDF ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              )}
              <Button size="icon" variant="outline" onClick={handlePrint} disabled={isLoading}>
                <Printer className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" onClick={handleShare} disabled={isLoading}>
                <Share2 className="h-4 w-4" />
              </Button>
              {allowResend && (
                <Button 
                  size="icon" 
                  variant="outline" 
                  onClick={() => setShowResendForm(!showResendForm)}
                  disabled={isLoading}
                  title="Resend via Email"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Resend Form */}
        {showResendForm && (
          <div className="mb-4 p-3 bg-muted rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>Send receipt via email</span>
            </div>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Button 
                size="sm" 
                onClick={handleResend}
                disabled={isResending || !email}
              >
                {isResending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Send"
                )}
              </Button>
            </div>
            {sale?.customers?.email && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setEmail(sale.customers.email)}
              >
                Use customer email: {sale.customers.email}
              </Button>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : sale ? (
          <div ref={printRef} className="font-mono text-sm">
            {/* Header */}
            <div className="text-center mb-4">
              <h1 className="font-bold text-lg">{settings.business_name || "BizManager"}</h1>
              {settings.business_address && (
                <p className="text-xs text-muted-foreground">{settings.business_address}</p>
              )}
              {settings.business_phone && (
                <p className="text-xs text-muted-foreground">Tel: {settings.business_phone}</p>
              )}
              {settings.business_gstin && (
                <p className="text-xs text-muted-foreground">GSTIN: {settings.business_gstin}</p>
              )}
            </div>

            <div className="border-t border-dashed border-gray-400 my-3" />

            {/* Receipt Info */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Receipt No:</span>
                <span className="font-bold">{sale.display_id}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{new Date(sale.created_at).toLocaleDateString("en-IN", {
                  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                })}</span>
              </div>
              {sale.customers && (
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span>{sale.customers.name}</span>
                </div>
              )}
              {sale.stores?.name && (
                <div className="flex justify-between">
                  <span>Store:</span>
                  <span>{sale.stores.name}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-gray-400 my-3" />

            {/* Items */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span>Item</span>
                <span>Amount</span>
              </div>
              {sale.sale_items?.map((item: any) => (
                <div key={item.id} className="text-xs">
                  <div className="flex justify-between">
                    <span className="flex-1 truncate pr-2">{item.products?.name}</span>
                    <span className="font-semibold">₹{Number(item.total_amount).toLocaleString()}</span>
                  </div>
                  <div className="text-muted-foreground text-[10px]">
                    {item.quantity} x ₹{Number(item.unit_price).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-gray-400 my-3" />

            {/* Totals */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between font-bold text-base pt-1 border-t">
                <span>TOTAL:</span>
                <span>₹{Number(sale.total_amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Cash:</span>
                <span>₹{Number(sale.cash_amount || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>UPI:</span>
                <span>₹{Number(sale.upi_amount || 0).toLocaleString()}</span>
              </div>
              {outstandingAmount > 0 && (
                <div className="flex justify-between text-red-600 font-semibold">
                  <span>Balance Due:</span>
                  <span>₹{outstandingAmount.toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-gray-400 my-3" />

            {/* Footer */}
            <div className="text-center text-xs space-y-1">
              <p className="font-semibold">Thank you for your business!</p>
              {sale.profiles?.full_name && (
                <p className="text-muted-foreground">Served by: {sale.profiles.full_name}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-2">
                This is a computer generated receipt
              </p>
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">Receipt not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SaleReceipt;
