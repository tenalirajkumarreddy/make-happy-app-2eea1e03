import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";

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
}

export const SaleReceipt = ({ saleId, open, onClose }: SaleReceiptProps) => {
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch sale details
  const { data: sale, isLoading } = useQuery({
    queryKey: ["sale-receipt", saleId],
    queryFn: async () => {
      const { data: saleData, error: saleError } = await supabase
        .from("sales")
        .select("*")
        .eq("id", saleId)
        .single();
      
      if (saleError) throw saleError;
      
      // Fetch related data separately
      const [storeRes, customerRes, itemsRes, userRes] = await Promise.all([
        saleData.store_id ? supabase.from("stores").select("name, address").eq("id", saleData.store_id).single() : Promise.resolve({ data: null }),
        saleData.customer_id ? supabase.from("customers").select("name, phone").eq("id", saleData.customer_id).single() : Promise.resolve({ data: null }),
        supabase.from("sale_items").select("*, products(name, unit)").eq("sale_id", saleId),
        saleData.recorded_by ? supabase.from("profiles").select("full_name").eq("id", saleData.recorded_by).single() : Promise.resolve({ data: null }),
      ]);
      
      return {
        ...saleData,
        stores: storeRes.data,
        customers: customerRes.data,
        recorded_by: userRes.data,
        sale_items: itemsRes.data || [],
      };
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

  // Calculate amounts - show SNAPSHOT balance (old_outstanding + outstanding_amount = Total Due after this sale)
  const amountPaid = Number(sale?.cash_amount || 0) + Number(sale?.upi_amount || 0);
  const previousBalance = Number(sale?.old_outstanding || 0); // Balance BEFORE this sale
  const totalDue = previousBalance + Number(sale?.outstanding_amount || 0); // Balance AFTER this sale (snapshot)

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
          <span style="font-weight: 600;">₹${Number(item.total_price || 0).toLocaleString()}</span>
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
            ${previousBalance > 0 ? `<div class="row"><span>Previous Balance:</span><span>₹${previousBalance.toLocaleString()}</span></div>` : ""}
${totalDue > previousBalance ? `<div class="row bold" style="color: #c00;"><span>Total Due:</span><span>₹${totalDue.toLocaleString()}</span></div>` : ""}
          </div>
          
          <div class="divider"></div>
          
          <div class="center">
            <p class="bold">Thank you for your business!</p>
            ${sale.recorded_by?.full_name ? `<p class="small">Served by: ${escapeHtml(sale.recorded_by.full_name)}</p>` : ""}
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
  `${item.products?.name} x${item.quantity} = ₹${Number(item.total_price || 0).toLocaleString()}`
).join("\n")}

Total: ₹${Number(sale.total_amount).toLocaleString()}
Paid: ₹${amountPaid.toLocaleString()}
${previousBalance > 0 ? `Previous Balance: ₹${previousBalance.toLocaleString()}` : ""}
${totalDue > previousBalance ? `Total Due: ₹${totalDue.toLocaleString()}` : ""}

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

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Receipt</span>
            <div className="flex gap-2">
              <Button size="icon" variant="outline" onClick={handlePrint} disabled={isLoading}>
                <Printer className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" onClick={handleShare} disabled={isLoading}>
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

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
                    <span className="flex-1 truncate pr-2">{item.products?.name || "Unknown"}</span>
                    <span className="font-semibold">₹{Number(item.total_price || 0).toLocaleString()}</span>
                  </div>
                  <div className="text-muted-foreground text-[10px]">
                    {item.quantity} x ₹{Number(item.unit_price || 0).toLocaleString()}
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
              {previousBalance > 0 && (
                <div className="flex justify-between">
                  <span>Previous Balance:</span>
                  <span>₹{previousBalance.toLocaleString()}</span>
                </div>
              )}
              {totalDue > previousBalance && (
                <div className="flex justify-between text-red-600 font-semibold">
                  <span>Total Due:</span>
                  <span>₹{totalDue.toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-gray-400 my-3" />

            {/* Footer */}
            <div className="text-center text-xs space-y-1">
              <p className="font-semibold">Thank you for your business!</p>
              {sale.recorded_by?.full_name && (
                <p className="text-muted-foreground">Served by: {sale.recorded_by.full_name}</p>
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
