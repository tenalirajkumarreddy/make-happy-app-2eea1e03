import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { KycReviewDialog } from "@/components/customers/KycReviewDialog";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { CsvImportDialog } from "@/components/shared/CsvImportDialog";
import { AdvancedFilters, applyFilters, type FilterValues } from "@/components/shared/AdvancedFilters";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { generateDisplayId } from "@/lib/displayId";
import { Loader2, User, Upload, AlertCircle } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DataTable } from "@/components/shared/DataTable";
import { logError } from "@/lib/logger";
import { usePermission } from "@/hooks/usePermission";
import { useRouteAccess } from "@/hooks/useRouteAccess";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const Customers = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { allowed: canCreateCustomers } = usePermission("create_customers");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [kycCustomer, setKycCustomer] = useState<any>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, { name: string; phone: string; email: string }>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [confirmBulkDeactivate, setConfirmBulkDeactivate] = useState(false);
  const [filters, setFilters] = useState<FilterValues>({});
  const [duplicateCustomer, setDuplicateCustomer] = useState<any>(null);
  const qc = useQueryClient();
  const canReviewKyc = role === "super_admin" || role === "manager";
  const canBulk = role === "super_admin" || role === "manager";
  const canEdit = role === "super_admin" || role === "manager";

  const { canAccessRoute, loading: routeLoading, hasMatrixRestrictions } = useRouteAccess(user?.id, role);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", hasMatrixRestrictions, canAccessRoute],
    queryFn: async () => {
      let query = supabase
        .from("customers")
        .select("*, stores(id, outstanding, route_id)")
        .order("created_at", { ascending: false });

        if (hasMatrixRestrictions) {
          // If matrix applies, filtering happens on the client side since
          // Supabase deep nested filtering is complex.
          // The query remains the same, but we filter in filteredCustomers.
        }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Real-time phone duplicate check
  useEffect(() => {
    if (!phone.trim() || phone.trim().length < 6) { setDuplicateCustomer(null); return; }
    
    const timer = setTimeout(() => {
      const match = customers?.find(c => c.phone === phone.trim());
      setDuplicateCustomer(match || null);
    }, 400);
    return () => clearTimeout(timer);
  }, [phone, customers]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    
    if (duplicateCustomer && phone.trim()) {
      // Allow adding anyway, but warn? Or logic might be to block. 
      // For now we just logged the warning in UI
    }

    setSaving(true);
    const displayId = generateDisplayId("CUST");
    const { error } = await supabase.from("customers").insert({
      display_id: displayId,
      name,
      phone: phone || null,
      email: email || null,
      address: address || null,
      photo_url: photoUrl || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Customer added");
      setDuplicateCustomer(null);
      setName("");
      setPhone("");
      setEmail("");
      setAddress("");
      setPhotoUrl("");
      setShowAdd(false);
      qc.invalidateQueries({ queryKey: ["customers"] });
    }
  };

  const handleCsvImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const displayId = generateDisplayId("CUST");
      const { error } = await supabase.from("customers").insert({
        display_id: displayId,
        name: row.name,
        email: row.email || null,
        address: row.address || null,
      });
      if (error) {
        errors.push(`Row ${i + 2}: ${error.message}`);
      } else {
        success++;
      }
    }

    if (success > 0) {
      logActivity(user!.id, `Imported ${success} customers via CSV`, "customer");
      qc.invalidateQueries({ queryKey: ["customers"] });
    }
    return { success, errors };
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = (active: boolean) => {
    if (active) setSelected(new Set((customers || []).map((c: any) => c.id)));
    else setSelected(new Set());
  };

  const handleBulkStatus = async (active: boolean) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    
    // Deactivate customers
    const { error } = await supabase.from("customers").update({ is_active: active }).in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }

    if (!active) {
      // Also deactivate stores if customer is deactivated
      // Note: This matches original intent, though ideally should be done via DB trigger or edge function for atomicity
      const { error: storeError } = await supabase.from("stores").update({ is_active: false }).in("customer_id", ids);
      if (storeError) logError("Failed to deactivate stores", storeError);
    }

    toast.success(`${ids.length} customers ${active ? "activated" : "deactivated"}`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["stores"] });
  };

  const enterEditMode = () => {
    const data: Record<string, { name: string; phone: string; email: string }> = {};
    (customers || []).forEach((c: any) => {
      data[c.id] = { name: c.name || "", phone: c.phone || "", email: c.email || "" };
    });
    setEditData(data);
    setEditMode(true);
  };

  const cancelEditMode = () => { setEditMode(false); setEditData({}); };

  const saveAllEdits = async () => {
    setBulkSaving(true);
    const changed = (customers || []).filter((c: any) => {
      const d = editData[c.id];
      if (!d) return false;
      return d.name !== (c.name || "") || d.phone !== (c.phone || "") || d.email !== (c.email || "");
    });
    if (changed.length === 0) {
      toast.info("No changes to save");
      setBulkSaving(false);
      setEditMode(false);
      return;
    }
    const results = await Promise.all(
      changed.map((c: any) => {
        const d = editData[c.id];
        return supabase.from("customers").update({ name: d.name || null, phone: d.phone || null, email: d.email || null }).eq("id", c.id);
      })
    );
    setBulkSaving(false);
    const errCount = results.filter((r) => r.error).length;
    if (errCount > 0) { toast.error(`${errCount} update(s) failed`); }
    else {
      toast.success(`${changed.length} customer(s) updated`);
    }
    setEditMode(false);
    setEditData({});
    qc.invalidateQueries({ queryKey: ["customers"] });
  };

  const setField = (id: string, field: keyof typeof editData[string], value: string) =>
    setEditData((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const columns = [
    ...(canBulk && selectMode ? [{
      header: () => (
        <Checkbox
          checked={selected.size === (customers?.length || 0) && (customers?.length || 0) > 0}
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
    { header: "Name", accessor: (row: any) => (
      <div className="flex items-center gap-2">
        {row.photo_url && <img src={row.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />}
        {editMode ? (
          <input
            className="border border-input rounded px-2 py-0.5 text-sm bg-background w-32 focus:outline-none focus:ring-1 focus:ring-ring"
            value={editData[row.id]?.name ?? row.name ?? ""}
            onChange={(e) => setField(row.id, "name", e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="font-medium text-primary hover:underline">{row.name}</span>
        )}
      </div>
    )},
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
    ), className: "hidden sm:table-cell" },
    { header: "Email", accessor: (row: any) => editMode ? (
      <input
        className="border border-input rounded px-2 py-0.5 text-sm bg-background w-40 focus:outline-none focus:ring-1 focus:ring-ring"
        value={editData[row.id]?.email ?? row.email ?? ""}
        onChange={(e) => setField(row.id, "email", e.target.value)}
        onClick={(e) => e.stopPropagation()}
        placeholder="Add email"
      />
    ) : (
      <span className="text-muted-foreground text-sm">{row.email || "—"}</span>
    ), className: "hidden md:table-cell" },
    { header: "Stores", accessor: (row: any) => row.stores?.length || 0, className: "text-center hidden sm:table-cell" },
    { header: "Outstanding", accessor: (row: any) => {
      const total = (row.stores || []).reduce((s: number, st: any) => s + Number(st.outstanding || 0), 0);
      return `₹${total.toLocaleString()}`;
    }},
    { header: "KYC", accessor: (row: any) => (
      <button onClick={() => canReviewKyc && row.kyc_status !== "not_requested" ? setKycCustomer(row) : null} className={canReviewKyc && row.kyc_status !== "not_requested" ? "cursor-pointer hover:opacity-80" : ""}>
        <StatusBadge status={row.kyc_status === "verified" ? "verified" : row.kyc_status === "pending" ? "pending" : row.kyc_status === "rejected" ? "rejected" : "inactive"} label={row.kyc_status.replace("_", " ")} />
      </button>
    )},
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
  ];

  const filteredCustomers = useMemo(() => {
    let data = customers || [];
    if (hasMatrixRestrictions) {
      data = data.filter((c: any) => 
        c.stores?.some((s: any) => canAccessRoute(s.route_id))
      );
    }
    return applyFilters(data, filters, {
      dateField: "created_at",
      kycField: "kyc_status",
      statusField: "is_active",
    });
  }, [customers, filters, hasMatrixRestrictions, canAccessRoute]);

  if (isLoading || routeLoading) {
    return <TableSkeleton columns={7} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Customers"
        subtitle="Manage customer accounts and KYC verification"
        primaryAction={canCreateCustomers ? { label: "Add Customer", onClick: () => setShowAdd(true) } : undefined}
        filterNode={
          <AdvancedFilters
            config={{ dateRange: true, kycStatus: true, status: true }}
            values={filters}
            onChange={setFilters}
          />
        }
        actions={[
          ...(canCreateCustomers ? [{ label: "Import CSV", icon: Upload, onClick: () => setShowImport(true), priority: 1 }] : []),
          ...(canBulk ? [{ label: selectMode ? "Done" : "Select", onClick: () => { setSelectMode((v) => !v); setSelected(new Set()); }, priority: 2 }] : []),
          ...(canEdit && !editMode ? [{ label: "Bulk Edit", onClick: enterEditMode, priority: 3 }] : []),
        ]}
      />

      {canBulk && selectMode && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-accent/50 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button variant="outline" size="sm" onClick={() => handleBulkStatus(true)}>Activate</Button>
          <Button variant="outline" size="sm" className="text-destructive border-destructive/40" onClick={() => setConfirmBulkDeactivate(true)}>Deactivate</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {editMode && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-medium text-primary">Bulk edit — modify any fields then save</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={cancelEditMode} disabled={bulkSaving}>Cancel</Button>
            <Button size="sm" onClick={saveAllEdits} disabled={bulkSaving}>
              {bulkSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save All
            </Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filteredCustomers}
        searchKey="name"
        searchPlaceholder="Search customers..."
        onRowClick={(row) => { if (!editMode) navigate(`/customers/${row.id}`); }}
        renderMobileCard={(row: any) => (
          <div className={`rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow active:bg-muted/30 ${!row.is_active ? "opacity-60" : ""}`}>
            <div className="flex">
              <div className="w-24 self-stretch shrink-0 bg-muted flex items-center justify-center overflow-hidden">
                {row.photo_url ? (
                  <img src={row.photo_url} alt={row.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="h-8 w-8 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex-1 p-3 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm text-foreground truncate">{row.name}</h3>
                  <StatusBadge status={row.is_active ? "active" : "inactive"} />
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-muted-foreground font-mono truncate">{row.display_id}</p>
                  <StatusBadge status={row.kyc_status === "verified" ? "verified" : row.kyc_status === "pending" ? "pending" : "inactive"} label={`KYC: ${row.kyc_status.replace("_", " ")}`} />
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-sm font-bold text-foreground">₹{(row.stores || []).reduce((s: number, st: any) => s + Number(st.outstanding || 0), 0).toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">{row.stores?.length || 0} stores</span>
                </div>
              </div>
            </div>
          </div>
        )}
      />

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="flex items-start gap-4">
              <ImageUpload folder="customers" currentUrl={photoUrl || null} onUploaded={setPhotoUrl} onRemoved={() => setPhotoUrl("")} />
              <div className="flex-1 space-y-3">
                <div><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} required className="mt-1" /></div>
                <div><Label>Phone *</Label><Input value={phone} onChange={e => setPhone(e.target.value)} className="mt-1" placeholder="+91 98765 43210" required /></div>
              </div>
            </div>
            {duplicateCustomer && phone.trim() && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Phone already used by <span className="font-semibold">{duplicateCustomer.name}</span> ({duplicateCustomer.display_id}).{" "}
      DataTable
                </span>
              </div>
            )}
            <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" /></div>
            <div><Label>Address</Label><Input value={address} onChange={e => setAddress(e.target.value)} className="mt-1" /></div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Customer
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <CsvImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        templateName="customers"
        fields={[
          { key: "name", label: "Name", required: true },
          { key: "phone", label: "Phone", required: true },
          { key: "email", label: "Email" },
          { key: "address", label: "Address" },
        ]}
        onImport={handleCsvImport}
      />

      <KycReviewDialog
        customer={kycCustomer}
        open={!!kycCustomer}
        onOpenChange={(open) => { if (!open) setKycCustomer(null); }}
        onDone={() => { setKycCustomer(null); qc.invalidateQueries({ queryKey: ["customers"] }); }}
      />

      <AlertDialog open={confirmBulkDeactivate} onOpenChange={setConfirmBulkDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {selected.size} customer(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the selected customers and all their stores. This cannot be undone without manually re-activating each one.
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

export default Customers;
