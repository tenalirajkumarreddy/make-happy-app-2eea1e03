import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ReportExportBarProps {
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  onExportCSV?: () => void;
  onPrint?: () => void;
  isExporting?: boolean;
  className?: string;
  // Control which exports to show
  showPDF?: boolean;
  showExcel?: boolean;
  showCSV?: boolean;
  showPrint?: boolean;
  onPrintHTML?: () => string | Promise<string>;
}

export function ReportExportBar({
  onExportPDF,
  onExportExcel,
  onExportCSV,
  onPrint,
  isExporting = false,
  className,
  showPDF = true,
  showExcel = true,
  showCSV = true,
  showPrint = true,
  onPrintHTML,
}: ReportExportBarProps) {
  const hasAnyExport = (showPDF && (onExportPDF || onPrintHTML)) || (showExcel && onExportExcel) || (showCSV && onExportCSV);
  
  // Count available options
  const exportOptions = [
    (showPDF && onExportPDF) && { label: "PDF", icon: FileText, onClick: onExportPDF },
    (showPDF && onPrintHTML) && { 
      label: "Print / PDF", 
      icon: Printer, 
      onClick: async () => {
        try {
          const html = await onPrintHTML();
          const printWindow = window.open("", "_blank");
          if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            // wait for fonts to load before printing
            setTimeout(() => {
              printWindow.focus();
            }, 500);
          }
        } catch (error) {
          console.error("Failed to generate print layout:", error);
        }
      }
    },
    (showExcel && onExportExcel) && { label: "Excel", icon: FileSpreadsheet, onClick: onExportExcel },
    (showCSV && onExportCSV) && { label: "CSV", icon: FileText, onClick: onExportCSV },
  ].filter(Boolean) as Array<{ label: string; icon: typeof FileText; onClick: () => void }>;

  // If only one export option, show direct button
  const singleExport = exportOptions.length === 1;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {hasAnyExport && (
        singleExport ? (
          <Button
            variant="outline"
            size="sm"
            onClick={exportOptions[0].onClick}
            disabled={isExporting}
            className="gap-2"
          >
            {(() => {
              const Icon = exportOptions[0].icon;
              return <Icon className="h-4 w-4" />;
            })()}
            Export {exportOptions[0].label}
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isExporting} className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {exportOptions.map((option) => (
                <DropdownMenuItem key={option.label} onClick={option.onClick}>
                  <option.icon className="h-4 w-4 mr-2" />
                  Export as {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      )}
      
      {showPrint && onPrint && (
        <Button variant="outline" size="sm" onClick={onPrint} disabled={isExporting} className="gap-2">
          <Printer className="h-4 w-4" />
          Print
        </Button>
      )}
    </div>
  );
}
