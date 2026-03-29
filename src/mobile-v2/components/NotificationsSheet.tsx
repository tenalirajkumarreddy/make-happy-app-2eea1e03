import { Bell, CheckCheck, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/Badge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationsSheet({ open, onOpenChange }: Props) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[75vh] rounded-t-3xl flex flex-col px-0 mv2-bg-card">
        {/* Handle */}
        <div className="mv2-sheet-handle mx-auto mt-3" />
        
        <SheetHeader className="px-4 pb-3 border-b mv2-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 mv2-text-primary" />
              Notifications
              {unreadCount > 0 && (
                <Badge variant="primary">
                  {unreadCount}
                </Badge>
              )}
            </SheetTitle>
            {unreadCount > 0 && (
              <button
                className="mv2-btn mv2-btn-ghost mv2-btn-sm text-xs gap-1"
                onClick={markAllAsRead}
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="mv2-empty-state">
              <Bell className="mv2-empty-state-icon" />
              <h3 className="mv2-empty-state-title">No notifications</h3>
              <p className="mv2-empty-state-description">
                You're all caught up! Check back later for updates.
              </p>
            </div>
          ) : (
            <div className="divide-y mv2-border">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  className={cn(
                    "w-full text-left px-4 py-3.5 transition-colors hover:mv2-bg-accent active:mv2-bg-muted",
                    !n.is_read && "bg-[var(--mv2-primary)]/5"
                  )}
                  onClick={() => markAsRead(n.id)}
                >
                  <div className="flex gap-3 items-start">
                    <div
                      className={cn(
                        "h-2.5 w-2.5 rounded-full mt-1.5 shrink-0",
                        !n.is_read ? "mv2-bg-primary" : "bg-transparent"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight">{n.title}</p>
                      <p className="text-[13px] mv2-text-muted mt-0.5 leading-snug">
                        {n.message}
                      </p>
                      <p className="text-[11px] mv2-text-muted opacity-70 mt-1.5">
                        {new Date(n.created_at).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
