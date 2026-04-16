import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  BulkOperationConfig,
  BulkOperationResult,
  BulkOperationProgress,
  BulkActionContext,
} from "@/lib/bulkOperations";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Check,
  X,
  Loader2,
  FileText,
  RotateCcw,
  Download,
  AlertCircle,
} from "lucide-react";

interface BulkOperationDialogProps<T> {
  isOpen: boolean;
  onClose: () => void;
  operation: BulkOperationConfig<T> | null;
  selectedItems: T[];
  selectedIds: Set<string>;
  onConfirm: (context: BulkActionContext<T>) => Promise<BulkOperationResult>;
  onCancel?: () => void;
  itemLabel?: string;
  itemLabelPlural?: string;
  allowUndo?: boolean;
  showItemList?: boolean;
  maxItemsToShow?: number;
}

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  operation: BulkOperationConfig<unknown> | null;
  selectedCount: number;
  itemLabel?: string;
  itemLabelPlural?: string;
}

interface ProgressDialogProps {
  isOpen: boolean;
  onClose: () => void;
  progress: BulkOperationProgress | null;
  operation: BulkOperationConfig<unknown> | null;
  result: BulkOperationResult | null;
  selectedCount: number;
  onRetry?: () => void;
  onUndo?: () => void;
  canUndo: boolean;
}

interface ResultDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: BulkOperationResult | null;
  operation: BulkOperationConfig<unknown> | null;
  onRetry?: () => void;
  onUndo?: () => void;
  canUndo: boolean;
}

/**
 * BulkOperationDialog - Comprehensive dialog for bulk operations
 * Handles confirmation, progress tracking, and result display
 */
export function BulkOperationDialog<T extends { id: string; name?: string; display_id?: string }>({
  isOpen,
  onClose,
  operation,
  selectedItems,
  selectedIds,
  onConfirm,
  onCancel,
  itemLabel = "item",
  itemLabelPlural = "items",
  allowUndo = true,
  showItemList = true,
  maxItemsToShow = 10,
}: BulkOperationDialogProps<T>) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [progress, setProgress] = useState<BulkOperationProgress | null>(null);
  const [result, setResult] = useState<BulkOperationResult | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  const selectedCount = selectedIds.size;

  // Handle confirm click
  const handleConfirmClick = () => {
    if (!operation) return;

    if (operation.requiresConfirmation) {
      setShowConfirmation(true);
    } else {
      executeOperation();
    }
  };

  // Execute the operation
  const executeOperation = async () => {
    if (!operation) return;

    setShowConfirmation(false);
    setShowProgress(true);
    setProgress({
      total: selectedCount,
      processed: 0,
      current: 0,
      percentage: 0,
      status: "pending",
    });

    try {
      const context: BulkActionContext<T> = {
        items: selectedItems,
        selectedIds,
        operationType: operation.type,
      };

      // Set up progress callback
      const onProgress = (p: BulkOperationProgress) => {
        setProgress(p);
      };

      const operationResult = await onConfirm(context);
      setResult(operationResult);
      setCanUndo(operationResult.canUndo && allowUndo);

      // Show result dialog
      setShowProgress(false);
      setShowResult(true);

      if (operationResult.success) {
        toast.success(
          `${operation.label} completed: ${operationResult.successCount} ${operationResult.successCount === 1 ? itemLabel : itemLabelPlural} processed`
        );
      } else {
        toast.error(
          `${operation.label} completed with ${operationResult.errorCount} errors`
        );
      }
    } catch (error) {
      console.error("Operation error:", error);
      setProgress(prev => prev ? { ...prev, status: "failed" } : null);
      toast.error("Operation failed: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setShowConfirmation(false);
    setShowProgress(false);
    setShowResult(false);
    onCancel?.();
    onClose();
  };

  // Handle retry
  const handleRetry = () => {
    setShowResult(false);
    executeOperation();
  };

  // Handle undo
  const handleUndo = async () => {
    // This would call the undo function
    toast.info("Undo functionality not yet implemented");
    setShowResult(false);
    onClose();
  };

  // Handle final close
  const handleFinalClose = () => {
    setShowProgress(false);
    setShowResult(false);
    setResult(null);
    setProgress(null);
    onClose();
  };

  // Get icon for operation
  const getIcon = (iconName: string) => {
    const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
      Trash2: AlertTriangle,
      Download: Download,
      Archive: FileText,
      RefreshCw: RotateCcw,
      Check: Check,
      X: X,
      AlertTriangle: AlertTriangle,
      AlertCircle: AlertCircle,
    };
    const Icon = iconMap[iconName] || AlertCircle;
    return <Icon className="h-5 w-5" />;
  };

  if (!operation) return null;

  return (
    <>
      {/* Main Dialog - Shows operation details */}
      <Dialog open={isOpen && !showConfirmation && !showProgress && !showResult} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getIcon(operation.icon)}
              {operation.label}
            </DialogTitle>
            <DialogDescription>{operation.description}</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">Selected {itemLabelPlural}</span>
              <Badge variant="secondary">{selectedCount}</Badge>
            </div>

            {showItemList && selectedItems.length > 0 && (
              <ScrollArea className="h-48 border rounded-md">
                <div className="p-2 space-y-1">
                  {selectedItems.slice(0, maxItemsToShow).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted text-sm"
                    >
                      <Check className="h-3 w-3 text-green-500" />
                      <span className="flex-1 truncate">
                        {item.name || item.display_id || item.id}
                      </span>
                    </div>
                  ))}
                  {selectedItems.length > maxItemsToShow && (
                    <p className="text-xs text-center text-muted-foreground py-2">
                      And {selectedItems.length - maxItemsToShow} more...
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}

            {operation.requiresConfirmation && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-yellow-800">
                  {operation.confirmationMessage || `This action cannot be undone.`}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmClick}
              variant={operation.color === "destructive" ? "destructive" : "default"}
            >
              {operation.confirmButtonText || operation.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showConfirmation}
        onClose={handleCancel}
        onConfirm={executeOperation}
        operation={operation}
        selectedCount={selectedCount}
        itemLabel={itemLabel}
        itemLabelPlural={itemLabelPlural}
      />

      {/* Progress Dialog */}
      <ProgressDialog
        isOpen={showProgress}
        onClose={handleFinalClose}
        progress={progress}
        operation={operation}
        result={result}
        selectedCount={selectedCount}
        onRetry={handleRetry}
        onUndo={handleUndo}
        canUndo={canUndo}
      />

      {/* Result Dialog */}
      <ResultDialog
        isOpen={showResult}
        onClose={handleFinalClose}
        result={result}
        operation={operation}
        onRetry={handleRetry}
        onUndo={handleUndo}
        canUndo={canUndo}
      />
    </>
  );
}

