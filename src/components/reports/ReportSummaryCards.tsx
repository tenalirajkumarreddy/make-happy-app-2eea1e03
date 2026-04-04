import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface SummaryCardData {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: LucideIcon;
  iconColor?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  trendLabel?: string;
}

export interface ReportSummaryCardsProps {
  cards: SummaryCardData[];
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}

const iconColorMap: Record<string, string> = {
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  green: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  red: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  yellow: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
  orange: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
  pink: "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400",
  cyan: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400",
  teal: "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400",
  gray: "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400",
};

const columnClasses: Record<number, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 lg:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
};

export function ReportSummaryCards({ cards, columns = 4, className }: ReportSummaryCardsProps) {
  return (
    <div className={cn("grid gap-4", columnClasses[columns], className)}>
      {cards.map((card, idx) => {
        const Icon = card.icon;
        const iconColorClass = card.iconColor ? iconColorMap[card.iconColor] || iconColorMap.blue : iconColorMap.blue;
        
        const TrendIcon = card.trend === "up" ? TrendingUp : card.trend === "down" ? TrendingDown : Minus;
        const trendColorClass = card.trend === "up" 
          ? "text-green-600 dark:text-green-400" 
          : card.trend === "down" 
            ? "text-red-600 dark:text-red-400" 
            : "text-muted-foreground";

        return (
          <Card key={idx} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="space-y-1 flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground truncate">{card.label}</p>
                <p className="text-2xl font-bold tracking-tight truncate">
                  {typeof card.value === "number" ? card.value.toLocaleString("en-IN") : card.value}
                </p>
                {card.subValue && (
                  <p className="text-xs text-muted-foreground truncate">{card.subValue}</p>
                )}
                {card.trendValue && (
                  <div className={cn("flex items-center gap-1 text-xs", trendColorClass)}>
                    <TrendIcon className="h-3 w-3" />
                    <span>{card.trendValue}</span>
                    {card.trendLabel && <span className="text-muted-foreground">{card.trendLabel}</span>}
                  </div>
                )}
              </div>
              {Icon && (
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ml-3", iconColorClass)}>
                  <Icon className="h-5 w-5" />
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
