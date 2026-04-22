import React, { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Download, FileSpreadsheet, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ReportContainerProps {
  title: string;
  subtitle?: string;
  icon?: React.ElementType | ReactNode;
  dateRange?: string;
  filters?: ReactNode;
  summaryCards?: ReactNode;
  children: ReactNode;
  onPrint?: () => void | string;
  onExportExcel?: () => void;
  onExportPDF?: () => void;
  showBackButton?: boolean;
  actions?: ReactNode;
  isLoading?: boolean;
}

export function ReportContainer({
  title,
  subtitle,
  icon: Icon,
  dateRange,
  filters,
  summaryCards,
  children,
  onPrint,
  onExportExcel,
  onExportPDF,
  showBackButton = false,
  actions,
  isLoading = false,
}: ReportContainerProps) {
  const navigate = useNavigate();

  // Render icon - handle both component and element
  const renderIcon = () => {
    if (!Icon) return null;
    if (React.isValidElement(Icon)) {
      return Icon;
    }

    // Supports component references including forwardRef/memo icon components.
    if (typeof Icon === "function" || typeof Icon === "object") {
      const IconComponent = Icon as React.ElementType;
      return <IconComponent className="h-5 w-5" />;
    }

    return null;
  };

  // Handle print - support both void and string return types
  const handlePrint = () => {
    if (!onPrint) return;
    const result = onPrint();
    if (typeof result === 'string' && result) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(result);
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Report Header */}
      <div className="flex flex-col gap-4 pb-4 border-b border-border/60">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3">
            {showBackButton && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 mt-0.5"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="shrink-0 h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  {renderIcon()}
                </div>
              )}
              <div>
                <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                {subtitle && (
                  <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
                )}
              </div>
            </div>
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {dateRange && (
              <span className="text-xs font-medium bg-muted px-3 py-1.5 rounded-md">
                {dateRange}
              </span>
            )}
            {actions}
            {onExportExcel && (
              <Button
                variant="outline"
                size="sm"
                onClick={onExportExcel}
                disabled={isLoading}
                className="gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
            )}
            {onExportPDF && (
              <Button
                variant="outline"
                size="sm"
                onClick={onExportPDF}
                disabled={isLoading}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
            )}
            {onPrint && (
              <Button
                variant="default"
                size="sm"
                onClick={handlePrint}
                disabled={isLoading}
                className="gap-2"
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">Print</span>
              </Button>
            )}
          </div>
        </div>

        {/* Filters Row */}
        {filters && <div className="flex flex-wrap items-end gap-3">{filters}</div>}
      </div>

      {/* Summary Cards */}
      {summaryCards && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {summaryCards}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1">{children}</div>
    </div>
  );
}

// KPI Card for summary section - professional styling
interface ReportKPICardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  highlight?: boolean;
  icon?: React.ElementType | ReactNode;
}

export function ReportKPICard({
  label,
  value,
  subValue,
  trend,
  trendValue,
  highlight = false,
  icon: Icon,
}: ReportKPICardProps) {
  // Render icon - handle both component and element
  const renderIcon = () => {
    if (!Icon) return null;

    if (React.isValidElement(Icon)) {
      return Icon;
    }

    // Supports component references including forwardRef/memo icon components.
    if (typeof Icon === "function" || typeof Icon === "object") {
      const IconComponent = Icon as React.ElementType;
      return <IconComponent className="h-4 w-4" />;
    }

    return null;
  };

  return (
    <div
      className={`
        rounded-lg border p-4 transition-all
        ${highlight 
          ? "bg-primary text-primary-foreground border-primary" 
          : "bg-card border-border/60 hover:border-border hover:shadow-sm"
        }
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
          {label}
        </span>
        {Icon && (
          <span className={highlight ? "text-primary-foreground/60" : "text-muted-foreground/60"}>
            {renderIcon()}
          </span>
        )}
      </div>
      <div className="mt-2">
        <span className="text-2xl font-bold font-mono tracking-tight">{value}</span>
        {subValue && (
          <span className={`ml-2 text-xs ${highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            {subValue}
          </span>
        )}
      </div>
      {trend && trendValue && (
        <div className={`mt-1 text-xs font-medium ${
          trend === "up" ? "text-green-600" : 
          trend === "down" ? "text-red-600" : 
          highlight ? "text-primary-foreground/70" : "text-muted-foreground"
        }`}>
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {trendValue}
        </div>
      )}
    </div>
  );
}

// Professional data table for reports
interface ReportTableColumn<T> {
  key: keyof T | string;
  header: string;
  align?: "left" | "center" | "right";
  format?: (value: any, row: T) => ReactNode;
  className?: string;
}

interface ReportTableProps<T> {
  data: T[];
  columns: ReportTableColumn<T>[];
  emptyMessage?: string;
  showRowNumbers?: boolean;
  className?: string;
}

export function ReportTable<T extends Record<string, any>>({
  data,
  columns,
  emptyMessage = "No data available",
  showRowNumbers = false,
  className = "",
}: ReportTableProps<T>) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg bg-muted/20">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-lg border border-border/60 ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b border-border/60">
            {showRowNumbers && (
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground w-12">
                #
              </th>
            )}
            {columns.map((col, idx) => (
              <th
                key={idx}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                } ${col.className || ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {data.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-muted/30 transition-colors">
              {showRowNumbers && (
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                  {rowIdx + 1}
                </td>
              )}
              {columns.map((col, colIdx) => {
                const value = typeof col.key === "string" && col.key.includes(".")
                  ? col.key.split(".").reduce((obj, key) => obj?.[key], row)
                  : row[col.key as keyof T];
                
                return (
                  <td
                    key={colIdx}
                    className={`px-4 py-3 ${
                      col.align === "right" ? "text-right font-mono" : col.align === "center" ? "text-center" : "text-left"
                    } ${col.className || ""}`}
                  >
                    {col.format ? col.format(value, row) : String(value ?? "-")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Section divider for reports
interface ReportSectionProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function ReportSection({ title, subtitle, children, className = "" }: ReportSectionProps) {
  return (
    <section className={`space-y-4 ${className}`}>
      <div className="border-b border-border/60 pb-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
