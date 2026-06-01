import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

export function NotificationPanel() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();

  const handleNotificationClick = (n: any) => {
    if (!n.is_read) markAsRead(n.id);

    // Navigate based on entity type
    if (n.entity_type === "order" && n.entity_id) navigate(`/orders?highlight=${n.entity_id}`);
    else if (n.entity_type === "sale" && n.entity_id) navigate(`/sales?highlight=${n.entity_id}`);
    else if (n.entity_type === "transaction" && n.entity_id) navigate(`/transactions?highlight=${n.entity_id}`);
    else if (n.entity_type === "handover" && n.entity_id) navigate(`/handovers?highlight=${n.entity_id}`);
    else if (n.entity_type === "expense_claim" && n.entity_id) navigate(`/handovers?highlight=${n.entity_id}`);
    else if (n.entity_type === "expense_request" && n.entity_id) navigate(`/handovers?highlight=${n.entity_id}`);
    else if (n.entity_type === "stock_transfer" && n.entity_id) navigate(`/stock-transfers?highlight=${n.entity_id}`);
    else if (n.entity_type === "customer" && n.entity_id) navigate(`/customers/${n.entity_id}`);
  };

  const timeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return format(new Date(dateStr), "dd MMM");
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "order": return "bg-blue-500/10 text-blue-600";
      case "payment": return "bg-green-500/10 text-green-600";
      case "handover": return "bg-amber-500/10 text-amber-600";
      case "expense_request": return "bg-purple-500/10 text-purple-600";
      case "expense_claim": return "bg-purple-500/10 text-purple-600";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4" />
          <span className="font-medium">Notifications</span>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="h-5 px-1.5 text-xs">
              {unreadCount} new
            </Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" className="text-xs h-8" onClick={markAllAsRead}>
            <CheckCheck className="h-3 w-3 mr-1" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p>No notifications yet</p>
        </div>
      ) : (
        <ScrollArea className="h-[60vh]">
          <div className="space-y-2">
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={cn(
                  "w-full text-left p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors",
                  !n.is_read && "bg-primary/5 border-primary/20"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn("h-2 w-2 rounded-full mt-2 shrink-0", !n.is_read ? "bg-primary" : "bg-transparent")} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm leading-tight", !n.is_read ? "font-medium" : "text-muted-foreground")}>
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {n.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}