/**
 * ConfirmationDialog - Confirmation step for destructive operations
 */
function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  operation,
  selectedCount,
  itemLabel = "item",
  itemLabelPlural = "items",
}: ConfirmationDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const expectedText = "CONFIRM";
  const isConfirmed = confirmText === expectedText;

  if (!operation) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {operation.confirmButtonText || `Confirm ${operation.label}`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {operation.confirmationMessage || 
              `You are about to ${operation.label.toLowerCase()} ${selectedCount} ${selectedCount === 1 ? itemLabel : itemLabelPlural}. This action cannot be undone.`
            }
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="py-4">
          <p className="text-sm text-muted-foreground mb-2">
            Type <strong>{expectedText}</strong> to confirm:
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full p-2 border rounded-md"
            placeholder={expectedText}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={!isConfirmed}
            className={cn(
              "bg-destructive hover:bg-destructive/90",
              !isConfirmed && "opacity-50 cursor-not-allowed"
            )}
          >
            {operation.confirmButtonText || operation.label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * ProgressDialog - Shows operation progress
 */
function ProgressDialog({
  isOpen,
  onClose,
  progress,
  operation,
  result,
  selectedCount,
  onRetry,
  onUndo,
  canUndo,
}: ProgressDialogProps) {
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{operation?.label || "Processing"}</DialogTitle>
          <DialogDescription>
            {result ? "Operation completed" : `Processing ${selectedCount} items`}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {progress && !result && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {progress.processed} of {progress.total}
                </span>
                <span className="font-medium">{progress.percentage}%</span>
              </div>
              <Progress value={progress.percentage} className="h-2" />
              {progress.currentItem && (
                <p className="text-xs text-center text-muted-foreground">
                  {progress.currentItem}
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                {result.success ? (
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                    <Check className="h-8 w-8 text-green-600" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                    <X className="h-8 w-8 text-red-600" />
                  </div>
                )}
              </div>

              <div className="text-center">
                <p className="font-medium text-lg">
                  {result.success ? "Operation Successful" : "Operation Completed with Errors"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.successCount} succeeded, {result.errorCount} failed
                </p>
              </div>

              {result.errors.length > 0 && (
                <ScrollArea className="h-32 border rounded-md">
                  <div className="p-2 space-y-1">
                    {result.errors.map((error, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-2 text-sm text-red-600 bg-red-50 rounded"
                      >
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                        <span className="flex-1 truncate">{error.error}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {result && !result.success && onRetry && (
            <Button variant="outline" onClick={onRetry}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Retry Failed
            </Button>
          )}
          {result && canUndo && onUndo && (
            <Button variant="outline" onClick={onUndo}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Undo
            </Button>
          )}
          <Button onClick={onClose}>
            {result ? "Done" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ResultDialog - Final result display
 */
function ResultDialog({
  isOpen,
  onClose,
  result,
  operation,
  onRetry,
  onUndo,
  canUndo,
}: ResultDialogProps) {
  if (!isOpen || !result) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result.success ? (
              <Check className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            )}
            {result.success ? "Success" : "Completed with Issues"}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{result.successCount}</p>
              <p className="text-xs text-green-700">Succeeded</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">{result.errorCount}</p>
              <p className="text-xs text-red-700">Failed</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Errors:</p>
              <ScrollArea className="h-24 border rounded-md">
                <div className="p-2 space-y-1">
                  {result.errors.slice(0, 5).map((error, index) => (
                    <p key={index} className="text-xs text-red-600">
                      • {error.error}
                    </p>
                  ))}
                  {result.errors.length > 5 && (
                    <p className="text-xs text-muted-foreground">
                      And {result.errors.length - 5} more...
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!result.success && onRetry && result.errorCount > 0 && (
            <Button variant="outline" onClick={onRetry}>
              Retry Failed
            </Button>
          )}
          {canUndo && onUndo && (
            <Button variant="outline" onClick={onUndo}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Undo
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BulkOperationDialog;
