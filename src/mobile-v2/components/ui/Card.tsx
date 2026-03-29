import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  elevated?: boolean;
  glass?: boolean;
  onClick?: () => void;
  padding?: "none" | "sm" | "md" | "lg";
  variant?: "default" | "outline" | "filled" | "ghost";
}

export function Card({ children, className, elevated, glass, onClick, padding = "md", variant = "default" }: CardProps) {
  const paddingClasses = {
    none: "",
    sm: "p-3",
    md: "p-4",
    lg: "p-5",
  };

  const variantClasses = {
    default: elevated ? "mv2-card-elevated" : "mv2-card",
    outline: "mv2-card border border-border bg-transparent",
    filled: "mv2-card bg-muted",
    ghost: "bg-transparent",
  };

  return (
    <div
      className={cn(
        variantClasses[variant],
        glass && "mv2-glass",
        paddingClasses[padding],
        onClick && "cursor-pointer active:scale-[0.99] transition-transform",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn("mb-3", className)}>
      {children}
    </div>
  );
}

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function CardTitle({ children, className }: CardTitleProps) {
  return (
    <h3 className={cn("text-base font-semibold", className)}>
      {children}
    </h3>
  );
}

interface CardDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function CardDescription({ children, className }: CardDescriptionProps) {
  return (
    <p className={cn("text-sm mv2-text-muted mt-0.5", className)}>
      {children}
    </p>
  );
}

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={className}>{children}</div>;
}
