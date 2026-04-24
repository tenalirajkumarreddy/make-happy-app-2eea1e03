import { PageHeader } from "@/components/shared/PageHeader";
import { VirtualDataTable } from "@/components/shared/VirtualDataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useInfiniteQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Loader2, Users, Phone, Mail, MapPin, Plus, Building2 } from "lucide-react";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useState, useMemo, useEffect } from "react";

// Set page title hook
const usePageTitle = (title: string) => {
  useEffect(() => {
    const originalTitle = document.title;
    document.title = title;
    return () => {
      document.title = originalTitle;
    };
  }, [title]);
};
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";
import { sanitizeString } from "@/lib/sanitization";

const Vendors = () => {
  usePageTitle("Vendors | BizManager");
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editingVendor, setEditingVendor] = useState<any>(null);
  const PAGE_SIZE = 50;

  // Form state
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  const [pan, setPan] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Net 30 days");
  const [creditLimit, setCreditLimit] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading
  } = useInfiniteQuery({
    queryKey: ["vendors", currentWarehouse?.id],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from("vendors")
        .select("*")
        .order("created_at", { ascending: false });

      if (currentWarehouse?.id) {
        query = query.eq("warehouse_id", currentWarehouse.id);
      }

      const { data, error } = await query.range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length;
    },
  });

  const vendors = useMemo(() => data?.pages.flatMap((page) => page) || [], [data]);

  const resetForm = () => {
    setName("");
    setContactPerson("");
    setPhone("");
    setEmail("");
    setAddress("");
    setGstin("");
    setPan("");
    setPaymentTerms("Net 30 days");
    setCreditLimit("");
    setNotes("");
    setEditingVendor(null);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Generate display ID using the sequence
      const { data: idData } = await supabase.rpc("generate_display_id", {
        prefix: "VEN",
        seq_name: "vendors_display_id_seq"
      });

    const vendorData = {
      display_id: idData,
      warehouse_id: currentWarehouse?.id || null,
      name: sanitizeString(name.trim()),
      contact_person: sanitizeString(contactPerson.trim()) || null,
      phone: sanitizeString(phone.trim()) || null,
      email: sanitizeString(email.trim()) || null,
      address: sanitizeString(address.trim()) || null,
      gstin: sanitizeString(gstin.trim()) || null,
      pan: sanitizeString(pan.trim()) || null,
      payment_terms: sanitizeString(paymentTerms.trim()) || "Net 30 days",
      credit_limit: creditLimit ? parseFloat(creditLimit) : 0,
      notes: sanitizeString(notes.trim()) || null,
      created_by: user!.id
    };

      if (editingVendor) {
        // Update existing vendor
        const { error } = await supabase
          .from("vendors")
          .update(vendorData)
          .eq("id", editingVendor.id);

        if (error) throw error;
        toast.success("Vendor updated successfully");
        logActivity(user!.id, `Updated vendor: ${name}`, "vendor");
      } else {
        // Create new vendor
        const { error } = await supabase
          .from("vendors")
          .insert(vendorData);

        if (error) throw error;
        toast.success("Vendor added successfully");
        logActivity(user!.id, `Created vendor: ${name}`, "vendor");
      }

      qc.invalidateQueries({ queryKey: ["vendors"] });
      setShowAdd(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to save vendor");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (vendor: any) => {
    setEditingVendor(vendor);
    setName(vendor.name || "");
    setContactPerson(vendor.contact_person || "");
    setPhone(vendor.phone || "");
    setEmail(vendor.email || "");
    setAddress(vendor.address || "");
    setGstin(vendor.gstin || "");
    setPan(vendor.pan || "");
    setPaymentTerms(vendor.payment_terms || "Net 30 days");
    setCreditLimit(vendor.credit_limit?.toString() || "");
    setNotes(vendor.notes || "");
    setShowAdd(true);
  };

  const columns = [
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs hidden lg:table-cell" },
    { 
      header: "Vendor", 
      accessor: (row: any) => (
        <div>
          <div className="font-medium">{row.name}</div>
          {row.contact_person && <div className="text-xs text-muted-foreground">{row.contact_person}</div>}
        </div>
      )
    },
    { header: "Phone", accessor: (row: any) => row.phone || "—", className: "hidden md:table-cell text-sm" },
    { header: "Email", accessor: (row: any) => row.email || "—", className: "hidden lg:table-cell text-sm text-muted-foreground" },
    { 
      header: "Outstanding", 
      accessor: (row: any) => (
        <span className={`font-semibold ${Number(row.outstanding) > 0 ? 'text-red-600' : 'text-green-600'}`}>
          ₹{Number(row.outstanding || 0).toLocaleString()}
        </span>
      )
    },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
  ];

  if (isLoading) {
    return <TableSkeleton columns={6} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Vendors"
        subtitle={`Manage vendor accounts and payments in ${currentWarehouse?.name || "the selected warehouse"}`}
        primaryAction={{ label: "Add Vendor", onClick: () => { resetForm(); setShowAdd(true); } }}
        actions={[
          { 
            label: "Raw Materials", 
            onClick: () => navigate("/raw-materials"),
            variant: "outline" as const,
            priority: 1
          }
        ]}
      />

      {/* Desktop: Card Grid, Mobile: Table */}
      {!isMobile ? (
        <div className="space-y-4">
          <div className="entity-grid">
            {vendors.map((vendor: any) => (
              <div
                key={vendor.id}
                onClick={() => navigate(`/vendors/${vendor.id}`)}
                className={`group entity-card ${!vendor.is_active ? "entity-card-inactive" : ""}`}
              >
                {/* Header */}
                <div className="entity-card-header">
                  <div className="entity-card-icon-box">
                    <Building2 className="h-8 w-8 text-primary" />
                  </div>
                  <div className="absolute top-2 right-2">
                    <StatusBadge status={vendor.is_active ? "active" : "inactive"} />
                  </div>
                </div>

                {/* Content */}
                <div className="entity-card-content">
                  <div>
                    <h3 className="entity-card-title">{vendor.name}</h3>
                    <p className="entity-card-subtitle mt-0.5">{vendor.display_id}</p>
                  </div>

                  {vendor.contact_person && (
                    <div className="text-sm">
                      <p className="entity-card-label mb-1">Contact Person</p>
                      <p className="font-medium text-foreground truncate">{vendor.contact_person}</p>
                    </div>
                  )}

                  {/* Contact info */}
                  <div className="space-y-1.5 text-sm">
                    {vendor.phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{vendor.phone}</span>
                      </div>
                    )}
                    {vendor.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-xs">{vendor.email}</span>
                      </div>
                    )}
                    {vendor.address && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-xs">{vendor.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Outstanding */}
                  <div className="entity-card-stat">
                    <p className="entity-card-label">Outstanding</p>
                    <p className={`font-bold text-lg ${Number(vendor.outstanding) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      ₹{Number(vendor.outstanding || 0).toLocaleString()}
                    </p>
                  </div>

  {/* Edit button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(vendor);
              }}
              aria-label={`Edit vendor ${vendor.name}`}
            >
              Edit Vendor
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {vendors.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No vendors found. Click "Add Vendor" to create your first vendor.
            </div>
          )}
        </div>
      ) : (
        <VirtualDataTable
          columns={columns}
          data={vendors}
          searchKey="name"
          searchPlaceholder="Search vendors..."
          onRowClick={(row) => navigate(`/vendors/${row.id}`)}
          height="calc(100vh - 240px)"
          renderMobileCard={(row: any) => (
            <div className={`entity-card-mobile ${!row.is_active ? "entity-card-inactive" : ""}`}>
              <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm text-foreground truncate">{row.name}</h3>
                  <StatusBadge status={row.is_active ? "active" : "inactive"} />
                </div>
                <p className="entity-card-subtitle">{row.display_id}</p>
                {row.contact_person && <p className="text-xs text-muted-foreground mt-0.5">{row.contact_person}</p>}
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-muted-foreground">Outstanding</span>
                  <span className={`font-bold text-sm ${Number(row.outstanding) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ₹{Number(row.outstanding || 0).toLocaleString()}
                  </span>
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

      {/* Add/Edit Vendor Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { setShowAdd(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVendor ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Vendor Name *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} required className="mt-1" />
              </div>
              <div>
                <Label>Contact Person</Label>
                <Input value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} className="mt-1" placeholder="+91 98765 43210" />
              </div>
              <div className="col-span-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Address</Label>
                <Textarea value={address} onChange={e => setAddress(e.target.value)} className="mt-1" rows={2} />
              </div>
              <div>
                <Label>GSTIN</Label>
                <Input value={gstin} onChange={e => setGstin(e.target.value)} className="mt-1" placeholder="22AAAAA0000A1Z5" />
              </div>
              <div>
                <Label>PAN</Label>
                <Input value={pan} onChange={e => setPan(e.target.value)} className="mt-1" placeholder="AAAAA0000A" />
              </div>
              <div>
                <Label>Payment Terms</Label>
                <Input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} className="mt-1" placeholder="Net 30 days" />
              </div>
              <div>
                <Label>Credit Limit (₹)</Label>
                <Input type="number" step="0.01" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} className="mt-1" placeholder="0" />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" rows={3} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => { setShowAdd(false); resetForm(); }} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingVendor ? "Update Vendor" : "Add Vendor"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Vendors;
