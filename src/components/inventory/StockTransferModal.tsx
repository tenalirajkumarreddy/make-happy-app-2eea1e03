import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
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
  staffMembers?: { user_id: string; full_name?: string; role?: string }[];
  allowedTransferTypes?: TransferType[];
  currentUserId?: string;
}

type TransferType = "warehouse_to_staff" | "staff_to_warehouse" | "staff_to_staff";

interface SelectedProduct {
  product_id: string;
  product_name: string;
  available: number;
  quantity: string;
}

// ---------------------------------------------------------------------------
// Allowed staff roles for stock transfers
// ---------------------------------------------------------------------------
const ALLOWED_STAFF_ROLES = ["agent", "pos", "marketer", "manager"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StockTransferModal({
  isOpen,
  onClose,
  warehouseId,
  defaultProductId,
  staffMembers,
  allowedTransferTypes = ["warehouse_to_staff", "staff_to_warehouse", "staff_to_staff"],
  currentUserId,
}: StockTransferModalProps) {
  const queryClient = useQueryClient();

  const [transferType, setTransferType] = useState<TransferType>(
    (allowedTransferTypes[0] as TransferType) || "warehouse_to_staff"
  );
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [notes, setNotes] = useState<string>("");

  // ── Reset on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setTransferType("warehouse_to_staff");
    setFromId(warehouseId ?? "");
    setToId("");
    setSelectedProducts([]);
    setNotes("");
  }, [isOpen, warehouseId]);

  // ── Warehouses ─────────────────────────────────────────────────────────────
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-transfer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("is_active", true);
      if (error) throw error;
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
        .select("user_id, role")
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
          full_name: profileMap.get(r.user_id)?.full_name ?? "Unknown",
          avatar_url: profileMap.get(r.user_id)?.avatar_url ?? null,
        }))
        .filter(
          (s) =>
            s.full_name &&
            s.full_name !== "Unknown" &&
            s.full_name.toLowerCase() !== "staff"
        );
    },
    enabled: !staffMembers || staffMembers.length === 0,
    staleTime: 60_000,
  });

  // Prefer prop list, fall back to fetched list
  const displayStaff = useMemo(() => {
    if (staffMembers && staffMembers.length > 0) return staffMembers;
    return fetchedStaff;
  }, [staffMembers, fetchedStaff]);

  // ── Source stock ───────────────────────────────────────────────────────────
  const { data: sourceStock = [] } = useQuery({
    queryKey: ["source-stock-transfer", transferType, fromId],
    queryFn: async () => {
      if (!fromId) return [];

      if (transferType === "warehouse_to_staff") {
        const { data, error } = await supabase
          .from("product_stock")
          .select(
            "product_id, quantity, product:products(id, name, sku, unit, base_price)"
          )
          .eq("warehouse_id", fromId)
          .gt("quantity", 0);
        if (error) throw error;
        return (data ?? []).map((r) => ({
          ...r,
          product: Array.isArray(r.product) ? r.product[0] : r.product,
        }));
      } else {
        // staff_to_warehouse or staff_to_staff
        const { data, error } = await supabase
          .from("staff_stock")
          .select(
            "product_id, quantity, warehouse_id, product:products(id, name, sku, unit, base_price)"
          )
          .eq("user_id", fromId)
          .gt("quantity", 0);
        if (error) throw error;
        return (data ?? []).map((r) => ({
          ...r,
          product: Array.isArray(r.product) ? r.product[0] : r.product,
        }));
      }
    },
    enabled: !!fromId,
  });

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

  // ── Atomic RPC transfer ────────────────────────────────────────────────────
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

      // ── For each product, call the atomic RPC ──────────────────────────────
      const errors: string[] = [];

      for (const item of selectedProducts) {
        const qty = parseFloat(item.quantity);

                // Build RPC payload based on transfer type
        const payload: Record<string, unknown> = {
          p_product_id: item.product_id,
          p_quantity: qty,
          p_transfer_type: transferType,
          p_description: notes || null,
          p_from_warehouse_id: null,
          p_from_user_id: null,
          p_to_warehouse_id: null,
          p_to_user_id: null,
        };

        if (transferType === "warehouse_to_staff") {
          payload.p_from_warehouse_id = fromId;
          payload.p_to_user_id = toId;
        } else if (transferType === "staff_to_warehouse") {
          payload.p_from_user_id = fromId;
          payload.p_to_warehouse_id = toId;
          // staff→warehouse uses the staff_stock warehouse_id as origin
          const sourceRow = sourceStock.find((s) => s.product_id === item.product_id);
          if (sourceRow && "warehouse_id" in sourceRow) {
            payload.p_from_warehouse_id = (sourceRow as any).warehouse_id;
          }
        } else {
          // staff_to_staff
          payload.p_from_user_id = fromId;
          payload.p_to_user_id = toId;
        }

        const { error } = await supabase.rpc(
          "record_stock_transfer" as any,
          payload as any
        );

        if (error) {
          errors.push(`${item.product_name}: ${error.message}`);
        }
      }

      if (errors.length > 0) {
        throw new Error(errors.join("\n"));
      }
    },
    onSuccess: () => {
      // Invalidate all relevant query keys
      queryClient.invalidateQueries({ queryKey: ["product-stock"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-products"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stock"] });
      queryClient.invalidateQueries({ queryKey: ["staff-stock-by-warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-pending-returns"] });
      queryClient.invalidateQueries({ queryKey: ["source-stock-transfer"] });

      toast.success(`Transferred ${totalItems} product(s) successfully`);
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
    if (type === "warehouse_to_staff") {
      setFromId(warehouseId ?? warehouses[0]?.id ?? "");
      setToId("");
    } else if (type === "staff_to_warehouse") {
      setFromId("");
      setToId(warehouseId ?? warehouses[0]?.id ?? "");
    } else {
      setFromId("");
      setToId("");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Transfer Stock</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 overflow-hidden space-y-4">
          {/* ── Transfer type ── */}
          <div className="flex gap-2 flex-wrap">
            {(
              [
                ["warehouse_to_staff", "Warehouse → Staff"],
                ["staff_to_warehouse", "Staff → Warehouse"],
                ["staff_to_staff", "Staff → Staff"],
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
            <div className="space-y-2">
              <Label>From</Label>
              <Select value={fromId} onValueChange={(v) => { setFromId(v); setSelectedProducts([]); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Source" />
                </SelectTrigger>
                <SelectContent>
                  {transferType === "warehouse_to_staff" &&
                    warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  {(transferType === "staff_to_warehouse" ||
                    transferType === "staff_to_staff") &&
                    displayStaff.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

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
                      .filter((s) => s.user_id !== fromId)
                      .map((s) => (
                        <SelectItem key={s.user_id} value={s.user_id}>
                          {s.full_name}
                        </SelectItem>
                      ))}
                  {transferType === "staff_to_warehouse" &&
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
              {sourceStock.length > 0 ? (
                <div className="space-y-2">
                  {sourceStock.map((item) => {
                    const sel = isSelected(item.product_id);
                    const selItem = selectedProducts.find(
                      (p) => p.product_id === item.product_id
                    );
                    return (
                      <div
                        key={item.product_id}
                        className={`flex items-start gap-3 p-2 rounded-md border transition-colors ${
                          sel
                            ? "bg-muted/50 border-primary"
                            : "hover:bg-muted/30"
                        }`}
                      >
                        <Checkbox
                          checked={sel}
                          onCheckedChange={() => toggleProduct(item)}
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
                          <div className="w-24">
                            <Input
                              type="number"
                              placeholder="Qty"
                              value={selItem?.quantity ?? ""}
                              onChange={(e) =>
                                updateQuantity(item.product_id, e.target.value)
                              }
                              min={1}
                              max={item.quantity}
                              className="h-8 text-sm"
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
                  <p className="text-sm">
                    {fromId
                      ? "No products available from this source"
                      : "Select a source first"}
                  </p>
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