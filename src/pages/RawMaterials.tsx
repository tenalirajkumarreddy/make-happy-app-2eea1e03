import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Pencil, Trash2, Package, Link2 } from "lucide-react";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";

interface RawMaterial {
  id: string;
  display_id: string;
  name: string;
  description?: string;
  unit: string;
  category?: string;
  min_stock_level: number;
  current_stock: number;
  unit_cost: number;
  hsn_code?: string;
  is_active: boolean;
  created_at: string;
}

interface VendorLink {
  id: string;
  vendor_id: string;
  raw_material_id: string;
  unit_price: number;
  lead_time_days: number;
  is_preferred: boolean;
  vendors?: { id: string; name: string; display_id: string };
}

const UNITS = ["kg", "g", "L", "mL", "pcs", "box", "pack", "ton", "unit"];
const CATEGORIES = ["Chemicals", "Packaging", "Labels", "Caps & Closures", "Raw Ingredients", "Consumables", "Other"];

const RawMaterials = () => {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState<RawMaterial | null>(null);
  const [showLinkVendor, setShowLinkVendor] = useState(false);
  const [linkMaterialId, setLinkMaterialId] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("kg");
  const [category, setCategory] = useState("");
  const [minStockLevel, setMinStockLevel] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [saving, setSaving] = useState(false);

  // Vendor link form
  const [linkVendorId, setLinkVendorId] = useState("");
  const [linkUnitPrice, setLinkUnitPrice] = useState("");
  const [linkLeadTime, setLinkLeadTime] = useState("7");
  const [linkIsPreferred, setLinkIsPreferred] = useState(false);

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["raw-materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("raw_materials")
        .select("*, vendors(name, display_id)")
        .order("name");
      if (error) throw error;
      return data as RawMaterial[];
    },
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-list"],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("id, name, display_id").eq("is_active", true);
      return data || [];
    },
  });

  const { data: vendorLinks = [] } = useQuery({
    queryKey: ["vendor-raw-materials", linkMaterialId],
    queryFn: async () => {
      if (!linkMaterialId) return [];
      const { data, error } = await supabase
        .from("vendor_raw_materials")
        .select("*, vendors(id, name, display_id)")
        .eq("raw_material_id", linkMaterialId);
      if (error) throw error;
      return data as VendorLink[];
    },
    enabled: !!linkMaterialId,
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setUnit("kg");
    setCategory("");
    setMinStockLevel("");
    setUnitCost("");
    setHsnCode("");
    setVendorId("");
    setEditingItem(null);
  };

  const resetLinkForm = () => {
    setLinkVendorId("");
    setLinkUnitPrice("");
    setLinkLeadTime("7");
    setLinkIsPreferred(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);

    try {
      if (editingItem) {
        const { error } = await supabase
          .from("raw_materials")
          .update({
            name: name.trim(),
            description: description.trim() || null,
            unit,
            category: category || null,
            vendor_id: vendorId || null,
            min_stock_level: minStockLevel ? parseFloat(minStockLevel) : 0,
            unit_cost: unitCost ? parseFloat(unitCost) : 0,
            hsn_code: hsnCode.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingItem.id);
        if (error) throw error;
        toast.success("Raw material updated");
        logActivity(user!.id, `Updated raw material: ${name}`, "inventory");
      } else {
        // Generate display ID
        const { data: idData } = await supabase.rpc("generate_display_id", {
          prefix: "RM",
          seq_name: "raw_materials_display_id_seq"
        });

        const { error } = await supabase.from("raw_materials").insert({
          display_id: idData,
          vendor_id: vendorId || null,
          name: name.trim(),
          description: description.trim() || null,
          unit,
          category: category || null,
          min_stock_level: minStockLevel ? parseFloat(minStockLevel) : 0,
          unit_cost: unitCost ? parseFloat(unitCost) : 0,
          hsn_code: hsnCode.trim() || null,
          created_by: user!.id,
        });
        if (error) throw error;
        toast.success("Raw material added");
        logActivity(user!.id, `Created raw material: ${name}`, "inventory");
      }

      qc.invalidateQueries({ queryKey: ["raw-materials"] });
      setShowAdd(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: RawMaterial) => {
    setEditingItem(item);
    setName(item.name);
    setDescription(item.description || "");
    setUnit(item.unit);
    setCategory(item.category || "");
    setVendorId((item as any).vendor_id || "");
    setMinStockLevel(item.min_stock_level?.toString() || "");
    setUnitCost(item.unit_cost?.toString() || "");
    setHsnCode(item.hsn_code || "");
    setShowAdd(true);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("raw_materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["raw-materials"] });
      toast.success("Raw material deleted");
      setDeletingId(null);
    },
    onError: (e: Error) => {
      toast.error(`Cannot delete: ${e.message}`);
      setDeletingId(null);
    },
  });

  const linkVendorMutation = useMutation({
    mutationFn: async (data: { vendor_id: string; raw_material_id: string; unit_price: number; lead_time_days: number; is_preferred: boolean }) => {
      // If setting as preferred, unset other preferred vendors for this material
      if (data.is_preferred) {
        await supabase
          .from("vendor_raw_materials")
          .update({ is_preferred: false })
          .eq("raw_material_id", data.raw_material_id);
      }
      const { error } = await supabase.from("vendor_raw_materials").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-raw-materials"] });
      toast.success("Vendor linked");
      resetLinkForm();
    },
    onError: (e: Error) => {
      toast.error(`Failed: ${e.message}`);
    },
  });

  const unlinkVendorMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendor_raw_materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-raw-materials"] });
      toast.success("Vendor unlinked");
    },
  });

  const handleLinkVendor = () => {
    if (!linkVendorId || !linkMaterialId) {
      toast.error("Select a vendor");
      return;
    }
    linkVendorMutation.mutate({
      vendor_id: linkVendorId,
      raw_material_id: linkMaterialId,
      unit_price: linkUnitPrice ? parseFloat(linkUnitPrice) : 0,
      lead_time_days: parseInt(linkLeadTime) || 7,
      is_preferred: linkIsPreferred,
    });
  };

  const columns = [
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Name", accessor: "name" as const, className: "font-medium" },
    { header: "Vendor", accessor: (row: any) => row.vendors?.name || "—", className: "text-sm text-muted-foreground" },
    { header: "Category", accessor: (row: RawMaterial) => row.category || "—", className: "text-sm text-muted-foreground" },
    { header: "Unit", accessor: "unit" as const, className: "text-sm" },
    { header: "Stock", accessor: (row: RawMaterial) => `${row.current_stock} ${row.unit}`, className: "text-sm" },
    { header: "Unit Cost", accessor: (row: RawMaterial) => `₹${row.unit_cost?.toLocaleString() || 0}`, className: "text-sm" },
    {
      header: "Status",
      accessor: (row: RawMaterial) => (
        <StatusBadge 
          status={row.current_stock <= row.min_stock_level ? "inactive" : "active"} 
          label={row.current_stock <= row.min_stock_level ? "Low Stock" : "OK"} 
        />
      ),
    },
    {
      header: "Actions",
      accessor: (row: RawMaterial) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setLinkMaterialId(row.id); setShowLinkVendor(true); }}>
            <Link2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(row)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingId(row.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return <TableSkeleton columns={8} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Raw Materials"
        subtitle="Manage inventory raw materials and link vendors"
        primaryAction={{ label: "Add Material", onClick: () => { resetForm(); setShowAdd(true); } }}
      />

      <DataTable
        columns={columns}
        data={materials}
        searchKey="name"
        searchPlaceholder="Search materials..."
        emptyMessage="No raw materials yet"
        renderMobileCard={(row: RawMaterial) => (
          <div className="rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <p className="font-mono text-xs text-muted-foreground mb-1">{row.display_id}</p>
                <h3 className="font-semibold text-base mb-1">{row.name}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {row.category || "Uncategorized"}
                  </span>
                  {row.vendors?.name && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300">
                      {row.vendors.name}
                    </span>
                  )}
                </div>
              </div>
              <StatusBadge 
                status={row.current_stock <= row.min_stock_level ? "inactive" : "active"} 
                label={row.current_stock <= row.min_stock_level ? "Low" : "OK"} 
              />
            </div>
            
            {/* Stock and Cost Info */}
            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Current Stock</p>
                <p className="font-semibold">{row.current_stock} {row.unit}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Unit Cost</p>
                <p className="font-semibold">₹{row.unit_cost?.toLocaleString() || 0}/{row.unit}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-3 pt-3 border-t">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { setLinkMaterialId(row.id); setShowLinkVendor(true); }}>
                <Link2 className="h-4 w-4 mr-1" />
                Link Vendor
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleEdit(row)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeletingId(row.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      />

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { setShowAdd(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Raw Material" : "Add Raw Material"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Sodium Chloride" required />
              </div>
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No Vendor</SelectItem>
                    {vendors.map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} ({v.display_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Unit Cost (₹)</Label>
                <Input type="number" step="0.01" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Min Stock Level</Label>
                <Input type="number" step="0.01" min="0" value={minStockLevel} onChange={(e) => setMinStockLevel(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>HSN Code</Label>
              <Input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} placeholder="e.g., 25010010" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingItem ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Link Vendor Dialog */}
      <Dialog open={showLinkVendor} onOpenChange={(open) => { setShowLinkVendor(open); if (!open) { resetLinkForm(); setLinkMaterialId(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Vendors</DialogTitle>
          </DialogHeader>
          
          {/* Existing Links */}
          {vendorLinks.length > 0 && (
            <div className="space-y-2 mb-4">
              <Label className="text-xs text-muted-foreground">Linked Vendors</Label>
              <div className="space-y-2">
                {vendorLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div>
                      <p className="font-medium text-sm">{link.vendors?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ₹{link.unit_price?.toLocaleString()}/unit • {link.lead_time_days} days lead time
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {link.is_preferred && <Badge variant="secondary" className="text-[10px]">Preferred</Badge>}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-destructive" 
                        onClick={() => unlinkVendorMutation.mutate(link.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add New Link */}
          <div className="space-y-4 pt-4 border-t">
            <Label>Link New Vendor</Label>
            <div className="space-y-3">
              <Select value={linkVendorId} onValueChange={setLinkVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors
                    .filter((v: any) => !vendorLinks.some((l) => l.vendor_id === v.id))
                    .map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} ({v.display_id})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Input 
                  type="number" 
                  step="0.01" 
                  min="0"
                  placeholder="Unit price (₹)" 
                  value={linkUnitPrice} 
                  onChange={(e) => setLinkUnitPrice(e.target.value)} 
                />
                <Input 
                  type="number" 
                  min="1"
                  placeholder="Lead time (days)" 
                  value={linkLeadTime} 
                  onChange={(e) => setLinkLeadTime(e.target.value)} 
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input 
                  type="checkbox" 
                  checked={linkIsPreferred} 
                  onChange={(e) => setLinkIsPreferred(e.target.checked)} 
                  className="rounded border-gray-300"
                />
                Set as preferred vendor
              </label>
            </div>
            <Button 
              onClick={handleLinkVendor} 
              disabled={!linkVendorId || linkVendorMutation.isPending}
              className="w-full"
            >
              {linkVendorMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Link Vendor
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Raw Material?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone. Linked vendors will also be removed.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingId && deleteMutation.mutate(deletingId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RawMaterials;
