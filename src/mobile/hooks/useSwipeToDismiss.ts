import { useRef, useEffect, useState, useCallback } from "react";

interface UseSwipeToDismissOptions {
  onDismiss: () => void;
  onSaveDraft?: () => void;
  threshold?: number;
  enabled?: boolean;
}

export function useSwipeToDismiss({
  onDismiss,
  onSaveDraft,
  threshold = 100,
  enabled = true,
}: UseSwipeToDismissOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startY = useRef<number>(0);
  const elementRef = useRef<HTMLElement>(null);
  const savedDraft = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    startY.current = e.touches[0].clientY;
    setIsDragging(true);
  }, [enabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled || !isDragging) return;
    
    const currentY = e.touches[0].clientY;
    const delta = currentY - startY.current;
    
    // Only allow downward drag
    if (delta > 0) {
      e.preventDefault();
      const offset = Math.min(delta * 0.5, 200);
      setDragOffset(offset);
    }
  }, [enabled, isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!enabled || !isDragging) return;
    
    setIsDragging(false);
    
    if (dragOffset >= threshold) {
      // Dismiss
      if (onSaveDraft && !savedDraft.current) {
        onSaveDraft();
        savedDraft.current = true;
      }
      onDismiss();
    } else {
      // Snap back
      setDragOffset(0);
    }
  }, [enabled, isDragging, dragOffset, threshold, onDismiss, onSaveDraft]);

  const style = {
    transform: `translateY(${dragOffset}px)`,
    transition: isDragging ? "none" : "transform 300ms ease-out",
    opacity: dragOffset > 150 ? 1 - (dragOffset - 150) / 100 : 1,
  };

  return {
    ref: elementRef,
    style,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    isDragging,
    dragOffset,
  };
}

// Hook for Dialog swipe-to-dismiss
export function useDialogSwipeToDismiss(
  open: boolean,
  onOpenChange: (open: boolean) => void,
  onSaveDraft?: () => void
) {
  const { ref, style, handlers, dragOffset } = useSwipeToDismiss({
    onDismiss: () => onOpenChange(false),
    onSaveDraft,
    threshold: 100,
    enabled: open,
  });

  return { ref, style, handlers, dragOffset };
}

// Hook for Sheet swipe-to-dismiss (bottom sheets)
export function useSheetSwipeToDismiss(
  open: boolean,
  onOpenChange: (open: boolean) => void,
  onSaveDraft?: () => void
) {
  const { ref, style, handlers, dragOffset } = useSwipeToDismiss({
    onDismiss: () => onOpenChange(false),
    onSaveDraft,
    threshold: 120,
    enabled: open,
  });

  return { ref, style, handlers, dragOffset };
}