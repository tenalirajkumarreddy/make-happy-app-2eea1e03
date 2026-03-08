import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  columns?: number;
  rows?: number;
}

export function TableSkeleton({ columns = 5, rows = 8 }: TableSkeletonProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-4 border-b px-4 py-3">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={`h-${i}`} className="h-4" style={{ width: `${100 / columns}%` }} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, ri) => (
          <div key={ri} className="flex items-center gap-4 border-b last:border-0 px-4 py-3">
            {Array.from({ length: columns }).map((_, ci) => (
              <Skeleton key={`${ri}-${ci}`} className="h-4" style={{ width: `${100 / columns}%` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
