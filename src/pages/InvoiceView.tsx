import { useState, useRef } from "react";
import { formatDate } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Printer, Download, ArrowLeft, Share2 } from "lucide-react";
import { toast } from "sonner";

// Number to words converter
const numberToWords = (num: number): string => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  
  const convert = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  };
  
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  
  let result = "Rupees " + convert(rupees);
  if (paise > 0) {
    result += " and " + convert(paise) + " Paise";
  }
  return result + " Only";
};

const InvoiceView = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch invoice
  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          customers(name, phone),
          stores(name),
          warehouses:dispatch_warehouse_id(name, address, city, pincode, phone),
          invoice_items(*),
          invoice_sales(sale_id, sales(display_id))
        `)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch company settings
  const { data: settings = {} } = useQuery({
    queryKey: ["company-settings-invoice"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("key, value");
      const map: Record<string, string> = {};
      data?.forEach((s: any) => { map[s.key] = s.value; });
      return map;
    },
  });

  // Fetch business info for GST details
  const { data: businessInfo } = useQuery({
    queryKey: ["business-info-invoice"],
    queryFn: async () => {
      const { data } = await supabase.from("business_info").select("*").single();
      return data;
    },
  });

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invoice ${invoice?.invoice_number}`,
          text: `Invoice ${invoice?.invoice_number} - ₹${Number(invoice?.total_amount).toLocaleString()}`,
          url: window.location.href,
        });
      } catch (err) {
        // User cancelled share
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Invoice not found</p>
        <Button variant="link" onClick={() => navigate("/invoices")}>
          Back to Invoices
        </Button>
      </div>
    );
  }

  const amountInWords = numberToWords(Number(invoice.total_amount));

  const renderPrintCopy = (copyTitle: string, isLast: boolean) => (
    <section className={`mx-auto max-w-4xl bg-white p-8 text-black ${isLast ? "" : "print:break-after-page"}`}>
      <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-black">
        <div>
          <h1 className="text-2xl font-bold">{businessInfo?.name || settings.business_name || "Your Company"}</h1>
          <p className="text-sm whitespace-pre-line">
            {businessInfo?.address || settings.business_address}
            {(businessInfo?.city || settings.business_city) && `, ${businessInfo?.city || settings.business_city}`}
            {(businessInfo?.pincode || settings.business_pincode) && ` - ${businessInfo?.pincode || settings.business_pincode}`}
          </p>
          {(businessInfo?.phone || settings.business_phone) && <p className="text-sm">Phone: {businessInfo?.phone || settings.business_phone}</p>}
          {(businessInfo?.email || settings.business_email) && <p className="text-sm">Email: {businessInfo?.email || settings.business_email}</p>}
          {(businessInfo?.gstin || settings.business_gstin) && <p className="text-sm font-mono font-semibold">GSTIN: {businessInfo?.gstin || settings.business_gstin}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-3xl font-bold text-primary">TAX INVOICE</h2>
          <p className="font-mono text-lg font-semibold mt-2">{invoice.invoice_number}</p>
          <p className="text-sm">Date: {formatDate(invoice.invoice_date)}</p>
          <Badge variant="outline" className="mt-2">{copyTitle}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-6">
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground mb-2">BILL TO</h3>
          <p className="font-semibold">{invoice.customer_name}</p>
          {invoice.stores?.name && <p className="text-sm">{invoice.stores.name}</p>}
          {invoice.customer_address && <p className="text-sm whitespace-pre-line">{invoice.customer_address}</p>}
          {invoice.customer_phone && <p className="text-sm">Phone: {invoice.customer_phone}</p>}
          {invoice.customer_gstin && <p className="text-sm font-mono">GSTIN: {invoice.customer_gstin}</p>}
        </div>
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground mb-2">DISPATCH FROM</h3>
          {invoice.warehouses ? (
            <>
              <p className="font-semibold">{invoice.warehouses.name}</p>
              <p className="text-sm whitespace-pre-line">
                {invoice.warehouses.address}
                {invoice.warehouses.city && `, ${invoice.warehouses.city}`}
                {invoice.warehouses.pincode && ` - ${invoice.warehouses.pincode}`}
              </p>
              {invoice.warehouses.phone && <p className="text-sm">Phone: {invoice.warehouses.phone}</p>}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>
      </div>

      <table className="w-full mb-6 text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-left p-2 border">#</th>
            <th className="text-left p-2 border">Description</th>
            <th className="text-left p-2 border">HSN</th>
            <th className="text-right p-2 border">Qty</th>
            <th className="text-right p-2 border">Rate</th>
            <th className="text-right p-2 border">Taxable</th>
            <th className="text-right p-2 border">GST %</th>
            <th className="text-right p-2 border">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.invoice_items?.map((item: any, index: number) => {
            const lineTotal = Number(item.total_amount ?? item.quantity * item.unit_price);
            const gstRate = item.gst_rate || item.tax_rate || 0;
            const taxableAmt = item.taxable_amount || (gstRate > 0 ? lineTotal / (1 + gstRate / 100) : lineTotal);
            return (
              <tr key={item.id}>
                <td className="p-2 border">{index + 1}</td>
                <td className="p-2 border">{item.product_name}</td>
                <td className="p-2 border font-mono text-xs">{item.hsn_code || "—"}</td>
                <td className="p-2 border text-right">{item.quantity}</td>
                <td className="p-2 border text-right">₹{Number(item.unit_price).toLocaleString()}</td>
                <td className="p-2 border text-right">₹{Number(taxableAmt).toLocaleString()}</td>
                <td className="p-2 border text-right">{gstRate}%</td>
                <td className="p-2 border text-right font-semibold">₹{Number(lineTotal).toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex justify-end mb-6">
        <div className="w-80 border rounded-lg overflow-hidden">
          <div className="flex justify-between py-2 px-3 bg-gray-50 border-b">
            <span>Taxable Amount</span>
            <span className="font-medium">₹{Number(invoice.taxable_amount || invoice.subtotal).toLocaleString()}</span>
          </div>
          {invoice.is_inter_state ? (
            <div className="flex justify-between py-2 px-3 border-b">
              <span>IGST</span>
              <span>₹{Number(invoice.igst_amount || invoice.tax_amount).toLocaleString()}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between py-2 px-3 border-b">
                <span>CGST</span>
                <span>₹{Number(invoice.cgst_amount || (invoice.tax_amount / 2)).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 px-3 border-b">
                <span>SGST</span>
                <span>₹{Number(invoice.sgst_amount || (invoice.tax_amount / 2)).toLocaleString()}</span>
              </div>
            </>
          )}
          {Number(invoice.discount_amount) > 0 && (
            <div className="flex justify-between py-2 px-3 text-green-600 border-b">
              <span>Discount</span>
              <span>-₹{Number(invoice.discount_amount).toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between py-3 px-3 bg-primary/10 font-bold text-lg">
            <span>Grand Total</span>
            <span>₹{Number(invoice.total_amount).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 p-3 rounded">
        <p className="text-sm"><span className="font-semibold">Amount in Words: </span>{amountInWords}</p>
      </div>
    </section>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header - Hide in print */}
      <div className="print:hidden">
        <PageHeader
          title={`Invoice ${invoice.invoice_number}`}
          subtitle={invoice.status === "cancelled" ? "This invoice has been cancelled" : undefined}
          backButton={{ label: "Back to Invoices", onClick: () => navigate("/invoices") }}
        />
        
        <div className="flex gap-2 mt-4">
          <Button onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Button variant="outline" onClick={handleShare}>
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
        </div>
      </div>

      {/* Invoice Template */}
      <Card className="max-w-4xl mx-auto print:hidden">
        <CardContent className="p-8 print:p-4" ref={printRef}>
          {/* Cancelled Watermark */}
          {invoice.status === "cancelled" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-red-200 text-8xl font-bold rotate-[-30deg] opacity-50">
                CANCELLED
              </span>
            </div>
          )}

          {/* Header */}
          <div className="flex justify-between items-start mb-8 pb-4 border-b-2 border-gray-800">
            <div>
              {settings.business_logo_url && (
                <img src={settings.business_logo_url} alt="Logo" className="h-16 mb-2" />
              )}
              <h1 className="text-2xl font-bold">{businessInfo?.name || settings.business_name || "Your Company"}</h1>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {businessInfo?.address || settings.business_address}
                {(businessInfo?.city || settings.business_city) && `, ${businessInfo?.city || settings.business_city}`}
                {(businessInfo?.pincode || settings.business_pincode) && ` - ${businessInfo?.pincode || settings.business_pincode}`}
              </p>
              {(businessInfo?.phone || settings.business_phone) && <p className="text-sm">Phone: {businessInfo?.phone || settings.business_phone}</p>}
              {(businessInfo?.email || settings.business_email) && <p className="text-sm">Email: {businessInfo?.email || settings.business_email}</p>}
              {(businessInfo?.gstin || settings.business_gstin) && (
                <p className="text-sm font-mono font-semibold">GSTIN: {businessInfo?.gstin || settings.business_gstin}</p>
              )}
              {businessInfo?.pan && <p className="text-sm font-mono">PAN: {businessInfo.pan}</p>}
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-bold text-primary">TAX INVOICE</h2>
              <p className="font-mono text-lg font-semibold mt-2">{invoice.invoice_number}</p>
              <p className="text-sm text-muted-foreground">
                Date: {formatDate(invoice.invoice_date)}
              </p>
              {invoice.is_inter_state !== undefined && (
                <Badge variant={invoice.is_inter_state ? "secondary" : "outline"} className="mt-2">
                  {invoice.is_inter_state ? "Inter-State (IGST)" : "Intra-State (CGST+SGST)"}
                </Badge>
              )}
            </div>
          </div>

          {/* Bill To / Ship From */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">BILL TO</h3>
              <p className="font-semibold">{invoice.customer_name}</p>
              {invoice.stores?.name && <p className="text-sm">{invoice.stores.name}</p>}
              {invoice.customer_address && <p className="text-sm whitespace-pre-line">{invoice.customer_address}</p>}
              {invoice.customer_phone && <p className="text-sm">Phone: {invoice.customer_phone}</p>}
              {invoice.customer_gstin && <p className="text-sm font-mono">GSTIN: {invoice.customer_gstin}</p>}
            </div>
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">DISPATCH FROM</h3>
              {invoice.warehouses ? (
                <>
                  <p className="font-semibold">{invoice.warehouses.name}</p>
                  <p className="text-sm whitespace-pre-line">
                    {invoice.warehouses.address}
                    {invoice.warehouses.city && `, ${invoice.warehouses.city}`}
                    {invoice.warehouses.pincode && ` - ${invoice.warehouses.pincode}`}
                  </p>
                  {invoice.warehouses.phone && <p className="text-sm">Phone: {invoice.warehouses.phone}</p>}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full mb-6 text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left p-2 border">#</th>
                <th className="text-left p-2 border">Description</th>
                <th className="text-left p-2 border">HSN</th>
                <th className="text-right p-2 border">Qty</th>
                <th className="text-right p-2 border">Rate</th>
                <th className="text-right p-2 border">Taxable</th>
                <th className="text-right p-2 border">GST %</th>
                <th className="text-right p-2 border">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.invoice_items?.map((item: any, index: number) => {
                const lineTotal = item.quantity * item.unit_price;
                const gstRate = item.gst_rate || item.tax_rate || 0;
                const taxableAmt = item.taxable_amount || (gstRate > 0 ? lineTotal / (1 + gstRate / 100) : lineTotal);
                return (
                  <tr key={item.id}>
                    <td className="p-2 border">{index + 1}</td>
                    <td className="p-2 border">{item.product_name}</td>
                    <td className="p-2 border font-mono text-xs">{item.hsn_code || "—"}</td>
                    <td className="p-2 border text-right">{item.quantity}</td>
                    <td className="p-2 border text-right">₹{Number(item.unit_price).toLocaleString()}</td>
                    <td className="p-2 border text-right">₹{Number(taxableAmt).toLocaleString()}</td>
                    <td className="p-2 border text-right">{gstRate}%</td>
                    <td className="p-2 border text-right font-semibold">₹{Number(lineTotal).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* GST Summary */}
          <div className="flex justify-end mb-8">
            <div className="w-80 border rounded-lg overflow-hidden">
              <div className="flex justify-between py-2 px-3 bg-gray-50 border-b">
                <span>Taxable Amount</span>
                <span className="font-medium">₹{Number(invoice.taxable_amount || invoice.subtotal).toLocaleString()}</span>
              </div>
              
              {/* Show CGST/SGST or IGST based on is_inter_state */}
              {invoice.is_inter_state ? (
                <div className="flex justify-between py-2 px-3 border-b">
                  <span>IGST {invoice.igst_rate ? `@ ${invoice.igst_rate}%` : ""}</span>
                  <span>₹{Number(invoice.igst_amount || invoice.tax_amount).toLocaleString()}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between py-2 px-3 border-b">
                    <span>CGST {invoice.cgst_rate ? `@ ${invoice.cgst_rate}%` : ""}</span>
                    <span>₹{Number(invoice.cgst_amount || (invoice.tax_amount / 2)).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2 px-3 border-b">
                    <span>SGST {invoice.sgst_rate ? `@ ${invoice.sgst_rate}%` : ""}</span>
                    <span>₹{Number(invoice.sgst_amount || (invoice.tax_amount / 2)).toLocaleString()}</span>
                  </div>
                </>
              )}
              
              {Number(invoice.discount_amount) > 0 && (
                <div className="flex justify-between py-2 px-3 text-green-600 border-b">
                  <span>Discount</span>
                  <span>-₹{Number(invoice.discount_amount).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between py-3 px-3 bg-primary/10 font-bold text-lg">
                <span>Grand Total</span>
                <span>₹{Number(invoice.total_amount).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Amount in Words */}
          <div className="bg-gray-50 p-3 rounded mb-8">
            <p className="text-sm">
              <span className="font-semibold">Amount in Words: </span>
              {amountInWords}
            </p>
          </div>

          {/* Bank Details */}
          {(businessInfo?.bank_name || settings.bank_name) && (
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="font-semibold text-sm text-muted-foreground mb-2">BANK DETAILS</h3>
                <p className="text-sm">Bank: {businessInfo?.bank_name || settings.bank_name}</p>
                <p className="text-sm font-mono">A/C No: {businessInfo?.bank_account_number || settings.bank_account_number}</p>
                <p className="text-sm font-mono">IFSC: {businessInfo?.bank_ifsc || settings.bank_ifsc}</p>
                {(businessInfo?.bank_branch || settings.bank_branch) && <p className="text-sm">Branch: {businessInfo?.bank_branch || settings.bank_branch}</p>}
              </div>
              <div className="text-right">
                <h3 className="font-semibold text-sm text-muted-foreground mb-2">FOR {(businessInfo?.name || settings.business_name || "").toUpperCase()}</h3>
                <div className="h-16"></div>
                <p className="text-sm">Authorized Signatory</p>
              </div>
            </div>
          )}

          {/* Terms */}
          {settings.invoice_terms && (
            <div className="border-t pt-4">
              <h3 className="font-semibold text-sm text-muted-foreground mb-1">TERMS & CONDITIONS</h3>
              <p className="text-xs text-muted-foreground whitespace-pre-line">{settings.invoice_terms}</p>
            </div>
          )}

          {/* Linked Sales */}
          {invoice.invoice_sales?.length > 0 && (
            <div className="border-t pt-4 mt-4 print:hidden">
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">LINKED SALES</h3>
              <div className="flex flex-wrap gap-2">
                {invoice.invoice_sales.map((link: any) => (
                  <Badge key={link.sale_id} variant="outline" className="font-mono">
                    {link.sales?.display_id || link.sale_id.slice(0, 8)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {invoice.notes && (
            <div className="border-t pt-4 mt-4">
              <h3 className="font-semibold text-sm text-muted-foreground mb-1">NOTES</h3>
              <p className="text-sm whitespace-pre-line">{invoice.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="hidden print:block print:space-y-8">
        {renderPrintCopy("Original Copy", false)}
        {renderPrintCopy("Customer Copy", true)}
      </div>

      <style>{`
        @media print {
          @page { margin: 12mm; }
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
        }
      `}</style>
    </div>
  );
};

export default InvoiceView;
