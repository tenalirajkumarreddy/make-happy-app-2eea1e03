import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import {Loader2, Package, ArrowUpDown, Users, Search, Building2, FlaskConical, Pencil} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fmtINR } from "@/lib/utils";
import { toast } from "sonner";


interface StockItem {
  id: string;
  product_id: string;
  quantity: number;
  reorder_level: number;
  warehouse_id: string;
  products?: {
    name: string;
    sku: string;
    price: number;
    unit: string;
    category: string;
  };
}

interface StaffMember {
  user_id: string;
  full_name: string;
  role: string;
}

export function OperatorInventory() {
  const { user } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("stock");
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferProduct, setTransferProduct] = useState<StockItem | null>(null);
  const [transferType, setTransferType] = useState<"warehouse_to_staff" | "staff_to_staff">("warehouse_to_staff");
  const [transferDestinationId, setTransferDestinationId] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);

  const { data: stockItems = [], isLoading: stockLoading } = useQuery({
    queryKey: ["operator-stock", currentWarehouse?.id],
    queryFn: async () => {
      if (!currentWarehouse?.id) return [];
      const { data } = await supabase
        .from("product_stock")
        .select("*, products(name, sku, price, unit, category)")
        .eq("warehouse_id", currentWarehouse.id)
        .gt("quantity", 0)
        .order("created_at", { ascending: false });
      return (data || []) as unknown as StockItem[];
    },
    enabled: !!currentWarehouse?.id,
  });

  const filteredStock = useMemo(() => {
    if (!searchTerm) return stockItems;
    const s = searchTerm.toLowerCase();
    return stockItems.filter(
      (i) =>
        i.products?.name?.toLowerCase().includes(s) ||
        i.products?.sku?.toLowerCase().includes(s)
    );
  }, [stockItems, searchTerm]);

  const lowStockItems = useMemo(
    () => stockItems.filter((i) => i.quantity > 0 && i.quantity <= (i.reorder_level || 0)),
    [stockItems]
  );
  const outOfStockItems = useMemo(
    () => stockItems.filter((i) => i.quantity <= 0),
    [stockItems]
  );
  const totalValue = useMemo(
    () => stockItems.reduce((s, i) => s + i.quantity * (i.products?.price || 0), 0),
    [stockItems]
  );

  const { data: staffList = [] } = useQuery({
    queryKey: ["operator-warehouse-staff", currentWarehouse?.id],
    queryFn: async () => {
      if (!currentWarehouse?.id) return [];
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("warehouse_id", currentWarehouse.id)
        .in("role", ["agent", "marketer", "manager", "operator"]);
      if (!userRoles?.length) return [];
      const userIds = userRoles.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));
      return userRoles
        .filter((r) => r.user_id !== user?.id)
        .map((r) => ({
          user_id: r.user_id,
          full_name: profileMap.get(r.user_id) || "Unknown",
          role: r.role,
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
    enabled: !!currentWarehouse?.id && !!user?.id,
  });

  const handleTransfer = async () => {
    if (!transferProduct || !transferDestinationId || !transferQty) {
      toast.error("Please fill all fields");
      return;
    }
    const qty = Number(transferQty);
    if (!qty || qty <= 0) {
      toast.error("Quantity must be positive");
      return;
    }
    if (qty > (transferProduct.quantity || 0)) {
      toast.error("Not enough stock available");
      return;
    }

    setIsTransferring(true);
    try {
      const isFromWarehouse = transferType === "warehouse_to_staff";
      const payload = {
        p_transfer_type: transferType,
        p_from_warehouse_id: isFromWarehouse ? currentWarehouse?.id : null,
        p_from_user_id: isFromWarehouse ? null : user?.id,
        p_to_warehouse_id: null as any,
        p_to_user_id: transferDestinationId,
        p_product_id: transferProduct.product_id,
        p_quantity: qty,
        p_description: transferNotes || null,
      };

      const { data, error } = await (supabase as any).rpc("record_stock_transfer", payload) as any;
      if (error) throw error;

      toast.success("Stock transfer submitted");
      setShowTransferDialog(false);
      setTransferProduct(null);
      setTransferDestinationId("");
      setTransferQty("");
      setTransferNotes("");
      qc.invalidateQueries({ queryKey: ["operator-stock"] });
    } catch (e: any) {
      toast.error(e.message || "Transfer failed");
    } finally {
      setIsTransferring(false);
    }
  };

  const { data: transferHistory = [] } = useQuery({
    queryKey: ["operator-transfer-history", currentWarehouse?.id],
    queryFn: async () => {
      if (!currentWarehouse?.id) return [];
      const { data } = await supabase
        .from("stock_transfers")
        .select(`
          *,
          products(name),
          from_profile:profiles!stock_transfers_from_user_id_fkey(full_name),
          to_profile:profiles!stock_transfers_to_user_id_fkey(full_name)
        `)
        .or(`from_warehouse_id.eq.${currentWarehouse.id},to_warehouse_id.eq.${currentWarehouse.id}`)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!currentWarehouse?.id,
  });

  const { data: rawMaterials = [], isLoading: rmLoading } = useQuery({
    queryKey: ["operator-raw-materials", currentWarehouse?.id],
    queryFn: async () => {
      if (!currentWarehouse?.id) return [];
      const { data: materials } = await supabase
        .from("raw_materials")
        .select("id, name, unit, category, unit_cost, current_stock")
        .eq("is_active", true)
        .order("name");

      if (!materials) return [];

      const { data: stocks } = await supabase
        .from("raw_material_stock")
        .select("raw_material_id, quantity")
        .eq("warehouse_id", currentWarehouse.id);

      const stockMap = new Map(stocks?.map((s) => [s.raw_material_id, s.quantity]) ?? []);
      return materials.map((m: any) => ({ ...m, current_stock: stockMap.get(m.id) ?? 0 }));
    },
    enabled: !!currentWarehouse?.id,
  });

  const [rmAdjustId, setRmAdjustId] = useState<string | null>(null);
  const [rmAdjustName, setRmAdjustName] = useState("");
  const [rmAdjustType, setRmAdjustType] = useState<"used" | "remaining">("used");
  const [rmAdjustQty, setRmAdjustQty] = useState("");
  const [rmAdjustReason, setRmAdjustReason] = useState("");
  const [isRmAdjusting, setIsRmAdjusting] = useState(false);

  if (stockLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-primary/10 p-3">
              <p className="text-xs text-muted-foreground">Total Items</p>
              <p className="text-xl font-bold">{stockItems.length}</p>
            </div>
            <div className="rounded-lg bg-orange-50 dark:bg-orange-950/20 p-3">
              <p className="text-xs text-muted-foreground">Low Stock</p>
              <p className="text-xl font-bold text-orange-600">{lowStockItems.length}</p>
            </div>
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-3">
              <p className="text-xs text-muted-foreground">Out of Stock</p>
              <p className="text-xl font-bold text-red-600">{outOfStockItems.length}</p>
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-3">
              <p className="text-xs text-muted-foreground">Stock Value</p>
              <p className="text-xl font-bold text-green-600">{fmtINR(totalValue)}</p>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="stock" className="text-xs">
                <Package className="h-3.5 w-3.5 mr-1" />
                Stock
              </TabsTrigger>
              <TabsTrigger value="transfers" className="text-xs">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
                Transfers
              </TabsTrigger>
              <TabsTrigger value="raw-materials" className="text-xs">
                <FlaskConical className="h-3.5 w-3.5 mr-1" />
                Raw
              </TabsTrigger>
            </TabsList>

            <TabsContent value="stock" className="mt-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-10 text-sm"
                />
              </div>

              {filteredStock.map((item) => {
                const stockStatus = item.quantity <= 0
                  ? { label: "Out", color: "text-red-600 bg-red-50 dark:bg-red-950/20" }
                  : item.quantity <= (item.reorder_level || 0)
                  ? { label: "Low", color: "text-orange-600 bg-orange-50 dark:bg-orange-950/20" }
                  : { label: "In Stock", color: "text-green-600 bg-green-50 dark:bg-green-950/20" };

                return (
                  <div
                    key={item.id}
                    onClick={() => { setSelectedItem(item); setShowDetailModal(true); }}
                    className="rounded-lg border bg-card p-3 cursor-pointer active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{item.products?.name}</p>
                        <p className="text-xs text-muted-foreground">SKU: {item.products?.sku}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-lg font-bold">{item.quantity}</p>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${stockStatus.color}`}>
                          {stockStatus.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {!filteredStock.length && (
                <div className="py-12 text-center text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No stock items found</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="transfers" className="mt-3 space-y-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => {
                    setTransferProduct(null);
                    setTransferType("warehouse_to_staff");
                    setTransferDestinationId("");
                    setTransferQty("");
                    setTransferNotes("");
                    setShowTransferDialog(true);
                  }}
                >
                  <Building2 className="h-3.5 w-3.5 mr-1" />
                  Dispatch to Staff
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs"
                  onClick={() => {
                    setTransferProduct(null);
                    setTransferType("staff_to_staff");
                    setTransferDestinationId("");
                    setTransferQty("");
                    setTransferNotes("");
                    setShowTransferDialog(true);
                  }}
                >
                  <Users className="h-3.5 w-3.5 mr-1" />
                  Staff to Staff
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Recent Transfers</p>
                {transferHistory.map((t: any) => (
                  <div key={t.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold">{t.products?.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {t.transfer_type === "warehouse_to_staff"
                            ? `Warehouse → ${t.to_profile?.full_name || "Staff"}`
                            : `${t.from_profile?.full_name || "Staff"} → ${t.to_profile?.full_name || "Staff"}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-sm font-bold">{t.quantity} units</p>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${
                            t.status === "approved"
                              ? "border-green-500 text-green-600"
                              : t.status === "rejected"
                              ? "border-red-500 text-red-600"
                              : "border-yellow-500 text-yellow-600"
                          }`}
                        >
                          {t.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
                {!transferHistory.length && (
                  <p className="text-xs text-muted-foreground text-center py-6">No transfers yet</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="raw-materials" className="mt-3 space-y-3">
              {rmLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {rawMaterials.map((rm: any) => (
                    <div
                      key={rm.id}
                      className="rounded-lg border bg-card p-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{rm.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {rm.category || "—"} · {rm.unit || "units"}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="text-lg font-bold">{rm.current_stock}</p>
                          <span className="text-[10px] text-muted-foreground">{rm.unit || "units"}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground">
                          Unit Cost: {fmtINR(rm.unit_cost || 0)}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px]"
                          onClick={() => {
                            setRmAdjustId(rm.id);
                            setRmAdjustName(rm.name);
                            setRmAdjustType("used");
                            setRmAdjustQty("");
                            setRmAdjustReason("");
                          }}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Adjust
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!rawMaterials.length && (
                    <div className="py-12 text-center text-muted-foreground">
                      <FlaskConical className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No raw materials found</p>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Stock Details</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Product</p>
                    <p className="text-sm font-semibold">{selectedItem.products?.name}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    selectedItem.quantity <= 0
                      ? "text-red-600 bg-red-50 dark:bg-red-950/20"
                      : selectedItem.quantity <= (selectedItem.reorder_level || 0)
                      ? "text-orange-600 bg-orange-50 dark:bg-orange-950/20"
                      : "text-green-600 bg-green-50 dark:bg-green-950/20"
                  }`}>
                    {selectedItem.quantity <= 0 ? "Out" : selectedItem.quantity <= (selectedItem.reorder_level || 0) ? "Low" : "In Stock"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">SKU</span>
                  <span className="font-mono text-sm">{selectedItem.products?.sku}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Category</span>
                  <span className="text-sm capitalize">{selectedItem.products?.category || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Unit Price</span>
                  <span className="text-sm font-semibold">{fmtINR(selectedItem.products?.price || 0)}</span>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-xs text-muted-foreground">Current Stock</span>
                  <span className="text-lg font-bold">{selectedItem.quantity}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Reorder Level</span>
                  <span className="text-sm">{selectedItem.reorder_level}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Stock Value</span>
                  <span className="text-sm font-semibold text-primary">
                    {fmtINR(selectedItem.quantity * (selectedItem.products?.price || 0))}
                  </span>
                </div>
              </div>

              <Button
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  setShowDetailModal(false);
                  setTransferProduct(selectedItem);
                  setTransferType("warehouse_to_staff");
                  setTransferQty("");
                  setTransferNotes("");
                  setTransferDestinationId("");
                  setShowTransferDialog(true);
                }}
              >
                <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
                Transfer Stock
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {transferType === "warehouse_to_staff" ? "Dispatch to Staff" : "Staff to Staff Transfer"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-1">
              <button
                onClick={() => setTransferType("warehouse_to_staff")}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  transferType === "warehouse_to_staff"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Building2 className="h-3.5 w-3.5 mx-auto mb-0.5" />
                Warehouse → Staff
              </button>
              <button
                onClick={() => setTransferType("staff_to_staff")}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  transferType === "staff_to_staff"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Users className="h-3.5 w-3.5 mx-auto mb-0.5" />
                Staff → Staff
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Product</label>
              <Select
                value={transferProduct?.product_id || ""}
                onValueChange={(val) => {
                  const found = stockItems.find((s) => s.product_id === val);
                  setTransferProduct(found || null);
                }}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {stockItems.map((s) => (
                    <SelectItem key={s.product_id} value={s.product_id}>
                      {s.products?.name} ({s.quantity} avail)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Staff Member</label>
              <Select value={transferDestinationId} onValueChange={setTransferDestinationId}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map((s) => (
                    <SelectItem key={s.user_id} value={s.user_id}>
                      {s.full_name} ({s.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Quantity</label>
              <Input
                type="number"
                min={1}
                placeholder="e.g. 10"
                value={transferQty}
                onChange={(e) => setTransferQty(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes (optional)</label>
              <Input
                placeholder="Reason for transfer"
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            <Button
              size="sm"
              className="w-full text-xs"
              onClick={handleTransfer}
              disabled={isTransferring || !transferProduct || !transferDestinationId || !transferQty}
            >
              {isTransferring ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
              )}
              {isTransferring ? "Processing..." : "Submit Transfer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rmAdjustId} onOpenChange={(open) => { if (!open) setRmAdjustId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Adjust Raw Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-sm font-medium">{rmAdjustName}</p>
              <p className="text-xs text-muted-foreground">
                Current: {rawMaterials.find((r: any) => r.id === rmAdjustId)?.current_stock || 0} units
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Adjustment Type</label>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => setRmAdjustType("used")}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    rmAdjustType === "used"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  Used (Consumption)
                </button>
                <button
                  onClick={() => setRmAdjustType("remaining")}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    rmAdjustType === "remaining"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  Remaining (Set)
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {rmAdjustType === "used" ? "Quantity Used" : "New Quantity"}
              </label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="e.g. 10"
                value={rmAdjustQty}
                onChange={(e) => setRmAdjustQty(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Reason</label>
              <Input
                placeholder="Why is this being adjusted?"
                value={rmAdjustReason}
                onChange={(e) => setRmAdjustReason(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            <Button
              size="sm"
              className="w-full text-xs"
              onClick={async () => {
                if (!rmAdjustId || !rmAdjustQty || Number(rmAdjustQty) <= 0) {
                  toast.error("Enter a valid quantity");
                  return;
                }
                setIsRmAdjusting(true);
                try {
                  const { data, error } = await (supabase as any).rpc("adjust_raw_material_stock", {
                    p_raw_material_id: rmAdjustId,
                    p_warehouse_id: currentWarehouse?.id,
                    p_adjustment_type: rmAdjustType,
                    p_quantity: Number(rmAdjustQty),
                    p_reason: rmAdjustReason || null,
                    p_performed_by: user?.id,
                  }) as any;
                  if (error) throw error;
                  toast.success("Raw material adjusted");
                  setRmAdjustId(null);
                  setRmAdjustQty("");
                  setRmAdjustReason("");
                  qc.invalidateQueries({ queryKey: ["operator-raw-materials"] });
                } catch (err: any) {
                  toast.error(err.message || "Adjustment failed");
                } finally {
                  setIsRmAdjusting(false);
                }
              }}
              disabled={isRmAdjusting || !rmAdjustQty || Number(rmAdjustQty) <= 0}
            >
              {isRmAdjusting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Pencil className="h-3.5 w-3.5 mr-1" />
              )}
              {isRmAdjusting ? "Adjusting..." : "Submit Adjustment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
