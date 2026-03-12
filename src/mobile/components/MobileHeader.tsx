import { useState, useEffect } from "react";
import { Bell, Wifi, WifiOff, User, LogOut, Moon, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { supabase } from "@/integrations/supabase/client";
import { NotificationsSheet } from "./NotificationsSheet";

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

interface Props {
  title?: string;
}

export function MobileHeader({ title }: Props) {
  const { profile, role, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const { isOnline, pendingCount } = useOnlineStatus();
  const { dark, toggle } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);
  const [companyName, setCompanyName] = useState("BizManager");
  const [companyLogo, setCompanyLogo] = useState<string>("");

  useEffect(() => {
    supabase
      .from("company_settings")
      .select("key, value")
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        data.forEach((s) => { map[s.key] = s.value || ""; });
        if (map.company_name) setCompanyName(map.company_name);
        if (map.company_logo) setCompanyLogo(map.company_logo);
      });
  }, []);

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-40 bg-background border-b border-border"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="h-14 flex items-center px-3 gap-1.5">
          {/* Brand */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {companyLogo ? (
              <img src={companyLogo} alt="logo" className="h-8 w-8 rounded-xl object-contain shrink-0" />
            ) : (
              <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center shrink-0">
                <span className="text-primary-foreground text-xs font-bold">
                  {companyName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold leading-tight truncate">{title ?? companyName}</h1>
              <p className="text-[11px] text-muted-foreground capitalize leading-tight">{role ?? ""}</p>
            </div>
          </div>

          {/* Online indicator */}
          <div className="flex items-center gap-1 shrink-0">
            {isOnline ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-destructive" />
            )}
            {pendingCount > 0 && (
              <Badge variant="destructive" className="text-[9px] h-4 px-1 min-w-4">
                {pendingCount}
              </Badge>
            )}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggle}
            className="p-2 rounded-full hover:bg-muted transition-colors shrink-0"
            aria-label="Toggle theme"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Notifications bell */}
          <button
            className="relative p-2 rounded-full hover:bg-muted transition-colors shrink-0"
            onClick={() => setNotifOpen(true)}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded-full hover:bg-muted transition-colors shrink-0">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-3 py-2.5">
                <p className="text-sm font-semibold">{profile?.full_name ?? "User"}</p>
                <p className="text-xs text-muted-foreground capitalize">{role ?? ""}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <NotificationsSheet open={notifOpen} onOpenChange={setNotifOpen} />
    </>
  );
}
