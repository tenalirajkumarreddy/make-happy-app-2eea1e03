import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface QuickActionProps {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  href?: string;
  primary?: boolean;
  className?: string;
}

export function QuickAction({ label, icon: Icon, onClick, href, primary, className }: QuickActionProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (href) {
      navigate(href);
    }
  };

  return (
    <button
      className={cn(
        "mv2-quick-action",
        primary && "mv2-quick-action-primary",
        className
      )}
      onClick={handleClick}
    >
      <div className="mv2-quick-action-icon">
        <Icon className="h-5 w-5" />
      </div>
      <span className="mv2-quick-action-label">{label}</span>
    </button>
  );
}

interface QuickActionsGridProps {
  children: React.ReactNode;
  columns?: 3 | 4;
  className?: string;
}

export function QuickActionsGrid({ children, columns = 4, className }: QuickActionsGridProps) {
  return (
    <div 
      className={cn(
        "mv2-quick-actions",
        columns === 3 && "!grid-cols-3",
        className
      )}
    >
      {children}
    </div>
  );
}
