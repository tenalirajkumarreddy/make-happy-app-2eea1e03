import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { StorePricingDialog } from "@/components/stores/StorePricingDialog";
import { CreateStoreWizard } from "@/components/stores/CreateStoreWizard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DollarSign, Store, Settings2 } from "lucide-react";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const Stores = () => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [pricingStore, setPricingStore] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRoute, setBulkRoute] = useState("");
  const qc = useQueryClient();
  const canManagePricing = role === "super_admin" || role === "manager";
  const canBulk = role === "super_admin" || role === "manager";

  const { data: stores, isLoading } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*, customers(name), store_types(name), routes(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: allRoutes } = useQuery({
    queryKey: ["all-routes"],
    queryFn: async () => {
      const { data } = await supabase.from("routes").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === (stores?.length || 0)) {
      setSelected(new Set());
    } else {
      setSelected(new Set(stores?.map((s) => s.id) || []));
    }
  };

  const handleBulkStatus = async (active: boolean) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("stores").update({ is_active: active }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} stores ${active ? "activated" : "deactivated"}`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["stores"] });
  };

  const handleBulkRoute = async () => {
    if (selected.size === 0 || !bulkRoute) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("stores").update({ route_id: bulkRoute }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`Route assigned to ${ids.length} stores`);
    setSelected(new Set());
    setBulkRoute("");
    qc.invalidateQueries({ queryKey: ["stores"] });
  };

  const columns = [
    ...(canBulk ? [{
      header: () => (
        <Checkbox
          checked={selected.size === (stores?.length || 0) && (stores?.length || 0) > 0}
          onCheckedChange={toggleAll}
        />
      ),
      accessor: (row: any) => (
        <Checkbox
          checked={selected.has(row.id)}
          onCheckedChange={() => toggleSelect(row.id)}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        />
      ),
      className: "w-10",
      hideOnMobile: true,
    }] : []),
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs hidden lg:table-cell", hideOnMobile: true },
    { header: "Store", accessor: (row: any) => (
      <div className="flex items-center gap-2">
        {row.photo_url && <img src={row.photo_url} alt="" className="h-8 w-8 rounded-md object-cover" />}
        <span className="font-medium">{row.name}</span>
      </div>
    )},
    { header: "Customer", accessor: (row: any) => row.customers?.name || "—", className: "text-muted-foreground text-sm hidden sm:table-cell" },
    { header: "Type", accessor: (row: any) => row.store_types?.name ? <Badge variant="secondary">{row.store_types.name}</Badge> : "—", className: "hidden sm:table-cell" },
    { header: "Route", accessor: (row: any) => row.routes?.name || "—", className: "text-sm hidden lg:table-cell" },
    { header: "Outstanding", accessor: (row: any) => `₹${Number(row.outstanding).toLocaleString()}`, className: "font-semibold" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
    ...(canManagePricing ? [{ header: "Pricing", accessor: (row: any) => (
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setPricingStore(row); }}>
        <DollarSign className="mr-1 h-3 w-3" />Set Prices
      </Button>
    ), hideOnMobile: true }] : []),
  ];

  if (isLoading) {
    return <TableSkeleton columns={7} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Stores"
        subtitle="Manage store locations and assignments"
        primaryAction={{ label: "Add Store", onClick: () => setShowAdd(true) }}
        actions={[
          { label: "Store Types", icon: Settings2, onClick: () => navigate("/store-types"), priority: 1 },
        ]}
      />

      {canBulk && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-accent/50 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button variant="outline" size="sm" onClick={() => handleBulkStatus(true)}>Activate</Button>
          <Button variant="outline" size="sm" onClick={() => handleBulkStatus(false)}>Deactivate</Button>
          <div className="flex items-center gap-2">
            <Select value={bulkRoute} onValueChange={setBulkRoute}>
              <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Assign route" /></SelectTrigger>
              <SelectContent>{allRoutes?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleBulkRoute} disabled={!bulkRoute}>Assign</Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={stores || []}
        searchKey="name"
        searchPlaceholder="Search stores..."
        onRowClick={(row) => navigate(`/stores/${row.id}`)}
        renderMobileCard={(row: any) => (
          <div className={`rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow active:bg-muted/30 ${!row.is_active ? "opacity-60" : ""}`}>
            <div className="flex">
              <div className="w-20 h-20 shrink-0 bg-muted flex items-center justify-center overflow-hidden">
                {row.photo_url ? (
                  <img src={row.photo_url} alt={row.name} className="w-full h-full object-cover" />
                ) : (
                  <Store className="h-8 w-8 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex-1 p-3 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm text-foreground truncate">{row.name}</h3>
                  <StatusBadge status={row.is_active ? "active" : "inactive"} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{row.customers?.name || "—"}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-sm font-bold text-foreground">₹{Number(row.outstanding).toLocaleString()}</span>
                  {row.store_types?.name && (
                    <Badge variant="secondary" className="text-[10px] h-5">{row.store_types.name}</Badge>
                  )}
                </div>
                {row.routes?.name && (
                  <p className="text-[11px] text-muted-foreground mt-1">Route: {row.routes.name}</p>
                )}
              </div>
            </div>
          </div>
        )}
      />

      <CreateStoreWizard open={showAdd} onOpenChange={setShowAdd} />

      <StorePricingDialog
        store={pricingStore}
        open={!!pricingStore}
        onOpenChange={(open) => { if (!open) setPricingStore(null); }}
      />
    </div>
  );
};

export default Stores;
