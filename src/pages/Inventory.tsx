import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";
import { Loader2, Package, Plus, Minus, History, BoxSelect } from "lucide-react";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format } from "date-fns";

type MovementType = "purchase" | "sale" | "adjustment" | "return" | "transfer_in" | "transfer_out";

const MOVEMENT_TYPES: Record<MovementType, string> = {
  purchase: "Purchase (In)",
  sale: "Sale (Out)",
  adjustment: "Correction (+/-)",
  return: "Return (In)",
  transfer_in: "Transfer (In)",
  transfer_out: "Transfer (Out)",
};

const Inventory = () => {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const canEdit = ["super_admin", "manager", "pos"].includes(role || "");
  
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<any>(null);
  const [adjustType, setAdjustType] = useState<MovementType>("adjustment");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [saving, setSaving] = useState(false);

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

  // Fetch Inventory for selected warehouse
  const { data: inventory, isLoading: loadInv } = useQuery({
    queryKey: ["inventory", selectedWarehouseId],
    queryFn: async () => {
      if (!selectedWarehouseId) return [];
      
      // We need products and their stock in this warehouse
      // Supabase join syntax: product_stock(quantity, warehouse_id)
      
      // Strategy: Fetch all products, then fetch stock for this warehouse
      const { data: products } = await supabase
        .from("products")
        .select("id, name, sku, unit, category")
        .eq("is_active", true)
        .order("name");
        
      if (!products) return [];

      const { data: stocks } = await supabase
        .from("product_stock")
        .select("product_id, quantity")
        .eq("warehouse_id", selectedWarehouseId);
      
      const stockMap = new Map(stocks?.map(s => [s.product_id, s.quantity]));

      return products.map(p => ({
        ...p,
        quantity: stockMap.get(p.id) || 0,
      }));
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

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouseId || !adjustProduct) return;
    setSaving(true);
    
    try {
        const qty = parseFloat(adjustQty);
        if (isNaN(qty) || qty === 0) throw new Error("Invalid quantity");

        // Calculate actual change based on type
        // For 'adjustment', we accept +/-. For others, we enforce sign logic?
        // Let's keep it simple: user inputs positive number, type determines sign
        
        let finalQty = qty;
        if (["sale", "transfer_out"].includes(adjustType)) {
            finalQty = -Math.abs(qty);
        } else if (["purchase", "return", "transfer_in"].includes(adjustType)) {
            finalQty = Math.abs(qty);
        }
        // 'adjustment' can be either, assume user entered correct sign or use UI toggle?
        // Let's make UI simple: Input always positive, Type determines direction
        
        // Actually for adjustment, allow negative input
        if (adjustType === "adjustment") {
            finalQty = qty; // User can type -5
        }

        // Call single RPC for atomic transaction
        const { error: stockError, data: result } = await supabase.rpc("record_stock_movement", {
            p_product_id: adjustProduct.id,
            p_warehouse_id: selectedWarehouseId,
            p_quantity: finalQty,
            p_type: adjustType,
            p_reason: adjustReason,
            p_user_id: user?.id
        });

        if (stockError) throw stockError;

        toast.success("Stock updated successfully");
        setShowAdjust(false);
        setAdjustQty("");
        setAdjustReason("");
        qc.invalidateQueries({ queryKey: ["inventory"] });
        qc.invalidateQueries({ queryKey: ["stock-movements"] });
        logActivity(user!.id, `Adjusted stock for ${adjustProduct.name}`, "stock", adjustProduct.id);

    } catch (err: any) {
        toast.error(err.message);
    } finally {
        setSaving(false);
    }
  };

  const columns = [
    { header: "SKU", accessor: "sku", className: "w-[100px] font-mono text-xs" },
    { header: "Product", accessor: "name", className: "font-medium" },
    { header: "Category", accessor: "category" },
    { 
        header: "Stock", 
        accessor: (row: any) => (
            <div className={`font-bold ${row.quantity < 0 ? "text-red-500" : row.quantity === 0 ? "text-slate-400" : "text-green-600"}`}>
                {row.quantity} <span className="text-xs font-normal text-slate-500">{row.unit}</span>
            </div>
        ) 
    },
    {
        header: "Action",
        accessor: (row: any) => canEdit && (
            <Button variant="ghost" size="sm" onClick={() => {
                setAdjustProduct(row);
                setAdjustType("adjustment");
                setShowAdjust(true);
            }}>
                Adjust
            </Button>
        )
    }
  ];

  const movementColumns = [
      { header: "Date", accessor: (row: any) => format(new Date(row.created_at), "dd MMM HH:mm"), className: "text-xs text-slate-500" },
      { header: "Product", accessor: (row: any) => row.products?.name },
      { header: "Type", accessor: (row: any) => <Badge variant="outline">{row.type}</Badge> },
      { 
          header: "Qty", 
          accessor: (row: any) => (
             <span className={row.quantity > 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                 {row.quantity > 0 ? "+" : ""}{row.quantity}
             </span>
          ) 
      },
      { header: "Reason", accessor: "reason", className: "text-xs block max-w-[200px] truncate" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <PageHeader title="Inventory Management" subtitle="Manage stock levels across warehouses" />
            <div className="flex items-center gap-2">
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
        </div>

        <Tabs defaultValue="stock">
            <TabsList>
                <TabsTrigger value="stock">Current Stock</TabsTrigger>
                <TabsTrigger value="movements">Recent Movements</TabsTrigger>
            </TabsList>

            <TabsContent value="stock" className="space-y-4">
                {loadInv ? (
                    <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin" /></div>
                ) : (
                    <DataTable 
                        data={inventory || []} 
                        columns={columns} 
                        searchable 
                        searchKeys={["name", "sku"]}
                    />
                )}
            </TabsContent>

            <TabsContent value="movements">
                 <div className="rounded-md border">
                    <DataTable 
                        data={movements || []} 
                        columns={movementColumns} 
                    />
                 </div>
            </TabsContent>
        </Tabs>

        <Dialog open={showAdjust} onOpenChange={setShowAdjust}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Adjust Stock for {adjustProduct?.name}</DialogTitle>
                    <DialogDescription>
                        Record a stock movement. Current stock: {adjustProduct?.quantity} {adjustProduct?.unit}
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
                        <Label>Quantity ({adjustProduct?.unit})</Label>
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
    </div>
  );
};

export default Inventory;


