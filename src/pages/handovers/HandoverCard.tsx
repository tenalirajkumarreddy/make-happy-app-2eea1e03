import { CheckCircle, Edit2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { UserHoverCard } from "@/components/shared/UserHoverCard";

type HandoverItem = {
  id: string;
  user_id: string;
  handed_to: string;
  cash_amount: number;
  upi_amount: number;
  status: string;
  created_at: string;
  notes?: string;
};

type HandoverCardProps = {
  item: HandoverItem;
  showActions?: boolean;
  showAdminActions?: boolean;
  user: { id: string } | undefined | null;
  canCancelAnyHandover: boolean;
  isAdminOrManager: boolean;
  actionLoading: string | null;
  profileMap: Record<string, { name: string; avatar: string | null }>;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCancel: (id: string) => void;
  onEdit: (item: HandoverItem) => void;
  onRequestCancel: (id: string) => void;
};

export function HandoverCard({
  item, showActions = false, showAdminActions = false,
  user, canCancelAnyHandover, isAdminOrManager, actionLoading,
  profileMap, onAccept, onDecline, onCancel, onEdit, onRequestCancel,
}: HandoverCardProps) {
  const isSender = item.user_id === user?.id;
  const isRecipient = item.handed_to === user?.id;
  const isPending = item.status === "awaiting_confirmation";
  const total = Number(item.cash_amount) + Number(item.upi_amount);
  const isLoading = actionLoading === item.id;

  const canCancel = (isSender || canCancelAnyHandover) && isPending;
  const canAcceptDecline = isRecipient && isPending;
  const canAdminAct = isAdminOrManager && isPending;

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    confirmed: { label: "Confirmed", color: "text-green-600", bg: "bg-green-50" },
    rejected: { label: "Rejected", color: "text-red-600", bg: "bg-red-50" },
    cancelled: { label: "Cancelled", color: "text-slate-500", bg: "bg-slate-100" },
    awaiting_confirmation: { label: "Pending", color: "text-amber-600", bg: "bg-amber-50" },
  };
  const status = statusConfig[item.status] || statusConfig.awaiting_confirmation;

  const getUserName = (userId: string) => profileMap?.[userId]?.name || "Unknown";

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:shadow-sm transition-shadow">
      <UserHoverCard userId={item.handed_to} profileMap={profileMap} size="md" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tabular-nums">₹{(total || 0).toLocaleString()}</span>
          <span className={`text-2xs font-medium px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>
            {status.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {getUserName(item.user_id)} → {getUserName(item.handed_to)} • {format(new Date(item.created_at), "dd MMM, hh:mm a")}
        </p>
      </div>

      {showActions && canAcceptDecline && (
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" className="h-8 text-xs gap-1" onClick={() => onAccept(item.id)} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
            Accept
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => onDecline(item.id)} disabled={isLoading}>
            Decline
          </Button>
        </div>
      )}

      {showAdminActions && canAdminAct && (
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" className="h-8 text-xs gap-1" onClick={() => onAccept(item.id)} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
            Accept
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => onDecline(item.id)} disabled={isLoading}>
            Decline
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => onEdit(item)} disabled={isLoading}>
            <Edit2 className="h-3 w-3" /> Edit
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => onCancel(item.id)} disabled={isLoading}>
            Cancel
          </Button>
        </div>
      )}

      {canCancel && !canAcceptDecline && !canAdminAct && (
        <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground hover:text-destructive shrink-0" onClick={() => onRequestCancel(item.id)} disabled={isLoading}>
          Cancel
        </Button>
      )}
    </div>
  );
}
