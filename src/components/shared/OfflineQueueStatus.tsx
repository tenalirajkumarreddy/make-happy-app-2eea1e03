import { Wifi, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineQueueStatus() {
  const { isOnline } = useOnlineStatus();

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {isOnline ? (
        <>
          <Wifi className="h-3 w-3 text-emerald-500" />
          <span className="text-emerald-600">Online</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3 text-red-500" />
          <span className="text-red-600">Offline</span>
        </>
      )}
    </div>
  );
}
