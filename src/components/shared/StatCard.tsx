import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
}

export function StatCard({ title, value, change, changeType = "neutral", icon: Icon, iconColor }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-xl sm:text-2xl font-bold tracking-tight truncate">{value}</p>
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
          "flex h-11 w-11 items-center justify-center rounded-xl transition-colors shrink-0", 
          iconColor ? `bg-${iconColor.replace('bg-', '')}/10` : "bg-accent/50"
        )}>
          <Icon className={cn(
            "h-5 w-5", 
            iconColor ? `text-${iconColor.replace('bg-', '')}` : "text-accent-foreground"
          )} />
        </div>
      </div>
    </div>
  );
}
