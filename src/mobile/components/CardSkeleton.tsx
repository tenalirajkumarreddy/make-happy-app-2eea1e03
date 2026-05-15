/**
 * CardSkeleton — a shimmer placeholder that matches the shape of admin list cards.
 * Use instead of a spinner while React Query is fetching data for the first time.
 */
export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden animate-pulse">
      <div className="p-3">
        {/* Top row — ID + badge */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="space-y-1.5 flex-1">
            <div className="h-3.5 w-24 bg-slate-200 dark:bg-slate-700 rounded-md" />
            <div className="h-3 w-32 bg-slate-100 dark:bg-slate-600 rounded-md" />
          </div>
          <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>

        {/* Middle row — items */}
        <div className="space-y-1.5 mb-2.5">
          <div className="flex justify-between items-center">
            <div className="h-3 w-40 bg-slate-100 dark:bg-slate-600 rounded" />
            <div className="h-3 w-12 bg-slate-100 dark:bg-slate-600 rounded" />
          </div>
          <div className="flex justify-between items-center">
            <div className="h-3 w-28 bg-slate-100 dark:bg-slate-600 rounded" />
            <div className="h-3 w-12 bg-slate-100 dark:bg-slate-600 rounded" />
          </div>
        </div>

        {/* Bottom row — date + amount */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-50 dark:border-slate-700">
          <div className="h-3 w-28 bg-slate-100 dark:bg-slate-600 rounded" />
          <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded-md" />
        </div>
      </div>

      {/* Action bar */}
      <div className="flex border-t border-slate-100 dark:border-slate-700">
        {[1, 2].map((i) => (
          <div key={i} className={`flex-1 py-2.5 flex justify-center ${i === 1 ? "border-r border-slate-100 dark:border-slate-700" : ""}`}>
            <div className="h-3 w-12 bg-slate-100 dark:bg-slate-600 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * CardSkeletonList — renders N skeleton cards for initial loading state.
 */
export function CardSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="px-4 space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
