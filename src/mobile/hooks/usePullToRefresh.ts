import { useRef, useState, useCallback } from "react";

interface Options {
  onRefresh: () => Promise<unknown>;
  threshold?: number; // px to drag before triggering
}

interface PullState {
  isPulling: boolean;
  isRefreshing: boolean;
  pullDistance: number;
}

/**
 * usePullToRefresh — lightweight touch-based pull-to-refresh for mobile list pages.
 * Attach `handlers` to the scrollable container and render the `indicator` above the list.
 */
export function usePullToRefresh({ onRefresh, threshold = 72 }: Options) {
  const startY = useRef(0);
  const [state, setState] = useState<PullState>({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0,
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only activate pull when the container is scrolled to the top
    const target = e.currentTarget as HTMLElement;
    if (target.scrollTop > 2) return;
    startY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const target = e.currentTarget as HTMLElement;
      if (target.scrollTop > 2) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) return;
      // Dampen movement so it feels natural (logarithmic resistance)
      const distance = Math.min(threshold * 1.5, delta * 0.45);
      setState((s) => ({ ...s, isPulling: true, pullDistance: distance }));
    },
    [threshold]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!state.isPulling) return;
    if (state.pullDistance >= threshold) {
      setState({ isPulling: false, isRefreshing: true, pullDistance: 0 });
      try {
        await onRefresh();
      } finally {
        setState({ isPulling: false, isRefreshing: false, pullDistance: 0 });
      }
    } else {
      setState({ isPulling: false, isRefreshing: false, pullDistance: 0 });
    }
  }, [state.isPulling, state.pullDistance, threshold, onRefresh]);

  return {
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    isPulling: state.isPulling,
    isRefreshing: state.isRefreshing,
    pullDistance: state.pullDistance,
    threshold,
  };
}
