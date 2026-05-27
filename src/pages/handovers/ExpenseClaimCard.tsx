import { Edit2, Receipt, XCircle } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { UserHoverCard } from "@/components/shared/UserHoverCard";

type ExpenseClaimCardProps = {
  item: any;
  showReviewAction?: boolean;
  user: { id: string } | undefined | null;
  actionLoading: string | null;
  highlightExpenseId: string | null;
  profileMap: Record<string, { name: string; avatar: string | null }>;
  highlightedRef: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  onReview: (expense: any) => void;
  onCancelClaim: (claimId: string) => void;
  getCategoryName: (categoryId: string | null) => string;
  getCategoryColor: (categoryId: string | null) => string;
};

export function ExpenseClaimCard({
  item, showReviewAction = false, user, actionLoading, highlightExpenseId,
  profileMap, highlightedRef, onReview, onCancelClaim, getCategoryName, getCategoryColor,
}: ExpenseClaimCardProps) {
  const isOwner = item.user_id === user?.id;
  const isLoading = actionLoading === item.id;
  const isHighlighted = highlightExpenseId === item.id;
  const statusLabel = item.status === "approved" ? "Approved"
    : item.status === "rejected" ? "Rejected"
    : item.status === "cancelled" ? "Cancelled"
    : "Pending";
  const displayAmount = item.status === "approved" && item.approved_amount
    ? Number(item.approved_amount)
    : Number(item.amount);
  const wasAmountChanged = item.status === "approved" && item.approved_amount && Number(item.approved_amount) !== Number(item.amount);
  const wasCategoryChanged = item.status === "approved" && item.category_id !== item.original_category_id;

  return (
    <div
      ref={(el) => { highlightedRef.current[item.id] = el; }}
      className={`group flex items-center gap-4 rounded-lg border bg-card px-4 py-3 hover:shadow-sm transition-shadow border-l-4 ${
        isHighlighted ? "ring-2 ring-primary ring-offset-2 animate-pulse" : ""
      } ${
        item.status === "approved" ? "border-l-green-500" :
        item.status === "rejected" ? "border-l-red-500" :
        item.status === "cancelled" ? "border-l-gray-400" :
        "border-l-orange-500"
      }`}>
      <div className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0" style={{ backgroundColor: `${getCategoryColor(item.category_id)}20` }}>
        <Receipt className="h-5 w-5" style={{ color: getCategoryColor(item.category_id) }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-bold tabular-nums">₹{(displayAmount || 0).toLocaleString()}</span>
          {wasAmountChanged && (
            <span className="text-[10px] text-muted-foreground line-through">₹{Number(item.amount || 0).toLocaleString()}</span>
          )}
          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
            item.status === "approved" ? "bg-success/10 text-success" :
            item.status === "rejected" ? "bg-destructive/10 text-destructive" :
            item.status === "cancelled" ? "bg-muted text-muted-foreground" :
            "bg-warning/10 text-warning"
          }`}>{statusLabel}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate" title={item.description}>
          {item.description}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] font-medium px-1.5 py-px rounded" style={{ backgroundColor: `${getCategoryColor(item.category_id)}20`, color: getCategoryColor(item.category_id) }}>
            {getCategoryName(item.category_id)}
            {wasCategoryChanged && " (changed)"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {format(new Date(item.expense_date), "dd MMM yyyy")}
          </span>
          {!isOwner && (
            <span className="text-[10px] font-medium bg-primary/8 text-primary px-1.5 py-px rounded">
              by <UserHoverCard userId={item.user_id} profileMap={profileMap}>{profileMap?.[item.user_id]?.name || "Unknown"}</UserHoverCard>
            </span>
          )}
        </div>
        {item.reviewer_notes && item.status !== "pending" && (
          <p className="text-[11px] text-muted-foreground/70 italic mt-1 truncate">Note: "{item.reviewer_notes}"</p>
        )}
      </div>

      {showReviewAction && item.status === "pending" && (
        <Button size="sm" className="h-7 text-xs gap-1 px-2.5 shrink-0" onClick={() => onReview(item)} disabled={isLoading}>
          <Edit2 className="h-3 w-3" /> Review
        </Button>
      )}

      {isOwner && item.status === "pending" && (
        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive shrink-0" onClick={() => onCancelClaim(item.id)} disabled={isLoading}>
          <XCircle className="h-3 w-3 mr-1" /> Cancel
        </Button>
      )}
    </div>
  );
}
