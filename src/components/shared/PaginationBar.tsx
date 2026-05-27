import { Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  currentCount: number;
  totalCount?: number;
  onLoadMore: () => void;
  isLoading: boolean;
  className?: string;
}

export function PaginationBar({ currentCount, totalCount, onLoadMore, isLoading, className }: Props) {
  const hasMore = totalCount !== undefined
    ? currentCount < totalCount
    : false;

  if (!hasMore && currentCount === 0) return null;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {totalCount !== undefined && (
        <p className="text-xs text-muted-foreground">
          Showing {currentCount} of {totalCount}
        </p>
      )}
      {hasMore && (
        <Button
          variant="outline"
          size="sm"
          onClick={onLoadMore}
          disabled={isLoading}
          className="gap-1.5 min-w-[140px]"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {totalCount !== undefined
            ? `Load More (${currentCount} of ${totalCount})`
            : "Load More"}
        </Button>
      )}
    </div>
  );
}
