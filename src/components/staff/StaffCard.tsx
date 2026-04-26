/**
 * StaffCard Component
 * Modern card-based staff display similar to CustomerCard and StoreCard
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  User,
  Phone,
  Mail,
  Building2,
  Package,
  Wallet,
  MoreHorizontal,
  MapPin,
  Calendar,
  Activity,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
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
import { toast } from "sonner";

interface StaffCardProps {
  staff: {
    id: string;
    user_id: string;
    full_name: string;
    email?: string;
    phone?: string;
    avatar_url?: string;
    role: string;
    is_active: boolean;
    warehouse_id?: string;
    warehouses?: { name: string } | null;
    created_at?: string;
    last_active?: string;
    // Aggregated data
    cash_amount?: number;
    upi_amount?: number;
    stock_count?: number;
    today_sales?: number;
    today_collections?: number;
  };
  onRecordPayment?: (staff: any) => void;
  onEdit?: (staff: any) => void;
  onToggleActive?: (staffId: string, active: boolean) => void;
  className?: string;
}

const roleColors: Record<string, string> = {
  super_admin: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  manager: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  agent: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
  marketer: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  operator: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
};

const roleLabels: Record<string, string> = {
  super_admin: "Admin",
  manager: "Manager",
  agent: "Agent",
  marketer: "Marketer",
  operator: "Operator",
};

export function StaffCard({
  staff,
  onRecordPayment,
  onEdit,
  onToggleActive,
  className,
}: StaffCardProps) {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);

  const totalAmount = (staff.cash_amount || 0) + (staff.upi_amount || 0);
  const hasHoldings = totalAmount > 0 || (staff.stock_count || 0) > 0;

  const handleViewProfile = () => {
    navigate(`/staff/${staff.user_id}`);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

const getStatusColor = () => {
  if (!staff.is_active) return "bg-slate-400 dark:bg-slate-600";
  if (staff.last_active) {
    const lastActive = new Date(staff.last_active);
    const hoursAgo = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60);
    if (hoursAgo < 1) return "bg-green-500 dark:bg-green-600";
    if (hoursAgo < 24) return "bg-amber-500 dark:bg-amber-600";
  }
  return "bg-slate-400 dark:bg-slate-600";
};

  return (
    <div
      className={cn(
        "group relative bg-white rounded-xl border border-border/50",
        "hover:shadow-lg hover:border-primary/20 transition-all duration-200",
        "cursor-pointer overflow-hidden",
        !staff.is_active && "opacity-75 grayscale",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleViewProfile}
    >
      {/* Status Indicator */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <div
          className={cn(
            "w-2.5 h-2.5 rounded-full ring-2 ring-white",
            getStatusColor()
          )}
          title={staff.is_active ? "Active" : "Inactive"}
        />
      </div>

      {/* Main Content */}
      <div className="p-5">
        {/* Header - Avatar + Name */}
        <div className="flex items-start gap-4 mb-4">
          <Avatar className="h-14 w-14 ring-2 ring-border/50">
            <AvatarImage src={staff.avatar_url} alt={staff.full_name} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
              {getInitials(staff.full_name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="font-semibold text-base text-foreground truncate">
              {staff.full_name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-medium px-2 py-0.5",
                  roleColors[staff.role] || "bg-slate-100 text-slate-700"
                )}
              >
                {roleLabels[staff.role] || staff.role}
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

        {/* Contact Info */}
        <div className="space-y-2 mb-4">
          {staff.phone && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{staff.phone}</span>
            </div>
          )}
          {staff.email && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{staff.email}</span>
            </div>
          )}
          {staff.warehouses?.name && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{staff.warehouses.name}</span>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Wallet className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Cash</span>
            </div>
            <p className="text-base font-semibold text-foreground">
              ₹{totalAmount.toLocaleString("en-IN")}
            </p>
            <div className="flex gap-1 mt-1 text-xs text-muted-foreground">
              {staff.cash_amount > 0 && (
                <span className="text-green-600 dark:text-green-400">
                  ₹{staff.cash_amount?.toLocaleString("en-IN")} C
                </span>
              )}
              {staff.upi_amount > 0 && (
                <span className="text-blue-600 dark:text-blue-400">
                  ₹{staff.upi_amount?.toLocaleString("en-IN")} U
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Package className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Stock</span>
            </div>
            <p className="text-base font-semibold text-foreground">
              {staff.stock_count || 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">items held</p>
          </div>
        </div>

        {/* Today's Activity */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <div className="flex items-center gap-3">
            {staff.today_sales !== undefined && staff.today_sales > 0 && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <Activity className="h-3 w-3" />
                <span>{staff.today_sales} sales</span>
              </div>
            )}
            {staff.today_collections !== undefined &&
              staff.today_collections > 0 && (
                <div className="flex items-center gap-1 text-xs text-blue-600">
                  <Wallet className="h-3 w-3" />
                  <span>₹{staff.today_collections} collected</span>
                </div>
              )}
          </div>

          {/* Actions Dropdown */}
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
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewProfile(); }}>
                <User className="h-4 w-4 mr-2" />
                View Profile
              </DropdownMenuItem>
              {onRecordPayment && (
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onRecordPayment(staff); }}
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  Record Payment
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {onEdit && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(staff); }}>
                  Edit Details
                </DropdownMenuItem>
              )}
              {onToggleActive && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleActive(staff.user_id, !staff.is_active);
                  }}
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
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Hover Overlay for Quick Actions */}
      {isHovered && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent pointer-events-none" />
      )}
    </div>
  );
}

export default StaffCard;
