import { CompanySettings } from "@/hooks/useCompanySettings";

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
    
    html { font-size: 12px; }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #1A1A1A;
      background: #FFFFFF;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ===== PAGE WRAPPER WITH BORDER ===== */
    .page-wrapper {
      border: 1px solid #E5E7EB;
      min-height: 100%;
      position: relative;
    }

    /* ===== HEADER BAND - Navy with Amber Bottom Border ===== */
    .header-band {
      background: #1A2B4A;
      height: 60px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 20px;
      border-bottom: 3px solid #F5A623;
    }

    .header-left {
      color: #FFFFFF;
      font-size: 22px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .header-right {
      color: #FFFFFF;
      font-size: 26px;
      font-weight: 700;
    }

    /* ===== SUB-HEADER ROW ===== */
    .sub-header {
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #D0D5DD;
    }

    .sub-header-left {
      font-size: 11px;
      color: #6B7280;
    }

    .sub-header-right {
      font-size: 13px;
      font-weight: 700;
      color: #1A1A1A;
      text-align: right;
    }

    /* ===== INFO ROWS - Two Column ===== */
    .info-row {
      background: #F5F7FA;
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #D0D5DD;
    }

    .info-label {
      flex: 1;
      font-size: 12px;
      color: #6B7280;
    }

    .info-value {
      flex: 1;
      font-size: 12px;
      font-weight: 600;
      color: #1A1A1A;
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
      color: #1A2B4A;
      border-left: 3px solid #1A2B4A;
      padding-left: 8px;
      margin: 20px 0 12px 0;
      letter-spacing: 0.5px;
    }

    h3 {
      font-size: 11px;
      font-weight: 600;
      color: #1A1A1A;
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
      background: #F5F7FA;
      border: 1px solid #D0D5DD;
      padding: 12px;
      text-align: center;
    }

    .kpi-card.highlight {
      background: #1A2B4A;
      border-color: #1A2B4A;
    }

    .kpi-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: #6B7280;
      margin-bottom: 4px;
      letter-spacing: 0.3px;
    }

    .kpi-card.highlight .kpi-label {
      color: #F5A623;
    }

    .kpi-value {
      font-size: 18px;
      font-weight: 700;
      color: #1A1A1A;
      font-variant-numeric: tabular-nums;
    }

    .kpi-card.highlight .kpi-value {
      color: #FFFFFF;
    }

    /* ===== TABLES ===== */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }

    thead { display: table-header-group; }

    th {
      background: #1A2B4A;
      color: #FFFFFF;
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
      border-bottom: 1px solid #D0D5DD;
    }

    tbody tr:nth-child(even) {
      background: #F9FAFB;
    }

    tbody tr:nth-child(odd) {
      background: #FFFFFF;
    }

    /* Total Row */
    tr.total-row, tfoot tr {
      background: #1A2B4A !important;
      color: #FFFFFF;
      font-weight: 700;
      font-size: 14px;
    }

    tr.total-row td, tfoot td {
      color: #FFFFFF;
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
      border-bottom: 1px solid #D0D5DD;
    }

    .summary-row:last-child {
      border-bottom: none;
    }

    .summary-label {
      font-size: 12px;
      color: #6B7280;
    }

    .summary-value {
      font-size: 12px;
      font-weight: 600;
      color: #1A1A1A;
      text-align: right;
    }

    .summary-total {
      background: #1A2B4A;
      display: flex;
      justify-content: space-between;
      padding: 10px 12px;
    }

    .summary-total .summary-label,
    .summary-total .summary-value {
      color: #FFFFFF;
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
    
    .text-pos, .text-success { color: #047857; }
    .text-neg, .text-danger { color: #DC2626; }
    .text-warn, .text-warning { color: #F59E0B; }
    .text-muted { color: #6B7280; }
    .text-primary { color: #1A2B4A; }
    .text-accent { color: #F5A623; }
    
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

    .pill-success { background: #D1FAE5; color: #047857; }
    .pill-danger { background: #FEE2E2; color: #DC2626; }
    .pill-warning { background: #FEF3C7; color: #D97706; }
    .pill-info { background: #DBEAFE; color: #1D4ED8; }
    .pill-neutral { background: #F3F4F6; color: #374151; }

    /* ===== BADGE ===== */
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge-success { background: #D1FAE5; color: #047857; }
    .badge-danger { background: #FEE2E2; color: #DC2626; }
    .badge-warning { background: #FEF3C7; color: #D97706; }
    .badge-info { background: #DBEAFE; color: #1D4ED8; }
    .badge-neutral { background: #F3F4F6; color: #374151; }

    /* ===== EMPTY STATE ===== */
    .empty-state {
      text-align: center;
      padding: 24px;
      color: #9CA3AF;
      font-style: italic;
      background: #F9FAFB;
      border: 1px dashed #D0D5DD;
    }

    /* ===== FOOTER STRIP ===== */
    .footer-strip {
      background: #F5F7FA;
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      border-top: 1px solid #D0D5DD;
    }

    .footer-left {
      font-style: italic;
      color: #6B7280;
    }

    .footer-right {
      color: #1A1A1A;
    }

    /* ===== PAGE BREAK ===== */
    .page-break {
      page-break-before: always;
    }

    /* ===== PRINT ADJUSTMENTS ===== */
    @media print {
      body { background: #FFFFFF; }
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
