import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/shared/TableSkeleton";

const StoreTypes = () => {
  const { role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "super_admin";

  const [showAdd, setShowAdd] = useState(false);
  const [editingType, setEditingType] = useState<any>(null);
  const [deletingType, setDeletingType] = useState<any>(null);
  const [newTypeName, setNewTypeName] = useState("");
  const [newOrderType, setNewOrderType] = useState("simple");
  const [creditLimitKyc, setCreditLimitKyc] = useState("");
  const [creditLimitNoKyc, setCreditLimitNoKyc] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: storeTypes, isLoading } = useQuery({
    queryKey: ["store-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("store_types").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const openEdit = (row: any) => {
    setEditingType(row);
    setNewTypeName(row.name);
    setNewOrderType(row.order_type);
    setCreditLimitKyc(String(row.credit_limit_kyc || 0));
    setCreditLimitNoKyc(String(row.credit_limit_no_kyc || 0));
    setShowAdd(true);
  };

  const handleClose = (open?: boolean) => {
    if (open) return;
    setShowAdd(false);
    setEditingType(null);
    setNewTypeName("");
    setNewOrderType("simple");
    setCreditLimitKyc("");
    setCreditLimitNoKyc("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (editingType) {
      const { error } = await supabase.from("store_types").update({
        name: newTypeName,
        order_type: newOrderType,
      }).eq("id", editingType.id);
      setSaving(false);
      if (error) toast.error(error.message);
      else { toast.success("Store type updated"); handleClose(); qc.invalidateQueries({ queryKey: ["store-types"] }); }
    } else {
      const { error } = await supabase.from("store_types").insert({
        name: newTypeName,
        order_type: newOrderType,
      });
      setSaving(false);
      if (error) toast.error(error.message);
      else { toast.success("Store type added"); handleClose(); qc.invalidateQueries({ queryKey: ["store-types"] }); }
    }
  };

  const handleDelete = async () => {
    if (!deletingType) return;
    setDeleting(true);
    const { error } = await supabase.from("store_types").delete().eq("id", deletingType.id);
    setDeleting(false);
    if (error) {
      if (error.message.includes("violates foreign key")) {
        toast.error("Cannot delete: this store type is in use by stores or routes");
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success("Store type deleted");
      qc.invalidateQueries({ queryKey: ["store-types"] });
    }
    setDeletingType(null);
  };

  const toggleAutoOrder = async (id: string, current: boolean) => {
    await supabase.from("store_types").update({ auto_order_enabled: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["store-types"] });
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("store_types").update({ is_active: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["store-types"] });
  };

  const columns = [
    { header: "Name", accessor: "name" as const, className: "font-medium" },
    { header: "Order Type", accessor: (row: any) => <Badge variant="secondary">{row.order_type}</Badge> },
    { header: "Auto Order", accessor: (row: any) => (
      <Switch checked={row.auto_order_enabled} onCheckedChange={() => toggleAutoOrder(row.id, row.auto_order_enabled)} disabled={!isAdmin} />
    )},
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
    ...(isAdmin ? [{ header: "Actions", accessor: (row: any) => (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openEdit(row)}>
          <Pencil className="h-3 w-3 mr-1" /> Edit
        </Button>
        <Button variant={row.is_active ? "destructive" : "default"} size="sm" className="h-7 text-xs" onClick={() => toggleActive(row.id, row.is_active)}>
          {row.is_active ? "Disable" : "Enable"}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setDeletingType(row)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    )}] : []),
  ];

  const renderMobileCard = (row: any) => (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{row.name}</h3>
          <StatusBadge status={row.is_active ? "active" : "inactive"} />
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0">{row.order_type}</Badge>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Auto Order</span>
          <Switch
            checked={row.auto_order_enabled}
            onCheckedChange={() => toggleAutoOrder(row.id, row.auto_order_enabled)}
            disabled={!isAdmin}
          />
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => openEdit(row)}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
            <Button variant={row.is_active ? "destructive" : "default"} size="sm" className="h-7 text-xs px-2" onClick={() => toggleActive(row.id, row.is_active)}>
              {row.is_active ? "Disable" : "Enable"}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingType(row)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  if (isLoading) return <TableSkeleton columns={5} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Store Types"
        subtitle="Manage store type categories and their settings"
        primaryAction={isAdmin ? { label: "Add Store Type", icon: Plus, onClick: () => setShowAdd(true) } : undefined}
      />

      <DataTable
        columns={columns}
        data={storeTypes || []}
        searchKey="name"
        searchPlaceholder="Search store types..."
        renderMobileCard={renderMobileCard}
      />

      <Dialog open={showAdd} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingType ? "Edit Store Type" : "Add Store Type"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><Label>Type Name</Label><Input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} required className="mt-1" placeholder="e.g., Retail, Wholesale" /></div>
            <div>
              <Label>Order Type</Label>
              <Select value={newOrderType} onValueChange={setNewOrderType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple</SelectItem>
                  <SelectItem value="detailed">Detailed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingType ? "Update Store Type" : "Add Store Type"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingType} onOpenChange={(open) => !open && setDeletingType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Store Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingType?.name}</strong>? This cannot be undone. Store types that are in use by stores or routes cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StoreTypes;
