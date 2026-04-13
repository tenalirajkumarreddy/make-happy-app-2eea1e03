import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import {
  Loader2,
  Package,
  Plus,
  Minus,
  History,
  BoxSelect,
  ArrowRightLeft,
  Users,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCcw,
} from "lucide-react";
import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type MovementType = "purchase" | "sale" | "adjustment" | "return" | "transfer_in" | "transfer_out";

const MOVEMENT_TYPES: Record<MovementType, string> = {
  purchase: "Purchase (In)",
  sale: "Sale (Out)",
  adjustment: "Correction (+/-)",
  return: "Return (In)",
  transfer_in: "Transfer (In)",
  transfer_out: "Transfer (Out)",
};

interface StockHolder {
  user_id: string;
  full_name: string;
  quantity: number;
  role: string;
}

interface ProductStockBreakdown {
  product_id: string;
  product_name: string;
  sku: string;
  unit: string;
  base_price: number;
  warehouse_quantity: number;
  staff_holdings: StockHolder[];
  total_quantity: number;
}

const Inventory = () => {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const canEdit = usePermission("inventory", "manage");
  const canAdjust = usePermission("stock", "adjust");
  const canTransfer = usePermission("stock", "transfer");
  const isAdmin = role === "super_admin";

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [showAdjust, setShowAdjust] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showReturnReview, setShowReturnReview] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedTransfer, setSelectedTransfer] = useState<any>(null);

  // Adjust form state
  const [adjustType, setAdjustType] = useState<MovementType>("adjustment");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [transferFrom, setTransferFrom] = useState<"warehouse" | "staff">("warehouse");
  const [transferTo, setTransferTo] = useState<"warehouse" | "staff">("staff");
  const [transferFromUserId, setTransferFromUserId] = useState("");
  const [transferToUserId, setTransferToUserId] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Return review state
  const [returnActualQty, setReturnActualQty] = useState("");
  const [returnAction, setReturnAction] = useState<"keep" | "flag">("keep");
  const [returnNotes, setReturnNotes] = useState("");

  // Fetch Warehouses
  const { data: warehouses, isLoading: loadWh } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("*").eq("is_active", true).order("name");
      return data || [];
    },
  });

  // Set default warehouse
  if (warehouses?.length && !selectedWarehouseId) {
    setSelectedWarehouseId(warehouses[0].id);
  }

  // Fetch Products
  const { data: products, isLoading: loadProducts } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, unit, category, base_price, min_stock_level")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  // Fetch Warehouse Stock
  const { data: warehouseStock, isLoading: loadWarehouseStock } = useQuery({
    queryKey: ["warehouse-stock", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      const { data } = await supabase
        .from("product_stock")
        .select("product_id, quantity")
        .eq("warehouse_id", selectedWarehouseId);
      return data || [];
    },
    enabled: !!selectedWarehouseId,
  });

  // Fetch Staff Stock with Profiles
  const { data: staffStock, isLoading: loadStaffStock } = useQuery({
    queryKey: ["staff-stock-all", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      const { data, error } = await supabase
        .from("staff_stock")
        .select(`
          id,
          user_id,
          product_id,
          quantity,
          profile:profiles(id, full_name, user_roles(role))
        `)
        .eq("warehouse_id", selectedWarehouseId)
        .gt("quantity", 0); // Only get staff with stock > 0

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedWarehouseId,
  });

  // Fetch Staff Members for Transfer
  const { data: staffMembers } = useQuery({
    queryKey: ["staff-members", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      const { data } = await supabase
        .from("user_roles")
        .select("user_id, role, profile:profiles(id, full_name, avatar_url)")
        .eq("warehouse_id", selectedWarehouseId)
        .in("role", ["agent", "marketer", "pos"]);
      return data?.map((s: any) => ({
        id: s.user_id,
        full_name: s.profile?.full_name || "Unknown",
        avatar_url: s.profile?.avatar_url,
        role: s.role,
      })) || [];
    },
    enabled: !!selectedWarehouseId,
  });

  // Fetch Pending Returns (transfers with status pending)
  const { data: pendingReturns, isLoading: loadReturns } = useQuery({
    queryKey: ["pending-returns", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      const { data, error } = await supabase
        .from("stock_transfers")
        .select(`
          *,
          product:products(id, name, sku, unit),
          from_user:profiles!stock_transfers_from_user_id_fkey(id, full_name, avatar_url),
          to_warehouse:warehouses!stock_transfers_to_warehouse_id_fkey(id, name)
        `)
        .eq("transfer_type", "staff_to_warehouse")
        .eq("from_warehouse_id", selectedWarehouseId)
        .eq("status", "pending");

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedWarehouseId,
  });

  // Fetch Recent Movements
  const { data: movements } = useQuery({
    queryKey: ["stock-movements", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      const { data } = await supabase
        .from("stock_movements")
        .select("*, products(name, sku)")
        .eq("warehouse_id", selectedWarehouseId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!selectedWarehouseId,
  });

  // Build stock breakdown by product
  const stockBreakdown = useMemo((): ProductStockBreakdown[] => {
    if (!products || !warehouseStock) return [];

    const warehouseStockMap = new Map(warehouseStock.map((s: any) => [s.product_id, s.quantity]));
    const staffStockMap = new Map<string, StockHolder[]>();

    // Group staff stock by product
    staffStock?.forEach((item: any) => {
      const existing = staffStockMap.get(item.product_id) || [];
      existing.push({
        user_id: item.user_id,
        full_name: item.profile?.full_name || "Unknown",
        quantity: item.quantity,
        role: item.profile?.user_roles?.[0]?.role || "staff",
      });
      staffStockMap.set(item.product_id, existing);
    });

    return products.map((product: any) => {
      const warehouseQty = warehouseStockMap.get(product.id) || 0;
      const staffHoldings = staffStockMap.get(product.id) || [];
      const staffQty = staffHoldings.reduce((sum, h) => sum + h.quantity, 0);

      return {
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        unit: product.unit,
        base_price: product.base_price,
        warehouse_quantity: warehouseQty,
        staff_holdings: staffHoldings,
        total_quantity: warehouseQty + staffQty,
      };
    });
  }, [products, warehouseStock, staffStock]);

  // Handle stock adjustment
  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouseId || !selectedProduct) return;
    setSaving(true);
    try {
      const qty = parseFloat(adjustQty);
      if (isNaN(qty) || qty === 0) throw new Error("Invalid quantity");

      let finalQty = qty;
      if (["sale", "transfer_out"].includes(adjustType)) {
        finalQty = -Math.abs(qty);
      } else if (["purchase", "return", "transfer_in"].includes(adjustType)) {
        finalQty = Math.abs(qty);
      }

      const { error } = await supabase.rpc("record_stock_movement", {
        p_product_id: selectedProduct.id,
        p_warehouse_id: selectedWarehouseId,
        p_quantity: finalQty,
        p_type: adjustType,
        p_reason: adjustReason,
        p_user_id: user?.id,
      });

      if (error) throw error;
      toast.success("Stock updated successfully");
      setShowAdjust(false);
      setAdjustQty("");
      setAdjustReason("");
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Handle stock transfer
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouseId || !selectedProduct || !transferQty) return;

    const qty = parseFloat(transferQty);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Invalid quantity");
      return;
    }

    // Validate permissions
    if (transferFrom === "staff" && transferTo === "warehouse" && !isAdmin) {
      toast.error("Only admin can transfer from staff to warehouse");
      return;
    }

    if (transferFrom === "warehouse" && transferTo === "staff" && !canAdjust) {
      toast.error("You don't have permission to transfer stock");
      return;
    }

    setSaving(true);
    try {
      let transferType = "";
      let fromUserId = null;
      let toUserId = null;

      if (transferFrom === "warehouse" && transferTo === "staff") {
        transferType = "warehouse_to_staff";
        toUserId = transferToUserId;
      } else if (transferFrom === "staff" && transferTo === "warehouse") {
        transferType = "staff_to_warehouse";
        fromUserId = transferFromUserId;
      } else if (transferFrom === "staff" && transferTo === "staff") {
        transferType = "staff_to_staff";
        fromUserId = transferFromUserId;
        toUserId = transferToUserId;
      }

      const { error } = await supabase.rpc("record_stock_transfer", {
        p_transfer_type: transferType,
        p_from_warehouse_id: selectedWarehouseId,
        p_from_user_id: fromUserId,
        p_to_warehouse_id: selectedWarehouseId,
        p_to_user_id: toUserId,
        p_product_id: selectedProduct.id,
        p_quantity: qty,
        p_reason: transferReason,
        p_created_by: user?.id,
      });

      if (error) throw error;

      toast.success("Stock transferred successfully");
      setShowTransfer(false);
      resetTransferForm();
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["staff-stock-all"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["pending-returns"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Handle return review
  const handleReturnReview = async (approved: boolean) => {
    if (!selectedTransfer) return;

    const actualQty = parseFloat(returnActualQty) || selectedTransfer.quantity;
    const difference = selectedTransfer.quantity - actualQty;

    setSaving(true);
    try {
      const { error } = await supabase.rpc("process_stock_return", {
        p_transfer_id: selectedTransfer.id,
        p_actual_quantity: actualQty,
        p_difference: difference,
        p_action: returnAction, // 'keep' or 'flag'
        p_notes: returnNotes,
        p_reviewed_by: user?.id,
        p_approved: approved,
      });

      if (error) throw error;

      toast.success(approved ? "Return approved" : "Return rejected");
      setShowReturnReview(false);
      resetReturnForm();
      qc.invalidateQueries({ queryKey: ["pending-returns"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["staff-stock-all"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetTransferForm = () => {
    setTransferFrom("warehouse");
    setTransferTo("staff");
    setTransferFromUserId("");
    setTransferToUserId("");
    setTransferQty("");
    setTransferReason("");
  };

  const resetReturnForm = () => {
    setSelectedTransfer(null);
    setReturnActualQty("");
    setReturnAction("keep");
    setReturnNotes("");
  };

  const openAdjustModal = (product: any, type: MovementType = "adjustment") => {
    setSelectedProduct(product);
    setAdjustType(type);
    setShowAdjust(true);
  };

  const openTransferModal = (product: any) => {
    setSelectedProduct(product);
    resetTransferForm();
    setShowTransfer(true);
  };

  const openReturnReview = (transfer: any) => {
    setSelectedTransfer(transfer);
    setReturnActualQty(transfer.quantity.toString());
    setShowReturnReview(true);
  };

  // Columns for DataTable
  const columns = [
    {
      header: "SKU",
      accessor: "sku",
      className: "w-[100px] font-mono text-xs",
    },
    {
      header: "Product",
      accessor: (row: ProductStockBreakdown) => (
        <div>
          <div className="font-medium">{row.product_name}</div>
          <div className="text-xs text-muted-foreground">{row.sku}</div>
        </div>
      ),
    },
    {
      header: "Stock Breakdown",
      accessor: (row: ProductStockBreakdown) => (
        <div className="space-y-1">
          {/* Total */}
          <div className="flex items-center gap-2 font-semibold">
            <span className="text-emerald-600">{row.total_quantity}</span>
            <span className="text-xs text-muted-foreground">{row.unit} total</span>
          </div>
          {/* Warehouse */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Warehouse:</span>
            <span className="font-medium">{row.warehouse_quantity}</span>
          </div>
          {/* Staff Holdings */}
          {row.staff_holdings.length > 0 && (
            <div className="space-y-0.5 pl-2 border-l-2 border-muted">
              {row.staff_holdings.map((holder) => (
                <div key={holder.user_id} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground truncate max-w-[100px]">
                    {holder.full_name}:
                  </span>
                  <span className="font-medium">{holder.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
      className: "min-w-[200px]",
    },
    {
      header: "Value",
      accessor: (row: ProductStockBreakdown) => (
        <div className="text-right">
          <div className="font-medium">
            ₹{(row.total_quantity * row.base_price).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">
            ₹{row.base_price.toLocaleString()}/{row.unit}
          </div>
        </div>
      ),
      className: "text-right",
    },
    {
      header: "Actions",
      accessor: (row: ProductStockBreakdown) => (
        <div className="flex items-center gap-2">
          {canAdjust && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openAdjustModal({ id: row.product_id, name: row.product_name, unit: row.unit })}
            >
              Adjust
            </Button>
          )}
          {canTransfer && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openTransferModal({ id: row.product_id, name: row.product_name, unit: row.unit })}
            >
              <ArrowRightLeft className="h-3 w-3 mr-1" />
              Transfer
            </Button>
          )}
        </div>
      ),
      className: "text-right",
    },
  ];

  const movementColumns = [
    {
      header: "Date",
      accessor: (row: any) => format(new Date(row.created_at), "dd MMM HH:mm"),
      className: "text-xs text-slate-500 whitespace-nowrap",
    },
    {
      header: "Product",
      accessor: (row: any) => row.products?.name,
    },
    {
      header: "Type",
      accessor: (row: any) => <Badge variant="outline">{row.type}</Badge>,
    },
    {
      header: "Qty",
      accessor: (row: any) => (
        <span className={row.quantity > 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
          {row.quantity > 0 ? "+" : ""}{row.quantity}
        </span>
      ),
      className: "text-right",
    },
    {
      header: "Reason",
      accessor: "reason",
      className: "text-xs max-w-[200px] truncate",
    },
  ];

  const isLoading = loadWh || loadProducts || loadWarehouseStock || loadStaffStock;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Inventory Management"
          subtitle="Manage stock levels across warehouses and staff"
        />
        <div className="flex items-center gap-2">
          {canTransfer && (
            <Button variant="outline" onClick={() => setShowTransfer(true)}>
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Transfer Stock
            </Button>
          )}
          {canAdjust && (
            <Button onClick={() => openAdjustModal(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Adjust Stock
            </Button>
          )}
        </div>
      </div>

      {/* Warehouse Selector */}
      {warehouses && warehouses.length > 0 && (
        <div className="flex items-center gap-3">
          <BoxSelect className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select Warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses?.map((w: any) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Summary Cards */}
      {!isLoading && stockBreakdown.length > 0 && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Products</p>
                  <p className="text-2xl font-bold">{stockBreakdown.length}</p>
                </div>
                <Package className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">In Warehouse</p>
                  <p className="text-2xl font-bold">
                    {stockBreakdown.reduce((sum, s) => sum + s.warehouse_quantity, 0)}
                  </p>
                </div>
                <BoxSelect className="h-8 w-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">With Staff</p>
                  <p className="text-2xl font-bold">
                    {stockBreakdown.reduce((sum, s) => sum + s.staff_holdings.reduce((a, h) => a + h.quantity, 0), 0)}
                  </p>
                </div>
                <Users className="h-8 w-8 text-indigo-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending Returns</p>
                  <p className="text-2xl font-bold">{pendingReturns?.length || 0}</p>
                </div>
                <RefreshCcw className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="stock" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stock">Current Stock</TabsTrigger>
          <TabsTrigger value="movements">Recent Movements</TabsTrigger>
          {(isAdmin || canAdjust) && (
            <TabsTrigger value="returns" className="relative">
              Pending Returns
              {pendingReturns && pendingReturns.length > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 flex items-center justify-center">
                  {pendingReturns.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin h-8 w-8" />
            </div>
          ) : (
            <DataTable
              data={stockBreakdown}
              columns={columns}
              searchable
              searchKeys={["product_name", "sku"]}
            />
          )}
        </TabsContent>

        <TabsContent value="movements">
          <div className="rounded-md border">
            <DataTable data={movements || []} columns={movementColumns} />
          </div>
        </TabsContent>

        {(isAdmin || canAdjust) && (
          <TabsContent value="returns">
            {loadReturns ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin h-8 w-8" />
              </div>
            ) : pendingReturns?.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-xl">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold text-lg mb-2">No Pending Returns</h3>
                <p className="text-muted-foreground text-sm">
                  All return requests have been processed.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingReturns?.map((returnReq: any) => (
                  <Card key={returnReq.id} className="overflow-hidden">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={returnReq.from_user?.avatar_url} />
                            <AvatarFallback>
                              {returnReq.from_user?.full_name?.charAt(0) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h4 className="font-semibold">
                              Return from {returnReq.from_user?.full_name || "Unknown"}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              Product: {returnReq.product?.name} ({returnReq.quantity} {returnReq.product?.unit})
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Requested: {format(new Date(returnReq.created_at), "dd MMM yyyy HH:mm")}
                            </p>
                            {returnReq.description && (
                              <p className="text-sm mt-1 italic">"{returnReq.description}"</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openReturnReview(returnReq)}
                          >
                            Review
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Adjust Stock Dialog */}
      <Dialog open={showAdjust} onOpenChange={setShowAdjust}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock {selectedProduct?.name && `for ${selectedProduct.name}`}</DialogTitle>
            <DialogDescription>
              Record a stock movement
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdjust} className="space-y-4">
            <div className="space-y-2">
              <Label>Movement Type</Label>
              <Select value={adjustType} onValueChange={(v) => setAdjustType(v as MovementType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MOVEMENT_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity ({selectedProduct?.unit || "units"})</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                {adjustType === "adjustment" ? "Use negative for reduction." : "Enter positive value, system will apply sign."}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Reason / Note</Label>
              <Textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="e.g. Broken stock, Received shipment #123"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdjust(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Adjustment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer Stock Dialog */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Transfer Stock {selectedProduct?.name && `for ${selectedProduct.name}`}</DialogTitle>
            <DialogDescription>
              Move stock between warehouse and staff
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTransfer} className="space-y-4">
            {/* From */}
            <div className="space-y-2">
              <Label>From</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={transferFrom === "warehouse" ? "default" : "outline"}
                  onClick={() => setTransferFrom("warehouse")}
                  className="flex-1"
                  disabled={!isAdmin && transferTo === "warehouse"}
                >
                  Warehouse
                </Button>
                <Button
                  type="button"
                  variant={transferFrom === "staff" ? "default" : "outline"}
                  onClick={() => setTransferFrom("staff")}
                  className="flex-1"
                  disabled={!isAdmin}
                >
                  Staff
                </Button>
              </div>
              {transferFrom === "staff" && (
                <Select value={transferFromUserId} onValueChange={setTransferFromUserId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffMembers?.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* To */}
            <div className="space-y-2">
              <Label>To</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={transferTo === "warehouse" ? "default" : "outline"}
                  onClick={() => setTransferTo("warehouse")}
                  className="flex-1"
                  disabled={!isAdmin}
                >
                  Warehouse
                </Button>
                <Button
                  type="button"
                  variant={transferTo === "staff" ? "default" : "outline"}
                  onClick={() => setTransferTo("staff")}
                  className="flex-1"
                >
                  Staff
                </Button>
              </div>
              {transferTo === "staff" && (
                <Select value={transferToUserId} onValueChange={setTransferToUserId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffMembers
                      ?.filter((s: any) => s.id !== transferFromUserId)
                      ?.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Product Selection (if not preselected) */}
            {!selectedProduct && (
              <div className="space-y-2">
                <Label>Product</Label>
                <Select
                  value={selectedProduct?.id || ""}
                  onValueChange={(id) => {
                    const p = products?.find((prod: any) => prod.id === id);
                    setSelectedProduct(p);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Quantity */}
            <div className="space-y-2">
              <Label>Quantity ({selectedProduct?.unit || "units"})</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Enter quantity"
                value={transferQty}
                onChange={(e) => setTransferQty(e.target.value)}
                required
              />
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="Reason for transfer..."
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowTransfer(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Transfer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Return Review Dialog */}
      <Dialog open={showReturnReview} onOpenChange={setShowReturnReview}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Return Request</DialogTitle>
            <DialogDescription>
              Review stock return from {selectedTransfer?.from_user?.full_name}
            </DialogDescription>
          </DialogHeader>
          {selectedTransfer && (
            <div className="space-y-4">
              {/* Request Info */}
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Product:</span>
                  <span className="font-medium">{selectedTransfer.product?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Requested:</span>
                  <span className="font-medium">{selectedTransfer.quantity} {selectedTransfer.product?.unit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expected in hand:</span>
                  <span className="font-medium text-amber-600">{selectedTransfer.quantity}</span>
                </div>
              </div>

              {/* Actual Quantity */}
              <div className="space-y-2">
                <Label>Actual Quantity Received</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={selectedTransfer.quantity}
                  value={returnActualQty}
                  onChange={(e) => setReturnActualQty(e.target.value)}
                />
                {parseFloat(returnActualQty || "0") < selectedTransfer.quantity && (
                  <p className="text-sm text-amber-600">
                    Difference: {selectedTransfer.quantity - parseFloat(returnActualQty || "0")} {selectedTransfer.product?.unit}
                  </p>
                )}
              </div>

              {/* Action Toggle */}
              {parseFloat(returnActualQty || "0") < selectedTransfer.quantity && (
                <div className="space-y-3">
                  <Label>Handle Difference</Label>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {returnAction === "keep" ? (
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <p className="font-medium">
                          {returnAction === "keep" ? "Keep with User" : "Flag as Error"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {returnAction === "keep"
                            ? "Remaining stock stays with staff member"
                            : "Log as discrepancy in performance report"}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={returnAction === "flag"}
                      onCheckedChange={(checked) => setReturnAction(checked ? "flag" : "keep")}
                    />
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label>Review Notes</Label>
                <Textarea
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Add notes about this return..."
                />
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowReturnReview(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => handleReturnReview(false)}
                  disabled={saving}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
                <Button
                  type="button"
                  onClick={() => handleReturnReview(true)}
                  disabled={saving}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inventory;
