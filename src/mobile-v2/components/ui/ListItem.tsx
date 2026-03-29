import { LucideIcon, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface ListItemProps {
  title: string;
  subtitle?: string;
  meta?: string;
  icon?: LucideIcon;
  iconBgClass?: string;
  iconColor?: string;
  avatar?: string;
  badge?: React.ReactNode;
  trailing?: React.ReactNode;
  showArrow?: boolean;
  onClick?: () => void;
  href?: string;
  className?: string;
  children?: React.ReactNode;
}

export function ListItem({
  title,
  subtitle,
  meta,
  icon: Icon,
  iconBgClass,
  iconColor,
  avatar,
  badge,
  trailing,
  showArrow = true,
  onClick,
  href,
  className,
  children,
}: ListItemProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (href) {
      navigate(href);
    }
  };

  const isClickable = onClick || href;

  return (
    <div
      className={cn("mv2-list-item", className)}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      {Icon && (
        <div className={cn("mv2-list-item-icon", iconBgClass)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      )}
      {avatar && (
        <img src={avatar} alt="" className="mv2-list-item-avatar" />
      )}
      <div className="mv2-list-item-content">
        <p className="mv2-list-item-title">{title}</p>
        {subtitle && <p className="mv2-list-item-subtitle">{subtitle}</p>}
        {meta && <p className="mv2-list-item-meta">{meta}</p>}
        {children}
      </div>
      {trailing && <div className="flex-shrink-0">{trailing}</div>}
      {badge && <div className="mv2-list-item-badge">{badge}</div>}
      {showArrow && isClickable && (
        <ChevronRight className="mv2-list-item-action h-5 w-5" />
      )}
    </div>
  );
}
