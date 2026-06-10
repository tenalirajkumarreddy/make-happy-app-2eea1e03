import { useState, useCallback, useEffect, useRef } from "react";

export function usePagination(pageSize: number, deps: unknown[] = []) {
  const [page, setPage] = useState(1);
  const prevDepsRef = useRef(deps);

  useEffect(() => {
    const prev = prevDepsRef.current;
    const changed = deps.some((dep, i) => dep !== prev[i]);
    if (changed) {
      setPage(1);
      prevDepsRef.current = deps;
    }
  }, deps);

  const loadMore = useCallback(() => setPage((p) => p + 1), []);

  const range: [number, number] = [0, page * pageSize - 1];

  const hasMoreFromCount = useCallback(
    (totalCount: number | undefined, currentLength: number) => {
      if (totalCount !== undefined) return page * pageSize < totalCount;
      return currentLength >= page * pageSize;
    },
    [page, pageSize]
  );

  return { page, setPage, loadMore, range, hasMoreFromCount, pageSize };
}
