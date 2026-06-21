import { forwardRef, ReactNode } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useSheetSwipeToDismiss } from "./hooks/useSwipeToDismiss";

interface SwipeableSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  onSaveDraft?: () => void;
  side?: "left" | "right" | "top" | "bottom";
}

export const SwipeableSheet = forwardRef<HTMLButtonElement, SwipeableSheetProps>(
  ({ open, onOpenChange, children, className, onSaveDraft, side = "left", ...props }, ref) => {
    const { ref: contentRef, style, handlers, dragOffset } = useSheetSwipeToDismiss(
      open,
      onOpenChange,
      onSaveDraft
    );

    const isDragging = dragOffset > 0;

    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>
          <button
            ref={ref}
            className={cn("w-full h-full", isDragging && "pointer-events-none")}
            {...props}
          />
        </SheetTrigger>
        <SheetContent
          ref={contentRef}
          side={side}
          className={cn(className, "transition-none")}
          style={style}
          {...handlers}
        >
          {children}
        </SheetContent>
      </Sheet>
    );
  }
);

SwipeableSheet.displayName = "SwipeableSheet";