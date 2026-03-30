import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";

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

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to print");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt ${sale?.display_id}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              font-size: 12px; 
              padding: 10px;
              max-width: 80mm;
            }
            .center { text-align: center; }
            .right { text-align: right; }
            .bold { font-weight: bold; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .item-row { display: flex; justify-content: space-between; margin: 4px 0; }
            .total-row { display: flex; justify-content: space-between; font-weight: bold; margin-top: 8px; }
            h1 { font-size: 16px; margin-bottom: 4px; }
            h2 { font-size: 14px; margin-bottom: 8px; }
            .small { font-size: 10px; color: #666; }
          </style>
        </head>
        <body>
          ${content.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
  };

  const handleShare = async () => {
    if (!sale) return;

    const receiptText = `
Receipt: ${sale.display_id}
Date: ${new Date(sale.sale_date).toLocaleDateString("en-IN")}
Customer: ${sale.customers?.name || "Walk-in"}
${sale.stores?.name ? `Store: ${sale.stores.name}` : ""}

Items:
${sale.sale_items?.map((item: any) => 
  `${item.products?.name} x${item.quantity} = ₹${Number(item.total_amount).toLocaleString()}`
).join("\n")}

Total: ₹${Number(sale.total_amount).toLocaleString()}
Paid: ₹${Number(sale.amount_collected || 0).toLocaleString()}
${Number(sale.outstanding) > 0 ? `Due: ₹${Number(sale.outstanding).toLocaleString()}` : ""}

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
                <span>{new Date(sale.sale_date).toLocaleDateString("en-IN", {
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
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₹{Number(sale.subtotal || sale.total_amount).toLocaleString()}</span>
              </div>
              {Number(sale.discount_amount) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount:</span>
                  <span>-₹{Number(sale.discount_amount).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1 border-t">
                <span>TOTAL:</span>
                <span>₹{Number(sale.total_amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Paid:</span>
                <span>₹{Number(sale.amount_collected || 0).toLocaleString()}</span>
              </div>
              {Number(sale.outstanding) > 0 && (
                <div className="flex justify-between text-red-600 font-semibold">
                  <span>Balance Due:</span>
                  <span>₹{Number(sale.outstanding).toLocaleString()}</span>
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
