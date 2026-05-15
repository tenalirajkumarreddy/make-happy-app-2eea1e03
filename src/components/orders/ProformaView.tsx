import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { toast } from "sonner";

interface ProformaItem {
  product_name: string;
  quantity: number;
  unit_price: number;
}

interface ProformaData {
  id: string;
  display_id: string;
  order_id: string;
  store_name: string;
  customer_name: string;
  customer_phone: string;
  items: ProformaItem[];
  total_amount: number;
  status: string;
  created_at: string;
}

function invoiceHTML(proforma: ProformaData, copyLabel: string) {
  const rows = proforma.items.map((item, i) => `
    <tr${i % 2 === 0 ? ' style="background:#f8fafc"' : ''}>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#1f2937">${item.product_name}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#1f2937;text-align:center">${item.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#1f2937;text-align:right">₹${item.unit_price.toLocaleString("en-IN")}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#1f2937;text-align:right">₹${(item.quantity * item.unit_price).toLocaleString("en-IN")}</td>
    </tr>
  `).join("");

  const total = proforma.total_amount;
  const totalWords = "Rupees " + (total > 0 ? total.toLocaleString("en-IN") : "Zero") + " Only";

  return `
    <div style="width:100%;max-width:800px;margin:0 auto;padding:0;font-family:'Inter','Segoe UI',Arial,sans-serif;color:#1f2937;box-sizing:border-box;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
      <!-- Watermark -->
      <div style="position:absolute;top:45%;left:50%;transform:translate(-50%,-50%) rotate(-25deg);font-size:70px;font-weight:900;color:${copyLabel === "ORIGINAL" ? "rgba(37,99,235,0.04)" : "rgba(220,38,38,0.04)"};letter-spacing:8px;pointer-events:none;white-space:nowrap">${copyLabel}</div>

      <!-- Top Border Accent -->
      <div style="height:5px;background:linear-gradient(90deg,#1e40af,#3b82f6,#60a5fa)"></div>

      <div style="padding:35px 40px 30px;position:relative">

        <!-- Header: Company + Invoice Title -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px">
          <div>
            <h2 style="margin:0 0 2px;font-size:20px;font-weight:800;color:#1e3a5f;letter-spacing:-0.3px">Your Company Name</h2>
            <p style="margin:0;font-size:10px;color:#94a3b8">123 Business Street, City - 000000</p>
            <p style="margin:1px 0 0;font-size:10px;color:#94a3b8">Phone: +91 98765 43210 | Email: company@email.com</p>
            <p style="margin:1px 0 0;font-size:10px;color:#94a3b8">GSTIN: 00AAAAA0000A1Z0</p>
          </div>
          <div style="text-align:right">
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 16px">
              <p style="margin:0 0 2px;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:600">Proforma Invoice</p>
              <p style="margin:0;font-size:16px;font-weight:800;color:#1e40af;letter-spacing:-0.3px">${proforma.display_id}</p>
              <p style="margin:2px 0 0;font-size:10px;color:#64748b">Date: ${new Date(proforma.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
            </div>
          </div>
        </div>

        <!-- Billing & Customer Details -->
        <div style="display:flex;gap:25px;margin-bottom:25px">
          <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;background:#f8fafc">
            <p style="margin:0 0 6px;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;border-bottom:1px solid #e5e7eb;padding-bottom:6px">Bill To</p>
            <p style="margin:0;font-size:13px;font-weight:600;color:#1f2937">${proforma.customer_name}</p>
            <p style="margin:1px 0 0;font-size:11px;color:#64748b">Phone: ${proforma.customer_phone}</p>
          </div>
          <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;background:#f8fafc">
            <p style="margin:0 0 6px;font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;border-bottom:1px solid #e5e7eb;padding-bottom:6px">Ship To</p>
            <p style="margin:0;font-size:13px;font-weight:600;color:#1f2937">${proforma.store_name}</p>
          </div>
        </div>

        <!-- Items Table -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:linear-gradient(135deg,#1e40af,#3b82f6)">
              <th style="padding:11px 14px;font-size:10px;color:#fff;text-align:left;text-transform:uppercase;letter-spacing:0.8px;font-weight:600">#</th>
              <th style="padding:11px 14px;font-size:10px;color:#fff;text-align:left;text-transform:uppercase;letter-spacing:0.8px;font-weight:600">Description</th>
              <th style="padding:11px 14px;font-size:10px;color:#fff;text-align:center;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;width:70px">Qty</th>
              <th style="padding:11px 14px;font-size:10px;color:#fff;text-align:right;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;width:120px">Rate</th>
              <th style="padding:11px 14px;font-size:10px;color:#fff;text-align:right;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;width:130px">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows || "<tr><td colspan='5' style='padding:30px;text-align:center;color:#94a3b8;font-size:13px'>No items</td></tr>"}
          </tbody>
        </table>

        <!-- Summary -->
        <div style="display:flex;justify-content:flex-end;margin-bottom:20px">
          <div style="width:320px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
            <div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e5e7eb;background:#f8fafc">
              <span style="font-size:12px;color:#64748b">Subtotal</span>
              <span style="font-size:12px;font-weight:600;color:#1f2937">₹${total.toLocaleString("en-IN")}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e5e7eb;background:#f8fafc">
              <span style="font-size:12px;color:#64748b">GST (0%)</span>
              <span style="font-size:12px;font-weight:600;color:#1f2937">₹0</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:12px 14px;background:#1e40af;color:#fff">
              <span style="font-size:13px;font-weight:700">Total Amount</span>
              <span style="font-size:15px;font-weight:800">₹${total.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>

        <!-- Amount in Words -->
        <div style="margin-bottom:15px;padding:10px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px">
          <p style="margin:0;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Amount in Words</p>
          <p style="margin:3px 0 0;font-size:13px;font-weight:600;color:#1f2937">${totalWords}</p>
        </div>

        <!-- Terms & Footer -->
        <div style="border-top:1px solid #e5e7eb;padding-top:14px">
          <div style="display:flex;justify-content:space-between;font-size:9px;color:#94a3b8">
            <div>
              <p style="margin:0 0 2px;font-weight:600;color:#64748b;font-size:10px">Terms & Conditions:</p>
              <p style="margin:0">1. This is a proforma invoice — not a tax invoice.</p>
              <p style="margin:0">2. Prices are subject to change without notice.</p>
              <p style="margin:0">3. Payment terms: As agreed.</p>
            </div>
            <div style="text-align:right">
              <p style="margin:0 0 2px;font-weight:600;color:#1e40af;font-size:11px">${proforma.display_id}</p>
              <p style="margin:0;font-family:monospace;font-size:9px;color:#94a3b8">UID: ${proforma.display_id}-${proforma.id.slice(0,6)}</p>
            </div>
          </div>
          <div style="margin-top:12px;text-align:center;font-size:8px;color:#cbd5e1;border-top:1px solid #f1f5f9;padding-top:8px">
            This is a computer-generated document. No signature required. | ${proforma.display_id}
          </div>
        </div>

      </div>
    </div>
  `;
}

