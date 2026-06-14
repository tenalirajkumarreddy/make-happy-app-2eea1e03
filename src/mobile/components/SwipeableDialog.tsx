import { forwardRef, ReactNode } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDialogSwipeToDismiss } from "./hooks/useSwipeToDismiss";

interface SwipeableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  onSaveDraft?: () => void;
}

export const SwipeableDialog = forwardRef<HTMLButtonElement, SwipeableDialogProps>(
  ({ open, onOpenChange, children, className, onSaveDraft, ...props }, ref) => {
    const { ref: contentRef, style, handlers, dragOffset } = useDialogSwipeToDismiss(
      open,
      onOpenChange,
      onSaveDraft
    );

    const isDragging = dragOffset > 0;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <button
            ref={ref}
            className={cn("w-full h-full", isDragging && "pointer-events-none")}
            {...props}
          />
        </DialogTrigger>
        <DialogContent
          ref={contentRef}
          className={cn(className, "transition-none")}
          style={style}
          {...handlers}
        >
          {children}
        </DialogContent>
      </Dialog>
    );
  }
);

SwipeableDialog.displayName = "SwipeableDialog";