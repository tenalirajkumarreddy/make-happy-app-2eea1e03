import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BulkOperationConfig,
  BulkOperationResult,
  BulkOperationProgress,
  BulkOperationType,
  getAllBulkOperations,
  validateBulkSelection,
} from "@/lib/bulkOperations";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MoreHorizontal,
  Trash2,
  Download,
  Archive,
  RefreshCw,
  UserPlus,
  Printer,
  Check,
  X,
  Loader2,
  ChevronDown,
  Settings,
  Filter,
} from "lucide-react";

// Icons mapping
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Trash2,
  Download,
  Archive,
  RefreshCw,
  UserPlus,
  Printer,
  Check,
  X,
  Settings,
  Filter,
};

interface BulkActionToolbarProps<T> {
  items: T[];
  selectedIds: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
  onOperationComplete?: (result: BulkOperationResult) => void;
  customOperations?: BulkOperationConfig<T>[];
  itemLabel?: string;
  itemLabelPlural?: string;
  className?: string;
  showSelectAll?: boolean;
  showClearSelection?: boolean;
  disabled?: boolean;
}

interface BulkOperationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  operation: BulkOperationConfig<unknown> | null;
  selectedCount: number;
  progress: BulkOperationProgress | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * BulkActionToolbar - Toolbar for bulk operations on data tables
 * Provides selection controls, operation buttons, and progress tracking
 */
