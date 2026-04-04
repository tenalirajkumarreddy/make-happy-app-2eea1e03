import { PageHeader } from "@/components/shared/PageHeader";
import { VirtualDataTable } from "@/components/shared/VirtualDataTable";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { StorePricingDialog } from "@/components/stores/StorePricingDialog";
import { CreateStoreWizard } from "@/components/stores/CreateStoreWizard";
import { CsvImportDialog } from "@/components/shared/CsvImportDialog";
import { AdvancedFilters, applyFilters, type FilterValues } from "@/components/shared/AdvancedFilters";
import { useInfiniteQuery, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DollarSign, Store, Settings2, Upload, Loader2, Phone, MapPin } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Stores = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const isMobile = useIsMobile();
  const { allowed: canCreateStores } = usePermission("create_stores");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [pricingStore, setPricingStore] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [bulkRoute, setBulkRoute] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, { name: string; phone: string }>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [confirmBulkDeactivate, setConfirmBulkDeactivate] = useState(false);
  const [filters, setFilters] = useState<FilterValues>({});
  const qc = useQueryClient();
  const PAGE_SIZE = 50;
  // const [loadedPages, setLoadedPages] = useState(1);
  const canManagePricing = role === "super_admin" || role === "manager";
  const canBulk = role === "super_admin" || role === "manager";
  const canEdit = role === "super_admin" || role === "manager";

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading
  } = useInfiniteQuery({
    queryKey: ["stores"],
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await supabase
        .from("stores")
        .select("*, customers(name), store_types(name), routes(name)")
        .order("created_at", { ascending: false })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length;
    },
  });

  const stores = useMemo(() => data?.pages.flatMap((page) => page) || [], [data]);

  const { data: allRoutes } = useQuery({
    queryKey: ["all-routes"],
    queryFn: async () => {
      const { data } = await supabase.from("routes").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  const { data: storeTypes } = useQuery({
    queryKey: ["store-types-list"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  const { data: customersList } = useQuery({
    queryKey: ["customers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name, display_id").eq("is_active", true);
      return data || [];
    },
  });

  const enterEditMode = () => {
    const data: Record<string, { name: string; phone: string }> = {};
    (stores || []).forEach((s: any) => {
      data[s.id] = { name: s.name || "", phone: s.phone || "" };
    });
    setEditData(data);
    setEditMode(true);
  };

  const cancelEditMode = () => { setEditMode(false); setEditData({}); };

  const saveAllEdits = async () => {
    setBulkSaving(true);
    const changed = (stores || []).filter((s: any) => {
      const d = editData[s.id];
      if (!d) return false;
      return d.name !== (s.name || "") || d.phone !== (s.phone || "");
    });
    if (changed.length === 0) {
      toast.info("No changes to save");
      setBulkSaving(false);
      setEditMode(false);
      return;
    }
    const results = await Promise.all(
      changed.map((s: any) => {
        const d = editData[s.id];
        return supabase.from("stores").update({ name: d.name || null, phone: d.phone || null }).eq("id", s.id);
      })
    );
    setBulkSaving(false);
    const errCount = results.filter((r) => r.error).length;
    if (errCount > 0) { toast.error(`${errCount} update(s) failed`); }
    else {
      toast.success(`${changed.length} store(s) updated`);
      logActivity(user!.id, `Bulk updated ${changed.length} stores`, "store");
    }
    setEditMode(false);
    setEditData({});
    qc.invalidateQueries({ queryKey: ["stores"] });
  };

  const setField = (id: string, field: keyof typeof editData[string], value: string) =>
    setEditData((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const handleCsvImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    const errors: string[] = [];
    const currentCount = stores?.length || 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Match customer by name or display_id
      const customer = customersList?.find(
        (c) => c.name.toLowerCase() === row.customer?.toLowerCase() || c.display_id === row.customer
      );
      if (!customer) {
        errors.push(`Row ${i + 2}: Customer "${row.customer}" not found`);
        continue;
      }

      // Match store type by name
      const storeType = storeTypes?.find((t) => t.name.toLowerCase() === row.store_type?.toLowerCase());
      if (!storeType) {
        errors.push(`Row ${i + 2}: Store type "${row.store_type}" not found`);
        continue;
      }

      // Optionally match route
      let routeId: string | null = null;
      if (row.route) {
        const route = allRoutes?.find((r) => r.name.toLowerCase() === row.route?.toLowerCase());
        if (!route) {
          errors.push(`Row ${i + 2}: Route "${row.route}" not found`);
          continue;
        }
        routeId = route.id;
      }

      const displayId = `STR-${String(currentCount + success + 1).padStart(6, "0")}`;
      const { error } = await supabase.from("stores").insert({
        display_id: displayId,
        name: row.name,
        customer_id: customer.id,
        store_type_id: storeType.id,
        route_id: routeId,
        phone: row.phone || null,
        address: row.address || null,
      });
      if (error) {
        errors.push(`Row ${i + 2}: ${error.message}`);
      } else {
        success++;
      }
    }

    if (success > 0) {
      logActivity(user!.id, `Imported ${success} stores via CSV`, "store");
      qc.invalidateQueries({ queryKey: ["stores"] });
    }
    return { success, errors };
  };

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
    ...(canBulk && selectMode ? [{
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
        {row.photo_url && <img src={row.photo_url} alt="" loading="lazy" className="h-8 w-8 rounded-md object-cover" />}
        {editMode ? (
          <input
            className="border border-input rounded px-2 py-0.5 text-sm bg-background w-36 focus:outline-none focus:ring-1 focus:ring-ring"
            value={editData[row.id]?.name ?? row.name ?? ""}
            onChange={(e) => setField(row.id, "name", e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="font-medium">{row.name}</span>
        )}
      </div>
    )},
    { header: "Customer", accessor: (row: any) => row.customers?.name || "—", className: "text-muted-foreground text-sm hidden sm:table-cell" },
    { header: "Phone", accessor: (row: any) => editMode ? (
      <input
        className="border border-input rounded px-2 py-0.5 text-sm bg-background w-32 focus:outline-none focus:ring-1 focus:ring-ring"
        value={editData[row.id]?.phone ?? row.phone ?? ""}
        onChange={(e) => setField(row.id, "phone", e.target.value)}
        onClick={(e) => e.stopPropagation()}
        placeholder="Add phone"
      />
    ) : (
      <span className="text-muted-foreground text-sm">{row.phone || "—"}</span>
    ), className: "hidden md:table-cell" },
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

  const filteredStores = useMemo(() => {
    return applyFilters(stores || [], filters, {
      dateField: "created_at",
      routeField: "route_id",
      storeTypeField: "store_type_id",
      statusField: "is_active",
      outstandingField: "outstanding",
    });
  }, [stores, filters]);

  if (isLoading) {
    return <TableSkeleton columns={7} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Stores"
        subtitle="Manage store locations and assignments"
        primaryAction={canCreateStores ? { label: "Add Store", onClick: () => setShowAdd(true) } : undefined}
        filterNode={
          <AdvancedFilters
            config={{
              dateRange: true,
              outstandingRange: true,
              storeType: { options: storeTypes?.map((t) => ({ id: t.id, name: t.name })) || [] },
              route: { options: allRoutes?.map((r) => ({ id: r.id, name: r.name })) || [] },
              status: true,
            }}
            values={filters}
            onChange={setFilters}
          />
        }
        actions={[
          { label: "Store Types", icon: Settings2, onClick: () => navigate("/store-types"), priority: 1 },
          ...(canCreateStores ? [{ label: "Import CSV", icon: Upload, onClick: () => setShowImport(true), priority: 2 as const }] : []),
          ...(canBulk ? [{ label: selectMode ? "Done" : "Select", onClick: () => { setSelectMode((v) => !v); setSelected(new Set()); }, priority: 3 as const }] : []),
          ...(canEdit && !editMode ? [{ label: "Bulk Edit", onClick: enterEditMode, priority: 4 as const }] : []),
        ]}
      />

      {editMode && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-medium text-primary">Bulk edit — modify name or phone then save</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={cancelEditMode} disabled={bulkSaving}>Cancel</Button>
            <Button size="sm" onClick={saveAllEdits} disabled={bulkSaving}>
              {bulkSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save All
            </Button>
          </div>
        </div>
      )}

      {canBulk && selectMode && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-accent/50 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button variant="outline" size="sm" onClick={() => handleBulkStatus(true)}>Activate</Button>
          <Button variant="outline" size="sm" className="text-destructive border-destructive/40" onClick={() => setConfirmBulkDeactivate(true)}>Deactivate</Button>
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

      {/* Desktop: Card Grid, Mobile: Table */}
      {!isMobile ? (
        <div className="space-y-4">
          <div className="entity-grid">
            {filteredStores.map((row: any) => {
              return (
                <div
                  key={row.id}
                  onClick={() => { if (!editMode) navigate(`/stores/${row.id}`); }}
                  className={`group entity-card ${!row.is_active ? "entity-card-inactive" : ""}`}
                >
                  {/* Header with image */}
                  <div className="entity-card-header">
                    {row.photo_url ? (
                      <img src={row.photo_url} alt={row.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                    ) : (
                      <div className="entity-card-icon-box">
                        <Store className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <StatusBadge status={row.is_active ? "active" : "inactive"} />
                    </div>
                    {row.store_types?.name && (
                      <div className="absolute bottom-2 left-2">
                        <Badge variant="secondary" className="text-xs">{row.store_types.name}</Badge>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="entity-card-content">
                    <div>
                      <h3 className="entity-card-title">{row.name}</h3>
                      <p className="entity-card-subtitle mt-0.5">{row.display_id}</p>
                    </div>

                    {/* Customer */}
                    <div className="text-sm">
                      <p className="entity-card-label mb-1">Customer</p>
                      <p className="font-medium text-foreground truncate">{row.customers?.name || "—"}</p>
                    </div>

                    {/* Contact info */}
                    <div className="space-y-1.5 text-sm">
                      {row.phone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{row.phone}</span>
                        </div>
                      )}
                      {row.address && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate text-xs">{row.address}</span>
                        </div>
                      )}
                    </div>

                    {/* Route */}
                    {row.routes?.name && (
                      <div className="pt-2 border-t text-sm">
                        <p className="text-xs text-muted-foreground">Route: <span className="font-medium text-foreground">{row.routes.name}</span></p>
                      </div>
                    )}

                    {/* Outstanding */}
                    <div className="entity-card-stat">
                      <p className="entity-card-label">Outstanding</p>
                      <p className="font-bold text-lg text-foreground">₹{Number(row.outstanding).toLocaleString()}</p>
                    </div>

                    {/* Pricing button for admins */}
                    {canManagePricing && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full text-xs" 
                        onClick={(e: React.MouseEvent) => { 
                          e.stopPropagation(); 
                          setPricingStore(row); 
                        }}
                      >
                        <DollarSign className="mr-1 h-3 w-3" />
                        Set Prices
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {filteredStores.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No stores found.
            </div>
          )}
        </div>
      ) : (
        <VirtualDataTable
          columns={columns}
          data={filteredStores}
          searchKey="name"
          searchPlaceholder="Search stores..."
          onRowClick={(row) => { if (!editMode) navigate(`/stores/${row.id}`); }}
          height="calc(100vh - 240px)"
          renderMobileCard={(row: any) => (
            <div className={`entity-card-mobile ${!row.is_active ? "entity-card-inactive" : ""}`} onClick={() => { if (!editMode) navigate(`/stores/${row.id}`); }}>
              <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {row.photo_url ? (
                  <img src={row.photo_url} alt={row.name} className="w-full h-full object-cover" />
                ) : (
                  <Store className="h-6 w-6 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm text-foreground truncate">{row.name}</h3>
                  <StatusBadge status={row.is_active ? "active" : "inactive"} />
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="entity-card-subtitle truncate">{row.display_id}</p>
                  {row.store_types?.name && <Badge variant="outline" className="text-xs h-5 px-1.5 rounded-sm border-muted-foreground/30 text-muted-foreground">{row.store_types.name}</Badge>}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-muted-foreground truncate">{row.customers?.name || "—"}</span>
                  <p className={`font-bold text-sm ${Number(row.outstanding) > 0 ? 'text-red-600' : 'text-foreground'}`}>₹{Number(row.outstanding).toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}
        />
      )}

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="gap-1.5">
            {isFetchingNextPage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}

      {showAdd && (
        <CreateStoreWizard
          open={showAdd}
          onOpenChange={setShowAdd}
        />
      )}

      <CsvImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        templateName="stores"
        fields={[
          { key: "name", label: "Store Name", required: true },
          { key: "customer", label: "Customer (name or ID)", required: true },
          { key: "store_type", label: "Store Type", required: true },
          { key: "route", label: "Route" },
          { key: "phone", label: "Phone" },
          { key: "address", label: "Address" },
        ]}
        onImport={handleCsvImport}
      />

      <StorePricingDialog
        store={pricingStore}
        open={!!pricingStore}
        onOpenChange={(open) => { if (!open) setPricingStore(null); }}
      />

      <AlertDialog open={confirmBulkDeactivate} onOpenChange={setConfirmBulkDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {selected.size} store(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              The selected stores will be deactivated and unavailable for new sales or orders until reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { setConfirmBulkDeactivate(false); handleBulkStatus(false); }}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Stores;
