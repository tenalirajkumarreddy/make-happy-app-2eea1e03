import { Bell, ChevronDown, LogOut, Moon, Sun } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Notification {
  id: string;
  message: string;
  time: string;
  type: "order" | "kyc" | "handover" | "system";
  read: boolean;
}

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

export function TopBar() {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const { dark, toggle } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Fetch initial notifications from recent activity
  useEffect(() => {
    async function fetchRecent() {
      const [ordersRes, kycRes, handoversRes] = await Promise.all([
        supabase.from("orders").select("id, display_id, created_at, status, stores(name)").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
        supabase.from("customers").select("id, name, kyc_submitted_at").eq("kyc_status", "pending").order("kyc_submitted_at", { ascending: false }).limit(5),
        supabase.from("handovers").select("id, created_at, status").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
      ]);

      const notifs: Notification[] = [];
      (ordersRes.data || []).forEach((o: any) => {
        notifs.push({
          id: `order-${o.id}`,
          message: `New order ${o.display_id} from ${o.stores?.name || "store"}`,
          time: o.created_at,
          type: "order",
          read: false,
        });
      });
      (kycRes.data || []).forEach((c: any) => {
        notifs.push({
          id: `kyc-${c.id}`,
          message: `KYC submitted by ${c.name}`,
          time: c.kyc_submitted_at || new Date().toISOString(),
          type: "kyc",
          read: false,
        });
      });
      (handoversRes.data || []).forEach((h: any) => {
        notifs.push({
          id: `handover-${h.id}`,
          message: `Pending handover awaiting confirmation`,
          time: h.created_at,
          type: "handover",
          read: false,
        });
      });

      notifs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setNotifications(notifs.slice(0, 10));
    }

    fetchRecent();
  }, []);

  // Subscribe to realtime changes
  useEffect(() => {
    const channel = supabase
      .channel("notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        setNotifications((prev) => [{
          id: `order-${payload.new.id}`,
          message: `New order ${payload.new.display_id}`,
          time: payload.new.created_at,
          type: "order" as const,
          read: false,
        }, ...prev].slice(0, 15));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customers", filter: "kyc_status=eq.pending" }, (payload) => {
        if (payload.new.kyc_status === "pending") {
          setNotifications((prev) => [{
            id: `kyc-${payload.new.id}`,
            message: `KYC submitted by ${payload.new.name}`,
            time: payload.new.kyc_submitted_at || new Date().toISOString(),
            type: "kyc",
            read: false,
          }, ...prev].slice(0, 15));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "handovers" }, (payload) => {
        setNotifications((prev) => [{
          id: `handover-${payload.new.id}`,
          message: `New handover submitted`,
          time: payload.new.created_at,
          type: "handover",
          read: false,
        }, ...prev].slice(0, 15));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const markAllRead = () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const roleName = role ? role.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "User";

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case "order": return "🛒";
      case "kyc": return "📋";
      case "handover": return "💰";
      default: return "🔔";
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4 lg:px-6">
      <div className="w-10 lg:w-0" />
      <div className="ml-auto flex items-center gap-2">
        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <ScrollArea className="max-h-80">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No notifications</div>
              ) : (
                <div className="divide-y">
                  {notifications.map((n) => (
                    <div key={n.id} className={`flex items-start gap-3 px-4 py-3 text-sm transition-colors ${n.read ? "opacity-60" : "bg-accent/30"}`}>
                      <span className="text-base mt-0.5">{typeIcon(n.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`leading-snug ${n.read ? "" : "font-medium"}`}>{n.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(n.time).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      </div>
                    </div>
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
