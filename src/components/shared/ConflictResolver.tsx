import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Trash2,
  Edit3,
  AlertOctagon,
  ChevronRight,
  ChevronDown,
  Info,
  Shield,
  Ban,
  Pause,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { PendingAction, ConflictInfo, resolveConflict, getConflictedActions } from "@/lib/offlineQueue";
import {
  Conflict,
  ConflictType,
  ResolutionStrategy,
  ResolutionOption,
  detectConflicts,
  getConflictResolutionOptions,
  resolveConflict as resolveConflictLib,
  ConflictResolution,
} from "@/lib/conflictResolver";

// Types
interface ConflictResolverProps {
  onResolve?: (actionId: string, resolution: ResolutionStrategy) => void;
  onDismiss?: () => void;
  className?: string;
  autoDetect?: boolean;
  showNotification?: boolean;
}

interface ConflictCardProps {
  conflict: Conflict;
  isExpanded: boolean;
  onToggle: () => void;
  onResolve: (strategy: ResolutionStrategy, modifications?: any) => void;
}

interface ConflictNotificationProps {
  conflicts: Conflict[];
  onView: () => void;
  onDismiss: () => void;
}

// Severity config
const severityConfig = {
  critical: {
    icon: AlertOctagon,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    badge: "destructive",
  },
  error: {
    icon: AlertCircle,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    badge: "default",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
    badge: "secondary",
  },
};

// Conflict type labels
const conflictTypeLabels: Record<ConflictType, string> = {
  [ConflictType.NONE]: "No Conflict",
  [ConflictType.CREDIT_EXCEEDED]: "Credit Limit Exceeded",
  [ConflictType.PRICE_CHANGED]: "Price Changed",
  [ConflictType.STORE_INACTIVE]: "Store Inactive",
  [ConflictType.PRODUCT_UNAVAILABLE]: "Product Unavailable",
  [ConflictType.INSUFFICIENT_STOCK]: "Insufficient Stock",
  [ConflictType.SALE_LIMIT_REACHED]: "Sale Limit Reached",
  [ConflictType.DATA_STALE]: "Data Outdated",
};

/**
 * ConflictResolver - Component for resolving offline conflicts
 * Displays conflicts and provides resolution options
 */
