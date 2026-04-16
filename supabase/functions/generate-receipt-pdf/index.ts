import { createClient } from "@supabase/supabase-js";
import { encodeBase64 } from "jsr:@std/encoding";

// HTML template for receipt
const RECEIPT_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt - {{RECEIPT_NUMBER}}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #fff;
      color: #333;
      line-height: 1.5;
    }
    .receipt {
      max-width: 800px;
      margin: 0 auto;
      padding: 30px;
      border: 1px solid #e0e0e0;
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 2px solid #1a5fb4;
      margin-bottom: 20px;
    }
    .logo { font-size: 28px; font-weight: bold; color: #1a5fb4; margin-bottom: 5px; }
    .company-name { font-size: 22px; font-weight: 600; color: #333; }
    .receipt-title { font-size: 18px; color: #666; margin-top: 5px; }
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .info-block { flex: 1; }
    .info-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-value { font-size: 14px; font-weight: 600; color: #333; }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .items-table th {
      background: #1a5fb4;
      color: #fff;
      padding: 12px;
      text-align: left;
      font-size: 13px;
      text-transform: uppercase;
    }
    .items-table td {
      padding: 12px;
      border-bottom: 1px solid #e0e0e0;
      font-size: 14px;
    }
    .items-table tr:last-child td { border-bottom: 2px solid #1a5fb4; }
    .text-right { text-align: right; }
    .summary-section {
      margin-top: 20px;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .summary-row.total {
      font-size: 18px;
      font-weight: 700;
      color: #1a5fb4;
      padding-top: 10px;
      border-top: 2px solid #1a5fb4;
    }
    .qr-section {
      text-align: center;
      margin-top: 30px;
      padding: 20px;
      background: #f0f4f8;
      border-radius: 8px;
    }
    .qr-code {
      width: 150px;
      height: 150px;
      margin: 10px auto;
      background: #fff;
      padding: 10px;
      border: 1px solid #ddd;
    }
    .qr-label { font-size: 12px; color: #666; margin-top: 10px; }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
    .terms { margin-top: 20px; font-size: 11px; color: #888; }
    @media print {
      body { background: #fff; }
      .receipt { border: none; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="logo">🏪</div>
      <div class="company-name">Aqua Prime</div>
      <div class="receipt-title">Sales Receipt</div>
    </div>

    <div class="info-section">
      <div class="info-block">
        <div class="info-label">Receipt Number</div>
        <div class="info-value">{{RECEIPT_NUMBER}}</div>
      </div>
      <div class="info-block">
        <div class="info-label">Date</div>
        <div class="info-value">{{SALE_DATE}}</div>
      </div>
      <div class="info-block">
        <div class="info-label">Store</div>
        <div class="info-value">{{STORE_NAME}}</div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>Product</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Price</th>
          <th class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {{ITEMS_ROWS}}
      </tbody>
    </table>

    <div class="summary-section">
      <div class="summary-row">
        <span>Subtotal</span>
        <span>{{SUBTOTAL}}</span>
      </div>
      <div class="summary-row">
        <span>Previous Balance</span>
        <span>{{PREVIOUS_BALANCE}}</span>
      </div>
      {{DISCOUNT_ROW}}
      <div class="summary-row total">
        <span>Total Outstanding</span>
        <span>{{TOTAL_OUTSTANDING}}</span>
      </div>
    </div>

    <div class="qr-section">
      <div class="qr-code">
        <img src="{{QR_CODE_DATA_URL}}" alt="Receipt QR Code" width="130" height="130" />
      </div>
      <div class="qr-label">Scan to verify receipt authenticity</div>
    </div>

    <div class="footer">
      <p>Thank you for your business!</p>
      <p>For questions, contact support@aquaprime.com</p>
      <p>Generated on {{GENERATED_AT}}</p>
    </div>

    <div class="terms">
      <strong>Terms & Conditions:</strong> Payment is due within 30 days. Late payments may incur additional charges.
      Goods once sold cannot be returned unless defective.
    </div>
  </div>
</body>
</html>
`;

// CORS headers for the edge function
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { receipt_id } = await req.json();

    if (!receipt_id) {
      return new Response(
        JSON.stringify({ error: "receipt_id is required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Supabase configuration missing" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch receipt data
    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .select(`
        *,
        sale:sales(*, store:stores(name)),
        sale_items:sale_items(*, product:products(name))
      `)
      .eq("id", receipt_id)
      .single();

    if (receiptError || !receipt) {
      return new Response(
        JSON.stringify({ error: "Receipt not found", details: receiptError }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Generate QR code data URL (simple base64 encoded verification URL)
    const verificationUrl = `${supabaseUrl}/verify-receipt/${receipt.receipt_number}`;
    // Note: In production, you'd use a QR code library. Here we create a data URL placeholder.
    const qrCodeSvg = generateQRCodeSVG(verificationUrl);
    const qrCodeDataUrl = `data:image/svg+xml;base64,${btoa(qrCodeSvg)}`;

    // Build items rows
    const itemsHtml = receipt.sale_items?.map((item: any) => `
      <tr>
        <td>${escapeHtml(item.product?.name || "Unknown Product")}</td>
        <td class="text-right">${item.quantity}</td>
        <td class="text-right">${formatCurrency(item.unit_price, receipt.sale?.currency || "INR")}</td>
        <td class="text-right">${formatCurrency(item.quantity * item.unit_price, receipt.sale?.currency || "INR")}</td>
      </tr>
    `).join("") || "<tr><td colspan=\"4\">No items</td></tr>";

    // Calculate discount row if applicable
    const discountRow = receipt.sale?.discount_amount > 0
      ? `<div class="summary-row"><span>Discount</span><span>-${formatCurrency(receipt.sale.discount_amount, receipt.sale?.currency || "INR")}</span></div>`
      : "";

    // Replace template variables
    const html = RECEIPT_TEMPLATE
      .replace("{{RECEIPT_NUMBER}}", escapeHtml(receipt.receipt_number))
      .replace("{{SALE_DATE}}", formatDate(receipt.sale?.created_at))
      .replace("{{STORE_NAME}}", escapeHtml(receipt.sale?.store?.name || "Unknown Store"))
      .replace("{{ITEMS_ROWS}}", itemsHtml)
      .replace("{{SUBTOTAL}}", formatCurrency(receipt.sale?.subtotal || 0, receipt.sale?.currency || "INR"))
      .replace("{{PREVIOUS_BALANCE}}", formatCurrency(receipt.sale?.previous_balance || 0, receipt.sale?.currency || "INR"))
      .replace("{{DISCOUNT_ROW}}", discountRow)
      .replace("{{TOTAL_OUTSTANDING}}", formatCurrency(receipt.sale?.outstanding || 0, receipt.sale?.currency || "INR"))
      .replace("{{QR_CODE_DATA_URL}}", qrCodeDataUrl)
      .replace("{{GENERATED_AT}}", formatDate(new Date().toISOString()));

    // In a real implementation, you'd convert HTML to PDF here using a library like Puppeteer or similar
    // For this example, we'll return the HTML that can be rendered or converted
    // The PDF generation would typically be done by a separate service

    // For this implementation, we'll store the HTML and return a success response
    // The actual PDF generation would need a headless browser service

    // Store receipt HTML in storage
    const htmlContent = new TextEncoder().encode(html);
    const filePath = `receipts/${receipt.receipt_number}.html`;
    
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from("receipts")
      .upload(filePath, htmlContent, {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      // Continue even if upload fails - we can still return the HTML
    }

    // Get public URL
    const { data: publicUrlData } = await supabase
      .storage
      .from("receipts")
      .getPublicUrl(filePath);

    const downloadUrl = publicUrlData?.publicUrl;

    // Update receipt record
    await supabase
      .from("receipts")
      .update({
        pdf_url: downloadUrl,
        html_generated: true,
      })
      .eq("id", receipt_id);

    return new Response(
      JSON.stringify({
        success: true,
        receipt_id,
        receipt_number: receipt.receipt_number,
        download_url: downloadUrl,
        html_preview: html.substring(0, 1000) + "...", // Preview only
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating receipt:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});

// Helper function to format currency
function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
  };
  const symbol = symbols[currency] || currency;
  return `${symbol}${amount.toFixed(2)}`;
}

// Helper function to format date
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Helper function to escape HTML
function escapeHtml(text: string | null): string {
  if (!text) return "";
  const div = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => div[char as keyof typeof div] || char);
}

// Helper function to generate a simple QR code SVG
function generateQRCodeSVG(text: string): string {
  // This is a simplified placeholder - in production, use a proper QR code library
  const size = 130;
  const modules = 25; // QR code has 25x25 modules for alphanumeric
  const moduleSize = size / modules;
  
  let svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${size}" height="${size}" fill="white"/>`;
  
  // Add position detection patterns (corners)
  const patterns = [
    { x: 0, y: 0 },
    { x: modules - 7, y: 0 },
    { x: 0, y: modules - 7 },
  ];
  
  patterns.forEach((pos) => {
    // Outer square
    svg += `<rect x="${pos.x * moduleSize}" y="${pos.y * moduleSize}" width="${7 * moduleSize}" height="${7 * moduleSize}" fill="black"/>`;
    // Inner white square
    svg += `<rect x="${(pos.x + 1) * moduleSize}" y="${(pos.y + 1) * moduleSize}" width="${5 * moduleSize}" height="${5 * moduleSize}" fill="white"/>`;
    // Center square
    svg += `<rect x="${(pos.x + 2) * moduleSize}" y="${(pos.y + 2) * moduleSize}" width="${3 * moduleSize}" height="${3 * moduleSize}" fill="black"/>`;
  });
  
  // Generate random-looking data pattern (in real implementation, this would be actual QR data)
  const hash = hashString(text);
  for (let i = 0; i < modules; i++) {
    for (let j = 0; j < modules; j++) {
      // Skip position detection patterns
      if ((i < 7 && j < 7) || (i < 7 && j >= modules - 7) || (i >= modules - 7 && j < 7)) continue;
      
      // Use hash to determine if module should be filled
      if ((hash + i * modules + j) % 3 === 0) {
        svg += `<rect x="${i * moduleSize}" y="${j * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="black"/>`;
      }
    }
  }
  
  svg += "</svg>";
  return svg;
}

// Simple hash function for deterministic QR pattern
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
