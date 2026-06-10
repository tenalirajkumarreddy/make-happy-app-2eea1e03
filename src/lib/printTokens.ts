/**
 * Shared CSS variable definitions for standalone print templates.
 * These are injected into <style> blocks of print windows that
 * cannot access the main app's CSS custom properties.
 *
 * If you update design tokens in index.css or tokens.css,
 * update the corresponding values here to keep print output consistent.
 */

export const PRINT_REPORT_CSS = `:root {
  --print-primary: #1A2B4A;
  --print-accent: #F5A623;
  --print-white: #FFFFFF;
  --print-border: #D0D5DD;
  --print-border-light: #E5E7EB;
  --print-bg-light: #F5F7FA;
  --print-bg-subtle: #F9FAFB;
  --print-text: #1A1A1A;
  --print-text-muted: #6B7280;
  --print-text-placeholder: #9CA3AF;
  --print-success: #047857;
  --print-danger: #DC2626;
  --print-warning: #F59E0B;
  --print-bg-success: #D1FAE5;
  --print-bg-danger: #FEE2E2;
  --print-bg-warning: #FEF3C7;
  --print-bg-info: #DBEAFE;
  --print-bg-neutral: #F3F4F6;
  --print-info: #1D4ED8;
  --print-warning-dark: #D97706;
  --print-text-dark: #374151;
}`;

export const PROFORMA_CSS = `:root {
  --pf-text: #1f2937;
  --pf-text-muted: #64748b;
  --pf-text-light: #94a3b8;
  --pf-text-lighter: #cbd5e1;
  --pf-primary: #1e40af;
  --pf-primary-light: #3b82f6;
  --pf-primary-lighter: #60a5fa;
  --pf-primary-dark: #1e3a5f;
  --pf-bg: #f8fafc;
  --pf-bg-light: #eff6ff;
  --pf-border: #e5e7eb;
  --pf-border-light: #bfdbfe;
  --pf-white: #ffffff;
  --pf-bg-print: #f1f5f9;
}`;

export const SALE_RECEIPT_CSS = `:root {
  --receipt-text: #1A1A1A;
  --receipt-muted: #666;
  --receipt-danger: #c00;
  --receipt-divider: #000;
}`;

export const TXN_RECEIPT_CSS = `:root {
  --receipt-text: #1A1A1A;
  --receipt-muted: #666;
  --receipt-danger: #c00;
  --receipt-success: #0a0;
  --receipt-divider: #000;
}`;

export const RECEIPT_CSS = TXN_RECEIPT_CSS;
