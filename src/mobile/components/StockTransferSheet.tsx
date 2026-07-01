import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Package, Loader2, Check, X, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface StockItem {
  id: string;
  product_id: string;
  quantity: number;
  amount_value: number;
  warehouse_id: string | null;
  product: { id: string; name: string; sku: string; unit: string; base_price: number; image_url?: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockTransferSheet({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<"list" | "transfer">("list");
  const [transferType, setTransferType] = useState<"staff_to_warehouse" | "staff_to_staff">("staff_to_warehouse");
  const [selectedProducts, setSelectedProducts] = useState<{ product_id: string; quantity: string }[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Stock holdings
  const { data: stockItems = [], isLoading } = useQuery({
    queryKey: ["mobile-agent-stock-holdings", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_stock")
        .select(`id, product_id, quantity, amount_value, warehouse_id, product:products(id, name, sku, unit, base_price, image_url)`)
        .eq("user_id", user!.id)
        .gt("quantity", 0);
      if (error) throw error;
      return (data || []).map((item: any) => ({
        ...item,
        product: Array.isArray(item.product) ? item.product[0] : item.product,
      })) as StockItem[];
    },
    enabled: !!user,
});

  // Warehouses (for staff_to_warehouse)
  const { data: warehouses = [] } = useQuery({
    queryKey: ["mobile-warehouses-for-transfer", user?.id],
    queryFn: async () => {
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("warehouse_id")
        .eq("user_id", user!.id);

      const whIds = (rolesData || []).map((r: any) => r.warehouse_id).filter(Boolean);

      if (whIds.length === 0) {
        const { data } = await supabase.from("warehouses").select("id, name").eq("is_active", true).limit(1);
        return data || [];
      }

      const { data } = await supabase.from("warehouses").select("id, name").in("id", whIds).eq("is_active", true);
      return data || [];
    },
    enabled: !!user,
});

  // Target staff (for staff_to_staff)
  const { data: staffList = [] } = useQuery({
    queryKey: ["mobile-staff-for-transfer"],
    queryFn: async () => {
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role, warehouse_id")
        .in("role", ["agent", "marketer", "manager", "operator", "super_admin"]);

      if (!rolesData?.length) return [];
      const userIds = rolesData.map((r: any) => r.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));
      return rolesData
        .map((r: any) => ({ user_id: r.user_id, full_name: profileMap.get(r.user_id) || "Unknown", role: r.role }))
        .filter((s: any) => s.user_id !== user?.id && s.full_name !== "Unknown");
    },
    enabled: !!user,
});

  const [toId, setToId] = useState("");

  const totalValue = stockItems.reduce((sum, item) => sum + (item.amount_value || 0), 0);
  const totalUnits = stockItems.reduce((sum, item) => sum + item.quantity, 0);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setView("list");
      setSelectedProducts([]);
      setNotes("");
      setTransferType("staff_to_warehouse");
      setToId("");
    }
  }, [open]);

  const toggleProduct = (productId: string) => {
    setSelectedProducts((prev) => {
      const exists = prev.some((p) => p.product_id === productId);
      if (exists) return prev.filter((p) => p.product_id !== productId);
      return [...prev, { product_id: productId, quantity: "" }];
    });
  };

  const updateQuantity = (productId: string, qty: string) => {
    setSelectedProducts((prev) =>
      prev.map((p) => (p.product_id === productId ? { ...p, quantity: qty } : p))
    );
  };

  const isSelected = (productId: string) => selectedProducts.some((p) => p.product_id === productId);

  const handleTransfer = async () => {
    if (!toId) { toast.error("Select a destination"); return; }
    if (selectedProducts.length === 0) { toast.error("Select at least one product"); return; }

    const invalid = selectedProducts.filter((p) => {
      const q = parseFloat(p.quantity);
      return !q || q <= 0;
    });
    if (invalid.length > 0) { toast.error("Enter valid quantity for all selected products"); return; }

    setSubmitting(true);
    try {
      for (const sp of selectedProducts) {
        const { error } = await supabase.rpc("record_stock_transfer", {
          p_transfer_type: transferType,
          p_from_warehouse_id: null,
          p_from_user_id: user!.id,
          p_to_warehouse_id: transferType === "staff_to_warehouse" ? toId : null,
          p_to_user_id: transferType === "staff_to_staff" ? toId : null,
          p_product_id: sp.product_id,
          p_quantity: parseFloat(sp.quantity),
          p_description: notes || null,
        });
        if (error) throw new Error(error.message);
      }

      toast.success("Transfer submitted successfully");
      qc.invalidateQueries({ queryKey: ["mobile-agent-stock-holdings", user?.id] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl flex flex-col !p-0">
        <SheetHeader className="px-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              My Stock
            </SheetTitle>
            {view === "list" && stockItems.length > 0 && (
              <Button size="sm" className="h-8 text-xs" onClick={() => setView("transfer")}>
                <ArrowRightLeft className="h-3 w-3 mr-1" />
                Transfer
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : stockItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
              <Package className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground font-medium">No stock assigned</p>
              <p className="text-xs text-muted-foreground">Stock transferred from warehouse will appear here</p>
            </div>
          ) : view === "list" ? (
            <div className="px-4 py-3 space-y-3">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border bg-slate-50 dark:bg-slate-900 p-3 text-center">
                  <p className="text-lg font-bold text-slate-800 dark:text-white">{stockItems.length}</p>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Products</p>
                </div>
                <div className="rounded-xl border bg-slate-50 dark:bg-slate-900 p-3 text-center">
                  <p className="text-lg font-bold text-slate-800 dark:text-white">{totalUnits}</p>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Units</p>
                </div>
                <div className="rounded-xl border bg-slate-50 dark:bg-slate-900 p-3 text-center">
                  <p className="text-lg font-bold text-slate-800 dark:text-white">₹{totalValue >= 1000 ? `${(totalValue/1000).toFixed(1)}k` : totalValue.toLocaleString()}</p>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Value</p>
                </div>
              </div>

              {/* Stock list */}
              {stockItems.map((item) => (
                <div key={item.id} className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3.5 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <Package className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{item.product?.name || "Unknown"}</p>
                    <p className="text-xs text-slate-400">SKU: {item.product?.sku || "—"} • ₹{item.product?.base_price?.toLocaleString()}/unit</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold text-slate-800 dark:text-white">{item.quantity}</p>
                    <p className="text-xs text-slate-400">units</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Transfer View */
            <div className="px-4 py-3 space-y-4">
              {/* Back button */}
              <button onClick={() => setView("list")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowRightLeft className="h-3 w-3 rotate-180" />
                Back to stock list
              </button>

              {/* Transfer type selector */}
              <div className="flex gap-2">
                {(["staff_to_warehouse", "staff_to_staff"] as const).map((type) => (
                  <Button
                    key={type}
                    variant={transferType === type ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setTransferType(type); setToId(""); }}
                    className="text-xs flex-1"
                  >
                    {type === "staff_to_warehouse" ? "→ Warehouse" : "→ Staff"}
                  </Button>
                ))}
              </div>

              {/* Destination */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {transferType === "staff_to_warehouse" ? "Transfer to Warehouse" : "Transfer to Staff"}
                </Label>
                {transferType === "staff_to_warehouse" ? (
                  <Select value={toId} onValueChange={setToId}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w: any) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={toId} onValueChange={setToId}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffList.map((s: any) => (
                        <SelectItem key={s.user_id} value={s.user_id}>
                          {s.full_name} ({s.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Product selection */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select Products</Label>
                <div className="space-y-2">
                  {stockItems.map((item) => {
                    const sel = selectedProducts.find((p) => p.product_id === item.product_id);
                    const isSelected = !!sel;
                    return (
                      <div key={item.id} className={cn(
                        "rounded-xl border p-3 transition-all",
                        isSelected ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20" : "border-slate-200 dark:border-slate-700"
                      )}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleProduct(item.product_id)}
                            className={cn(
                              "h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-all",
                              isSelected ? "bg-blue-500 border-blue-500" : "border-slate-300 dark:border-slate-600"
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{item.product?.name}</p>
                            <p className="text-xs text-slate-400">{item.quantity} units available</p>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="mt-2 pl-7">
                            <Input
                              type="number"
                              placeholder="Qty to transfer"
                              value={sel?.quantity || ""}
                              onChange={(e) => updateQuantity(item.product_id, e.target.value)}
                              min="1"
                              max={item.quantity}
                              className="h-9 text-sm"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes (optional)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes..."
                  className="h-10"
                />
              </div>

              {/* Submit */}
              <Button
                className="w-full h-11"
                onClick={handleTransfer}
                disabled={submitting || !toId || selectedProducts.length === 0}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                {submitting ? "Submitting..." : `Submit Transfer (${selectedProducts.length} products)`}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}