import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";
import { Loader2, Plus, Trash2, Pencil, Link as LinkIcon } from "lucide-react";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { BannerImageEditor } from "@/components/banners/BannerImageEditor";

interface CropState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const Banners = () => {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const canEdit = ["super_admin", "manager"].includes(role || "");

  const [showAdd, setShowAdd] = useState(false);
  const [editingBanner, setEditingBanner] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [selectedStoreTypeIds, setSelectedStoreTypeIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [cropData, setCropData] = useState<CropState | null>(null);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setImageUrl("");
    setLinkUrl("");
    setSelectedStoreTypeIds([]);
    setIsActive(true);
    setSortOrder("0");
    setCropData(null);
    setEditingBanner(null);
  };

  const handleEdit = async (banner: any) => {
    setEditingBanner(banner);
    setTitle(banner.title);
    setDescription(banner.description || "");
    setImageUrl(banner.image_url || "");
    setLinkUrl(banner.link_url || "");
    setIsActive(banner.is_active);
    setSortOrder(String(banner.sort_order || 0));
    setCropData(banner.crop_data || null);

    // Load store type associations
    const { data: associations } = await supabase
      .from("banner_store_types" as any)
      .select("store_type_id")
      .eq("banner_id", banner.id);

    if (associations && associations.length > 0) {
      setSelectedStoreTypeIds(associations.map((a: any) => a.store_type_id));
    } else if (banner.store_type_id) {
      // Fallback to legacy single store_type_id
      setSelectedStoreTypeIds([banner.store_type_id]);
    } else {
      setSelectedStoreTypeIds([]);
    }

    setShowAdd(true);
  };

  const { data: storeTypes } = useQuery({
    queryKey: ["store-types-simple"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name").eq("is_active", true).order("name");
      return data || [];
    },
  });

  const { data: banners, isLoading } = useQuery({
    queryKey: ["promotional-banners"],
    queryFn: async () => {
      const { data } = await supabase
        .from("promotional_banners")
        .select(`*, store_types(name)`)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      // Also load banner_store_types for display
      if (data) {
        const bannerIds = data.map((b: any) => b.id);
        const { data: associations } = await supabase
          .from("banner_store_types" as any)
          .select("banner_id, store_type_id")
          .in("banner_id", bannerIds);

        // Attach store type IDs to each banner
        return data.map((b: any) => ({
          ...b,
          _storeTypeIds: (associations || [])
            .filter((a: any) => a.banner_id === b.id)
            .map((a: any) => a.store_type_id),
        }));
      }
      return data || [];
    },
  });

