import { cn } from "@/lib/utils";

type BadgeVariant = "primary" | "secondary" | "success" | "warning" | "destructive" | "outline";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "secondary", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "mv2-badge",
        variant === "primary" && "mv2-badge-primary",
        variant === "secondary" && "mv2-badge-secondary",
        variant === "success" && "mv2-badge-success",
        variant === "warning" && "mv2-badge-warning",
        variant === "destructive" && "mv2-badge-destructive",
        variant === "outline" && "mv2-badge-outline",
        className
      )}
    >
      {children}
    </span>
  );
}
