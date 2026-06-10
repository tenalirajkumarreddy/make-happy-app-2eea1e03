import { CompanySettings } from "@/hooks/useCompanySettings";
import { PRINT_REPORT_CSS } from "@/lib/printTokens";

export interface PrintDocumentConfig {
  title: string;
  dateRange?: string;
  metadata?: Record<string, string>;
  orientation?: "portrait" | "landscape";
  htmlContent: string;
  companyInfo: CompanySettings;
}

/**
 * Professional Business Report Print Template
 * A4 Portrait with Navy/Amber Color Scheme
 */
export function generatePrintHTML(config: PrintDocumentConfig): string {
  const { title, dateRange, metadata = {}, orientation = "portrait", htmlContent, companyInfo } = config;

  const generatedAt = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // Build metadata two-column rows if provided
  const metadataRows = Object.keys(metadata).length > 0
    ? Object.entries(metadata).map(([label, value]) => `
        <div class="info-row">
          <div class="info-label">${label}</div>
          <div class="info-value">${value}</div>
        </div>
      `).join("")
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${companyInfo.companyName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    /* ===== RESET ===== */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    /* ===== PAGE SETUP ===== */
    @page {
      size: A4 ${orientation};
      margin: 20mm;
    }
    
    ${PRINT_REPORT_CSS}
    
    html { font-size: 12px; }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: var(--print-text);
      background: var(--print-white);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ===== PAGE WRAPPER WITH BORDER ===== */
    .page-wrapper {
      border: 1px solid var(--print-border-light);
      min-height: 100%;
      position: relative;
    }

    /* ===== HEADER BAND - Navy with Amber Bottom Border ===== */
    .header-band {
      background: var(--print-primary);
      height: 60px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 20px;
      border-bottom: 3px solid var(--print-accent);
    }

    .header-left {
      color: var(--print-white);
      font-size: 22px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .header-right {
      color: var(--print-white);
      font-size: 26px;
      font-weight: 700;
    }

    /* ===== SUB-HEADER ROW ===== */
    .sub-header {
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--print-border);
    }

    .sub-header-left {
      font-size: 11px;
      color: var(--print-text-muted);
    }

    .sub-header-right {
      font-size: 13px;
      font-weight: 700;
      color: var(--print-text);
      text-align: right;
    }

    /* ===== INFO ROWS - Two Column ===== */
    .info-row {
      background: var(--print-bg-light);
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid var(--print-border);
    }

    .info-label {
      flex: 1;
      font-size: 12px;
      color: var(--print-text-muted);
    }

    .info-value {
      flex: 1;
      font-size: 12px;
      font-weight: 600;
      color: var(--print-text);
      text-align: right;
    }

    /* ===== MAIN CONTENT AREA ===== */
    .content {
      padding: 20px;
    }

    /* ===== SECTION LABELS ===== */
    h2, .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--print-primary);
      border-left: 3px solid var(--print-primary);
      padding-left: 8px;
      margin: 20px 0 12px 0;
      letter-spacing: 0.5px;
    }

    h3 {
      font-size: 11px;
      font-weight: 600;
      color: var(--print-text);
      margin: 16px 0 8px 0;
    }

    /* ===== KPI ROW ===== */
    .kpi-row {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }

    .kpi-card {
      flex: 1;
      background: var(--print-bg-light);
      border: 1px solid #D0D5DD;
      padding: 12px;
      text-align: center;
    }

    .kpi-card.highlight {
      background: var(--print-primary);
      border-color: var(--print-primary);
    }

    .kpi-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--print-text-muted);
      margin-bottom: 4px;
      letter-spacing: 0.3px;
    }

    .kpi-card.highlight .kpi-label {
      color: var(--print-accent);
    }

    .kpi-value {
      font-size: 18px;
      font-weight: 700;
      color: var(--print-text);
      font-variant-numeric: tabular-nums;
    }

    .kpi-card.highlight .kpi-value {
      color: var(--print-white);
    }

    /* ===== TABLES ===== */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }

    thead { display: table-header-group; }

    th {
      background: var(--print-primary);
      color: var(--print-white);
      font-size: 12px;
      font-weight: 700;
      text-align: left;
      padding: 8px 12px;
      height: 36px;
    }

    th.text-right { text-align: right; }
    th.text-center { text-align: center; }

    td {
      padding: 8px 12px;
      height: 32px;
      border-bottom: 1px solid var(--print-border);
    }

    tbody tr:nth-child(even) {
      background: var(--print-bg-subtle);
    }

    tbody tr:nth-child(odd) {
      background: var(--print-white);
    }

    /* Total Row */
    tr.total-row, tfoot tr {
      background: #1A2B4A !important;
      color: var(--print-white);
      font-weight: 700;
      font-size: 14px;
    }

    tr.total-row td, tfoot td {
      color: var(--print-white);
      font-weight: 700;
    }

    /* ===== SUMMARY BLOCK (Right Half) ===== */
    .summary-block {
      width: 50%;
      margin-left: auto;
      border: 1px solid #D0D5DD;
      margin-bottom: 16px;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--print-border);
    }

    .summary-row:last-child {
      border-bottom: none;
    }

    .summary-label {
      font-size: 12px;
      color: var(--print-text-muted);
    }

    .summary-value {
      font-size: 12px;
      font-weight: 600;
      color: var(--print-text);
      text-align: right;
    }

    .summary-total {
      background: var(--print-primary);
      display: flex;
      justify-content: space-between;
      padding: 10px 12px;
    }

    .summary-total .summary-label,
    .summary-total .summary-value {
      color: var(--print-white);
      font-size: 14px;
      font-weight: 700;
    }

    /* ===== TWO COLUMN LAYOUT ===== */
    .two-col {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }

    .two-col > div {
      flex: 1;
    }

    /* ===== TEXT UTILITIES ===== */
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    
    .text-pos, .text-success { color: var(--print-success); }
    .text-neg, .text-danger { color: var(--print-danger); }
    .text-warn, .text-warning { color: var(--print-warning); }
    .text-muted { color: var(--print-text-muted); }
    .text-primary { color: var(--print-primary); }
    .text-accent { color: var(--print-accent); }
    
    .font-mono {
      font-family: ui-monospace, 'Cascadia Code', 'Courier New', monospace;
    }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .font-medium { font-weight: 500; }

    /* ===== STATUS PILLS ===== */
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .pill-success { background: #D1FAE5; color: var(--print-success); }
    .pill-danger { background: #FEE2E2; color: var(--print-danger); }
    .pill-warning { background: var(--print-bg-warning); color: var(--print-warning-dark); }
    .pill-info { background: var(--print-bg-info); color: var(--print-info); }
    .pill-neutral { background: var(--print-bg-neutral); color: var(--print-text-dark); }

    /* ===== BADGE ===== */
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge-success { background: #D1FAE5; color: var(--print-success); }
    .badge-danger { background: #FEE2E2; color: var(--print-danger); }
    .badge-warning { background: var(--print-bg-warning); color: var(--print-warning-dark); }
    .badge-info { background: var(--print-bg-info); color: var(--print-info); }
    .badge-neutral { background: var(--print-bg-neutral); color: var(--print-text-dark); }

    /* ===== EMPTY STATE ===== */
    .empty-state {
      text-align: center;
      padding: 24px;
      color: var(--print-text-placeholder);
      font-style: italic;
      background: var(--print-bg-subtle);
      border: 1px dashed var(--print-border);
    }

    /* ===== FOOTER STRIP ===== */
    .footer-strip {
      background: var(--print-bg-light);
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      border-top: 1px solid var(--print-border);
    }

    .footer-left {
      font-style: italic;
      color: var(--print-text-muted);
    }

    .footer-right {
      color: var(--print-text);
    }

    /* ===== PAGE BREAK ===== */
    .page-break {
      page-break-before: always;
    }

    /* ===== PRINT ADJUSTMENTS ===== */
    @media print {
      body { background: var(--print-white); }
      .page-wrapper { border-color: #E5E7EB; }
    }
  </style>
</head>
<body onload="window.print()">
  <div class="page-wrapper">
    <!-- HEADER BAND -->
    <div class="header-band">
      <div class="header-left">${companyInfo.companyName || "Company Name"}</div>
      <div class="header-right">${title}</div>
    </div>

    <!-- SUB-HEADER -->
    <div class="sub-header">
      <div class="sub-header-left">
        ${companyInfo.address ? companyInfo.address + " • " : ""}${companyInfo.phone ? "Ph: " + companyInfo.phone : ""}${companyInfo.gstin ? " • GSTIN: " + companyInfo.gstin : ""}
      </div>
      <div class="sub-header-right">
        ${dateRange || generatedAt}
      </div>
    </div>

    <!-- METADATA INFO ROWS -->
    ${metadataRows}

    <!-- MAIN CONTENT -->
    <div class="content">
      ${htmlContent}
    </div>

    <!-- FOOTER STRIP -->
    <div class="footer-strip">
      <div class="footer-left">Generated on ${generatedAt}</div>
      <div class="footer-right">BizManager Report System</div>
    </div>
  </div>
</body>
</html>`;
}
