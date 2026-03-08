import { Bell, ChevronDown } from "lucide-react";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4 lg:px-6">
      {/* Left spacer for mobile menu button */}
      <div className="w-10 lg:w-0" />

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-3">
        {/* Notifications */}
        <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            3
          </span>
        </button>

        {/* User menu */}
        <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary transition-colors">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            SA
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium leading-none">Super Admin</p>
            <p className="text-[11px] text-muted-foreground">admin@company.com</p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
        </button>
      </div>
    </header>
  );
}
