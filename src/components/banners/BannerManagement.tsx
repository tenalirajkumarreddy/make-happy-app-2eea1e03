import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/shared/ImageUpload";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Pencil, Trash2, Image } from "lucide-react";
import { toast } from "sonner";

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
  const [storeTypeId, setStoreTypeId] = useState("all");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");

  const { data: banners, isLoading } = useQuery({
    queryKey: ["banners-admin"],
    queryFn: async () => {
      const { data } = await supabase
        .from("promotional_banners")
        .select("*, store_types(name)")
        .order("sort_order");
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
    setStoreTypeId("all"); setIsActive(true); setSortOrder("0");
  };

  const openEdit = (b: any) => {
    setEditId(b.id);
    setTitle(b.title);
    setDescription(b.description || "");
    setImageUrl(b.image_url);
    setLinkUrl(b.link_url || "");
    setStoreTypeId(b.store_type_id || "all");
    setIsActive(b.is_active);
    setSortOrder(String(b.sort_order));
    setShowForm(true);
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
      store_type_id: storeTypeId === "all" ? null : storeTypeId,
      is_active: isActive,
      sort_order: Number(sortOrder) || 0,
      created_by: user!.id,
    };

    if (editId) {
      const { error } = await supabase.from("promotional_banners").update(payload).eq("id", editId);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Banner updated");
    } else {
      const { error } = await supabase.from("promotional_banners").insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Banner created");
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
              <img src={b.image_url} alt={b.title} className="h-16 w-28 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{b.title}</p>
                  {!b.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                </div>
                {b.description && <p className="text-xs text-muted-foreground truncate">{b.description}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px]">
                    {b.store_types?.name || "All Types"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">Order: {b.sort_order}</span>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(b)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(b.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Banner" : "Create Banner"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" /></div>
            <div><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" /></div>
            <div>
              <Label>Banner Image *</Label>
              <div className="mt-1">
                <ImageUpload folder="banners" currentUrl={imageUrl || null} onUploaded={setImageUrl} onRemoved={() => setImageUrl("")} size="lg" />
              </div>
            </div>
            <div><Label>Link URL</Label><Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="mt-1" placeholder="https://..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Target Store Type</Label>
                <Select value={storeTypeId} onValueChange={setStoreTypeId}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {storeTypes?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Active</Label>
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
