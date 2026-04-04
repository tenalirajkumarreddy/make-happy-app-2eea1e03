import { Skeleton } from "@/components/ui/skeleton";

interface MobileListSkeletonProps {
  /** Number of card items to show */
  items?: number;
  /** Show stat cards at top */
  showStats?: boolean;
  /** Number of stat cards */
  statCount?: number;
  /** Show search bar */
  showSearch?: boolean;
  /** Header title width */
  titleWidth?: string;
}

/**
 * Mobile-optimized skeleton loader for list views
 */
export function MobileListSkeleton({
  items = 5,
  showStats = true,
  statCount = 4,
  showSearch = true,
  titleWidth = "w-32",
}: MobileListSkeletonProps) {
  return (
    <div className="pb-8 bg-slate-50 dark:bg-[#0f1115] min-h-full animate-pulse">
      {/* Hero Header Skeleton */}
      <div className="bg-white dark:bg-[#1a1d24] px-5 pt-3 pb-6 rounded-b-[2rem] shadow-sm mb-6">
        <div className="flex flex-col items-center text-center">
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-12 w-24 mb-3" />
        </div>
        
        {showStats && (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {Array.from({ length: statCount }).map((_, i) => (
              <div key={i} className="text-center py-2">
                <Skeleton className="h-6 w-8 mx-auto mb-1" />
                <Skeleton className="h-3 w-12 mx-auto" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 space-y-4">
        {/* Search Bar Skeleton */}
        {showSearch && (
          <div className="flex gap-3 mb-4">
            <Skeleton className="h-11 flex-1 rounded-xl" />
            <Skeleton className="h-11 w-11 rounded-xl" />
          </div>
        )}

        {/* Title Skeleton */}
        <div className="flex items-center justify-between mb-3">
          <Skeleton className={`h-5 ${titleWidth}`} />
          <Skeleton className="h-4 w-16" />
        </div>

        {/* Card Items Skeleton */}
        <div className="space-y-3">
          {Array.from({ length: items }).map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#1a1d24] rounded-2xl shadow-sm p-4"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <div className="flex justify-between items-center">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Mobile dashboard skeleton with stat grid
 */
export function MobileDashboardSkeleton() {
  return (
    <div className="pb-8 bg-slate-50 dark:bg-[#0f1115] min-h-full animate-pulse">
      {/* Hero */}
      <div className="bg-white dark:bg-[#1a1d24] px-5 pt-3 pb-6 rounded-b-[2rem] shadow-sm mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div>
            <Skeleton className="h-4 w-24 mb-1" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="text-center">
          <Skeleton className="h-3 w-16 mx-auto mb-2" />
          <Skeleton className="h-10 w-28 mx-auto" />
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* Stat Cards Grid */}
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#1a1d24] rounded-2xl shadow-sm p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-6 w-12" />
            </div>
          ))}
        </div>

        {/* Quick Actions Skeleton */}
        <Skeleton className="h-5 w-28 mb-2" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center">
              <Skeleton className="h-12 w-12 rounded-xl mb-2" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>

        {/* Recent List */}
        <Skeleton className="h-5 w-32 mt-4" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#1a1d24] rounded-xl p-3 flex items-center gap-3"
            >
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-4 w-28 mb-1" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-14" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
