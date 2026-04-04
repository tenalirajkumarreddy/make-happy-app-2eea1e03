import { useState, useRef, useEffect, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Printer, Download, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PrintPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
  onPrint?: () => void;
  onDownloadPDF?: () => void;
  className?: string;
  paperSize?: "a4" | "letter" | "legal";
  orientation?: "portrait" | "landscape";
}

const paperSizes = {
  a4: { width: "210mm", height: "297mm" },
  letter: { width: "8.5in", height: "11in" },
  legal: { width: "8.5in", height: "14in" },
};

export function PrintPreview({
  open,
  onOpenChange,
  title = "Print Preview",
  children,
  onPrint,
  onDownloadPDF,
  className,
  paperSize = "a4",
  orientation = "portrait",
}: PrintPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
      return;
    }
    
    const printContent = printRef.current;
    if (!printContent) return;
    
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    
    const size = paperSizes[paperSize];
    const width = orientation === "landscape" ? size.height : size.width;
    const height = orientation === "landscape" ? size.width : size.height;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            @media print {
              @page {
                size: ${width} ${height};
                margin: 10mm;
              }
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              margin: 0;
              padding: 20px;
              color: #1a1a1a;
              font-size: 12px;
              line-height: 1.5;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 10px 0;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f5f5f5;
              font-weight: 600;
            }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .font-bold { font-weight: 700; }
            .font-semibold { font-weight: 600; }
            .text-sm { font-size: 11px; }
            .text-xs { font-size: 10px; }
            .text-lg { font-size: 14px; }
            .text-xl { font-size: 16px; }
            .text-2xl { font-size: 20px; }
            .mb-2 { margin-bottom: 8px; }
            .mb-4 { margin-bottom: 16px; }
            .mt-4 { margin-top: 16px; }
            .border-t { border-top: 1px solid #ddd; }
            .border-b { border-bottom: 1px solid #ddd; }
            .py-2 { padding-top: 8px; padding-bottom: 8px; }
            .text-muted { color: #666; }
            .print-header {
              border-bottom: 2px solid #333;
              padding-bottom: 16px;
              margin-bottom: 20px;
            }
            .print-footer {
              border-top: 1px solid #ddd;
              padding-top: 16px;
              margin-top: 20px;
              font-size: 10px;
              color: #666;
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-2 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>Preview before printing or downloading</DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {onDownloadPDF && (
                <Button variant="outline" size="sm" onClick={onDownloadPDF} className="gap-2">
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
              )}
              <Button size="sm" onClick={handlePrint} className="gap-2">
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto p-4 bg-gray-100 dark:bg-gray-900">
          <div 
            ref={printRef}
            className={cn(
              "mx-auto bg-white shadow-lg",
              orientation === "landscape" ? "w-[297mm] min-h-[210mm]" : "w-[210mm] min-h-[297mm]",
              "p-8 text-black",
              className
            )}
            style={{ 
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
              fontSize: "12px",
              lineHeight: "1.5",
            }}
          >
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Print-specific components for consistent styling
export function PrintHeader({ 
  companyName, 
  address, 
  phone, 
  gstin, 
  title,
  subtitle,
  dateRange,
}: { 
  companyName?: string;
  address?: string;
  phone?: string;
  gstin?: string;
  title: string;
  subtitle?: string;
  dateRange?: string;
}) {
  return (
    <div className="print-header mb-6 pb-4 border-b-2 border-gray-800">
      {companyName && (
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold">{companyName}</h1>
          {address && <p className="text-sm text-gray-600">{address}</p>}
          <div className="flex justify-center gap-4 text-xs text-gray-500 mt-1">
            {phone && <span>Phone: {phone}</span>}
            {gstin && <span>GSTIN: {gstin}</span>}
          </div>
        </div>
      )}
      <div className={companyName ? "text-center" : ""}>
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
        {dateRange && <p className="text-sm text-gray-500 mt-1">{dateRange}</p>}
      </div>
    </div>
  );
}

export function PrintFooter({ generatedAt, generatedBy }: { generatedAt?: string; generatedBy?: string }) {
  return (
    <div className="print-footer mt-8 pt-4 border-t text-xs text-gray-500 flex justify-between">
      <span>Generated: {generatedAt || new Date().toLocaleString()}</span>
      {generatedBy && <span>By: {generatedBy}</span>}
    </div>
  );
}

export function PrintTable({ 
  headers, 
  rows, 
  footer,
  className,
}: { 
  headers: string[];
  rows: (string | number | ReactNode)[][];
  footer?: (string | number | ReactNode)[];
  className?: string;
}) {
  return (
    <table className={cn("w-full border-collapse my-4", className)}>
      <thead>
        <tr className="bg-gray-100">
          {headers.map((h, i) => (
            <th key={i} className="border border-gray-300 px-3 py-2 text-left font-semibold text-sm">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
            {row.map((cell, j) => (
              <td key={j} className="border border-gray-300 px-3 py-2 text-sm">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {footer && (
        <tfoot>
          <tr className="bg-gray-100 font-semibold">
            {footer.map((cell, i) => (
              <td key={i} className="border border-gray-300 px-3 py-2 text-sm">
                {cell}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
