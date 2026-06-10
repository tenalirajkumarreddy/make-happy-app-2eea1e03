import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  className?: string;
}

const iconColorMap: Record<string, { bg: string; text: string }> = {
  "primary": { bg: "bg-primary/10", text: "text-primary" },
  "success": { bg: "bg-success/10", text: "text-success" },
  "warning": { bg: "bg-warning/10", text: "text-warning" },
  "destructive": { bg: "bg-destructive/10", text: "text-destructive" },
  "info": { bg: "bg-info/10", text: "text-info" },
  "purple": { bg: "bg-accent/10", text: "text-accent-foreground" },
  "emerald": { bg: "bg-success/10", text: "text-success" },
  "orange": { bg: "bg-warning/10", text: "text-warning" },
  "cyan": { bg: "bg-info/10", text: "text-info" },
  "pink": { bg: "bg-destructive/10", text: "text-destructive" },
};

export function StatCard({ title, value, change, changeType = "neutral", icon: Icon, iconColor = "primary", iconBgColor, className }: StatCardProps) {
  const colors = iconColorMap[iconColor] || iconColorMap.primary;

  return (
    <div className={cn("@container stat-card", className)}>
      <div className="flex items-start justify-between">
      <div className="space-y-2 min-w-0 flex-1">
        <p className="text-sm text-muted-foreground truncate">{title}</p>
        <p className={cn("text-xl @[400px]:text-2xl font-bold tracking-tight truncate", colors.text)}>{value}</p>
          {change && (
            <p
              className={cn(
                "text-xs font-medium",
                changeType === "positive" && "text-success",
                changeType === "negative" && "text-destructive",
                changeType === "neutral" && "text-muted-foreground"
              )}
            >
              {change}
            </p>
          )}
        </div>
        <div className={cn(
          "flex h-11 w-11 items-center justify-center rounded-xl transition-colors shrink-0 ml-3", 
          iconBgColor || colors.bg
        )}>
          <Icon className={cn("h-5 w-5", colors.text)} />
        </div>
      </div>
    </div>
  );
}
