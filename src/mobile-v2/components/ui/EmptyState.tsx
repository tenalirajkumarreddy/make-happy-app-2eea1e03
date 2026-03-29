import { LucideIcon, Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ 
  icon: Icon = Package, 
  title, 
  description, 
  action,
  className 
}: EmptyStateProps) {
  return (
    <div className={cn("mv2-empty-state", className)}>
      <Icon className="mv2-empty-state-icon" />
      <h3 className="mv2-empty-state-title">{title}</h3>
      {description && (
        <p className="mv2-empty-state-description">{description}</p>
      )}
      {action && (
        <button 
          className="mv2-btn mv2-btn-primary mv2-empty-state-action"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
