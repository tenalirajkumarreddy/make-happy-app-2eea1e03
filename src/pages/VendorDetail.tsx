import { useParams, useNavigate } from "react-router-dom";
import { formatDate } from "@/lib/utils";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Building2, Phone, Mail, MapPin, CreditCard, FileText, IndianRupee, Boxes, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { DataTable } from "@/components/shared/DataTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const UNITS = ["kg", "g", "L", "mL", "pcs", "box", "pack", "ton", "unit"];
const CATEGORIES = ["Chemicals", "Packaging", "Labels", "Caps & Closures", "Raw Ingredients", "Consumables", "Other"];

const VendorDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  // Raw material form state
  const [showRawMaterialDialog, setShowRawMaterialDialog] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);
  const [materialMode, setMaterialMode] = useState<"link" | "create">("link"); // Mode: link existing or create new
  const [selectedExistingMaterialId, setSelectedExistingMaterialId] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [materialDesc, setMaterialDesc] = useState("");
  const [materialUnit, setMaterialUnit] = useState("kg");
  const [materialCategory, setMaterialCategory] = useState("");
  const [materialMinStock, setMaterialMinStock] = useState("");
  const [materialUnitCost, setMaterialUnitCost] = useState("");
  const [materialHsn, setMaterialHsn] = useState("");
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [deletingMaterialId, setDeletingMaterialId] = useState<string | null>(null);

  const resetMaterialForm = () => {
    setMaterialMode("link");
    setSelectedExistingMaterialId("");
    setMaterialName("");
    setMaterialDesc("");
    setMaterialUnit("kg");
    setMaterialCategory("");
    setMaterialMinStock("");
    setMaterialUnitCost("");
    setMaterialHsn("");
    setEditingMaterial(null);
  };

  const { data: vendor, isLoading } = useQuery({
    queryKey: ["vendor", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ["vendor-purchases", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*, purchase_items(*, products(name))")
        .eq("vendor_id", id)
        .order("purchase_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["vendor-payments", id],
    queryFn: async () => {
      const { data, error} = await supabase
        .from("vendor_payments")
        .select("*")
        .eq("vendor_id", id)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: rawMaterials = [] } = useQuery({
    queryKey: ["vendor-raw-materials", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("raw_materials")
        .select("*")
        .eq("vendor_id", id)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Query for unlinked raw materials (no vendor assigned)
  const { data: unlinkedMaterials = [] } = useQuery({
    queryKey: ["unlinked-raw-materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("raw_materials")
        .select("id, display_id, name, unit, category")
        .is("vendor_id", null)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Raw Material mutations
  const saveMaterialMutation = useMutation({
    mutationFn: async (data: any) => {
      if (data.id) {
        // Edit existing material
        const { error } = await supabase
          .from("raw_materials")
          .update({
            name: data.name,
            description: data.description || null,
            unit: data.unit,
            category: data.category || null,
            min_stock_level: data.min_stock_level || 0,
            unit_cost: data.unit_cost || 0,
            hsn_code: data.hsn_code || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.id);
        if (error) throw error;
      } else if (data.mode === "link") {
        // Link existing material to this vendor
        const { error } = await supabase
          .from("raw_materials")
          .update({ vendor_id: id, updated_at: new Date().toISOString() })
          .eq("id", data.existing_material_id);
        if (error) throw error;
      } else {
        // Create new material
        const { data: idData } = await supabase.rpc("generate_display_id", {
          prefix: "RM",
          seq_name: "raw_materials_display_id_seq"
        });

        const { error } = await supabase.from("raw_materials").insert({
          display_id: idData,
          vendor_id: id,
          name: data.name,
          description: data.description || null,
          unit: data.unit,
          category: data.category || null,
          min_stock_level: data.min_stock_level || 0,
          unit_cost: data.unit_cost || 0,
          hsn_code: data.hsn_code || null,
          created_by: user!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-raw-materials", id] });
      qc.invalidateQueries({ queryKey: ["unlinked-raw-materials"] });
      qc.invalidateQueries({ queryKey: ["raw-materials-list"] });
      toast.success(editingMaterial ? "Material updated" : materialMode === "link" ? "Material linked" : "Material added");
      setShowRawMaterialDialog(false);
      resetMaterialForm();
    },
    onError: (e: Error) => {
      toast.error(`Failed: ${e.message}`);
    },
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: async (materialId: string) => {
      const { error } = await supabase.from("raw_materials").delete().eq("id", materialId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-raw-materials", id] });
      toast.success("Material deleted");
      setDeletingMaterialId(null);
    },
    onError: (e: Error) => {
      toast.error(`Cannot delete: ${e.message}`);
      setDeletingMaterialId(null);
    },
  });

  const handleSaveMaterial = () => {
    // Validation
    if (materialMode === "link") {
      if (!selectedExistingMaterialId) {
        toast.error("Please select a material to link");
        return;
      }
    } else {
      if (!materialName.trim()) {
        toast.error("Name is required");
        return;
      }
    }

    setSavingMaterial(true);
    saveMaterialMutation.mutate({
      id: editingMaterial?.id,
      mode: materialMode,
      existing_material_id: selectedExistingMaterialId,
      name: materialName.trim(),
      description: materialDesc.trim(),
      unit: materialUnit,
      category: materialCategory,
      min_stock_level: materialMinStock ? parseFloat(materialMinStock) : 0,
      unit_cost: materialUnitCost ? parseFloat(materialUnitCost) : 0,
      hsn_code: materialHsn.trim(),
    });
    setSavingMaterial(false);
  };

  const openEditMaterial = (material: any) => {
    setEditingMaterial(material);
    setMaterialName(material.name);
    setMaterialDesc(material.description || "");
    setMaterialUnit(material.unit);
    setMaterialCategory(material.category || "");
    setMaterialMinStock(material.min_stock_level?.toString() || "");
    setMaterialUnitCost(material.unit_cost?.toString() || "");
    setMaterialHsn(material.hsn_code || "");
    setShowRawMaterialDialog(true);
  };

  // Calculate ledger entries (purchases as debits, payments as credits)
  const ledgerEntries = [
    ...purchases.map((p: any) => ({
      id: p.id,
      date: p.purchase_date,
      type: "Purchase",
      reference: p.display_id,
      debit: p.total_amount,
      credit: 0,
      balance: 0, // Will calculate below
      status: p.status,
    })),
    ...payments.map((p: any) => ({
      id: p.id,
      date: p.payment_date,
      type: "Payment",
      reference: p.display_id,
      debit: 0,
      credit: p.amount,
      balance: 0,
      status: p.status,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate running balance
  let runningBalance = 0;
  ledgerEntries.forEach((entry) => {
    if (entry.status === 'completed') {
      runningBalance += entry.debit - entry.credit;
      entry.balance = runningBalance;
    }
  });

  const purchaseColumns = [
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Date", accessor: (row: any) => formatDate(row.purchase_date), className: "text-sm" },
    { header: "Bill #", accessor: (row: any) => row.bill_number || "—", className: "text-sm" },
    { 
      header: "Items", 
      accessor: (row: any) => (
        <span className="text-xs text-muted-foreground">
          {row.purchase_items?.length || 0} item(s)
        </span>
      )
    },
    { header: "Amount", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.status === "completed" ? "active" : row.status as any} label={row.status} /> },
  ];

  const paymentColumns = [
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Date", accessor: (row: any) => formatDate(row.payment_date), className: "text-sm" },
    { header: "Method", accessor: (row: any) => <Badge variant="outline">{row.payment_method}</Badge> },
    { header: "Reference", accessor: (row: any) => row.payment_reference || "—", className: "text-xs text-muted-foreground" },
    { header: "Amount", accessor: (row: any) => `₹${Number(row.amount).toLocaleString()}`, className: "font-semibold text-green-600" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.status === "completed" ? "active" : row.status as any} label={row.status} /> },
  ];

  const ledgerColumns = [
    { header: "Date", accessor: (row: any) => formatDate(row.date), className: "text-sm" },
    { header: "Type", accessor: (row: any) => <Badge variant={row.type === "Purchase" ? "secondary" : "outline"}>{row.type}</Badge> },
    { header: "Reference", accessor: "reference" as const, className: "font-mono text-xs" },
    { 
      header: "Debit", 
      accessor: (row: any) => row.debit > 0 ? `₹${Number(row.debit).toLocaleString()}` : "—",
      className: "text-red-600 font-medium"
    },
    { 
      header: "Credit", 
      accessor: (row: any) => row.credit > 0 ? `₹${Number(row.credit).toLocaleString()}` : "—",
      className: "text-green-600 font-medium"
    },
    { 
      header: "Balance", 
      accessor: (row: any) => (
        <span className={`font-semibold ${row.balance > 0 ? 'text-red-600' : row.balance < 0 ? 'text-green-600' : ''}`}>
          ₹{Number(row.balance).toLocaleString()}
        </span>
      )
    },
  ];

  const rawMaterialColumns = [
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Name", accessor: "name" as const, className: "font-medium" },
    { header: "Category", accessor: (row: any) => row.category || "—", className: "text-sm text-muted-foreground" },
    { header: "Unit", accessor: "unit" as const, className: "text-sm" },
    { header: "Stock", accessor: (row: any) => `${row.current_stock} ${row.unit}`, className: "text-sm" },
    { header: "Unit Cost", accessor: (row: any) => `₹${row.unit_cost?.toLocaleString() || 0}`, className: "text-sm" },
    {
      header: "Status",
      accessor: (row: any) => (
        <StatusBadge 
          status={row.current_stock <= row.min_stock_level ? "inactive" : "active"} 
          label={row.current_stock <= row.min_stock_level ? "Low Stock" : "OK"} 
        />
      ),
    },
    {
      header: "Actions",
      accessor: (row: any) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEditMaterial(row); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); setDeletingMaterialId(row.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return <TableSkeleton columns={4} />;
  }

  if (!vendor) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-muted-foreground mb-4">Vendor not found</p>
        <Button onClick={() => navigate("/vendors")}>Back to Vendors</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/vendors")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Vendor Info Card */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-lg bg-purple-100 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{vendor.name}</h1>
              <p className="text-sm text-muted-foreground font-mono">{vendor.display_id}</p>
            </div>
          </div>
          <StatusBadge status={vendor.is_active ? "active" : "inactive"} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Contact Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase">Contact</h3>
            {vendor.contact_person && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Contact:</span>
                <span>{vendor.contact_person}</span>
              </div>
            )}
            {vendor.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{vendor.phone}</span>
              </div>
            )}
            {vendor.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{vendor.email}</span>
              </div>
            )}
            {vendor.address && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span className="text-xs">{vendor.address}</span>
              </div>
            )}
          </div>

          {/* Tax Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase">Tax Details</h3>
            {vendor.gstin && (
              <div className="text-sm">
                <span className="text-muted-foreground">GSTIN:</span>
                <p className="font-mono">{vendor.gstin}</p>
              </div>
            )}
            {vendor.pan && (
              <div className="text-sm">
                <span className="text-muted-foreground">PAN:</span>
                <p className="font-mono">{vendor.pan}</p>
              </div>
            )}
          </div>

          {/* Payment Terms */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase">Payment</h3>
            <div className="text-sm">
              <span className="text-muted-foreground">Terms:</span>
              <p>{vendor.payment_terms}</p>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Credit Limit:</span>
              <p className="font-semibold">₹{Number(vendor.credit_limit).toLocaleString()}</p>
            </div>
          </div>

          {/* Account Summary */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase">Account</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Purchases:</span>
                <span className="font-semibold text-red-600">₹{Number(vendor.total_debit).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Paid:</span>
                <span className="font-semibold text-green-600">₹{Number(vendor.total_credit).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t">
                <span className="font-semibold">Outstanding:</span>
                <span className={`font-bold text-lg ${Number(vendor.outstanding) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₹{Number(vendor.outstanding).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {vendor.notes && (
          <div className="mt-6 pt-6 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Notes</h3>
            <p className="text-sm text-muted-foreground">{vendor.notes}</p>
          </div>
        )}
      </Card>

      {/* Tabs for Purchases, Payments, Ledger, Raw Materials */}
      <Tabs defaultValue="ledger" className="w-full">
        <TabsList>
          <TabsTrigger value="ledger">
            <FileText className="h-4 w-4 mr-2" />
            Ledger ({ledgerEntries.length})
          </TabsTrigger>
          <TabsTrigger value="purchases">
            <IndianRupee className="h-4 w-4 mr-2" />
            Purchases ({purchases.length})
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="h-4 w-4 mr-2" />
            Payments ({payments.length})
          </TabsTrigger>
          <TabsTrigger value="materials">
            <Boxes className="h-4 w-4 mr-2" />
            Raw Materials ({rawMaterials.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ledger" className="mt-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Account Ledger</h3>
            <DataTable
              columns={ledgerColumns}
              data={ledgerEntries}
              searchKey="reference"
              searchPlaceholder="Search by reference..."
              emptyMessage="No transactions yet"
            />
          </Card>
        </TabsContent>

        <TabsContent value="purchases" className="mt-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Purchase History</h3>
              <Button size="sm" onClick={() => navigate("/purchases", { state: { vendorId: vendor.id } })}>
                New Purchase
              </Button>
            </div>
            <DataTable
              columns={purchaseColumns}
              data={purchases}
              searchKey="display_id"
              searchPlaceholder="Search purchases..."
              emptyMessage="No purchases yet"
              onRowClick={(row) => navigate(`/purchases/${row.id}`)}
            />
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Payment History</h3>
              <Button size="sm" onClick={() => navigate("/vendor-payments", { state: { vendorId: vendor.id } })}>
                Record Payment
              </Button>
            </div>
            <DataTable
              columns={paymentColumns}
              data={payments}
              searchKey="display_id"
              searchPlaceholder="Search payments..."
              emptyMessage="No payments yet"
            />
          </Card>
        </TabsContent>

        <TabsContent value="materials" className="mt-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Raw Materials from this Vendor</h3>
              <Button size="sm" onClick={() => { resetMaterialForm(); setShowRawMaterialDialog(true); }}>
                <Plus className="h-4 w-4 mr-1" />
                Add Material
              </Button>
            </div>
            <DataTable
              columns={rawMaterialColumns}
              data={rawMaterials}
              searchKey="name"
              searchPlaceholder="Search materials..."
              emptyMessage="No raw materials yet"
              renderMobileCard={(row: any) => (
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">{row.display_id}</p>
                      <h3 className="font-semibold">{row.name}</h3>
                      <p className="text-xs text-muted-foreground">{row.category || "Uncategorized"}</p>
                    </div>
                    <StatusBadge 
                      status={row.current_stock <= row.min_stock_level ? "inactive" : "active"} 
                      label={row.current_stock <= row.min_stock_level ? "Low" : "OK"} 
                    />
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t text-sm">
                    <span>{row.current_stock} {row.unit}</span>
                    <span className="font-medium">₹{row.unit_cost?.toLocaleString() || 0}/{row.unit}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditMaterial(row)}>
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeletingMaterialId(row.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            />
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Raw Material Dialog */}
      <Dialog open={showRawMaterialDialog} onOpenChange={(open) => { setShowRawMaterialDialog(open); if (!open) resetMaterialForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMaterial ? "Edit Raw Material" : "Add Raw Material"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!editingMaterial && (
              <div className="space-y-2">
                <Label>Mode *</Label>
                <Select value={materialMode} onValueChange={(value: "link" | "create") => setMaterialMode(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="link">Link Existing Material</SelectItem>
                    <SelectItem value="create">Create New Material</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {materialMode === "link" && !editingMaterial ? (
              <div className="space-y-2">
                <Label>Select Material *</Label>
                <Select value={selectedExistingMaterialId} onValueChange={setSelectedExistingMaterialId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a material to link" />
                  </SelectTrigger>
                  <SelectContent>
                    {unlinkedMaterials.length === 0 ? (
                      <div className="py-2 px-3 text-sm text-muted-foreground">No unlinked materials available</div>
                    ) : (
                      unlinkedMaterials.map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} ({m.display_id}) - {m.unit}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {unlinkedMaterials.length === 0 && (
                  <p className="text-xs text-muted-foreground">All raw materials are already linked to vendors. Switch to "Create New Material" mode.</p>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input value={materialName} onChange={(e) => setMaterialName(e.target.value)} placeholder="e.g., Sodium Chloride" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select value={materialUnit} onValueChange={setMaterialUnit}>
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
                    <Select value={materialCategory} onValueChange={setMaterialCategory}>
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
                    <Input type="number" step="0.01" min="0" value={materialUnitCost} onChange={(e) => setMaterialUnitCost(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Min Stock Level</Label>
                    <Input type="number" step="0.01" min="0" value={materialMinStock} onChange={(e) => setMaterialMinStock(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>HSN Code</Label>
                  <Input value={materialHsn} onChange={(e) => setMaterialHsn(e.target.value)} placeholder="e.g., 25010010" className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={materialDesc} onChange={(e) => setMaterialDesc(e.target.value)} placeholder="Optional notes..." />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRawMaterialDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveMaterial} disabled={savingMaterial || saveMaterialMutation.isPending}>
              {(savingMaterial || saveMaterialMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingMaterial ? "Update" : materialMode === "link" ? "Link" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Material Confirmation */}
      <Dialog open={!!deletingMaterialId} onOpenChange={() => setDeletingMaterialId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Raw Material?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingMaterialId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingMaterialId && deleteMaterialMutation.mutate(deletingMaterialId)} disabled={deleteMaterialMutation.isPending}>
              {deleteMaterialMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendorDetail;
