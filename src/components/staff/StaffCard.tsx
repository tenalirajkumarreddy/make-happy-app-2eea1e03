/**
 * StaffCard - Refactored card component for staff directory.
 * Shows: profile, role badge, holdings (cash + stock), key permissions,
 * and today's activity with clear empty states.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Phone,
  Mail,
  Building2,
  Package,
  Wallet,
  MoreHorizontal,
  Activity,
  CheckCircle2,
  XCircle,
  Eye,
  Shield,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { StaffMember } from "@/types/staff";
import type { AppRole } from "@/types/roles";
import { PERMISSION_LABELS } from "@/lib/permissions";

// ── Role styling ────────────────────────────────────────────────────────────
const ROLE_CONFIG: Record<
  AppRole,
  { label: string; color性地  
    className: string; dotClass: string }
> = {
  super_admin: {
    label: "Admin",
    className: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    dotClass: "bg-red-500",
  },
  manager: {
    label: "Manager",
    className: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    dotClass: "bg-blue-500",
  },
  agent: {
    label: "Agent",
    className: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
    dotClass: "bg-green-500",
  },
  marketer: {
    label: "Marketer",
    className: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    dotClass: "bg-purple-500",
  },
  operator: {
    label: "Operator",
    className: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
    dotClass: "bg-orange-500",
  },
  customer: {
    label: "Customer",
    className: "bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800",
    dotClass: "bg-slate-500",
  },
};

// ── Activity status color ───────────────────────────────────────────────────
function getLastActiveColor(lastActive: string | null): string {
  if (!lastActive) return "bg-slate-400 dark:bg-slate-600";
  const hoursAgo = (Date.now() - new Date(lastActive).getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 1) return "bg-emerald-500 dark:bg-emerald-600";
  if (hoursAgo < 24) return "bg-amber-500 dark:bg-amber-600";
  return "bg-slate-400 dark:bg-slate-600";
}

// ── Component ───────────────────────────────────────────────────────────────
export interface StaffCardProps {
  staff: StaffMember;
  onToggleActive?: (userId: string, active: boolean) => void;
  className?: string;
}

export function StaffCard({ staff, onToggleActive, className }: StaffCardProps) {
  const navigate = useNavigate();

  const hasHoldings = staff.holdings.total_amount > 0 || staff.stock.total_value > 0;
  const statusColor = getLastActiveColor(staff.last_active_at);
  const roleConfig = ROLE_CONFIG[staff.role] || ROLE_CONFIG.customer;

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <div
      className={cn(
        "group relative bg-white rounded-xl border border-border/50",
        "hover:shadow-md hover:border-primary/20 transition-all duration-200",
        "overflow-hidden",
        !staff.is_active && "opacity-75 grayscale",
        className
      )}
    >
      {/* Status Indicator */}
      <div className="absolute top-3 right-3">
        <div
          className={cn("w-2.5 h-2.5 rounded-full ring-2 ring-white", statusColor)}
          title={staff.is_active ? "Active" : "Inactive"}
        />
      </div>

      <div className="p-5">
        {/* ── Header: Avatar + Name + Role ──────────────────────────────── */}
        <div className="flex items-start gap-4 mb-4">
          <Avatar className="h-14 w-14 ring-2 ring-border/50 shrink-0">
            <AvatarImage src={staff.avatar_url || undefined} alt={staff.full_name} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
              {getInitials(staff.full_name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="font-semibold text-base text-foreground truncate" title={staff.full_name}>
              {staff.full_name}
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className={cn("text-xs font-medium px-2 py-0.5", roleConfig.className)}>
                {roleConfig.label}
              </Badge>
              {hasHoldings && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                >
                  Has Holdings
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* ── Contact Info ───────────────────────────────────────────────── */}
        <div className="space-y-1.5 mb-4">
          {staff.phone && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate" title={staff.phone}>{staff.phone}</span>
            </div>
          )}
          {staff.email && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate" title={staff.email}>{staff.email}</span>
            </div>
          )}
          {staff.warehouse_name && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{staff.warehouse_name}</span>
            </div>
          )}
        </div>

        {/* ── Holdings Grid: Cash + Stock ────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Cash Holding */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Wallet className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Cash</span>
            </div>
            <p className="text-base font-semibold text-foreground">
              ₹{staff.holdings.total_amount.toLocaleString("en-IN")}
            </p>
            <div className="flex gap-1 mt-1 text-xs text-muted-foreground">
              {staff.holdings.cash_amount > 0 && (
                <span className="text-green-600 dark:text-green-400">
                  ₹{staff.holdings.cash_amount.toLocaleString("en-IN")} C
                </span>
              )}
              {staff.holdings.upi_amount > 0 && (
                <span className="text-blue-600 dark:text-blue-400">
                  ₹{staff.holdings.upi_amount.toLocaleString("en-IN")} U
                </span>
              )}
              {staff.holdings.total_amount === 0 && (
                <span className="text-slate-400">No cash</span>
              )}
            </div>
          </div>

          {/* Stock Holding */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Package className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Stock</span>
            </div>
            <p className="text-base font-semibold text-foreground">
              {staff.stock.total_items} items
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {staff.stock.total_value > 0 ? (
                <span className="text-amber-600 dark:text-amber-400">
                  ₹{staff.stock.total_value.toLocaleString("en-IN")} value
                </span>
              ) : (
                <span className="text-slate-400">No stock</span>
              )}
            </p>
          </div>
        </div>

        {/* ── Key Permissions (max 3) ────────────────────────────────────── */}
        {staff.key_permissions.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <Shield className="h-3 w-3" />
              <span className="font-medium">Permissions</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {staff.key_permissions.slice(0, 3).map((perm) => (
                <Badge key={perm} variant="outline" className="text-[10px] px-1.5 py-0.5 bg-primary/5">
                  {PERMISSION_LABELS[perm] || perm}
                </Badge>
              ))}
              {staff.key_permissions.length > 3 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                  +{staff.key_permissions.length - 3}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* ── Today's Activity ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50 min-h-[40px]">
          <div className="flex items-center gap-3">
            {staff.activity.today_sales_count > 0 ? (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <Activity className="h-3 w-3" />
                <span>{staff.activity.today_sales_count} sales</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Activity className="h-3 w-3" />
                <span>0 sales</span>
              </div>
            )}
            {staff.activity.today_collections_amount > 0 ? (
              <div className="flex items-center gap-1 text-xs text-blue-600">
                <Wallet className="h-3 w-3" />
                <span>₹{staff.activity.today_collections_amount.toLocaleString("en-IN")} collected</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Wallet className="h-3 w-3" />
                <span>₹0 collected</span>
              </div>
            )}
          </div>

          {/* ── Actions Dropdown (separate from card click) ───────────── */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate(`/staff/${staff.user_id}`)}>
                <Eye className="h-4 w-4 mr-2" />
                View Profile
              </DropdownMenuItem>
              {onToggleActive && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onToggleActive(staff.user_id, !staff.is_active)}
                    className={staff.is_active ? "text-red-600" : "text-green-600"}
                  >
                    {staff.is_active ? (
                      <>
                        <XCircle className="h-4 w-4 mr-2" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Activate
                      </>
                    )}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export default StaffCard;
