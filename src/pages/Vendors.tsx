import { PageHeader } from "@/components/shared/PageHeader";
import { VirtualDataTable } from "@/components/shared/VirtualDataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useInfiniteQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Users, Phone, Mail, MapPin, Plus, Building2 } from "lucide-react";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";

const Vendors = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
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
    queryKey: ["vendors"],
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
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
        name: name.trim(),
        contact_person: contactPerson.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        gstin: gstin.trim() || null,
        pan: pan.trim() || null,
        payment_terms: paymentTerms.trim() || "Net 30 days",
        credit_limit: creditLimit ? parseFloat(creditLimit) : 0,
        notes: notes.trim() || null,
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
          ₹{Number(row.outstanding).toLocaleString()}
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
        subtitle="Manage vendor accounts and payments"
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {vendors.map((vendor: any) => (
              <div
                key={vendor.id}
                onClick={() => navigate(`/vendors/${vendor.id}`)}
                className={`group rounded-xl border bg-card shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer ${!vendor.is_active ? "opacity-60" : ""}`}
              >
                {/* Header */}
                <div className="relative h-24 bg-gradient-to-br from-purple-500/10 to-purple-500/5 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                    <Building2 className="h-8 w-8 text-purple-600" />
                  </div>
                  <div className="absolute top-2 right-2">
                    <StatusBadge status={vendor.is_active ? "active" : "inactive"} />
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="font-semibold text-lg text-foreground truncate">{vendor.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{vendor.display_id}</p>
                  </div>

                  {vendor.contact_person && (
                    <div className="text-sm">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Contact Person</p>
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
                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Outstanding</p>
                      <p className={`font-bold text-lg ${Number(vendor.outstanding) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ₹{Number(vendor.outstanding).toLocaleString()}
                      </p>
                    </div>
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
            <div className={`rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow ${!row.is_active ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm text-foreground truncate">{row.name}</h3>
                  <p className="text-xs text-muted-foreground font-mono">{row.display_id}</p>
                  {row.contact_person && <p className="text-xs text-muted-foreground mt-1">{row.contact_person}</p>}
                </div>
                <StatusBadge status={row.is_active ? "active" : "inactive"} />
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <span className="text-xs text-muted-foreground">Outstanding</span>
                <span className={`font-bold ${Number(row.outstanding) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₹{Number(row.outstanding).toLocaleString()}
                </span>
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
