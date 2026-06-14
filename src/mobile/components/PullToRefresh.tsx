"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Spinner, ArrowDown } from "@phosphor-icons/react";
import { useUIHaptics } from "../hooks/useHaptics";

interface Props {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  threshold?: number;
  maxPull?: number;
}

export function PullToRefresh({ 
  onRefresh, 
  children, 
  threshold = 80, 
  maxPull = 120 
}: Props) {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showArrow, setShowArrow] = useState(true);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number>(0);
  const { haptic, hapticSuccess } = useUIHaptics();

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isRefreshing) return;
    const container = containerRef.current;
    if (!container) return;
    
    // Only allow pull-to-refresh when at top of scroll
    if (container.scrollTop > 0) return;
    
    startY.current = e.touches[0].clientY;
    setIsPulling(true);
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;
    
    const currentY = e.touches[0].clientY;
    const distance = Math.max(0, currentY - startY.current);
    
    if (distance > 0) {
      e.preventDefault();
      const clamped = Math.min(distance * 0.5, maxPull);
      setPullDistance(clamped);
      setShowArrow(clamped < threshold);
    }
  }, [isPulling, isRefreshing, maxPull, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || isRefreshing) return;
    
    setIsPulling(false);
    
    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      haptic("light");
      
      try {
        await onRefresh();
        hapticSuccess();
      } catch (err) {
        console.error("Pull to refresh failed:", err);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isPulling, isRefreshing, pullDistance, threshold, onRefresh, haptic, hapticSuccess]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    container.addEventListener("touchstart", handleTouchStart as EventListener, { passive: true });
    container.addEventListener("touchmove", handleTouchMove as EventListener, { passive: false });
    container.addEventListener("touchend", handleTouchEnd as EventListener, { passive: true });
    
    return () => {
      container.removeEventListener("touchstart", handleTouchStart as EventListener);
      container.removeEventListener("touchmove", handleTouchMove as EventListener);
      container.removeEventListener("touchend", handleTouchEnd as EventListener);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / threshold, 1);
  const rotateDeg = progress * 180;

  return (
    <div 
      ref={containerRef}
      className="overflow-auto"
      style={{ 
        transform: isPulling && !isRefreshing ? `translateY(${pullDistance}px)` : undefined,
        transition: isRefreshing ? "transform 300ms ease-out" : (isPulling ? "none" : "transform 300ms ease-out"),
      }}
    >
      {/* Pull indicator */}
      {(isPulling || isRefreshing) && (
        <div 
          className="flex items-center justify-center h-16 -mt-16 transition-opacity"
          style={{ opacity: pullDistance > 10 ? 1 : 0 }}
        >
          {isRefreshing ? (
            <Spinner className="h-6 w-6 animate-spin text-primary"  />
          ) : (
            <ArrowDown 
              className={`h-6 w-6 text-muted-foreground transition-transform duration-200 ${showArrow ? "rotate-180" : ""}`}
              style={{ transform: showArrow ? `rotate(${rotateDeg}deg)` : `rotate(${rotateDeg}deg) scale(0.5)` }}
             />
          )}
        </div>
      )}
      
      {children}
    </div>
  );
}