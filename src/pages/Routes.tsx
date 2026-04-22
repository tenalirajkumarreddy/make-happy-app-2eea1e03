import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Store, Loader2, ChevronRight, Unlock } from "lucide-react";
import { RouteSessionPanel } from "@/components/routes/RouteSessionPanel";
import { RouteAccessMatrix } from "@/components/routes/RouteAccessMatrix";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
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
  const { role, user } = useAuth();
  const isAdmin = role === "super_admin" || role === "manager";
  const isScopedStaff = role === "agent" || role === "marketer" || role === "pos";
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [showAccessDialog, setShowAccessDialog] = useState(false);
  const [name, setName] = useState("");
  const [storeTypeId, setStoreTypeId] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const { currentWarehouse } = useWarehouse();

  const { data: storeTypes, isLoading: typesLoading } = useQuery({
    queryKey: ["store-types"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("*").eq("is_active", true);
      return data || [];
    },
  });

  const { data: routes, isLoading: routesLoading } = useQuery({
    queryKey: ["routes", currentWarehouse?.id],
    queryFn: async () => {
      let query = (supabase as any)
        .from("routes")
        .select("*, store_types(name), stores(id, outstanding)")
        .eq("is_active", true);
      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      const { data, error } = await query;
      if (error) throw error;

      const allRoutes = data || [];
      if (!isScopedStaff || !user?.id) return allRoutes;

      const { data: accessRows, error: accessError } = await supabase
        .from("agent_routes")
        .select("route_id, enabled")
        .eq("user_id", user.id);
      if (accessError) throw accessError;

      // No matrix configured for this user → unrestricted, show all routes
      if (!accessRows || accessRows.length === 0) {
        return allRoutes;
      }

      // Deny-by-default: only show routes explicitly enabled in the matrix
      const enabledRouteIds = new Set(
        accessRows.filter((row: any) => row.enabled).map((row: any) => row.route_id)
      );
      return allRoutes.filter((route: any) => enabledRouteIds.has(route.id));
    },
    enabled: !!role && !!user,
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await (supabase as any).from("routes").insert({
      name,
      store_type_id: storeTypeId,
      warehouse_id: currentWarehouse?.id || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Route created");
      setShowAdd(false);
      setName(""); setStoreTypeId("");
      qc.invalidateQueries({ queryKey: ["routes"] });
    }
  };

  if (typesLoading || routesLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const defaultTab = storeTypes?.[0]?.id || "";

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Routes"
        subtitle={`Manage delivery routes and assign stores in ${currentWarehouse?.name || "the selected warehouse"}`}
        actions={
          isAdmin
            ? [
                {
                  label: "Route Access",
                  icon: Unlock,
                  onClick: () => setShowAccessDialog(true),
                  variant: "outline",
                  priority: 2, // Lower priority than primary action
                },
              ]
            : undefined
        }
        primaryAction={isAdmin ? { label: "Create Route", onClick: () => setShowAdd(true) } : undefined}
      />

      {role === "agent" && <RouteSessionPanel />}

      {storeTypes && storeTypes.length > 0 ? (
        <Tabs defaultValue={defaultTab} className="w-full">
          <div className="w-full overflow-x-auto pb-2 scrollbar-none">
            <TabsList className="bg-muted/50 p-1 h-11">
              {storeTypes.map((type) => (
                <TabsTrigger key={type.id} id={`tab-${type.id}`} value={type.id}>{type.name}</TabsTrigger>
              ))}
            </TabsList>
          </div>

          {storeTypes.map((type) => {
            const typeRoutes = routes?.filter(r => r.store_type_id === type.id) || [];
            return (
              <TabsContent key={type.id} value={type.id} aria-labelledby={`tab-${type.id}`} className="space-y-4 mt-4">
                {typeRoutes.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-card/50 p-12 text-center flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-300">
                    <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                      <MapPin className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">No routes for {type.name}</p>
                    {isAdmin && <p className="text-xs text-muted-foreground/60 mt-1">Create a new route to get started.</p>}
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
                              <span>Outstanding: <span className="font-medium text-foreground">₹{(totalOutstanding || 0).toLocaleString()}</span></span>
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

      <Dialog open={showAccessDialog} onOpenChange={setShowAccessDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Route Access Matrix</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0">
            <RouteAccessMatrix />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Routes;
