import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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

interface TemplateItem {
  product_name?: string;
  description?: string;
  hsn_code?: string;
  quantity: number;
  unit_price: number;
  gst_rate?: number;
  tax_rate?: number;
  taxable_amount?: number;
  total_amount?: number;
}

interface InvoiceTemplateProps {
  // Business info
  businessName?: string;
  businessAddress?: string;
  businessCity?: string;
  businessPincode?: string;
  businessPhone?: string;
  businessEmail?: string;
  businessGstin?: string;
  businessPan?: string;
  businessLogoUrl?: string;
  
  // Invoice info
  invoiceNumber: string;
  invoiceDate: string;
  invoiceType?: "proforma" | "tax" | "credit_note";
  isInterState?: boolean;
  status?: string;
  
  // Customer info
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerGstin?: string;
  storeName?: string;
  
  // Dispatch info
  warehouseName?: string;
  warehouseAddress?: string;
  warehouseCity?: string;
  warehousePincode?: string;
  warehousePhone?: string;
  
  // Items
  items: TemplateItem[];
  
  // Totals
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  
  // Additional
  notes?: string;
  terms?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankBranch?: string;
  
  // Copy label (for print)
  copyTitle?: string;
  showPrintCopy?: boolean;
}

export function InvoiceTemplate({
  businessName,
  businessAddress,
  businessCity,
  businessPincode,
  businessPhone,
  businessEmail,
  businessGstin,
  businessPan,
  businessLogoUrl,
  invoiceNumber,
  invoiceDate,
  invoiceType = "tax",
  isInterState = false,
  status,
  customerName,
  customerAddress,
  customerPhone,
  customerGstin,
  storeName,
  warehouseName,
  warehouseAddress,
  warehouseCity,
  warehousePincode,
  warehousePhone,
  items,
  subtotal,
  taxAmount,
  discountAmount,
  totalAmount,
  cgstAmount,
  sgstAmount,
  igstAmount,
  cgstRate,
  sgstRate,
  igstRate,
  notes,
  terms,
  bankName,
  bankAccountNumber,
  bankIfsc,
  bankBranch,
  copyTitle = "Original Copy",
  showPrintCopy = false,
}: InvoiceTemplateProps) {
  const amountInWords = numberToWords(totalAmount);
  const displayGstRate = cgstRate || sgstRate || igstRate || (taxAmount > 0 && subtotal > 0 ? Math.round((taxAmount / subtotal) * 100) : 18);

  const renderContent = () => (
    <>
      {/* Header */}
      <div className="flex justify-between items-start mb-8 pb-4 border-b-2 border-gray-800">
        <div>
          {businessLogoUrl && (
            <img src={businessLogoUrl} alt="Logo" className="h-16 mb-2" />
          )}
          <h1 className="text-2xl font-bold">{businessName || "Your Company"}</h1>
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {businessAddress}
            {businessCity && `, ${businessCity}`}
            {businessPincode && ` - ${businessPincode}`}
          </p>
          {businessPhone && <p className="text-sm">Phone: {businessPhone}</p>}
          {businessEmail && <p className="text-sm">Email: {businessEmail}</p>}
          {businessGstin && (
            <p className="text-sm font-mono font-semibold">GSTIN: {businessGstin}</p>
          )}
          {businessPan && <p className="text-sm font-mono">PAN: {businessPan}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-3xl font-bold text-primary">
            {invoiceType === "proforma" ? "PROFORMA INVOICE" : 
             invoiceType === "credit_note" ? "CREDIT NOTE" : "TAX INVOICE"}
          </h2>
          <p className="font-mono text-lg font-semibold mt-2">{invoiceNumber}</p>
          <p className="text-sm text-muted-foreground">
            Date: {formatDate(invoiceDate)}
          </p>
          {isInterState !== undefined && (
            <Badge variant={isInterState ? "secondary" : "outline"} className="mt-2">
              {isInterState ? "Inter-State (IGST)" : "Intra-State (CGST+SGST)"}
            </Badge>
          )}
        </div>
      </div>

      {/* Bill To / Ship From */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground mb-2">BILL TO</h3>
          <p className="font-semibold">{customerName}</p>
          {storeName && <p className="text-sm">{storeName}</p>}
          {customerAddress && <p className="text-sm whitespace-pre-line">{customerAddress}</p>}
          {customerPhone && <p className="text-sm">Phone: {customerPhone}</p>}
          {customerGstin && <p className="text-sm font-mono">GSTIN: {customerGstin}</p>}
        </div>
        <div>
          <h3 className="font-semibold text-sm text-muted-foreground mb-2">DISPATCH FROM</h3>
          {warehouseName ? (
            <>
              <p className="font-semibold">{warehouseName}</p>
              <p className="text-sm whitespace-pre-line">
                {warehouseAddress}
                {warehouseCity && `, ${warehouseCity}`}
                {warehousePincode && ` - ${warehousePincode}`}
              </p>
              {warehousePhone && <p className="text-sm">Phone: {warehousePhone}</p>}
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
          {items.map((item, index) => {
            const lineTotal = item.total_amount ?? item.quantity * item.unit_price;
            const gstRate = item.gst_rate || item.tax_rate || 0;
            const taxableAmt = item.taxable_amount || (gstRate > 0 ? lineTotal / (1 + gstRate / 100) : lineTotal);
            return (
              <tr key={index}>
                <td className="p-2 border">{index + 1}</td>
                <td className="p-2 border">{item.product_name || item.description}</td>
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
            <span className="font-medium">₹{Number(subtotal).toLocaleString()}</span>
          </div>
          
          {isInterState ? (
            <div className="flex justify-between py-2 px-3 border-b">
              <span>IGST {igstRate ? `@ ${igstRate}%` : ""}</span>
              <span>₹{Number(igstAmount || taxAmount).toLocaleString()}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between py-2 px-3 border-b">
                <span>CGST {cgstRate ? `@ ${cgstRate}%` : `@ ${displayGstRate / 2}%`}</span>
                <span>₹{Number(cgstAmount || (taxAmount / 2)).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 px-3 border-b">
                <span>SGST {sgstRate ? `@ ${sgstRate}%` : `@ ${displayGstRate / 2}%`}</span>
                <span>₹{Number(sgstAmount || (taxAmount / 2)).toLocaleString()}</span>
              </div>
            </>
          )}
          
          {Number(discountAmount) > 0 && (
            <div className="flex justify-between py-2 px-3 text-green-600 border-b">
              <span>Discount</span>
              <span>-₹{Number(discountAmount).toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between py-3 px-3 bg-primary/10 font-bold text-lg">
            <span>Grand Total</span>
            <span>₹{Number(totalAmount).toLocaleString()}</span>
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
      {bankName && (
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="font-semibold text-sm text-muted-foreground mb-2">BANK DETAILS</h3>
            <p className="text-sm">Bank: {bankName}</p>
            {bankAccountNumber && <p className="text-sm font-mono">A/C No: {bankAccountNumber}</p>}
            {bankIfsc && <p className="text-sm font-mono">IFSC: {bankIfsc}</p>}
            {bankBranch && <p className="text-sm">Branch: {bankBranch}</p>}
          </div>
          <div className="text-right">
            <h3 className="font-semibold text-sm text-muted-foreground mb-2">FOR {(businessName || "").toUpperCase()}</h3>
            <div className="h-16"></div>
            <p className="text-sm">Authorized Signatory</p>
          </div>
        </div>
      )}

      {/* Terms */}
      {terms && (
        <div className="border-t pt-4">
          <h3 className="font-semibold text-sm text-muted-foreground mb-1">TERMS & CONDITIONS</h3>
          <p className="text-xs text-muted-foreground whitespace-pre-line">{terms}</p>
        </div>
      )}

      {/* Notes */}
      {notes && (
        <div className="border-t pt-4 mt-4">
          <h3 className="font-semibold text-sm text-muted-foreground mb-1">NOTES</h3>
          <p className="text-sm whitespace-pre-line">{notes}</p>
        </div>
      )}
    </>
  );

  return (
    <div className="bg-white text-black p-8 rounded-lg">
      {renderContent()}
      
      {showPrintCopy && (
        <div className="print:break-before-page mt-8 pt-8 border-t-2 border-dashed border-gray-400">
          <Badge variant="outline" className="mb-4">Customer Copy</Badge>
          {renderContent()}
        </div>
      )}
    </div>
  );
}
