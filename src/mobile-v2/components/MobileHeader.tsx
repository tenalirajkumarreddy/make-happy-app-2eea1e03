import { useState, useEffect } from "react";
import { Bell, Wifi, WifiOff, LogOut, Moon, Sun, ChevronDown, User, Menu } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  onMenuClick?: () => void;
}

export function MobileHeader({ title, onMenuClick }: Props) {
  const { profile, role, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const { isOnline, pendingCount } = useOnlineStatus();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [companyName, setCompanyName] = useState("Aqua Prime");
  const [companyLogo, setCompanyLogo] = useState<string>("");

  useEffect(() => {
    const loadCompanySettings = async () => {
      try {
        const { data, error } = await supabase
          .from("company_settings")
          .select("key, value");
        
        if (error) throw error;
        if (!data) return;
        
        const map: Record<string, string> = {};
        data.forEach((s) => { map[s.key] = s.value || ""; });
        if (map.company_name) setCompanyName(map.company_name);
        if (map.company_logo) setCompanyLogo(map.company_logo);
      } catch (error) {
        console.error("Failed to load company settings:", error);
        // Use default values on error
      }
    };
    
    loadCompanySettings();
  }, []);

  const initials = (profile?.full_name ?? "U")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleLabel: Record<string, string> = {
    agent: "Field Agent",
    manager: "Manager",
    super_admin: "Admin",
    marketer: "Marketer",
    pos: "POS",
    customer: "Customer",
  };

  return (
    <>
      <header className="mv2-header">
        <div className="mv2-header-inner">
          {/* Menu button */}
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="mv2-btn-icon text-white/80 hover:text-white hover:bg-white/10"
              style={{ width: 40, height: 40, marginLeft: -8 }}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}

          {/* Brand / Logo */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {companyLogo ? (
              <img
                src={companyLogo}
                alt="logo"
                className="h-9 w-9 rounded-xl object-contain shrink-0 ring-1 ring-white/20 bg-white/10"
              />
            ) : (
              <div className="h-9 w-9 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0 ring-1 ring-white/20 overflow-hidden">
                <img src="/logo.png" alt="Logo" className="h-full w-full object-contain p-1" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold text-white leading-tight truncate">
                {title ?? companyName}
              </h1>
              <p className="text-[11px] text-white/70 leading-tight">
                {roleLabel[role ?? ""] ?? role ?? ""}
              </p>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Connectivity pill */}
            <div
              className={cn(
                "mv2-connectivity",
                isOnline ? "online" : "offline"
              )}
            >
              <div className="mv2-connectivity-dot" />
              {isOnline ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              {pendingCount > 0 && (
                <span className="ml-0.5 bg-amber-400 text-amber-900 px-1.5 rounded-full text-[9px] font-bold">
                  {pendingCount}
                </span>
              )}
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="mv2-btn-icon text-white/80 hover:text-white hover:bg-white/10"
              style={{ width: 40, height: 40 }}
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Notifications */}
            <button
              className="mv2-btn-icon text-white/80 hover:text-white hover:bg-white/10 relative"
              style={{ width: 40, height: 40 }}
              onClick={() => setNotifOpen(true)}
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Profile dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 ml-1 p-1 rounded-full hover:bg-white/10 transition-all">
                  <div className="mv2-avatar mv2-avatar-sm ring-2 ring-white/30">
                    <span className="text-[11px]">{initials}</span>
                  </div>
                  <ChevronDown className="h-3 w-3 text-white/70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 mt-1">
                <div className="px-3 py-3 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/50 dark:to-indigo-950/50">
                  <div className="flex items-center gap-2.5">
                    <div className="mv2-avatar mv2-avatar-md">
                      <span>{initials}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{profile?.full_name ?? "User"}</p>
                      <p className="text-xs text-muted-foreground capitalize">{roleLabel[role ?? ""] ?? role ?? ""}</p>
                    </div>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate(role === "customer" ? "/portal/profile" : (role === "super_admin" || role === "manager" ? "/admin/profile" : `/${role}`))}
                  className="gap-2 mx-1 rounded-lg"
                >
                  <User className="h-4 w-4" />
                  My Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={signOut}
                  className="text-destructive focus:text-destructive gap-2 mx-1 mb-1 rounded-lg"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <NotificationsSheet open={notifOpen} onOpenChange={setNotifOpen} />
    </>
  );
}