export function ConflictResolver({
  onResolve,
  onDismiss,
  className,
  autoDetect = true,
  showNotification = true,
}: ConflictResolverProps) {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [hasUnresolved, setHasUnresolved] = useState(false);

  // Load conflicts
  const loadConflicts = useCallback(async () => {
    setLoading(true);
    try {
      // Get conflicted actions
      const actions = await getConflictedActions();
      
      // Detect actual conflicts
      const detectedConflicts: Conflict[] = [];
      for (const action of actions) {
        const actionConflicts = await detectConflicts(action);
        detectedConflicts.push(...actionConflicts);
      }
      
      setConflicts(detectedConflicts);
      setHasUnresolved(detectedConflicts.length > 0);
    } catch (error) {
      console.error("Error loading conflicts:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-detect on mount
  useEffect(() => {
    if (autoDetect) {
      loadConflicts();
    }
  }, [autoDetect, loadConflicts]);

  // Listen for queue changes
  useEffect(() => {
    const handleQueueChanged = () => {
      if (autoDetect) {
        loadConflicts();
      }
    };
    
    window.addEventListener("offline-queue-changed", handleQueueChanged);
    return () => window.removeEventListener("offline-queue-changed", handleQueueChanged);
  }, [autoDetect, loadConflicts]);

  // Handle resolve
  const handleResolve = async (
    conflict: Conflict,
    strategy: ResolutionStrategy,
    modifications?: any
  ) => {
    try {
      const resolution: ConflictResolution = {
        conflictId: conflict.id,
        strategy,
        modifications,
        timestamp: new Date().toISOString(),
      };

      const result = await resolveConflictLib(conflict, resolution);
      
      if (result.success) {
        // Update local state
        setConflicts(prev => prev.filter(c => c.id !== conflict.id));
        onResolve?.(conflict.operation.id, strategy);
        toast.success("Conflict resolved");
      } else {
        toast.error(result.error || "Failed to resolve conflict");
      }
    } catch (error) {
      console.error("Resolve error:", error);
      toast.error("Failed to resolve conflict");
    }
  };

  // Get critical/error count
  const criticalCount = conflicts.filter(c => c.severity === "critical").length;
  const errorCount = conflicts.filter(c => c.severity === "error").length;

  if (conflicts.length === 0 && !loading) {
    return null;
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Notification Banner */}
      {showNotification && hasUnresolved && (
        <ConflictNotification
          conflicts={conflicts}
          onView={() => setShowAll(true)}
          onDismiss={() => {
            setHasUnresolved(false);
            onDismiss?.();
          }}
        />
      )}

      {/* Conflict List Dialog */}
      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Resolve Conflicts
            </DialogTitle>
            <DialogDescription>
              {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""} detected between queued operations and current server state.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3 pr-4">
              {conflicts.map((conflict) => (
                <ConflictCard
                  key={conflict.id}
                  conflict={conflict}
                  isExpanded={expandedId === conflict.id}
                  onToggle={() => setExpandedId(
                    expandedId === conflict.id ? null : conflict.id
                  )}
                  onResolve={(strategy, mods) => handleResolve(conflict, strategy, mods)}
                />
              ))}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAll(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline Summary */}
      {!showAll && conflicts.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                Offline Conflicts
              </span>
              <div className="flex gap-2">
                {criticalCount > 0 && (
                  <Badge variant="destructive">{criticalCount} Critical</Badge>
                )}
                {errorCount > 0 && (
                  <Badge variant="default">{errorCount} Error</Badge>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              {conflicts.length} queued operation{conflicts.length !== 1 ? "s" : ""} have conflicts with the current server state.
            </p>
            <Button size="sm" onClick={() => setShowAll(true)}>
              View & Resolve
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * ConflictCard - Individual conflict display with resolution options
 */
function ConflictCard({
  conflict,
  isExpanded,
  onToggle,
  onResolve,
}: ConflictCardProps) {
  const config = severityConfig[conflict.severity];
  const Icon = config.icon;
  const options = getConflictResolutionOptions(conflict);

  return (
    <Card className={cn(
      "transition-all duration-200",
      config.borderColor,
      isExpanded && "ring-1 ring-offset-1",
      conflict.severity === "critical" && "ring-red-200",
      conflict.severity === "error" && "ring-orange-200",
      conflict.severity === "warning" && "ring-yellow-200"
    )}>
      <CardHeader 
        className={cn(
          "py-3 cursor-pointer hover:bg-muted/50 transition-colors",
          config.bgColor
        )}
        onClick={onToggle}
      >
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", config.color)} />
            <span>{conflictTypeLabels[conflict.type]}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={config.badge as any} className="text-xs">
              {conflict.severity}
            </Badge>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CardTitle>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 pb-4">
          <Separator className="my-3" />
          
          {/* Conflict Details */}
          <div className="space-y-3">
            <Alert className={cn(config.bgColor, config.borderColor)}>
              <AlertTitle className="text-sm">{conflict.reason}</AlertTitle>
              <AlertDescription className="text-xs mt-1">
                Operation: {conflict.operation.type} • 
                Queued at: {new Date(conflict.queuedState.timestampAtQueueTime).toLocaleString()}
              </AlertDescription>
            </Alert>

            {/* Comparison */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 bg-muted rounded">
                <p className="text-xs text-muted-foreground mb-1">When Queued</p>
                {conflict.queuedState.storeOutstandingAtQueueTime !== undefined && (
                  <p>Outstanding: ₹{conflict.queuedState.storeOutstandingAtQueueTime.toLocaleString()}</p>
                )}
                {conflict.queuedState.productPriceAtQueueTime !== undefined && (
                  <p>Price: ₹{conflict.queuedState.productPriceAtQueueTime}</p>
                )}
              </div>
              <div className="p-2 bg-primary/5 rounded">
                <p className="text-xs text-primary/70 mb-1">Current</p>
                {conflict.currentState.storeOutstanding !== undefined && (
                  <p>Outstanding: ₹{conflict.currentState.storeOutstanding.toLocaleString()}</p>
                )}
                {conflict.currentState.productPrice !== undefined && (
                  <p>Price: ₹{conflict.currentState.productPrice}</p>
                )}
                {conflict.currentState.storeIsActive === false && (
                  <p className="text-red-600 font-medium">Store Inactive</p>
                )}
              </div>
            </div>

            {/* Resolution Options */}
            <div className="space-y-2 pt-2">
              <p className="text-sm font-medium">Resolve:</p>
              <div className="flex flex-wrap gap-2">
                {options.map((option) => (
                  <Button
                    key={option.strategy}
                    size="sm"
                    variant={option.color === "destructive" ? "destructive" : "outline"}
                    onClick={() => onResolve(option.strategy)}
                    className={cn(
                      option.color === "warning" && "border-yellow-500 text-yellow-700 hover:bg-yellow-50",
                      option.color === "success" && "border-green-500 text-green-700 hover:bg-green-50"
                    )}
                  >
                    {getOptionIcon(option.icon)}
                    <span className="ml-1">{option.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/**
 * ConflictNotification - Compact notification for conflicts
 */
function ConflictNotification({
  conflicts,
  onView,
  onDismiss,
}: ConflictNotificationProps) {
  const criticalCount = conflicts.filter(c => c.severity === "critical").length;
  const totalCount = conflicts.length;

  return (
    <Alert className={cn(
      "animate-in slide-in-from-top-2",
      criticalCount > 0 ? "border-red-200 bg-red-50" : "border-yellow-200 bg-yellow-50"
    )}>
      <div className="flex items-start gap-3">
        {criticalCount > 0 ? (
          <AlertOctagon className="h-5 w-5 text-red-600 flex-shrink-0" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
        )}
        <div className="flex-1">
          <AlertTitle className="text-sm font-medium">
            {criticalCount > 0 
              ? `${criticalCount} Critical Conflict${criticalCount !== 1 ? "s" : ""}` 
              : `${totalCount} Offline Conflict${totalCount !== 1 ? "s" : ""}`
            }
          </AlertTitle>
          <AlertDescription className="text-xs mt-1">
            Queued operations conflict with current server state. Review and resolve to continue syncing.
          </AlertDescription>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={onView} variant={criticalCount > 0 ? "destructive" : "default"}>
              Resolve Now
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </Alert>
  );
}

// Helper to get icon for resolution option
function getOptionIcon(iconName: string) {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Edit3: Edit3,
    AlertTriangle: AlertTriangle,
    Clock: Clock,
    X: XCircle,
    Pause: Pause,
    RefreshCw: RefreshCw,
    PackageX: Trash2,
    Package: Shield,
    Calendar: Clock,
    Check: CheckCircle,
  };
  
  const Icon = iconMap[iconName];
  return Icon ? <Icon className="h-3 w-3" /> : null;
}

/**
 * useConflictNotifications - Hook for conflict notifications
 */
export function useConflictNotifications() {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkConflicts = useCallback(async () => {
    try {
      const actions = await getConflictedActions();
      const detectedConflicts: Conflict[] = [];
      
      for (const action of actions) {
        const actionConflicts = await detectConflicts(action);
        detectedConflicts.push(...actionConflicts);
      }
      
      setConflicts(detectedConflicts);
      setLastChecked(new Date());
      
      return detectedConflicts;
    } catch (error) {
      console.error("Error checking conflicts:", error);
      return [];
    }
  }, []);

  // Auto-check on mount and when queue changes
  useEffect(() => {
    checkConflicts();
    
    const handleQueueChange = () => {
      checkConflicts();
    };
    
    window.addEventListener("offline-queue-changed", handleQueueChange);
    return () => window.removeEventListener("offline-queue-changed", handleQueueChange);
  }, [checkConflicts]);

  return {
    conflicts,
    hasConflicts: conflicts.length > 0,
    criticalConflicts: conflicts.filter(c => c.severity === "critical").length,
    errorConflicts: conflicts.filter(c => c.severity === "error").length,
    warningConflicts: conflicts.filter(c => c.severity === "warning").length,
    lastChecked,
    checkConflicts,
  };
}

/**
 * ConflictBadge - Badge showing conflict count
 */
interface ConflictBadgeProps {
  count: number;
  criticalCount?: number;
  className?: string;
}

export function ConflictBadge({
  count,
  criticalCount = 0,
  className,
}: ConflictBadgeProps) {
  if (count === 0) return null;

  return (
    <div className={cn(
      "relative inline-flex items-center justify-center",
      className
    )}>
      <AlertTriangle className={cn(
        "h-5 w-5",
        criticalCount > 0 ? "text-red-500" : "text-yellow-500"
      )} />
      {count > 0 && (
        <span className={cn(
          "absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[10px] font-bold rounded-full flex items-center justify-center",
          criticalCount > 0 
            ? "bg-red-500 text-white" 
            : "bg-yellow-500 text-white"
        )}>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </div>
  );
}

export default ConflictResolver;
