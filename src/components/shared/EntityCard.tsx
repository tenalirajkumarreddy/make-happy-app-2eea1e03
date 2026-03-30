import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { Badge } from "@/components/ui/badge";
import { CARD_STYLES, ENTITY_COLORS } from "@/lib/breakpoints";

interface EntityCardProps {
  // Required props
  children: React.ReactNode;
  onClick?: () => void;
  
  // Header configuration
  imageUrl?: string | null;
  imageAlt?: string;
  icon?: LucideIcon;
  entityType?: keyof typeof ENTITY_COLORS;
  headerHeight?: "sm" | "md" | "lg";
  
  // Status
  isActive?: boolean;
  statusLabel?: string;
  badges?: { label: string; variant?: "default" | "secondary" | "outline" | "destructive" }[];
  
  // Selection
  isSelected?: boolean;
  selectionNode?: React.ReactNode;
  
  // Styling
  className?: string;
}

const headerHeights = {
  sm: "h-20",
  md: "h-28",
  lg: "h-36",
};

export function EntityCard({
  children,
  onClick,
  imageUrl,
  imageAlt = "Entity image",
  icon: Icon,
  entityType = "customer",
  headerHeight = "md",
  isActive = true,
  statusLabel,
  badges = [],
  isSelected = false,
  selectionNode,
  className,
}: EntityCardProps) {
  const colors = ENTITY_COLORS[entityType];
  
  return (
    <div
      onClick={onClick}
      className={cn(
        CARD_STYLES.clickable,
        !isActive && CARD_STYLES.inactive,
        isSelected && CARD_STYLES.selected,
        className
      )}
    >
      {/* Header with gradient background and image/icon */}
      <div className={cn(
        "relative flex items-center justify-center bg-gradient-to-br",
        colors.gradient,
        headerHeights[headerHeight]
      )}>
        {imageUrl ? (
          <img 
            src={imageUrl} 
            alt={imageAlt} 
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" 
          />
        ) : Icon ? (
          <div className="w-16 h-16 rounded-lg bg-muted/50 flex items-center justify-center backdrop-blur-sm">
            <Icon className={cn("h-8 w-8", colors.icon)} />
          </div>
        ) : null}
        
        {/* Status badge - top right */}
        <div className="absolute top-2 right-2 flex items-center gap-2">
          {selectionNode}
          {statusLabel !== undefined && (
            <StatusBadge 
              status={isActive ? "active" : "inactive"} 
              label={statusLabel}
            />
          )}
        </div>
        
        {/* Type badges - bottom left */}
        {badges.length > 0 && (
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
            {badges.map((badge, idx) => (
              <Badge key={idx} variant={badge.variant || "secondary"} className="text-xs">
                {badge.label}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {children}
      </div>
    </div>
  );
}

// Sub-components for consistent content structure
EntityCard.Title = function EntityCardTitle({ 
  children, 
  subtitle 
}: { 
  children: React.ReactNode; 
  subtitle?: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-semibold text-lg text-foreground truncate">{children}</h3>
      {subtitle && (
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{subtitle}</p>
      )}
    </div>
  );
};

EntityCard.Section = function EntityCardSection({ 
  label, 
  children,
  className 
}: { 
  label?: string; 
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("text-sm", className)}>
      {label && (
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      )}
      {children}
    </div>
  );
};

EntityCard.ContactInfo = function EntityCardContactInfo({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
};

EntityCard.Stat = function EntityCardStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="pt-2 border-t">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={cn("font-bold text-lg text-foreground", valueClassName)}>{value}</p>
      </div>
    </div>
  );
};

EntityCard.Actions = function EntityCardActions({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="pt-2 border-t flex items-center justify-between gap-2">
      {children}
    </div>
  );
};
