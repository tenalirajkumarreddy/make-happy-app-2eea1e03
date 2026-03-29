import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface SectionProps {
  title?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  children: React.ReactNode;
  className?: string;
}

export function Section({ title, action, children, className }: SectionProps) {
  const navigate = useNavigate();

  const handleActionClick = () => {
    if (action?.onClick) {
      action.onClick();
    } else if (action?.href) {
      navigate(action.href);
    }
  };

  return (
    <div className={cn("mv2-section", className)}>
      {(title || action) && (
        <div className="mv2-section-header">
          {title && <h3 className="mv2-section-title">{title}</h3>}
          {action && (
            <button className="mv2-section-action" onClick={handleActionClick}>
              {action.label}
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
