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
import { Loader2, Plus, Pencil } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/shared/TableSkeleton";

const StoreTypes = () => {
  const { role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "super_admin";

  const [showAdd, setShowAdd] = useState(false);
  const [editingType, setEditingType] = useState<any>(null);
  const [newTypeName, setNewTypeName] = useState("");
  const [newOrderType, setNewOrderType] = useState("simple");
  const [saving, setSaving] = useState(false);

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
    setShowAdd(true);
  };

  const handleClose = () => {
    setShowAdd(false);
    setEditingType(null);
    setNewTypeName("");
    setNewOrderType("simple");
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
      </div>
    )}] : []),
  ];

  if (isLoading) return <TableSkeleton columns={5} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Store Types"
        subtitle="Manage store type categories and their settings"
        primaryAction={isAdmin ? { label: "Add Store Type", icon: Plus, onClick: () => setShowAdd(true) } : undefined}
      />

      <DataTable columns={columns} data={storeTypes || []} searchKey="name" searchPlaceholder="Search store types..." />

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Store Type</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
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
              Add Store Type
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StoreTypes;
