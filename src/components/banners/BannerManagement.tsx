import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { BannerImageEditor } from "@/components/banners/BannerImageEditor";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Image } from "lucide-react";
import { toast } from "sonner";

interface CropState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function BannerManagement() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [selectedStoreTypeIds, setSelectedStoreTypeIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [cropData, setCropData] = useState<CropState | null>(null);

  const { data: banners, isLoading } = useQuery({
    queryKey: ["banners-admin"],
    queryFn: async () => {
      const { data } = await supabase
        .from("promotional_banners")
        .select("*, store_types(name)")
        .order("sort_order");

      if (data) {
        const bannerIds = data.map((b: any) => b.id);
        const { data: associations } = await supabase
          .from("banner_store_types" as any)
          .select("banner_id, store_type_id")
          .in("banner_id", bannerIds);

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

  const { data: storeTypes } = useQuery({
    queryKey: ["store-types-banners"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  const resetForm = () => {
    setEditId(null);
    setTitle(""); setDescription(""); setImageUrl(""); setLinkUrl("");
    setSelectedStoreTypeIds([]); setIsActive(true); setSortOrder("0");
    setCropData(null);
  };

  const openEdit = async (b: any) => {
    setEditId(b.id);
    setTitle(b.title);
    setDescription(b.description || "");
    setImageUrl(b.image_url);
    setLinkUrl(b.link_url || "");
    setIsActive(b.is_active);
    setSortOrder(String(b.sort_order));
    setCropData(b.crop_data || null);

    // Load store type associations
    const ids: string[] = b._storeTypeIds || [];
    if (ids.length > 0) {
      setSelectedStoreTypeIds(ids);
    } else if (b.store_type_id) {
      setSelectedStoreTypeIds([b.store_type_id]);
    } else {
      setSelectedStoreTypeIds([]);
    }

    setShowForm(true);
  };

  const toggleStoreType = (storeTypeId: string) => {
    setSelectedStoreTypeIds((prev) =>
      prev.includes(storeTypeId)
        ? prev.filter((id) => id !== storeTypeId)
        : [...prev, storeTypeId]
    );
  };

  const handleSave = async () => {
    if (!title.trim() || !imageUrl.trim()) {
      toast.error("Title and image are required");
      return;
    }
    setSaving(true);
    const payload = {
      title,
      description: description || null,
      image_url: imageUrl,
      link_url: linkUrl || null,
      store_type_id: selectedStoreTypeIds.length === 1 ? selectedStoreTypeIds[0] : null,
      is_active: isActive,
      sort_order: Number(sortOrder) || 0,
      created_by: user!.id,
      crop_data: cropData,
    };

    let bannerId: string;

    if (editId) {
      const { error } = await supabase.from("promotional_banners").update(payload).eq("id", editId);
      if (error) { toast.error(error.message); setSaving(false); return; }
      bannerId = editId;
      toast.success("Banner updated");
    } else {
      const { data: inserted, error } = await supabase.from("promotional_banners").insert(payload).select("id").single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      bannerId = inserted.id;
      toast.success("Banner created");
    }

    // Sync banner_store_types
    await supabase.from("banner_store_types" as any).delete().eq("banner_id", bannerId);
    if (selectedStoreTypeIds.length > 0) {
      const rows = selectedStoreTypeIds.map((stId) => ({
        banner_id: bannerId,
        store_type_id: stId,
      }));
      await supabase.from("banner_store_types" as any).insert(rows);
    }

    setSaving(false);
    setShowForm(false);
    resetForm();
    qc.invalidateQueries({ queryKey: ["banners-admin"] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("promotional_banners").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Banner deleted"); qc.invalidateQueries({ queryKey: ["banners-admin"] }); }
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Promotional Banners</h3>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Banner
        </Button>
      </div>

      {banners?.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          <Image className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No banners yet. Create one to display on customer dashboards.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {banners?.map((b: any) => (
            <div key={b.id} className="rounded-xl border bg-card p-3 flex items-center gap-3">
              <div
                className="h-16 w-28 rounded-lg overflow-hidden shrink-0 relative bg-muted"
                style={{ aspectRatio: "3" }}
              >
                <img
                  src={b.image_url}
                  alt={b.title}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full"
                  style={{
                    objectFit: "cover",
                    transform: b.crop_data
                      ? `translate(${b.crop_data.offsetX * 0.5}px, ${b.crop_data.offsetY * 0.5}px) scale(${b.crop_data.scale})`
                      : undefined,
                    transformOrigin: "center center",
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{b.title}</p>
                  {!b.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                </div>
                {b.description && <p className="text-xs text-muted-foreground truncate">{b.description}</p>}
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {(b._storeTypeIds || []).length === 0 ? (
                    <Badge variant="outline" className="text-[10px]">All Types</Badge>
                  ) : (
                    (b._storeTypeIds || []).map((id: string) => (
                      <Badge key={id} variant="secondary" className="text-[10px]">
                        {storeTypes?.find((t: any) => t.id === id)?.name || "Unknown"}
                      </Badge>
                    ))
                  )}
                  <span className="text-[10px] text-muted-foreground ml-1">Order: {b.sort_order}</span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors" onClick={() => openEdit(b)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 transition-colors" onClick={() => handleDelete(b.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) resetForm(); }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit Banner" : "Create Banner"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" /></div>
            <div><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" /></div>
            <div>
              <Label>Banner Image *</Label>
              <div className="mt-1">
                <ImageUpload folder="banners" currentUrl={imageUrl || null} onUploaded={setImageUrl} onRemoved={() => { setImageUrl(""); setCropData(null); }} size="lg" />
              </div>
            </div>

            {/* Image Editor */}
            {imageUrl && (
              <div>
                <Label>Adjust Display — Zoom & Pan</Label>
                <div className="mt-1">
                  <BannerImageEditor
                    imageUrl={imageUrl}
                    cropData={cropData}
                    onCropChange={setCropData}
                    aspectRatio={3}
                  />
                </div>
              </div>
            )}

            <div><Label>Link URL</Label><Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="mt-1" placeholder="https://..." /></div>

            {/* Multi-Store Type Selection */}
            <div>
              <Label>Target Store Types</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select store types. Leave all unchecked for all customers.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {storeTypes?.map((t: any) => {
                  const isSelected = selectedStoreTypeIds.includes(t.id);
                  return (
                    <Badge
                      key={t.id}
                      variant={isSelected ? "default" : "outline"}
                      className={`cursor-pointer py-1.5 px-3 text-xs transition-all ${
                        isSelected 
                          ? "bg-primary text-primary-foreground shadow-sm scale-105" 
                          : "hover:bg-accent border-muted-foreground/20"
                      }`}
                      onClick={() => toggleStoreType(t.id)}
                    >
                      {t.name}
                    </Badge>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="mt-1" />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <Label>Active</Label>
              </div>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editId ? "Update Banner" : "Create Banner"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
