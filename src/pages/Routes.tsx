import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Store, Loader2, ChevronRight } from "lucide-react";
import { RouteSessionPanel } from "@/components/routes/RouteSessionPanel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const Routes = () => {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [storeTypeId, setStoreTypeId] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { data: storeTypes, isLoading: typesLoading } = useQuery({
    queryKey: ["store-types"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("*").eq("is_active", true);
      return data || [];
    },
  });

  const { data: routes, isLoading: routesLoading } = useQuery({
    queryKey: ["routes-with-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routes")
        .select("*, store_types(name), stores(id, outstanding)")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("routes").insert({ name, store_type_id: storeTypeId });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Route created");
      setShowAdd(false);
      setName(""); setStoreTypeId("");
      qc.invalidateQueries({ queryKey: ["routes-with-stores"] });
    }
  };

  if (typesLoading || routesLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const defaultTab = storeTypes?.[0]?.id || "";

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Routes" subtitle="Manage delivery routes by store type" primaryAction={{ label: "Create Route", onClick: () => setShowAdd(true) }} />

      {role === "agent" && <RouteSessionPanel />}

      {storeTypes && storeTypes.length > 0 ? (
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            {storeTypes.map((type) => (
              <TabsTrigger key={type.id} value={type.id}>{type.name}</TabsTrigger>
            ))}
          </TabsList>

          {storeTypes.map((type) => {
            const typeRoutes = routes?.filter(r => r.store_type_id === type.id) || [];
            return (
              <TabsContent key={type.id} value={type.id} className="space-y-4 mt-4">
                {typeRoutes.length === 0 ? (
                  <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">
                    No routes for {type.name}. Create one to get started.
                  </div>
                ) : (
                  typeRoutes.map((route) => {
                    const storeCount = route.stores?.length || 0;
                    const totalOutstanding = route.stores?.reduce((sum: number, s: any) => sum + Number(s.outstanding || 0), 0) || 0;
                    return (
                      <div
                        key={route.id}
                        className="flex items-center justify-between rounded-xl border bg-card p-5 hover:shadow-md hover:bg-accent/20 transition-all cursor-pointer group"
                        onClick={() => navigate(`/routes/${route.id}`)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                            <MapPin className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{route.name}</h3>
                            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1"><Store className="h-3.5 w-3.5" />{storeCount} stores</span>
                              <span>Outstanding: <span className="font-medium text-foreground">₹{totalOutstanding.toLocaleString()}</span></span>
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                      </div>
                    );
                  })
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      ) : (
        <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">
          No store types configured. Add them in Settings first.
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Route</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div><Label>Route Name</Label><Input value={name} onChange={e => setName(e.target.value)} required className="mt-1" /></div>
            <div>
              <Label>Store Type</Label>
              <Select value={storeTypeId} onValueChange={setStoreTypeId} required>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select store type" /></SelectTrigger>
                <SelectContent>
                  {storeTypes?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Route
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Routes;