export function BulkActionToolbar<T extends { id: string }>({
  items,
  selectedIds,
  onSelectionChange,
  onOperationComplete,
  customOperations,
  itemLabel = "item",
  itemLabelPlural = "items",
  className,
  showSelectAll = true,
  showClearSelection = true,
  disabled = false,
}: BulkActionToolbarProps<T>) {
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<BulkOperationConfig<unknown> | null>(null);
  const [progress, setProgress] = useState<BulkOperationProgress | null>(null);

  const selectedCount = selectedIds.size;
  const totalCount = items.length;
  const isAllSelected = selectedCount === totalCount && totalCount > 0;

  // Get available operations
  const availableOperations = useMemo(() => {
    const defaultOps = getAllBulkOperations();
    const customOps = (customOperations || []).map((op, index) => ({
      key: `custom-${index}`,
      config: op as BulkOperationConfig<unknown>,
    }));
    return [...defaultOps, ...customOps];
  }, [customOperations]);

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (isAllSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(items.map(item => item.id)));
    }
  }, [isAllSelected, items, onSelectionChange]);

  // Handle clear selection
  const handleClearSelection = useCallback(() => {
    onSelectionChange(new Set());
  }, [onSelectionChange]);

  // Handle operation click
  const handleOperationClick = useCallback((operation: BulkOperationConfig<unknown>) => {
    // Validate selection
    const validation = validateBulkSelection(items, selectedIds, operation.type);
    
    if (!validation.valid) {
      toast.error(validation.error || "Invalid selection");
      return;
    }

    setSelectedOperation(operation);

    if (operation.requiresConfirmation) {
      setConfirmDialogOpen(true);
    } else {
      executeOperation(operation);
    }
  }, [items, selectedIds]);

  // Execute operation
  const executeOperation = async (operation: BulkOperationConfig<unknown>) => {
    setProgressDialogOpen(true);
    setProgress({
      total: selectedCount,
      processed: 0,
      current: 0,
      percentage: 0,
      status: "processing",
    });

    try {
      // This would be replaced with actual operation execution
      // For now, simulate progress
      for (let i = 0; i <= selectedCount; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        setProgress({
          total: selectedCount,
          processed: i,
          current: i,
          percentage: Math.round((i / selectedCount) * 100),
          status: "processing",
        });
      }

      const result: BulkOperationResult = {
        success: true,
        processedCount: selectedCount,
        successCount: selectedCount,
        errorCount: 0,
        errors: [],
        operationId: `op-${Date.now()}`,
        timestamp: new Date().toISOString(),
        canUndo: operation.allowUndo || false,
      };

      setProgress(prev => prev ? { ...prev, status: "completed" } : null);
      
      setTimeout(() => {
        setProgressDialogOpen(false);
        setProgress(null);
        handleClearSelection();
      }, 1000);

      toast.success(`${operation.label} completed for ${selectedCount} ${selectedCount === 1 ? itemLabel : itemLabelPlural}`);
      onOperationComplete?.(result);
    } catch (error) {
      setProgress(prev => prev ? { ...prev, status: "failed" } : null);
      toast.error(`Operation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  // Get icon component
  const getIcon = (iconName: string) => {
    const Icon = iconMap[iconName] || MoreHorizontal;
    return <Icon className="h-4 w-4" />;
  };

  // Get button color classes
  const getColorClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      default: "",
      primary: "bg-primary text-primary-foreground hover:bg-primary/90",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      warning: "bg-yellow-500 text-white hover:bg-yellow-600",
    };
    return colorMap[color] || "";
  };

  if (disabled) return null;

  return (
    <>
      <div className={cn(
        "flex items-center gap-2 p-2 bg-muted/50 rounded-lg",
        className
      )}>
        {/* Selection Controls */}
        <div className="flex items-center gap-2">
          {showSelectAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="h-8"
            >
              {isAllSelected ? "Deselect All" : "Select All"}
            </Button>
          )}
          
          {selectedCount > 0 && (
            <Badge variant="secondary" className="h-8 px-2">
              {selectedCount} selected
            </Badge>
          )}

          {showClearSelection && selectedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              className="h-8 px-2"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        <div className="flex-1" />

        {/* Bulk Actions */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-2">
            {/* Primary Actions */}
            {availableOperations
              .filter(({ config }) => !config.requiresConfirmation || config.type === "export")
              .slice(0, 3)
              .map(({ key, config }) => (
                <Button
                  key={key}
                  size="sm"
                  variant={config.color === "destructive" ? "destructive" : "default"}
                  onClick={() => handleOperationClick(config)}
                  className={cn("h-8", getColorClasses(config.color))}
                >
                  {getIcon(config.icon)}
                  <span className="ml-1 hidden sm:inline">{config.label}</span>
                </Button>
              ))}

            {/* More Actions Dropdown */}
            {availableOperations.length > 3 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <MoreHorizontal className="h-4 w-4" />
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {availableOperations
                    .filter(({ config }) => config.requiresConfirmation && config.type !== "export")
                    .map(({ key, config }) => (
                      <DropdownMenuItem
                        key={key}
                        onClick={() => handleOperationClick(config)}
                        className={cn(
                          "cursor-pointer",
                          config.color === "destructive" && "text-destructive"
                        )}
                      >
                        {getIcon(config.icon)}
                        <span className="ml-2">{config.label}</span>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedOperation?.label || "Confirm Action"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedOperation?.confirmationMessage || 
                `Are you sure you want to ${selectedOperation?.label?.toLowerCase()} ${selectedCount} ${selectedCount === 1 ? itemLabel : itemLabelPlural}?`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDialogOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDialogOpen(false);
                if (selectedOperation) {
                  executeOperation(selectedOperation);
                }
              }}
              className={cn(
                selectedOperation?.color === "destructive" && "bg-destructive hover:bg-destructive/90"
              )}
            >
              {selectedOperation?.confirmButtonText || "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Progress Dialog */}
      <Dialog open={progressDialogOpen} onOpenChange={setProgressDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedOperation?.label || "Processing"}
            </DialogTitle>
            <DialogDescription>
              Processing {selectedCount} {selectedCount === 1 ? itemLabel : itemLabelPlural}
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            {progress && (
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {progress.processed} of {progress.total} processed
                  </span>
                  <span className="font-medium">{progress.percentage}%</span>
                </div>
                <Progress value={progress.percentage} className="h-2" />
                {progress.status === "processing" && progress.currentItem && (
                  <p className="text-xs text-muted-foreground text-center">
                    Processing: {progress.currentItem}
                  </p>
                )}
                {progress.status === "completed" && (
                  <div className="flex items-center justify-center text-green-500">
                    <Check className="h-5 w-5 mr-2" />
                    <span>Completed successfully</span>
                  </div>
                )}
                {progress.status === "failed" && (
                  <div className="flex items-center justify-center text-destructive">
                    <X className="h-5 w-5 mr-2" />
                    <span>Operation failed</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * useBulkSelection - Hook for managing bulk selection state
 */
export function useBulkSelection<T extends { id: string }>(items: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map(item => item.id)));
  }, [items]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectRange = useCallback((startId: string, endId: string) => {
    const startIndex = items.findIndex(item => item.id === startId);
    const endIndex = items.findIndex(item => item.id === endId);
    
    if (startIndex === -1 || endIndex === -1) return;
    
    const [minIndex, maxIndex] = [startIndex, endIndex].sort((a, b) => a - b);
    const newIds = items.slice(minIndex, maxIndex + 1).map(item => item.id);
    
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      newIds.forEach(id => newSet.add(id));
      return newSet;
    });
  }, [items]);

  const isSelected = useCallback((id: string) => {
    return selectedIds.has(id);
  }, [selectedIds]);

  const selectedItems = useMemo(() => {
    return items.filter(item => selectedIds.has(item.id));
  }, [items, selectedIds]);

  return {
    selectedIds,
    setSelectedIds,
    selectedItems,
    selectedCount: selectedIds.size,
    toggleSelection,
    selectAll,
    deselectAll,
    selectRange,
    isSelected,
    isAllSelected: selectedIds.size === items.length && items.length > 0,
    isIndeterminate: selectedIds.size > 0 && selectedIds.size < items.length,
  };
}

/**
 * MultiSelectHeader - Checkbox header for data tables
 */
interface MultiSelectHeaderProps {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label?: string;
}

export function MultiSelectHeader({
  checked,
  indeterminate,
  onChange,
  label,
}: MultiSelectHeaderProps) {
  return (
    <div className="flex items-center">
      <input
        type="checkbox"
        checked={checked}
        ref={el => {
          if (el) {
            el.indeterminate = indeterminate;
          }
        }}
        onChange={onChange}
        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
      />
      {label && <span className="ml-2 text-sm">{label}</span>}
    </div>
  );
}

/**
 * MultiSelectCell - Checkbox cell for data table rows
 */
interface MultiSelectCellProps {
  checked: boolean;
  onChange: () => void;
  itemId: string;
}

export function MultiSelectCell({
  checked,
  onChange,
}: MultiSelectCellProps) {
  return (
    <div className="flex items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
      />
    </div>
  );
}

export default BulkActionToolbar;
