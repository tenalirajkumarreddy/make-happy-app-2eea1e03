import { Bell, ChevronDown, LogOut, Moon, Sun, CheckCheck, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, requestNotificationPermission } from "@/hooks/useNotifications";
import { Badge } from "@/components/ui/badge";
import { GlobalSearch } from "./GlobalSearch";
import { OfflineQueueStatus } from "@/components/shared/OfflineQueueStatus";

function useTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark";
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

const typeIcon = (type: string) => {
  switch (type) {
    case "order": return "🛒";
    case "payment": return "💳";
    case "handover": return "💰";
    case "system": return "⚙️";
    default: return "🔔";
  }
};

const typeColor = (type: string) => {
  switch (type) {
    case "order": return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "payment": return "bg-green-500/10 text-green-600 dark:text-green-400";
    case "handover": return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "system": return "bg-purple-500/10 text-purple-600 dark:text-purple-400";
    default: return "bg-muted text-muted-foreground";
  }
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function TopBar() {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const { dark, toggle } = useTheme();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);

  // Request browser notification permission on first render
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const roleName = role ? role.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "User";

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleNotificationClick = (n: any) => {
    if (!n.is_read) markAsRead(n.id);
    // Navigate based on entity type
    if (n.entity_type === "order" && n.entity_id) navigate("/orders");
    else if (n.entity_type === "sale" && n.entity_id) navigate("/sales");
    else if (n.entity_type === "transaction" && n.entity_id) navigate("/transactions");
    else if (n.entity_type === "handover" && n.entity_id) navigate("/handovers");
    else if (n.entity_type === "customer" && n.entity_id) navigate(`/customers/${n.entity_id}`);
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4 lg:px-6">
      <div className="w-10 lg:w-0" />
      <div className="flex-1 mx-4 max-w-sm">
        <GlobalSearch />
      </div>
      <div className="ml-auto flex items-center gap-2">
        {/* Offline queue status indicator */}
        <OfflineQueueStatus />

        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* Notifications */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1 animate-pulse">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">Notifications</p>
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-5">{unreadCount} new</Badge>
                )}
              </div>
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <CheckCheck className="h-3 w-3" />
                  Mark all read
                </button>
              )}
            </div>
            <ScrollArea className="max-h-96">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent/50 ${
                        n.is_read ? "opacity-60" : ""
                      }`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${typeColor(n.type)}`}>
                        {typeIcon(n.type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`leading-snug truncate ${n.is_read ? "" : "font-semibold"}`}>
                            {n.title}
                          </p>
                          {!n.is_read && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[11px] text-muted-foreground/70 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary transition-colors">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {initials}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-medium leading-none">{profile?.full_name || "User"}</p>
                <p className="text-[11px] text-muted-foreground">{roleName}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(role === "customer" ? "/portal/profile" : "/profile")}>
              <User className="mr-2 h-4 w-4" />
              My Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
