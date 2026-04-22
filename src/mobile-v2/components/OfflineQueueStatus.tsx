/**
 * Mobile Offline Queue Status Component
 * Shows pending sync actions with mobile-optimized UI
 */

import { useState, useEffect } from "react";
import { Cloud, CloudOff, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { getQueueCount, syncQueue } from "@/mobile-v2/lib/offlineQueue";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function OfflineQueueStatus() {
  const [count, setCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const updateCount = async () => {
      const c = await getQueueCount();
      setCount(c);
    };

    updateCount();
    
    // Update every 5 seconds
    const interval = setInterval(updateCount, 5000);
    
    // Listen for queue changes
    const handleQueueChange = () => updateCount();
    window.addEventListener("offline-queue-changed", handleQueueChange);
    
    // Listen for online/offline
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener("offline-queue-changed", handleQueueChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleSync = async () => {
    if (!navigator.onLine) {
      toast.error("You're offline. Connect to sync.");
      return;
    }
    
    setIsSyncing(true);
    try {
      const result = await syncQueue((completed, total) => {
        toast.info(`Syncing ${completed}/${total}...`, { duration: 1000 });
      });
      
      if (result.success > 0) {
        toast.success(`${result.success} items synced`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} items failed`);
      }
      if (result.conflicts > 0) {
        toast.warning(`${result.conflicts} conflicts need resolution`);
      }
      
      const c = await getQueueCount();
      setCount(c);
    } catch (error) {
      toast.error("Sync failed. Try again.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Don't show if no items and online
  if (count === 0 && isOnline) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50">
      <div
        className={cn(
          "rounded-xl p-4 shadow-lg border",
          isOnline
            ? count > 0
              ? "bg-amber-500/90 border-amber-400 text-white"
              : "bg-green-500/90 border-green-400 text-white"
            : "bg-slate-700/90 border-slate-600 text-white"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isOnline ? (
              count > 0 ? (
                <CloudOff className="h-5 w-5" />
              ) : (
                <Cloud className="h-5 w-5" />
              )
            ) : (
              <CloudOff className="h-5 w-5" />
            )}
            <div>
              <p className="font-medium text-sm">
                {!isOnline
                  ? "You're offline"
                  : count > 0
                  ? `${count} item${count === 1 ? "" : "s"} pending sync`
                  : "All synced"}
              </p>
              {count > 0 && isOnline && (
                <p className="text-xs opacity-80">
                  Tap to sync now
                </p>
              )}
            </div>
          </div>
          
          {count > 0 && isOnline && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="p-2 rounded-lg bg-white/20 hover:bg-white/30 active:scale-95 transition-all disabled:opacity-50"
            >
              {isSyncing ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <RefreshCw className="h-5 w-5" />
              )}
            </button>
          )}
        </div>
        
        {/* Progress bar when syncing */}
        {isSyncing && (
          <div className="mt-3">
            <div className="h-1 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white animate-pulse w-full" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OfflineQueueStatus;
