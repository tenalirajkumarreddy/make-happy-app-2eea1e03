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
  "success": { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-600 dark:text-green-400" },
  "warning": { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-400" },
  "destructive": { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400" },
  "info": { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400" },
  "purple": { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-600 dark:text-purple-400" },
  "emerald": { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-400" },
  "orange": { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-600 dark:text-orange-400" },
  "cyan": { bg: "bg-cyan-100 dark:bg-cyan-900/30", text: "text-cyan-600 dark:text-cyan-400" },
  "pink": { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-600 dark:text-pink-400" },
};

export function StatCard({ title, value, change, changeType = "neutral", icon: Icon, iconColor = "primary", iconBgColor, className }: StatCardProps) {
  const colors = iconColorMap[iconColor] || iconColorMap.primary;

  return (
    <div className={cn("stat-card", className)}>
      <div className="flex items-start justify-between">
      <div className="space-y-2 min-w-0 flex-1">
        <p className="text-sm text-muted-foreground truncate">{title}</p>
        <p className={cn("text-xl sm:text-2xl font-bold tracking-tight truncate", colors.text)}>{value}</p>
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
