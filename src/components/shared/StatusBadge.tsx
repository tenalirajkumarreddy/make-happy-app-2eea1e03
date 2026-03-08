import { cn } from "@/lib/utils";

type Status = "active" | "inactive" | "pending" | "verified" | "rejected" | "delivered" | "cancelled";

const statusStyles: Record<Status, string> = {
  active: "bg-success/10 text-success",
  inactive: "bg-muted text-muted-foreground",
  pending: "bg-warning/10 text-warning",
  verified: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
  delivered: "bg-info/10 text-info",
  cancelled: "bg-destructive/10 text-destructive",
};

interface StatusBadgeProps {
  status: Status;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", statusStyles[status])}>
      {label || status}
    </span>
  );
}
