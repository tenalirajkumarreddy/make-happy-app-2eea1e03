import { Bell, CheckCheck } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationsSheet({ open, onOpenChange }: Props) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[75vh] rounded-t-2xl flex flex-col">
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-white">
              <div className="h-8 w-8 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              Notifications
              {unreadCount > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-xs font-bold">
                  {unreadCount}
                </Badge>
              )}
            </SheetTitle>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                onClick={markAllAsRead}
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Bell className="h-7 w-7 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">All caught up!</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  className={cn(
                    "w-full text-left px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-slate-100 dark:active:bg-slate-700/50",
                    !n.is_read && "bg-blue-50/60 dark:bg-blue-900/10"
                  )}
                  onClick={() => markAsRead(n.id)}
                >
                  <div className="flex gap-3.5 items-start">
                    {/* Unread indicator dot */}
                    <div className="shrink-0 mt-1.5">
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full transition-colors",
                          !n.is_read ? "bg-blue-500" : "bg-transparent"
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-sm leading-snug",
                        !n.is_read ? "font-semibold text-slate-800 dark:text-white" : "font-medium text-slate-700 dark:text-slate-200"
                      )}>
                        {n.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {n.message}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 tabular-nums">
                        {new Date(n.created_at).toLocaleString("en-IN", {
                          day: "2-digit", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
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
