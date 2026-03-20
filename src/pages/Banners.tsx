import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";
import { Loader2, Megaphone, Plus, Trash2, Pencil, Calendar, Link as LinkIcon, Image as ImageIcon } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format } from "date-fns";
import { ImageUpload } from "@/components/shared/ImageUpload";

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
  const [storeTypeId, setStoreTypeId] = useState<string>("all");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
//   const [startsAt, setStartsAt] = useState("");
//   const [endsAt, setEndsAt] = useState("");

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setImageUrl("");
    setLinkUrl("");
    setStoreTypeId("all");
    setIsActive(true);
    setSortOrder("0");
    setEditingBanner(null);
  };

  const handleEdit = (banner: any) => {
    setEditingBanner(banner);
    setTitle(banner.title);
    setDescription(banner.description || "");
    setImageUrl(banner.image_url || "");
    setLinkUrl(banner.link_url || "");
    setStoreTypeId(banner.store_type_id || "all");
    setIsActive(banner.is_active);
    setSortOrder(String(banner.sort_order || 0));
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
      return data || [];
    },
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) {
        toast.error("Title is required");
        return;
    }
    setSaving(true);
    
    try {
        const payload = {
            title,
            description: description || null,
            image_url: imageUrl || "https://placehold.co/600x200?text=No+Image",
            link_url: linkUrl || null,
            store_type_id: storeTypeId === "all" ? null : storeTypeId,
            is_active: isActive,
            sort_order: parseInt(sortOrder) || 0,
            created_by: user?.id
        };

        if (editingBanner) {
            const { error } = await supabase
                .from("promotional_banners")
                .update(payload)
                .eq("id", editingBanner.id);
            if (error) throw error;
            toast.success("Banner updated");
        } else {
            const { error } = await supabase
                .from("promotional_banners")
                .insert(payload);
            if (error) throw error;
            toast.success("Banner created");
        }

        setShowAdd(false);
        resetForm();
        qc.invalidateQueries({ queryKey: ["promotional-banners"] });
        logActivity(user!.id, `${editingBanner ? "Updated" : "Created"} banner: ${title}`, "system", "banner");
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

  const columns = [
    { 
        header: "Image", 
        accessor: (row: any) => (
            <div className="h-12 w-24 overflow-hidden rounded bg-slate-100">
                {row.image_url && <img src={row.image_url} alt={row.title} className="h-full w-full object-cover" />}
            </div>
        ) 
    },
    { header: "Title", accessor: "title", className: "font-medium" },
    { 
        header: "Target", 
        accessor: (row: any) => row.store_types?.name ? <Badge variant="secondary">{row.store_types.name}</Badge> : <Badge variant="outline">All Customers</Badge> 
    },
    { header: "Order", accessor: "sort_order" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
    {
        header: "Action",
        accessor: (row: any) => canEdit && (
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => handleEdit(row)}>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(row.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
            </div>
        )
    }
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
                searchable 
                searchKeys={["title"]} 
            />
        )}

        <Dialog open={showAdd} onOpenChange={(open) => { if (!open) resetForm(); setShowAdd(open); }}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{editingBanner ? "Edit Banner" : "Create New Banner"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2 sm:col-span-2">
                             <Label>Banner Image</Label>
                             <div className="flex justify-center rounded-lg border border-dashed p-4">
                                <ImageUpload 
                                    folder="banners"
                                    currentUrl={imageUrl}
                                    onUploaded={setImageUrl}
                                    onRemoved={() => setImageUrl("")}
                                />
                             </div>
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                            <Label>Title</Label>
                            <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Summer Sale" />
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                             <Label>Description (Optional)</Label>
                             <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
                        </div>

                        <div className="space-y-2">
                             <Label>Target Audience</Label>
                             <Select value={storeTypeId} onValueChange={setStoreTypeId}>
                                 <SelectTrigger>
                                     <SelectValue placeholder="All Customers" />
                                 </SelectTrigger>
                                 <SelectContent>
                                     <SelectItem value="all">All Store Types</SelectItem>
                                     {storeTypes?.map((t: any) => (
                                         <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                     ))}
                                 </SelectContent>
                             </Select>
                        </div>
                        
                        <div className="space-y-2">
                            <Label>Sort Order</Label>
                            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                             <Label>External Link (Optional)</Label>
                             <div className="flex items-center gap-2">
                                <LinkIcon className="h-4 w-4 text-muted-foreground" />
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

