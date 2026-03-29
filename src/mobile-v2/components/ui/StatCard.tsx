import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: string;
    positive?: boolean;
  };
  className?: string;
  onClick?: () => void;
  variant?: "default" | "success" | "warning" | "danger" | "info";
}

export function StatCard({ label, value, icon: Icon, trend, className, onClick, variant = "default" }: StatCardProps) {
  const variantClasses = {
    default: "",
    success: "border-l-4 border-l-green-500",
    warning: "border-l-4 border-l-amber-500",
    danger: "border-l-4 border-l-red-500",
    info: "border-l-4 border-l-blue-500",
  };

  const iconVariantClasses = {
    default: "bg-primary/10 text-primary",
    success: "bg-green-500/10 text-green-600",
    warning: "bg-amber-500/10 text-amber-600",
    danger: "bg-red-500/10 text-red-600",
    info: "bg-blue-500/10 text-blue-600",
  };

  return (
    <div 
      className={cn(
        "mv2-stat-card",
        variantClasses[variant],
        onClick && "cursor-pointer active:scale-[0.98] transition-transform",
        className
      )}
      onClick={onClick}
    >
      {Icon && (
        <div className={cn("mv2-stat-icon", iconVariantClasses[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      )}
      <p className="mv2-stat-label">{label}</p>
      <p className="mv2-stat-value">{value}</p>
      {trend && (
        <p className={cn("mv2-stat-trend", trend.positive ? "positive" : "negative")}>
          {trend.positive ? "↑" : "↓"} {trend.value}
        </p>
      )}
    </div>
  );
}
