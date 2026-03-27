import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { 
  LayoutDashboard, 
  Send, 
  FileCode2, 
  ListOrdered, 
  Settings,
  Server,
  SignalHigh,
  SignalZero
} from "lucide-react";
import { useGetGatewayHealth } from "@workspace/api-client-react";

interface AppLayoutProps {
  children: ReactNode;
}

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Send SMS", href: "/send", icon: Send },
  { name: "Templates", href: "/templates", icon: FileCode2 },
  { name: "Logs", href: "/logs", icon: ListOrdered },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { data: health } = useGetGatewayHealth({
    query: { refetchInterval: 5000 }
  });

  const isHealthy = health?.status === "ok" && !health?.paused;

  return (
    <div className="min-h-screen flex bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border/50 bg-card/50 backdrop-blur-md flex flex-col z-20 hidden md:flex">
        <div className="p-6 flex items-center gap-3 border-b border-border/50">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
            <Send className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl tracking-wide text-foreground">OpenSMS</h1>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Gateway System</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.name} 
                href={item.href}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group relative overflow-hidden
                  ${isActive 
                    ? "bg-secondary/10 text-secondary" 
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }
                `}
              >
                {isActive && (
                  <motion.div 
                    layoutId="active-nav" 
                    className="absolute left-0 top-0 bottom-0 w-1 bg-secondary rounded-r-full glow-secondary"
                  />
                )}
                <item.icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? "scale-110" : "group-hover:scale-110"}`} />
                <span className="font-medium text-sm">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Status Indicator */}
        <div className="p-4 m-4 rounded-xl border border-border/50 bg-muted/30">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative flex items-center justify-center">
              {isHealthy ? (
                <>
                  <div className="w-2.5 h-2.5 rounded-full bg-primary z-10" />
                  <div className="w-2.5 h-2.5 rounded-full bg-primary absolute animate-ping opacity-75" />
                </>
              ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-destructive" />
              )}
            </div>
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Gateway Status</span>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium">
            {isHealthy ? (
              <span className="text-primary flex items-center gap-1.5"><SignalHigh className="w-4 h-4"/> Online</span>
            ) : (
              <span className="text-destructive flex items-center gap-1.5"><SignalZero className="w-4 h-4"/> Offline</span>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border/50 bg-card/80 backdrop-blur-md z-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Send className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="font-display font-bold text-lg">OpenSMS</h1>
          </div>
          <div className="flex gap-2">
            {navItems.map((item) => (
              <Link key={item.name} href={item.href} className={`p-2 rounded-lg ${location === item.href ? 'bg-secondary/20 text-secondary' : 'text-muted-foreground'}`}>
                <item.icon className="w-5 h-5" />
              </Link>
            ))}
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 z-10">
          <motion.div
            key={location}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="max-w-6xl mx-auto"
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