  const toggleStoreType = (storeTypeId: string) => {
    setSelectedStoreTypeIds((prev) =>
      prev.includes(storeTypeId)
        ? prev.filter((id) => id !== storeTypeId)
        : [...prev, storeTypeId]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);

    try {
      const basePayload = {
        title,
        description: description || null,
        image_url: imageUrl || "https://placehold.co/600x200?text=No+Image",
        link_url: linkUrl || null,
        store_type_id: selectedStoreTypeIds.length === 1 ? selectedStoreTypeIds[0] : null,
        is_active: isActive,
        sort_order: parseInt(sortOrder) || 0,
        crop_data: cropData,
      };

      let bannerId: string;

      if (editingBanner) {
        const { error } = await supabase
          .from("promotional_banners")
          .update(basePayload)
          .eq("id", editingBanner.id);
        if (error) throw error;
        bannerId = editingBanner.id;
        toast.success("Banner updated");
      } else {
        const { data: inserted, error } = await supabase
          .from("promotional_banners")
          .insert({ ...basePayload, created_by: user?.id })
          .select("id")
          .single();
        if (error) throw error;
        bannerId = inserted.id;
        toast.success("Banner created");
      }

      // Sync banner_store_types junction table
      // Delete existing associations
      await supabase
        .from("banner_store_types" as any)
        .delete()
        .eq("banner_id", bannerId);

      // Insert new associations
      if (selectedStoreTypeIds.length > 0) {
        const rows = selectedStoreTypeIds.map((stId) => ({
          banner_id: bannerId,
          store_type_id: stId,
        }));
        await supabase.from("banner_store_types" as any).insert(rows);
      }

      setShowAdd(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["promotional-banners"] });
      logActivity(user!.id, `${editingBanner ? "Updated" : "Created"} banner: ${title}`, "banner", title, editingBanner?.id || bannerId);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this banner?")) return;

    const { error } = await supabase.from("promotional_banners").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Banner deleted");
      qc.invalidateQueries({ queryKey: ["promotional-banners"] });
    }
  };

  const getStoreTypeNames = (banner: any) => {
    const ids: string[] = banner._storeTypeIds || [];
    if (ids.length === 0) return "All Customers";
    return ids
      .map((id: string) => storeTypes?.find((t: any) => t.id === id)?.name || "Unknown")
      .join(", ");
  };

  const columns = [
    {
      header: "Image",
      accessor: (row: any) => (
        <div
          className="h-12 w-24 overflow-hidden rounded bg-slate-100 relative"
          style={{ aspectRatio: "3" }}
        >
          {row.image_url && (
            <img
              src={row.image_url}
              alt={row.title}
              loading="lazy"
              className="absolute inset-0 w-full h-full"
              style={{
                objectFit: "cover",
                transform: row.crop_data
                  ? `translate(${row.crop_data.offsetX * 0.5}px, ${row.crop_data.offsetY * 0.5}px) scale(${row.crop_data.scale})`
                  : undefined,
                transformOrigin: "center center",
              }}
            />
          )}
        </div>
      ),
    },
    { header: "Title", accessor: "title", className: "font-medium" },
    {
      header: "Target",
      accessor: (row: any) => {
        const names = getStoreTypeNames(row);
        if (names === "All Customers") {
          return <Badge variant="outline">All Customers</Badge>;
        }
        const ids: string[] = row._storeTypeIds || [];
        return (
          <div className="flex flex-wrap gap-1">
            {ids.map((id: string) => (
              <Badge key={id} variant="secondary" className="text-[10px]">
                {storeTypes?.find((t: any) => t.id === id)?.name || "Unknown"}
              </Badge>
            ))}
          </div>
        );
      },
    },
    { header: "Order", accessor: "sort_order" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
    {
      header: "Action",
      accessor: (row: any) =>
        canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => handleEdit(row)}>
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(row.id)}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader title="Promotional Banners" subtitle="Manage banners visible on customer portal" />
        {canEdit && (
          <Button onClick={() => { resetForm(); setShowAdd(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Banner
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
      ) : (
        <DataTable
          data={banners || []}
          columns={columns}
          searchKey="title"
        />
      )}

      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) resetForm(); setShowAdd(open); }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBanner ? "Edit Banner" : "Create New Banner"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Banner Image Upload */}
              <div className="space-y-2 sm:col-span-2">
                <Label>Banner Image</Label>
                <div className="flex justify-center rounded-lg border border-dashed p-4">
                  <ImageUpload
                    folder="banners"
                    currentUrl={imageUrl}
                    onUploaded={setImageUrl}
                    onRemoved={() => { setImageUrl(""); setCropData(null); }}
                  />
                </div>
              </div>

              {/* Image Editor - Zoom/Pan */}
              {imageUrl && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Adjust Display — Zoom & Pan</Label>
                  <BannerImageEditor
                    imageUrl={imageUrl}
                    cropData={cropData}
                    onCropChange={setCropData}
                    aspectRatio={3}
                  />
                </div>
              )}

              <div className="space-y-2 sm:col-span-2">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Summer Sale" />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Description (Optional)</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>

              {/* Multi-Store Type Selection */}
              <div className="space-y-2 sm:col-span-2">
                <Label>Target Store Types</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select one or more store types. Leave all unchecked to show to all customers.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {storeTypes?.map((t: any) => (
                    <label
                      key={t.id}
                      className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                        selectedStoreTypeIds.includes(t.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent/50"
                      }`}
                    >
                      <Checkbox
                        checked={selectedStoreTypeIds.includes(t.id)}
                        onCheckedChange={() => toggleStoreType(t.id)}
                      />
                      <span className="text-sm">{t.name}</span>
                    </label>
                  ))}
                </div>
                {selectedStoreTypeIds.length === 0 && (
                  <p className="text-xs text-blue-600 mt-1">
                    No store types selected — banner will be visible to all customers.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>External Link (Optional)</Label>
                <div className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
                </div>
              </div>

              <div className="space-y-2 flex items-center justify-between sm:col-span-2 rounded-lg border p-3">
                <div className="block space-y-0.5">
                  <Label className="text-base">Active Status</Label>
                  <p className="text-xs text-muted-foreground">Visible to customers when enabled</p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Banner
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Banners;
