import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, MapPin, Warehouse as WarehouseIcon, Star } from "lucide-react";

interface Warehouse {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

interface WarehouseFormData {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  is_active: boolean;
  is_default: boolean;
}

const defaultFormData: WarehouseFormData = {
  name: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  phone: "",
  is_active: true,
  is_default: false,
};

export function WarehouseManagement() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<WarehouseFormData>(defaultFormData);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const getCompatiblePayload = (data: WarehouseFormData) => ({
    name: data.name,
    address: data.address || null,
    city: data.city || null,
    state: data.state || null,
    pincode: data.pincode || null,
    phone: data.phone || null,
    is_active: data.is_active,
    is_default: data.is_default,
  });

  const getMinimalPayload = (data: WarehouseFormData) => ({
    name: data.name,
    address: data.address || null,
    phone: data.phone || null,
    is_active: data.is_active,
  });

  const isMissingColumnError = (message?: string) => {
    if (!message) return false;
    const lower = message.toLowerCase();
    return lower.includes("column") && (lower.includes("does not exist") || lower.includes("schema cache"));
  };

  const { data: warehouses, isLoading } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as Warehouse[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: WarehouseFormData & { id?: string }) => {
      // If setting as default, first unset current default
      if (data.is_default) {
        const { error: unsetError } = await supabase
          .from("warehouses")
          .update({ is_default: false })
          .eq("is_default", true);
        if (unsetError && !isMissingColumnError(unsetError.message)) {
          throw unsetError;
        }
      }

      if (data.id) {
        const fullPayload = getCompatiblePayload(data);
        const { error } = await supabase
          .from("warehouses")
          .update(fullPayload)
          .eq("id", data.id);
        if (error) {
          if (!isMissingColumnError(error.message)) throw error;
          const { error: fallbackError } = await supabase
            .from("warehouses")
            .update(getMinimalPayload(data))
            .eq("id", data.id);
          if (fallbackError) throw fallbackError;
        }
      } else {
        const { error } = await supabase.from("warehouses").insert(getCompatiblePayload(data));
        if (error) {
          if (!isMissingColumnError(error.message)) throw error;
          const { error: fallbackError } = await supabase
            .from("warehouses")
            .insert(getMinimalPayload(data));
          if (fallbackError) throw fallbackError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success(editingId ? "Warehouse updated" : "Warehouse created");
      closeDialog();
    },
    onError: (e: Error) => {
      toast.error(`Failed: ${e.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("warehouses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Warehouse deleted");
      setDeletingId(null);
    },
    onError: (e: Error) => {
      toast.error(`Cannot delete: ${e.message}`);
      setDeletingId(null);
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: unsetError } = await supabase
        .from("warehouses")
        .update({ is_default: false })
        .eq("is_default", true);
      if (unsetError && !isMissingColumnError(unsetError.message)) {
        throw unsetError;
      }

      const { error } = await supabase.from("warehouses").update({ is_default: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Default warehouse updated");
    },
  });

  const openDialog = (warehouse?: Warehouse) => {
    if (warehouse) {
      setEditingId(warehouse.id);
      setFormData({
        name: warehouse.name,
        address: warehouse.address || "",
        city: warehouse.city || "",
        state: warehouse.state || "",
        pincode: warehouse.pincode || "",
        phone: warehouse.phone || "",
        is_active: warehouse.is_active,
        is_default: warehouse.is_default,
      });
    } else {
      setEditingId(null);
      setFormData(defaultFormData);
    }
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    setFormData(defaultFormData);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error("Warehouse name is required");
      return;
    }
    saveMutation.mutate({ ...formData, id: editingId || undefined });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Warehouses</h3>
          <p className="text-sm text-muted-foreground">Manage inventory locations</p>
        </div>
        <Button onClick={() => openDialog()} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Warehouse
        </Button>
      </div>

      {/* Warehouse Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {warehouses?.map((wh) => (
          <div
            key={wh.id}
            className={`rounded-xl border p-4 relative transition-all ${
              wh.is_default ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-card hover:shadow-md"
            } ${!wh.is_active ? "opacity-60" : ""}`}
          >
            {wh.is_default && (
              <Badge variant="secondary" className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] px-2">
                <Star className="h-3 w-3 mr-1" />
                Default
              </Badge>
            )}

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <WarehouseIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium truncate">{wh.name}</h4>
                {(wh.address || wh.city) && (
                  <div className="flex items-start gap-1 mt-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">
                      {[wh.address, wh.city, wh.state, wh.pincode].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
                {!wh.is_active && (
                  <Badge variant="outline" className="mt-2 text-[10px]">
                    Inactive
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4 pt-3 border-t">
              {!wh.is_default && wh.is_active && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setDefaultMutation.mutate(wh.id)}
                  disabled={setDefaultMutation.isPending}
                >
                  Set Default
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDialog(wh)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => setDeletingId(wh.id)}
                disabled={wh.is_default}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {warehouses?.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <WarehouseIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No warehouses configured</p>
            <Button variant="link" className="mt-2" onClick={() => openDialog()}>
              Add your first warehouse
            </Button>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Warehouse" : "Add Warehouse"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Warehouse Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Main Warehouse"
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Street address"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                />
              </div>
            </div>
            <div className="w-1/2 space-y-2">
              <Label>PIN Code</Label>
              <Input
                value={formData.pincode}
                onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                maxLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="flex items-center justify-between border-t pt-4">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">Show in warehouse selections</p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(c) => setFormData({ ...formData, is_active: c })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Set as Default</Label>
                <p className="text-xs text-muted-foreground">Auto-select for new purchases</p>
              </div>
              <Switch
                checked={formData.is_default}
                onCheckedChange={(c) => setFormData({ ...formData, is_default: c })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Warehouse?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove the warehouse. Products with stock in this warehouse may be affected.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
