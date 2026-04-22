/**
 * Refactored Inventory Page with Modular Feature System
 * 
 * Changes:
 * - Uses feature-based access control instead of hardcoded role checks
 * - Modular tab system - tabs only render if feature is enabled
 * - Actions are gated by specific features, not just roles
 * - Better separation of concerns
 * - More maintainable and testable
 */

import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import {
  Package,
  Warehouse,
  Users,
  FlaskConical,
  History,
  Plus,
  ArrowRightLeft,
  AlertCircle,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// Feature system
import {
  useInventoryFeatures,
  useFeature,
  isFeatureEnabled,
  getAllowedTransferTypes,
  UserRole,
} from "@/lib/featureConfig";

// Inventory hooks
import {
  useWarehouseStock,
  useStaffStockByWarehouse,
  useStockHistory,
} from "@/hooks/inventory";

// Inventory components
import {
  InventorySummaryCards,
  WarehouseStockView,
  StaffStockView,
  StockTransferModal,
  StockAdjustmentModal,
  StockHistoryView,
  RawMaterialInventoryView,
} from "@/components/inventory";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type InventoryTab = "stock" | "staff-holdings" | "raw-materials" | "history";

// ============================================================================
// Modular Tab Components - Only render if feature is enabled
// ============================================================================

interface TabConfig {
  id: InventoryTab;
  label: string;
  icon: React.ReactNode;
  featureId: string;
  badge?: (data: any) => number | null;
}

const TAB_CONFIG: TabConfig[] = [
  {
    id: "stock",
    label: "Stock",
    icon: <Package className="h-4 w-4" />,
    featureId: "inventory.warehouse.view",
  },
  {
    id: "staff-holdings",
    label: "Staff Holdings",
    icon: <Users className="h-4 w-4" />,
    featureId: "inventory.staff-holdings.view",
    badge: (data) => data?.staffGroups?.length || null,
  },
  {
    id: "raw-materials",
    label: "Raw Materials",
    icon: <FlaskConical className="h-4 w-4" />,
    featureId: "inventory.raw-materials.view",
  },
  {
    id: "history",
    label: "History",
    icon: <History className="h-4 w-4" />,
    featureId: "inventory.history.view",
    badge: (data) => data?.pendingReturns?.length || null,
  },
];

// ============================================================================
// Feature-Gated Components
// ============================================================================

function TransferStockButton({ onClick }: { onClick: () => void }) {
  const { enabled } = useFeature("inventory.transfer");
  if (!enabled) return null;
  
  return (
    <Button variant="outline" onClick={onClick}>
      <ArrowRightLeft className="h-4 w-4 mr-2" />
      Transfer Stock
    </Button>
  );
}

function AdjustStockButton({ onClick }: { onClick: () => void }) {
  const { enabled } = useFeature("inventory.adjust");
  if (!enabled) return null;
  
  return (
    <Button onClick={onClick}>
      <Plus className="h-4 w-4 mr-2" />
      Adjust Stock
    </Button>
  );
}

function WarehouseSelector({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string }[];
}) {
  const { enabled } = useFeature("inventory.warehouse.switch");
  
  if (!enabled || options.length <= 1) {
    // Show read-only warehouse name
    const selected = options.find((o) => o.id === value);
    return (
      <div className="flex items-center gap-2 text-sm">
        <Warehouse className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{selected?.name || "Warehouse"}</span>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-[240px]">
        <SelectValue placeholder="Select Warehouse" />
      </SelectTrigger>
      <SelectContent>
        {options.map((w) => (
          <SelectItem key={w.id} value={w.id}>
            {w.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ============================================================================
// Main Component
// ============================================================================

const InventoryRefactored = () => {
  const { user, role } = useAuth();
  const { currentWarehouse, allWarehouses, assignedWarehouseId } = useWarehouse();
  const navigate = useNavigate();
  const features = useInventoryFeatures();

  // State
  const [activeTab, setActiveTab] = useState<InventoryTab>("stock");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [preselectedProduct, setPreselectedProduct] = useState<any>(null);

  // Auto-select warehouse
  const warehouseOptions = useMemo(() => {
    // Super admins see all warehouses
    const canSwitch = isFeatureEnabled("inventory.warehouse.switch", {
      role: role as UserRole,
    }).enabled;
    
    if (canSwitch) {
      return allWarehouses || [];
    }
    
    // Others see only their assigned warehouse
    const allowedId = assignedWarehouseId ?? currentWarehouse?.id;
    return (allWarehouses || []).filter((w) => w.id === allowedId);
  }, [role, allWarehouses, assignedWarehouseId, currentWarehouse]);

  // Auto-select first warehouse
  useMemo(() => {
    if (!selectedWarehouseId && warehouseOptions.length > 0) {
      setSelectedWarehouseId(warehouseOptions[0].id);
    }
  }, [warehouseOptions, selectedWarehouseId]);

  // Filter visible tabs based on features
  const visibleTabs = useMemo(() => {
    return TAB_CONFIG.filter((tab) =>
      features.enabled.includes(tab.featureId)
    );
  }, [features.enabled]);

  // Ensure active tab is visible
  useMemo(() => {
    const visibleIds = visibleTabs.map((t) => t.id);
    if (!visibleIds.includes(activeTab) && visibleIds.length > 0) {
      setActiveTab(visibleIds[0] as InventoryTab);
    }
  }, [visibleTabs, activeTab]);

  // Data fetching
  const { data: warehouseStock, isLoading: isLoadingWarehouse } = useWarehouseStock({
    warehouseId: selectedWarehouseId,
    enabled: activeTab === "stock" && !!selectedWarehouseId,
  });

  const { data: staffStock, isLoading: isLoadingStaff } = useStaffStockByWarehouse(
    selectedWarehouseId
  );

  const { data: stockHistory, isLoading: isLoadingHistory } = useStockHistory({
    warehouseId: selectedWarehouseId,
    enabled: activeTab === "history",
  });

  const { data: pendingReturns } = useQuery({
    queryKey: ["pending-returns", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      const { data } = await supabase
        .from("stock_transfers")
        .select("*")
        .eq("transfer_type", "staff_to_warehouse")
        .eq("status", "pending")
        .eq("to_warehouse_id", selectedWarehouseId);
      return data || [];
    },
    enabled: activeTab === "history" && features.enabled.includes("inventory.returns.review"),
  });

  // Transfer types based on features
  const allowedTransferTypes = useMemo(() => {
    return getAllowedTransferTypes(role as UserRole);
  }, [role]);

  // Handlers
  const handleWarehouseChange = useCallback((id: string) => {
    // Check if user can switch warehouses
    const canSwitch = isFeatureEnabled("inventory.warehouse.switch", {
      role: role as UserRole,
    }).enabled;
    
    if (!canSwitch && id !== (assignedWarehouseId ?? currentWarehouse?.id)) {
      toast.error("You don't have permission to view this warehouse");
      return;
    }
    setSelectedWarehouseId(id);
  }, [role, assignedWarehouseId, currentWarehouse]);

  // Access guard
  const canViewInventory = features.enabled.includes("inventory.view");
  if (!canViewInventory) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Inventory Management"
          subtitle="You don't have access to inventory management."
        />
      </div>
    );
  }

  // Tab metadata
  const currentTabConfig = TAB_CONFIG.find((t) => t.id === activeTab);
  const tabMeta: Record<InventoryTab, { title: string; description: string }> = {
    stock: {
      title: "Warehouse Stock",
      description: "Check live stock levels and manage inventory",
    },
    "staff-holdings": {
      title: "Staff Holdings",
      description: "Track stock assigned to field staff",
    },
    "raw-materials": {
      title: "Raw Materials",
      description: "Manage raw materials and consumables",
    },
    history: {
      title: "History & Returns",
      description: "Review stock movements and returns",
    },
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Inventory Management"
          subtitle="Stock visibility, transfers, and reconciliation"
        />
        <div className="flex items-center gap-2">
          <TransferStockButton onClick={() => setShowTransferModal(true)} />
          <AdjustStockButton onClick={() => setShowAdjustmentModal(true)} />
        </div>
      </div>

      {/* Summary Cards */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">
                {tabMeta[activeTab]?.title || "Inventory"}
              </h2>
              <p className="text-sm text-muted-foreground max-w-2xl">
                {tabMeta[activeTab]?.description}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warehouse Selector */}
      {warehouseOptions.length > 0 && (
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 text-sm">
              <Warehouse className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium">Warehouse Context</p>
                <p className="text-muted-foreground">
                  Inventory data is scoped to the selected warehouse
                </p>
              </div>
            </div>
            <div className="sm:ml-auto">
              <WarehouseSelector
                value={selectedWarehouseId}
                onChange={handleWarehouseChange}
                options={warehouseOptions}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Warehouse Alert */}
      {!selectedWarehouseId && warehouseOptions.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No warehouse is assigned to this account. Contact your administrator.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InventoryTab)}>
        <TabsList className="mb-6 flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          {visibleTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-primary/5"
            >
              {tab.icon}
              {tab.label}
              {tab.badge && (
                (() => {
                  const count = tab.badge({ staffGroups: staffStock?.staffGroups || [], pendingReturns: pendingReturns || [] });
                  return count ? (
                    <Badge variant="secondary" className="ml-1">
                      {count}
                    </Badge>
                  ) : null;
                })()
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Stock Tab */}
        {visibleTabs.find((t) => t.id === "stock") && (
          <TabsContent value="stock" className="space-y-6">
            <WarehouseStockView
              products={warehouseStock?.items}
              selectedWarehouseId={selectedWarehouseId}
              isLoading={isLoadingWarehouse}
              canTransfer={features.enabled.includes("inventory.transfer")}
              canAdjust={features.enabled.includes("inventory.adjust")}
              onTransferStock={(product) => {
                if (!features.enabled.includes("inventory.transfer")) {
                  toast.error("You don't have permission to transfer stock");
                  return;
                }
                setPreselectedProduct(product);
                setShowTransferModal(true);
              }}
              onAdjustStock={(product) => {
                if (!features.enabled.includes("inventory.adjust")) {
                  toast.error("You don't have permission to adjust stock");
                  return;
                }
                setPreselectedProduct(product);
                setShowAdjustmentModal(true);
              }}
            />
          </TabsContent>
        )}

        {/* Staff Holdings Tab */}
        {visibleTabs.find((t) => t.id === "staff-holdings") && (
          <TabsContent value="staff-holdings" className="space-y-6">
            <StaffStockView
              staffStock={staffStock?.staffGroups || []}
              isLoading={isLoadingStaff}
              onTransfer={(staff) => {
                if (!features.enabled.includes("inventory.transfer")) {
                  toast.error("You don't have permission to transfer stock");
                  return;
                }
                setShowTransferModal(true);
              }}
            />
          </TabsContent>
        )}

        {/* History Tab */}
        {visibleTabs.find((t) => t.id === "history") && (
          <TabsContent value="history" className="space-y-6">
            <StockHistoryView warehouseId={selectedWarehouseId} />
          </TabsContent>
        )}
      </Tabs>

      {/* Modals - Feature-gated */}
      {features.enabled.includes("inventory.transfer") && (
        <StockTransferModal
          isOpen={showTransferModal}
          onClose={() => {
            setShowTransferModal(false);
            setPreselectedProduct(null);
          }}
          warehouseId={selectedWarehouseId}
          defaultProductId={preselectedProduct?.id}
          allowedTransferTypes={allowedTransferTypes}
        />
      )}

      {features.enabled.includes("inventory.adjust") && (
        <StockAdjustmentModal
          isOpen={showAdjustmentModal}
          onClose={() => {
            setShowAdjustmentModal(false);
            setPreselectedProduct(null);
          }}
          warehouseId={selectedWarehouseId}
          defaultProductId={preselectedProduct?.id}
        />
      )}
    </div>
  );
};

export default InventoryRefactored;
