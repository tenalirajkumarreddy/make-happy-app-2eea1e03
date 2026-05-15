import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullIndicatorProps {
  isRefreshing: boolean;
  isPulling: boolean;
  pullDistance: number;
  threshold: number;
}

/**
 * PullRefreshIndicator — the visual affordance shown at the top of a list
 * while the user is pulling or waiting for a refresh to complete.
 */
export function PullRefreshIndicator({
  isRefreshing,
  isPulling,
  pullDistance,
  threshold,
}: PullIndicatorProps) {
  const progress = Math.min(1, pullDistance / threshold);
  const isTriggered = progress >= 1;

  if (!isRefreshing && !isPulling) return null;

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-all duration-150"
      style={{ height: isRefreshing ? 44 : pullDistance }}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
          isTriggered || isRefreshing
            ? "bg-primary text-primary-foreground shadow-md"
            : "bg-muted text-muted-foreground"
        )}
        style={{ transform: `scale(${0.7 + progress * 0.3})`, opacity: 0.4 + progress * 0.6 }}
      >
        {isRefreshing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw
            className="h-3.5 w-3.5 transition-transform"
            style={{ transform: `rotate(${progress * 180}deg)` }}
          />
        )}
        {isRefreshing ? "Refreshing…" : isTriggered ? "Release to refresh" : "Pull to refresh"}
      </div>
    </div>
  );
}
