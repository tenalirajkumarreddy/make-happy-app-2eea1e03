import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, PencilLine } from "lucide-react";

interface ActiveOrderExistsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderDisplayId: string;
  storeName: string;
  onView: () => void;
  onEdit: () => void;
}

export function ActiveOrderExistsDialog({
  open,
  onOpenChange,
  orderDisplayId,
  storeName,
  onView,
  onEdit,
}: ActiveOrderExistsDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Active Order Already Exists</AlertDialogTitle>
          <AlertDialogDescription>
            Store <strong>{storeName}</strong> already has an active order (<strong>{orderDisplayId}</strong>).
            Each store can only have one pending or confirmed order at a time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onEdit} className="gap-2">
            <PencilLine className="h-4 w-4" />
            Edit Order
          </AlertDialogAction>
          <AlertDialogAction onClick={onView} className="gap-2">
            <Eye className="h-4 w-4" />
            View Order
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
