import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, AlertCircle, CheckCircle, X, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  getQueuedActions,
  getQueuedFileUploads,
  removeFromQueue,
  removeFileUpload,
  type PendingAction,
  type PendingFileUpload,
} from "@/lib/offlineQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatDistanceToNow } from "date-fns";

export function OfflineQueueStatus() {
  const { isOnline, pendingCount, syncing, conflictCount } = useOnlineStatus();
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [files, setFiles] = useState<PendingFileUpload[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const loadQueue = async () => {
    try {
      const [actionsData, filesData] = await Promise.all([
        getQueuedActions(),
        getQueuedFileUploads(),
      ]);
      setActions(actionsData);
      setFiles(filesData);
    } catch (err) {
      console.error("Failed to load offline queue:", err);
    }
  };

  useEffect(() => {
    loadQueue();
    const handleQueueChange = () => loadQueue();
    window.addEventListener("offline-queue-changed", handleQueueChange);
    return () => window.removeEventListener("offline-queue-changed", handleQueueChange);
  }, []);

  useEffect(() => {
    if (isOpen) loadQueue();
  }, [isOpen]);

  const totalPending = actions.length + files.length;
  const failedCount = actions.filter((a) => (a.retryCount || 0) >= 3).length +
    files.filter((f) => (f.retryCount || 0) >= 3).length;

  const handleRemoveAction = async (id: string) => {
    await removeFromQueue(id);
    loadQueue();
  };

  const handleRemoveFile = async (id: string) => {
    await removeFileUpload(id);
    loadQueue();
  };

  const getActionLabel = (type: string) => {
    switch (type) {
      case "sale": return "Sale";
      case "transaction": return "Payment";
      case "visit": return "Store Visit";
      case "customer": return "Customer";
      case "file_upload": return "File Upload";
      default: return type;
    }
  };

  const getFileLabel = (type: string) => {
    switch (type) {
      case "kyc": return "KYC Document";
      case "entity_photo": return "Photo";
      case "store_photo": return "Store Photo";
      default: return type;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`relative gap-1.5 ${!isOnline ? "text-amber-600" : "text-muted-foreground"}`}
          title={
            isOnline
              ? `Online${totalPending > 0 ? ` — ${totalPending} pending sync` : ""}`
              : "Offline"
          }
        >
          {syncing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : isOnline ? (
            totalPending > 0 ? <Cloud className="h-4 w-4" /> : <Wifi className="h-4 w-4" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )}
          {totalPending > 0 && (
            <Badge
              variant={failedCount > 0 ? "destructive" : "secondary"}
              className="h-5 min-w-[20px] px-1.5 text-xs"
            >
              {totalPending}
            </Badge>
          )}
          {conflictCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-warning text-2xs font-bold text-white px-1">
              {conflictCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-md p-6">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {isOnline ? (
              <>
                {syncing ? (
                  <RefreshCw className="h-5 w-5 animate-spin text-info" />
                ) : (
                  <Cloud className="h-5 w-5 text-success" />
                )}
                {syncing ? "Syncing..." : "Online"}
              </>
            ) : (
              <>
                <CloudOff className="h-5 w-5 text-amber-600" />
                Offline
              </>
            )}
            {totalPending > 0 && (
              <Badge variant="secondary" className="ml-1">{totalPending} pending</Badge>
            )}
            {conflictCount > 0 && (
              <Badge variant="destructive" className="ml-1">{conflictCount} conflict{conflictCount > 1 ? "s" : ""}</Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Status summary */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Pending sync</span>
              <span className="font-semibold">{totalPending}</span>
            </div>
            {failedCount > 0 && (
              <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {failedCount} failed after retries
              </div>
            )}
            {conflictCount > 0 && (
              <div className="mt-2 flex items-center gap-2 text-sm text-warning">
                <AlertCircle className="h-4 w-4" />
                {conflictCount} item{conflictCount > 1 ? "s" : ""} with conflicts
                <button
                  className="ml-auto text-xs font-medium underline underline-offset-2 hover:text-warning/80"
                  onClick={() => window.dispatchEvent(new CustomEvent("show-conflict-resolver"))}
                >
                  Resolve
                </button>
              </div>
            )}
            {syncing && (
              <div className="mt-2 flex items-center gap-2 text-sm text-info">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Syncing queued items...
              </div>
            )}
            {!isOnline && totalPending > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Items will sync when you're back online.
              </p>
            )}
            {isOnline && !syncing && totalPending === 0 && (
              <div className="mt-2 flex items-center gap-2 text-sm text-success">
                <CheckCircle className="h-4 w-4" />
                All synced
              </div>
            )}
          </div>

          {/* Pending actions */}
          {actions.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium">Pending Actions</h4>
              <div className="space-y-2">
                {actions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {getActionLabel(action.type)}
                        </Badge>
                        {(action.retryCount || 0) >= 3 && (
                          <Badge variant="destructive" className="text-xs">
                            Failed
                          </Badge>
                        )}
                        {(action.retryCount || 0) > 0 && (action.retryCount || 0) < 3 && (
                          <Badge variant="secondary" className="text-xs">
                            Retry {action.retryCount}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
                      </p>
                      {action.lastError && (
                        <p className="mt-1 truncate text-xs text-destructive">
                          {action.lastError}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={() => handleRemoveAction(action.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending file uploads */}
          {files.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium">Pending Files</h4>
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {getFileLabel(file.type)}
                        </Badge>
                        {(file.retryCount || 0) >= 3 && (
                          <Badge variant="destructive" className="text-xs">
                            Failed
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs font-medium">
                        {file.fileName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}
                      </p>
                      {file.lastError && (
                        <p className="mt-1 truncate text-xs text-destructive">
                          {file.lastError}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={() => handleRemoveFile(file.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {totalPending === 0 && !syncing && (
            <div className="py-8 text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-success/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                No pending items to sync
              </p>
            </div>
          )}
          {totalPending === 0 && syncing && (
            <div className="py-8 text-center">
              <RefreshCw className="mx-auto h-12 w-12 animate-spin text-info/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                Syncing...
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
