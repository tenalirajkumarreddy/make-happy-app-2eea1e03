import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Label } from "@/components/ui/label";
import { sendNotificationToMany, getApproverUserIds } from "@/lib/notifications";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Package, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StockTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouseId?: string;
  defaultProductId?: string;
  /** Optional pre-fetched staff list — if omitted we fetch internally */
  staffMembers?: { user_id: string; full_name?: string; role?: string; warehouse_id?: string }[];
  allowedTransferTypes?: TransferType[];
  currentUserId?: string;
}

type TransferType = "warehouse_to_staff" | "staff_to_warehouse" | "staff_to_staff" | "warehouse_to_warehouse";

interface SelectedProduct {
  product_id: string;
  product_name: string;
  available: number;
  quantity: string;
}

// ---------------------------------------------------------------------------
// Allowed staff roles for stock transfers
// ---------------------------------------------------------------------------
const ALLOWED_STAFF_ROLES = ["super_admin", "agent", "operator", "marketer", "manager"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StockTransferModal({
  isOpen,
  onClose,
  warehouseId,
  defaultProductId,
  staffMembers,
  allowedTransferTypes: initialAllowedTypes,
  currentUserId: propCurrentUserId,
}: StockTransferModalProps) {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const currentUserId = propCurrentUserId || user?.id;
  const queryClient = useQueryClient();

  const isSuperAdmin = role === "super_admin";
  const isManager = role === "manager";
  const isAdmin = isSuperAdmin || isManager;
  const isOperator = role === "operator";
  const isAgent = role === "agent" || role === "marketer";

  const allowedTransferTypes = useMemo(() => {
    if (initialAllowedTypes) return initialAllowedTypes;
    // Admin: full access
    if (isSuperAdmin) return ["warehouse_to_staff", "staff_to_warehouse", "staff_to_staff", "warehouse_to_warehouse"] as TransferType[];
    // Manager: all transfers including wh→wh
    if (isManager) return ["warehouse_to_staff", "staff_to_warehouse", "staff_to_staff", "warehouse_to_warehouse"] as TransferType[];
    // Operator: dispatch from their WH to staff, or staff-to-staff within their WH
    if (isOperator) return ["warehouse_to_staff", "staff_to_staff"] as TransferType[];
    // Agent/Marketer: only from own stock — never from warehouse
    if (isAgent) return ["staff_to_warehouse", "staff_to_staff"] as TransferType[];
    // Unknown role: no transfers allowed
    return [] as TransferType[];
  }, [isSuperAdmin, isManager, isOperator, isAgent, initialAllowedTypes]);

  const [transferType, setTransferType] = useState<TransferType>(
    (allowedTransferTypes[0] as TransferType) || "staff_to_staff"
  );
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [notes, setNotes] = useState<string>("");

  // ── Warehouses ─────────────────────────────────────────────────────────────
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-transfer", currentUserId],
    queryFn: async () => {
      console.log("[StockTransfer] Fetching warehouses for:", currentUserId);
      // First get user's direct warehouse assignment
      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("warehouse_id")
        .eq("user_id", currentUserId)
        .not("warehouse_id", "is", null);

      const assignedWarehouseIds = (userRoles ?? [])
        .map((r) => r.warehouse_id)
        .filter(Boolean);

      // Get warehouses where user has stock (they can transfer TO those)
      const { data: userStock } = await supabase
        .from("staff_stock")
        .select("warehouse_id")
        .eq("user_id", currentUserId)
        .gt("quantity", 0);

      const stockWarehouseIds = (userStock ?? [])
        .map((s) => s.warehouse_id)
        .filter(Boolean);

      // Combine: assigned + where user has stock
      const accessibleWhIds = [...new Set([...assignedWarehouseIds, ...stockWarehouseIds])];

      // Build query
      let query = supabase
        .from("warehouses")
        .select("id, name")
        .eq("is_active", true);

      // If not admin, restrict to assigned or stock-holding warehouses
      if (!isAdmin) {
        if (accessibleWhIds.length > 0) {
          query = query.in("id", accessibleWhIds);
        } else if (currentWarehouse?.id) {
          query = query.eq("id", currentWarehouse.id);
        }
      }

      const { data, error } = await query.order("name");
      if (error) throw error;
      console.log("[StockTransfer] Warehouses found:", data?.length || 0);
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // ── Staff list (broader roles) ─────────────────────────────────────────────
  const { data: fetchedStaff = [] } = useQuery({
    queryKey: ["staff-transfer-eligible"],
    queryFn: async () => {
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role, warehouse_id")
        .in("role", ALLOWED_STAFF_ROLES);

      if (rolesError) throw rolesError;
      if (!rolesData?.length) return [];

      const userIds = rolesData.map((r) => r.user_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map(
        (profilesData ?? []).map((p) => [p.user_id, p])
      );

      return rolesData
        .map((r) => ({
          user_id: r.user_id,
          role: r.role,
          warehouse_id: r.warehouse_id,
          full_name: profileMap.get(r.user_id)?.full_name ?? "Unknown",
          avatar_url: profileMap.get(r.user_id)?.avatar_url ?? null,
        }))
        .filter(
          (s) =>
            s.full_name &&
            s.full_name !== "Unknown"
        );
    },
    enabled: !staffMembers || staffMembers.length === 0,
    staleTime: 60_000,
  });

  // Prefer prop list, fall back to fetched list
  const displayStaff = useMemo(() => {
    const list = staffMembers && staffMembers.length > 0 ? staffMembers : fetchedStaff;
    
    // If agent, they can only select themselves as recipient/source in most cases
    // but here we filter based on transfer type in the render section
    return list;
  }, [staffMembers, fetchedStaff]);

  // ── Source stock ───────────────────────────────────────────────────────────
  const { data: sourceStock = [], isLoading: isLoadingStock } = useQuery({
    queryKey: ["source-stock-transfer", transferType, fromId],
    queryFn: async () => {
      console.log("[StockTransfer] Fetching stock for:", { transferType, fromId });
      let physicalStock: any[] = [];
      const pendingOutgoing: Record<string, number> = {};

      if (!fromId) return [];

      if (transferType === "warehouse_to_staff" || transferType === "warehouse_to_warehouse") {
        // Fetch from warehouse stock
        const { data, error } = await supabase
          .from("product_stock")
          .select("product_id, quantity, product:products(id, name, sku, unit, base_price)")
          .eq("warehouse_id", fromId)
          .gt("quantity", 0);
        if (error) throw error;
        physicalStock = data ?? [];

        // Fetch pending outgoing from this warehouse
        const { data: pending } = await supabase
          .from("stock_transfers")
          .select("product_id, quantity")
          .eq("from_warehouse_id", fromId)
          .in("status", ["pending", "awaiting_acceptance"]);
        
        pending?.forEach(p => {
          pendingOutgoing[p.product_id] = (pendingOutgoing[p.product_id] || 0) + Number(p.quantity);
        });
      } else {
        // staff_to_warehouse or staff_to_staff — fetch from selected user's stock
        // NOTE: Do NOT filter quantity > 0 here; we need rows with pending transfers too.
        const { data, error } = await supabase
          .from("staff_stock")
          .select("product_id, quantity, warehouse_id, product:products(id, name, sku, unit, base_price)")
          .eq("user_id", fromId)
          .gte("quantity", 0); // include zero-quantity rows to detect fully-pending stock
        if (error) throw error;
        physicalStock = data ?? [];

        // Fetch pending outgoing from this staff
        const { data: pending } = await supabase
          .from("stock_transfers")
          .select("product_id, quantity")
          .eq("from_user_id", fromId)
          .in("status", ["pending", "awaiting_acceptance"]);
        
        pending?.forEach(p => {
          pendingOutgoing[p.product_id] = (pendingOutgoing[p.product_id] || 0) + Number(p.quantity);
        });
      }

      const result = physicalStock.map((r) => {
        const product = Array.isArray(r.product) ? r.product[0] : r.product;
        const pending = pendingOutgoing[r.product_id] || 0;
        return {
          ...r,
          product,
          physical_quantity: r.quantity,
          quantity: Math.max(0, r.quantity - pending), // "Truly Available" after pending
          pending_out: pending
        };
      }).filter(r => r.quantity > 0 || r.pending_out > 0);

      console.log("[StockTransfer] Stock fetched:", physicalStock.length, "rows → ", result.length, "usable items");
      return result;
    },
    enabled: !!currentUserId && !!fromId,
  });

  // ── Reset on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !currentUserId) return;
    // Use the first allowed transfer type as default; safe fallback is staff_to_staff
    const defaultType = (allowedTransferTypes?.[0] as TransferType) || "staff_to_staff";
    setTransferType(defaultType);
    
    const defaultWhId = warehouseId || currentWarehouse?.id || warehouses[0]?.id || "";
    
    // Staff transfers: from current user; warehouse transfers: from warehouse
    if (["warehouse_to_staff", "warehouse_to_warehouse"].includes(defaultType)) {
      setFromId(defaultWhId);
      setToId("");
    } else {
      setFromId(currentUserId);
      setToId(defaultType === "staff_to_warehouse" ? defaultWhId : "");
    }
    
    setSelectedProducts([]);
    setNotes("");
    console.log("[StockTransfer] Reset state:", { defaultType, defaultWhId });
  }, [isOpen, currentUserId, warehouses, currentWarehouse]);


  // ── Update fromId when transferType changes ─────────────────────────────────
  useEffect(() => {
    if (!isOpen || !currentUserId) return;
    if (!["warehouse_to_staff", "warehouse_to_warehouse"].includes(transferType)) {
      setFromId(currentUserId);
      setSelectedProducts([]);
    }
  }, [transferType, isOpen, currentUserId]);

  // Default warehouse for current user
  const defaultWarehouseId = useMemo(() => {
    return warehouses[0]?.id ?? warehouseId;
  }, [warehouses, warehouseId]);

  // ── Pre-select defaultProductId ────────────────────────────────────────────
  useEffect(() => {
    if (!defaultProductId || !sourceStock.length || selectedProducts.length > 0) return;
    const match = sourceStock.find((s) => s.product_id === defaultProductId);
    if (match) {
      setSelectedProducts([
        {
          product_id: match.product_id,
          product_name: match.product?.name ?? "Unknown",
          available: match.quantity,
          quantity: "",
        },
      ]);
    }
  }, [defaultProductId, sourceStock, selectedProducts.length]);

  // ── Product selection helpers ──────────────────────────────────────────────
  const toggleProduct = (item: (typeof sourceStock)[0]) => {
    const id = item.product_id;
    setSelectedProducts((prev) => {
      const exists = prev.some((p) => p.product_id === id);
      if (exists) return prev.filter((p) => p.product_id !== id);
      return [
        ...prev,
        {
          product_id: id,
          product_name: item.product?.name ?? "Unknown",
          available: item.quantity,
          quantity: "",
        },
      ];
    });
  };

  const updateQuantity = (productId: string, qty: string) =>
    setSelectedProducts((prev) =>
      prev.map((p) => (p.product_id === productId ? { ...p, quantity: qty } : p))
    );

  const removeProduct = (productId: string) =>
    setSelectedProducts((prev) => prev.filter((p) => p.product_id !== productId));

  const isSelected = (productId: string) =>
    selectedProducts.some((p) => p.product_id === productId);

  const totalItems = selectedProducts.length;
  const totalQuantity = selectedProducts.reduce(
    (s, p) => s + (parseFloat(p.quantity) || 0),
    0
  );

  // ── Batch atomic transfer ───────────────────────────────────────────────────
  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!fromId) throw new Error("Source is required");
      if (!toId) throw new Error("Destination is required");
      if (fromId === toId) throw new Error("Source and destination cannot be the same");
      if (selectedProducts.length === 0) throw new Error("Select at least one product");

      const invalid = selectedProducts.filter((p) => {
        const q = parseFloat(p.quantity);
        return !q || q <= 0 || q > p.available;
      });
      if (invalid.length > 0) {
        throw new Error(
          `Invalid quantity for: ${invalid.map((p) => p.product_name).join(", ")}`
        );
      }

const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Determine IDs based on transfer type - convert empty strings to null
      let fromWarehouseId: string | null = null;
      let toWarehouseId: string | null = null;
      let fromUserId: string | null = null;
      let toUserId: string | null = null;

      const emptyToNull = (v: string) => (!v || v === 'undefined' ? null : v);

      if (transferType === "warehouse_to_staff") {
        fromWarehouseId = emptyToNull(fromId);
        toUserId = emptyToNull(toId);
      } else if (transferType === "staff_to_warehouse") {
        fromUserId = emptyToNull(fromId);
        toWarehouseId = emptyToNull(toId);
      } else if (transferType === "warehouse_to_warehouse") {
        fromWarehouseId = emptyToNull(fromId);
        toWarehouseId = emptyToNull(toId);
      } else {
        fromUserId = emptyToNull(fromId);
        toUserId = emptyToNull(toId);
      }

      const isSender = 
        (fromUserId === currentUserId) || 
        (fromWarehouseId && fromWarehouseId === currentWarehouse?.id);

      const results = [];
      for (const p of selectedProducts) {
        const { data, error } = await supabase.rpc("record_stock_transfer", {
          p_transfer_type: transferType,
          p_from_warehouse_id: fromWarehouseId,
          p_from_user_id: fromUserId,
          p_to_warehouse_id: toWarehouseId,
          p_to_user_id: toUserId,
          p_product_id: p.product_id,
          p_quantity: parseFloat(p.quantity),
          p_description: notes || null,
        });

        if (error) throw new Error(error.message || `Transfer failed for ${p.product_name}`);
        results.push(data);
      }
      
      return {
        isSender,
        fromWarehouseId,
        toWarehouseId,
        toUserId,
        firstTransferId: results?.[0]?.transfer_id || results?.[0]?.id,
        firstTransferStatus: results?.[0]?.status
      };
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["product-stock"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-products"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stock"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stock-by-warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-pending-returns"] });
      queryClient.invalidateQueries({ queryKey: ["source-stock-transfer"] });

      if (data) {
        const { isSender, toUserId, firstTransferId } = data;
        const transferTypeLabel = transferType === "staff_to_warehouse" ? "Staff → Warehouse" : 
          transferType === "warehouse_to_staff" ? "Warehouse → Staff" : 
          transferType === "warehouse_to_warehouse" ? "Warehouse → Warehouse" : "Staff → Staff";
        const notificationMessage = isSender ? 
          `New ${transferTypeLabel} transfer awaiting your acceptance` : 
          `New ${transferTypeLabel} request awaiting approval`;

        // Notify all approvers (super_admin, manager, operator)
        getApproverUserIds().then((approverIds) => {
          const notifyIds = [...approverIds];
          
          // If sending to a specific user, notify them too
          if (toUserId && isSender) {
            notifyIds.push(toUserId);
          }
          
          if (notifyIds.length > 0) {
            sendNotificationToMany(notifyIds, {
              title: "New Transfer Request",
              message: notificationMessage,
              type: "stock_transfer",
              entityType: "stock_transfers",
              entityId: firstTransferId,
            });
          }
        }).catch(console.error);
      }

      const finalStatus = data?.firstTransferStatus || "pending";
      const statusMessage = 
        finalStatus === "completed" ? "Transfer completed successfully" :
        finalStatus === "awaiting_acceptance" ? "Transfer sent - awaiting recipient acceptance" :
        "Transfer request submitted - awaiting approval";

      toast.success(statusMessage);
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to process transfer");
    },
  });

  // ── Transfer type change ───────────────────────────────────────────────────
  const changeTransferType = (type: TransferType) => {
    setTransferType(type);
    setSelectedProducts([]);
    const defaultWhId = warehouseId || currentWarehouse?.id || warehouses[0]?.id || "";
    
    if (type === "warehouse_to_staff") {
      setFromId(defaultWhId);
      setToId(isAgent ? currentUserId : "");
    } else if (type === "staff_to_warehouse") {
      setFromId(currentUserId);
      setToId(defaultWhId);
    } else if (type === "warehouse_to_warehouse") {
      setFromId(defaultWhId);
      setToId("");
    } else {
      // staff_to_staff
      setFromId(currentUserId);
      setToId("");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Transfer Stock</DialogTitle>
          <DialogDescription>Move inventory between warehouses and staff</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col flex-1 overflow-hidden space-y-4">
        {/* ── Transfer type ── */}
        <div className="flex gap-2 flex-wrap">
          {(
            [
              ["warehouse_to_staff", "Warehouse → Staff"],
              ["staff_to_warehouse", "Staff → Warehouse"],
              ["staff_to_staff", "Staff → Staff"],
              ["warehouse_to_warehouse", "Warehouse → Warehouse"],
            ] as [TransferType, string][]
          )
            .filter(([type]) => allowedTransferTypes?.includes(type))
            .map(([type, label]) => (
              <Button
                key={type}
                variant={transferType === type ? "default" : "outline"}
                size="sm"
                onClick={() => changeTransferType(type)}
              >
                {label}
              </Button>
            ))}
        </div>

          {/* ── From / To selects ── */}
          <div className="grid grid-cols-2 gap-4">
            {/* From Select */}
            {["warehouse_to_staff", "warehouse_to_warehouse"].includes(transferType) ? (
              <div className="space-y-2">
                <Label>From Warehouse</Label>
                <Select value={fromId} onValueChange={(v) => { setFromId(v); setSelectedProducts([]); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Source Warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              // staff_to_warehouse or staff_to_staff
              <div className="space-y-2">
                <Label>From Staff</Label>
                {isAdmin || isOperator ? (
                  <Select value={fromId} onValueChange={(v) => { setFromId(v); setSelectedProducts([]); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Source Staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {displayStaff
                        .filter(s => {
                          if (isOperator) return s.warehouse_id === currentWarehouse?.id;
                          return true;
                        })
                        .map((s) => (
                          <SelectItem key={s.user_id} value={s.user_id}>
                            {s.user_id === currentUserId ? `You (${s.full_name})` : `${s.full_name} (${s.role})`}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="h-10 px-3 py-2 rounded-md border bg-muted/50 text-sm flex items-center">
                    You ({displayStaff.find(s => s.user_id === currentUserId)?.full_name || 'Your Stock'})
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>To</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Destination" />
                </SelectTrigger>
                <SelectContent>
{(transferType === "warehouse_to_staff" ||
                      transferType === "staff_to_staff") &&
                      displayStaff
                        .filter((s) => {
                          if (s.user_id === fromId) return false;
                          
                          // For staff_to_staff, exclude self
                          
                          // For warehouse_to_staff, admins can select ANY staff (they manage stock in their warehouse)
                          // Just allow all staff - the admin chooses who gets stock in their warehouse
                          if (transferType === "warehouse_to_staff") {
                            return true;
                          }

                          // Operator restriction: only staff in their warehouse
                          if (isOperator && transferType === "staff_to_staff") {
                            return s.warehouse_id === currentWarehouse?.id;
                          }
                          
                          return true;
                        })
                      .map((s) => (
                        <SelectItem key={s.user_id} value={s.user_id}>
                          {s.full_name} ({s.role})
                        </SelectItem>
                      ))}
                  {(transferType === "staff_to_warehouse" ||
                    transferType === "warehouse_to_warehouse") &&
                    warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Product picker ── */}
          <div className="space-y-2 flex-1 overflow-hidden">
            <Label>Products ({selectedProducts.length} selected)</Label>
            <ScrollArea className="h-[250px] border rounded-md p-2">
              {isLoadingStock ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                  <Loader2 className="h-8 w-8 animate-spin mb-2" />
                  <p className="text-sm">Loading products...</p>
                </div>
              ) : sourceStock.length > 0 ? (
                <div className="space-y-2">
                  {sourceStock.map((item) => {
                    const sel = isSelected(item.product_id);
                    const selItem = selectedProducts.find(
                      (p) => p.product_id === item.product_id
                    );
                    return (
                      <div
                        key={item.product_id}
                        className={`flex items-start gap-3 p-2 rounded-md border transition-colors cursor-pointer ${
                          sel
                            ? "bg-muted/50 border-primary"
                            : "hover:bg-muted/30"
                        }`}
                        onClick={() => toggleProduct(item)}
                      >
                        <Checkbox
                          checked={sel}
                          onCheckedChange={() => toggleProduct(item)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {item.product?.name ?? "Unknown"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            SKU: {item.product?.sku ?? "N/A"} · Available:{" "}
                            {item.quantity}
                          </div>
                        </div>
                        {sel && (
                          <div className="w-24" onClick={(e) => e.stopPropagation()}>
                            <Input
                              type="number"
                              placeholder="Qty"
                              value={selItem?.quantity ?? ""}
                              onChange={(e) =>
                                updateQuantity(item.product_id, e.target.value)
                              }
                              onClick={(e) => e.stopPropagation()}
                              min={1}
                              max={item.quantity}
                              className="h-8 text-sm"
                              autoFocus
                            />
                          </div>
                        )}
                      </div>

                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                  <Package className="h-12 w-12 mb-2 opacity-30" />
                  <p className="text-sm font-medium">
                    {!fromId
                      ? "Select a source first"
                      : ["staff_to_warehouse", "staff_to_staff"].includes(transferType)
                        ? "No stock assigned to this staff member yet"
                        : "No stock available in this warehouse"}
                  </p>
                  {fromId && ["staff_to_warehouse", "staff_to_staff"].includes(transferType) && (
                    <p className="text-xs mt-1 text-center px-4">
                      Stock is assigned when a manager or operator completes a warehouse → staff transfer.
                    </p>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* ── Selected summary ── */}
          {selectedProducts.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm font-medium">
                <span>Selected: {totalItems} product(s)</span>
                <span>Total Qty: {totalQuantity}</span>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {selectedProducts.map((item) => (
                  <div
                    key={item.product_id}
                    className="flex items-center justify-between text-xs bg-background rounded px-2 py-1"
                  >
                    <span className="truncate flex-1">{item.product_name}</span>
                    <span className="mx-2 text-muted-foreground">
                      × {item.quantity || "—"}
                    </span>
                    <button
                      onClick={() => removeProduct(item.product_id)}
                      className="text-red-500 hover:text-red-700 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Notes ── */}
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for transfer"
              className="h-16"
            />
          </div>

          {/* ── Actions ── */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={transferMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={
                transferMutation.isPending ||
                !fromId ||
                !toId ||
                selectedProducts.length === 0
              }
              onClick={() => transferMutation.mutate()}
            >
              {transferMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Transferring…
                </>
              ) : (
                `Transfer ${totalItems} Item(s)`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}