export function ProformaView({ proforma }: { proforma: ProformaData }) {
  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) { toast.error("Pop-up blocked. Please allow pop-ups for printing."); return; }

    win.document.write(`
      <html>
        <head>
          <title>Proforma - ${proforma.display_id}</title>
          <style>
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              @page { margin: 5mm; size: A4; }
            }
            body { margin:0; padding:20px 0; background:#f1f5f9; }
          </style>
        </head>
        <body onload="window.print()">
          ${invoiceHTML(proforma, "ORIGINAL")}
          <div style="page-break-before:always"></div>
          ${invoiceHTML(proforma, "CUSTOMER COPY")}
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-primary font-mono">#{proforma.display_id}</p>
          <p className="text-xs text-muted-foreground">{new Date(proforma.created_at).toLocaleDateString()}</p>
        </div>
        <Button size="sm" onClick={handlePrint}>
          <Printer className="h-3.5 w-3.5 mr-1.5" /> Print Proforma
        </Button>
      </div>
      <div className="border rounded-lg overflow-hidden text-sm">
        <table className="w-full">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider w-8">#</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider">Product</th>
              <th className="text-center px-3 py-2 text-[10px] font-semibold uppercase tracking-wider w-16">Qty</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider w-24">Rate</th>
              <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider w-28">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {proforma.items.map((item, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                <td className="px-3 py-2 text-muted-foreground text-xs">{i + 1}</td>
                <td className="px-3 py-2 text-foreground">{item.product_name}</td>
                <td className="px-3 py-2 text-center text-muted-foreground">{item.quantity}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">₹{item.unit_price.toLocaleString("en-IN")}</td>
                <td className="px-3 py-2 text-right font-semibold text-foreground">₹{(item.quantity * item.unit_price).toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-primary/5">
              <td colSpan={4} className="px-3 py-2 text-right font-bold text-primary">TOTAL</td>
              <td className="px-3 py-2 text-right font-bold text-primary">₹{proforma.total_amount.toLocaleString("en-IN")}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
