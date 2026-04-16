import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  MapPin,
  Navigation,
  Clock,
  Route,
  CheckCircle,
  Circle,
  GripVertical,
  Play,
  Pause,
  RotateCcw,
  Target,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouteSession, RouteSession, RouteStore, StoreVisit, RouteProgress } from "@/hooks/useRouteSession";
import { useRouteOptimizer } from "@/hooks/useRouteSession";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Types
interface RouteOptimizerProps {
  agentId: string;
  initialStores?: RouteStore[];
  showMap?: boolean;
  onSessionChange?: (session: RouteSession | null) => void;
  className?: string;
}

interface StoreCardProps {
  store: RouteStore;
  index: number;
  isVisited: boolean;
  visit?: StoreVisit;
  isActive: boolean;
  onVisit: () => void;
  onReorder: (dragIndex: number, hoverIndex: number) => void;
}

interface RouteStatsProps {
  progress: RouteProgress;
  estimatedDuration: number;
  totalDistance: number;
}

/**
 * RouteOptimizer - Component for route optimization with map visualization
 * Provides store visit tracking, reordering, and progress monitoring
 */
export function RouteOptimizer({
  agentId,
  initialStores,
  showMap = true,
  onSessionChange,
  className,
}: RouteOptimizerProps) {
  const {
    session,
    stores,
    visits,
    progress,
    isLoading,
    createSession,
    updateSessionStatus,
    recordVisit,
    reorderRoute,
    getNextStore,
    isStoreVisited,
    getStoreVisit,
    refetchSession,
  } = useRouteSession(agentId);

  const { optimize, isOptimizing } = useRouteOptimizer();
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [selectedStore, setSelectedStore] = useState<RouteStore | null>(null);
  const [showVisitDialog, setShowVisitDialog] = useState(false);

  // Notify parent of session changes
  useMemo(() => {
    onSessionChange?.(session);
  }, [session, onSessionChange]);

  // Handle route start
  const handleStartRoute = async () => {
    if (!session) {
      // Create new session with initial stores
      if (initialStores?.length) {
        await createSession.mutateAsync({
          agentId,
          storeIds: initialStores.map(s => s.id),
        });
      }
    }
    
    if (session) {
      await updateSessionStatus.mutateAsync({
        sessionId: session.id,
        status: "active",
      });
    }
    setShowStartDialog(false);
  };

  // Handle store visit
  const handleVisitStore = async (store: RouteStore) => {
    if (!session) return;
    
    setSelectedStore(store);
    setShowVisitDialog(true);
  };

  // Confirm store visit
  const confirmVisit = async (store: RouteStore) => {
    if (!session) return;
    
    try {
      // Get current location
      const position = await getCurrentPosition();
      
      await recordVisit.mutateAsync({
        sessionId: session.id,
        storeId: store.id,
        location: position ? {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        } : undefined,
      });
      
      setShowVisitDialog(false);
      setSelectedStore(null);
    } catch (error) {
      console.error("Error recording visit:", error);
      toast.error("Failed to record visit");
    }
  };

  // Handle route completion
  const handleCompleteRoute = async () => {
    if (!session) return;
    
    await updateSessionStatus.mutateAsync({
      sessionId: session.id,
      status: "completed",
    });
  };

  // Handle route optimization
  const handleOptimize = async () => {
    if (!stores?.length) return;
    
    await optimize.mutateAsync({
      agentId,
      storeIds: stores.map(s => s.id),
    });
    
    refetchSession();
  };

  // Handle reorder
  const handleReorder = useCallback((dragIndex: number, hoverIndex: number) => {
    if (!session || !stores) return;
    
    const newOrder = [...stores.map(s => s.id)];
    const [draggedItem] = newOrder.splice(dragIndex, 1);
    newOrder.splice(hoverIndex, 0, draggedItem);
    
    reorderRoute.mutate({
      sessionId: session.id,
      newOrder,
    });
  }, [session, stores, reorderRoute]);

  // Get current status
  const nextStore = getNextStore();
  const isActive = session?.status === "active";
  const isCompleted = session?.status === "completed";

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Route Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Route className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Route Optimizer</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {session 
                    ? `${stores?.length || 0} stores planned`
                    : "No active route"
                  }
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {!session && initialStores?.length > 0 && (
                <Button onClick={() => setShowStartDialog(true)}>
                  <Play className="h-4 w-4 mr-2" />
                  Start Route
                </Button>
              )}
              {session?.status === "planned" && (
                <Button onClick={handleStartRoute}>
                  <Play className="h-4 w-4 mr-2" />
                  Start Route
                </Button>
              )}
              {isActive && (
                <Button variant="outline" onClick={handleCompleteRoute}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Complete
                </Button>
              )}
              {stores && stores.length > 1 && (
                <Button 
                  variant="outline" 
                  onClick={handleOptimize}
                  disabled={isOptimizing}
                >
                  <TrendingUp className="h-4 w-4 mr-2" />
                  {isOptimizing ? "Optimizing..." : "Optimize"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        {/* Progress Bar */}
        {progress && (
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {progress.visitedStores} of {progress.totalStores} visited
                </span>
                <span className="font-medium">
                  {Math.round(progress.completionPercentage)}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress.completionPercentage}%` }}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Route Stats */}
      {session && progress && (
        <RouteStats
          progress={progress}
          estimatedDuration={session.estimated_duration}
          totalDistance={session.total_distance}
        />
      )}

      {/* Store List */}
      {stores && stores.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Stores ({stores.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {stores.map((store, index) => {
                const visited = isStoreVisited(store.id);
                const visit = getStoreVisit(store.id);
                const isNext = nextStore?.id === store.id;
                
                return (
                  <StoreCard
                    key={store.id}
                    store={store}
                    index={index}
                    isVisited={visited}
                    visit={visit}
                    isActive={isNext && isActive}
                    onVisit={() => handleVisitStore(store)}
                    onReorder={handleReorder}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!stores?.length && !isLoading && (
        <Card>
          <CardContent className="p-8 text-center">
            <Route className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Route Planned</h3>
            <p className="text-muted-foreground mb-4">
              Add stores to create your route
            </p>
          </CardContent>
        </Card>
      )}

      {/* Start Route Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Route</DialogTitle>
            <DialogDescription>
              {initialStores?.length 
                ? `Start route with ${initialStores.length} stores`
                : "Create a new route session"
              }
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowStartDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartRoute}>
              <Play className="h-4 w-4 mr-2" />
              Start Route
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visit Store Dialog */}
      <Dialog open={showVisitDialog} onOpenChange={setShowVisitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Visited</DialogTitle>
            <DialogDescription>
              {selectedStore?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will record your visit to {selectedStore?.name} with your current location.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowVisitDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => selectedStore && confirmVisit(selectedStore)}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirm Visit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * StoreCard - Individual store card in the route list
 */
function StoreCard({
  store,
  index,
  isVisited,
  visit,
  isActive,
  onVisit,
}: StoreCardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-4 transition-colors",
        isActive && "bg-primary/5 border-l-4 border-l-primary",
        isVisited && "bg-muted/50",
        !isVisited && !isActive && "hover:bg-muted/50"
      )}
    >
      {/* Order Number */}
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
        {isVisited ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : isActive ? (
          <Target className="h-5 w-5 text-primary animate-pulse" />
        ) : (
          <span className="text-sm font-medium text-muted-foreground">
            {index + 1}
          </span>
        )}
      </div>

      {/* Store Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            "font-medium truncate",
            isVisited && "text-muted-foreground line-through"
          )}>
            {store.name}
          </span>
          {isActive && (
            <Badge variant="default" className="text-xs">
              Next
            </Badge>
          )}
        </div>
        {store.address && (
          <p className="text-xs text-muted-foreground truncate">
            {store.address}
          </p>
        )}
        {visit?.visited_at && (
          <p className="text-xs text-muted-foreground">
            Visited {new Date(visit.visited_at).toLocaleTimeString([], { 
              hour: "2-digit", 
              minute: "2-digit" 
            })}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0">
        {!isVisited && (
          <Button
            size="sm"
            variant={isActive ? "default" : "ghost"}
            onClick={onVisit}
          >
            <CheckCircle className="h-4 w-4 mr-1" />
            Visit
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * RouteStats - Display route statistics
 */
function RouteStats({
  progress,
  estimatedDuration,
  totalDistance,
}: RouteStatsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl font-bold">{progress.totalStores}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total Stores</p>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-2xl font-bold">{progress.visitedStores}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Visited</p>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl font-bold">
              {Math.round(estimatedDuration)}m
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Est. Duration</p>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl font-bold">
              {totalDistance.toFixed(1)}km
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Distance</p>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper function to get current position
function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    });
  });
}

export default RouteOptimizer;
