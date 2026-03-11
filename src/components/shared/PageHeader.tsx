import React from "react";
import { Button } from "@/components/ui/button";
import { LucideIcon, Plus, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface PageAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost" | "destructive";
  /** Priority determines when the action becomes visible outside the menu.
   *  Lower number = shown earlier as screen grows. Default = 10 (always in menu on small screens). */
  priority?: number;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Primary action — always visible as a button */
  primaryAction?: {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
  };
  /** Secondary actions — shown in overflow menu on small screens, revealed as screen grows */
  actions?: PageAction[];
  /** Always-visible node rendered before the primary action (e.g. a Filters button) */
  filterNode?: React.ReactNode;
}

export function PageHeader({ title, subtitle, primaryAction, actions = [], filterNode }: PageHeaderProps) {
  // Sort by priority (lower = more important)
  const sorted = [...actions].sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10));

  return (
    <div className="flex items-center justify-between gap-3 pb-4 mb-2">
      <div className="min-w-0">
        <h1 className="page-header">{title}</h1>
        {subtitle && <p className="page-subtitle mt-0.5 hidden sm:block">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Secondary actions visible on larger screens */}
        {sorted.map((action, i) => {
          const Icon = action.icon;
          return (
            <Button
              key={i}
              variant={action.variant || "outline"}
              size="sm"
              onClick={action.onClick}
              className={`gap-1.5 ${
                (action.priority ?? 10) <= 1
                  ? "hidden sm:inline-flex"
                  : (action.priority ?? 10) <= 2
                  ? "hidden md:inline-flex"
                  : (action.priority ?? 10) <= 3
                  ? "hidden lg:inline-flex"
                  : "hidden xl:inline-flex"
              }`}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {action.label}
            </Button>
          );
        })}

        {/* Filters node — always visible */}
        {filterNode}

        {/* Primary action — always visible */}
        {primaryAction && (
          <Button onClick={primaryAction.onClick} size="sm" className="gap-1.5">
            {primaryAction.icon ? <primaryAction.icon className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span className="hidden sm:inline">{primaryAction.label}</span>
          </Button>
        )}

        {/* Three-dot overflow menu — visible when actions are hidden */}
        {sorted.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 xl:hidden">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              {sorted.map((action, i) => {
                const Icon = action.icon;
                return (
                  <DropdownMenuItem
                    key={i}
                    onClick={action.onClick}
                    className={`gap-2 ${
                      (action.priority ?? 10) <= 1
                        ? "sm:hidden"
                        : (action.priority ?? 10) <= 2
                        ? "md:hidden"
                        : (action.priority ?? 10) <= 3
                        ? "lg:hidden"
                        : "xl:hidden"
                    }`}
                  >
                    {Icon && <Icon className="h-4 w-4" />}
                    {action.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
