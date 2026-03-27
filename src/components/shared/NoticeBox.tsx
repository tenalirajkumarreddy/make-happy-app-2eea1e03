import React from "react";
import { LucideIcon, Info, AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface NoticeBoxProps {
  title?: string;
  message: string | React.ReactNode;
  icon?: LucideIcon;
  variant?: "info" | "warning" | "error" | "success" | "premium";
  className?: string;
  onClose?: () => void;
}

export function NoticeBox({
  title,
  message,
  icon: Icon,
  variant = "info",
  className,
  onClose,
}: NoticeBoxProps) {
  const variants = {
    info: "bg-blue-50 border-blue-200 text-blue-900 icon-text-blue-600 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-200",
    warning: "bg-amber-50 border-amber-200 text-amber-900 icon-text-amber-600 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200",
    error: "bg-destructive/5 border-destructive/20 text-destructive icon-text-destructive",
    success: "bg-success/5 border-success/20 text-success icon-text-success",
    premium: "premium-info-box", // Uses the CSS utility we added
  };

  const DefaultIcon = {
    info: Info,
    warning: AlertCircle,
    error: AlertCircle,
    success: CheckCircle2,
    premium: Info,
  }[variant];

  const DisplayIcon = Icon || DefaultIcon;

  return (
    <div className={cn("rounded-xl border p-4 flex items-start gap-3 relative transition-all animate-in fade-in slide-in-from-top-2", variants[variant], className)}>
      <DisplayIcon className="h-5 w-5 shrink-0 mt-0.5 opacity-80" />
      <div className="flex-1 space-y-1">
        {title && <p className="text-sm font-semibold leading-none">{title}</p>}
        <div className="text-xs leading-relaxed opacity-90">{message}</div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 opacity-40 hover:opacity-100 transition-opacity"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
