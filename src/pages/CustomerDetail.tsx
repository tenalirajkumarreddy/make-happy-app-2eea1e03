import { useParams, useNavigate } from "react-router-dom";
import { formatDate } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, ArrowLeft, Store, User, Pencil, X, Save, AlertTriangle,
  Shield, CheckCircle2, XCircle, ExternalLink, Upload, Camera, Receipt, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { CustomerStatement } from "@/components/reports/CustomerStatement";

const CustomerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const canEdit = role === "super_admin" || role === "manager";
  const isCustomer = role === "customer";

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [kycSaving, setKycSaving] = useState(false);
  const [uploadingKyc, setUploadingKyc] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    gst_number: "",
  });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: stores } = useQuery({
    queryKey: ["customer-stores", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("*, store_types(name), routes(name)")
        .eq("customer_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: customerTxns } = useQuery({
    queryKey: ["customer-transactions", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, display_id, total_amount, cash_amount, upi_amount, created_at, stores(name)")
        .eq("customer_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["customer", id] });
    qc.invalidateQueries({ queryKey: ["customers"] });
  };

  const startEditing = () => {
    if (!customer || !customer.is_active) return;
    setForm({
      name: customer.name || "",
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      gst_number: customer.gst_number || "",
    });
    setPhotoUrl(customer.photo_url || null);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    const { error } = await supabase
      .from("customers")
      .update({
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        gst_number: form.gst_number || null,
        photo_url: photoUrl || null,
      })
      .eq("id", id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Customer updated");
    setEditing(false);
    invalidateAll();
  };

  const handleToggleActive = async () => {
    if (!customer || !id) return;
    const newVal = !customer.is_active;
    setToggling(true);
    const { error } = await supabase.from("customers").update({ is_active: newVal }).eq("id", id);
    if (error) { toast.error(error.message); setToggling(false); return; }

    if (!newVal && stores && stores.length > 0) {
      const storeIds = stores.map((s) => s.id);
      const { error: storeError } = await supabase.from("stores").update({ is_active: false }).in("id", storeIds);
      if (storeError) toast.error("Customer deactivated but failed to deactivate stores");
      else toast.success(`Customer deactivated along with ${storeIds.length} store(s)`);
    } else {
      toast.success(`Customer ${newVal ? "activated" : "deactivated"}`);
    }

    setToggling(false);
    setEditing(false);
    invalidateAll();
    qc.invalidateQueries({ queryKey: ["customer-stores", id] });
    qc.invalidateQueries({ queryKey: ["stores"] });
  };

  // KYC actions
  const handleKycApprove = async () => {
    if (!customer || !user) return;
    setKycSaving(true);
    const { error } = await supabase.from("customers").update({
      kyc_status: "verified",
      kyc_verified_at: new Date().toISOString(),
      kyc_verified_by: user.id,
      kyc_rejection_reason: null,
    }).eq("id", customer.id);
    setKycSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("KYC approved");
      logActivity(user.id, "Approved KYC", "customer", customer.name, customer.id);
      invalidateAll();
    }
  };

  const handleKycReject = async () => {
    if (!customer || !user) return;
    if (!rejectionReason.trim()) { toast.error("Please provide a rejection reason"); return; }
    setKycSaving(true);
    const { error } = await supabase.from("customers").update({
      kyc_status: "rejected",
      kyc_rejection_reason: rejectionReason,
      kyc_verified_by: user.id,
    }).eq("id", customer.id);
    setKycSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("KYC rejected");
      logActivity(user.id, "Rejected KYC", "customer", customer.name, customer.id);
      setRejectionReason("");
      invalidateAll();
    }
  };

  const uploadKycFile = async (file: File, field: "kyc_selfie_url" | "kyc_aadhar_front_url" | "kyc_aadhar_back_url") => {
    if (!customer) return;
    setUploadingKyc(true);
    const ext = file.name.split(".").pop();
    const path = `${customer.id}/${field}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("kyc-documents").upload(path, file, { upsert: true });
    if (uploadError) { toast.error("Upload failed: " + uploadError.message); setUploadingKyc(false); return; }

    const updateData: any = { [field]: path };
    // If all three docs will be present after this upload, set status to pending
    const currentDocs = {
      kyc_selfie_url: customer.kyc_selfie_url,
      kyc_aadhar_front_url: customer.kyc_aadhar_front_url,
      kyc_aadhar_back_url: customer.kyc_aadhar_back_url,
      [field]: path,
    };
    if (currentDocs.kyc_selfie_url && currentDocs.kyc_aadhar_front_url && currentDocs.kyc_aadhar_back_url) {
      updateData.kyc_status = "pending";
      updateData.kyc_submitted_at = new Date().toISOString();
    }

    const { error } = await supabase.from("customers").update(updateData).eq("id", customer.id);
    setUploadingKyc(false);
    if (error) toast.error(error.message);
    else { toast.success("Document uploaded"); invalidateAll(); }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!customer) {
    return <div className="text-center py-20 text-muted-foreground">Customer not found</div>;
  }

  const isInactive = !customer.is_active;
  const totalOutstanding = stores?.reduce((s, r) => s + Number(r.outstanding), 0) || 0;

  const storeColumns = [
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs", hideOnMobile: true },
    { header: "Name", accessor: "name" as const, className: "font-medium" },
    { header: "Type", accessor: (row: any) => row.store_types?.name || "—", className: "hidden sm:table-cell" },
    { header: "Route", accessor: (row: any) => row.routes?.name || "—", className: "hidden md:table-cell" },
    { header: "Outstanding", accessor: (row: any) => `₹${Number(row.outstanding).toLocaleString()}`, className: "font-semibold" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
  ];

  const kycStatus = customer.kyc_status || "not_requested";
  const kycLabel = kycStatus.replace("_", " ");

  const getDocUrl = (path: string | null) => {
    if (!path) return null;
    const { data } = supabase.storage.from("kyc-documents").getPublicUrl(path);
    return data.publicUrl;
  };

  const kycDocs = [
    { label: "Selfie", field: "kyc_selfie_url" as const, url: customer.kyc_selfie_url },
    { label: "Aadhar Front", field: "kyc_aadhar_front_url" as const, url: customer.kyc_aadhar_front_url },
    { label: "Aadhar Back", field: "kyc_aadhar_back_url" as const, url: customer.kyc_aadhar_back_url },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => navigate("/customers")} className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
        <ArrowLeft className="h-4 w-4" /> Customers
      </Button>

      {isInactive && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">This customer is inactive</p>
            <p className="text-xs text-muted-foreground mt-0.5">Activate the customer to resume operations.</p>
          </div>
        </div>
      )}

      {/* Profile Card */}
      <Card className={`overflow-hidden ${isInactive ? "opacity-75" : ""}`}>
        <div className="h-16 sm:h-20 bg-gradient-to-r from-primary/20 via-accent/30 to-primary/10" />
        <CardContent className="relative px-4 sm:px-6 pb-5 -mt-8 sm:-mt-10">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl border-4 border-card bg-muted flex items-center justify-center overflow-hidden shadow-md shrink-0">
              {customer.photo_url ? (
                <img src={customer.photo_url} alt={customer.name} loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <User className="h-8 w-8 text-muted-foreground/40" />
              )}
            </div>
            <div className="flex-1 min-w-0 sm:pb-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">{customer.name}</h1>
                <StatusBadge status={customer.is_active ? "active" : "inactive"} />
              </div>
              <p className="text-xs text-muted-foreground font-mono">{customer.display_id}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {canEdit && (
                <>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="cust-toggle" className="text-xs text-muted-foreground">{customer.is_active ? "Active" : "Inactive"}</Label>
                    <Switch id="cust-toggle" checked={customer.is_active} onCheckedChange={handleToggleActive} disabled={toggling} />
                  </div>
                  {!isInactive && (
                    !editing ? (
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => setShowStatement(true)} className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Statement</Button>
                        <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}><X className="h-4 w-4" /></Button>
                        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                        </Button>
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          </div>

          <Separator className="my-3" />

          {editing ? (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <ImageUpload folder="customers" currentUrl={photoUrl} onUploaded={setPhotoUrl} onRemoved={() => setPhotoUrl(null)} />
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">GST Number</Label><Input value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} /></div>
                  <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-2">
              <InfoItem label="Phone" value={customer.phone || "Not provided"} />
              <InfoItem label="Email" value={customer.email || "Not provided"} />
              <InfoItem label="Address" value={customer.address || "Not provided"} />
              <InfoItem label="GST" value={customer.gst_number || "—"} />
              <InfoItem label="Joined" value={formatDate(customer.created_at)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Stores</p>
          <p className="text-xl font-bold">{stores?.length || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total Outstanding</p>
          <p className={`text-xl font-bold ${totalOutstanding > 0 ? "text-destructive" : ""}`}>₹{totalOutstanding.toLocaleString()}</p>
        </Card>
      </div>

      {/* KYC Section */}
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" /> KYC Verification
            </h2>
            <Badge variant={kycStatus === "verified" ? "default" : kycStatus === "pending" ? "secondary" : kycStatus === "rejected" ? "destructive" : "outline"}>
              {kycLabel}
            </Badge>
          </div>

          {kycStatus === "rejected" && customer.kyc_rejection_reason && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs text-destructive font-medium">Rejection reason</p>
              <p className="text-sm text-destructive/80 mt-0.5">{customer.kyc_rejection_reason}</p>
            </div>
          )}

          {/* Documents grid */}
          <div className="grid grid-cols-3 gap-3">
            {kycDocs.map((doc) => (
              <KycDocCard
                key={doc.field}
                label={doc.label}
                url={doc.url}
                getPublicUrl={getDocUrl}
                canUpload={isCustomer || canEdit}
                uploading={uploadingKyc}
                onUpload={(file) => uploadKycFile(file, doc.field)}
              />
            ))}
          </div>

          {/* Approve/Reject for admin/manager when status is pending */}
          {canEdit && kycStatus === "pending" && (
            <div className="space-y-3 pt-2 border-t">
              <div>
                <Label className="text-xs">Rejection Reason (if rejecting)</Label>
                <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="mt-1" placeholder="Blurry photo, name mismatch..." rows={2} />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleKycApprove} disabled={kycSaving} className="flex-1" size="sm">
                  {kycSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                  Approve
                </Button>
                <Button onClick={handleKycReject} disabled={kycSaving} variant="destructive" className="flex-1" size="sm">
                  {kycSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1.5 h-3.5 w-3.5" />}
                  Reject
                </Button>
              </div>
            </div>
          )}

          {kycStatus === "verified" && customer.kyc_verified_at && (
            <p className="text-xs text-muted-foreground">
              Verified on {formatDate(customer.kyc_verified_at)}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stores */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Store className="h-4 w-4 text-muted-foreground" /> Stores
        </h2>
        {(stores?.length || 0) === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-muted-foreground text-sm">No stores yet</div>
        ) : (
          <DataTable columns={storeColumns} data={stores || []} searchKey="name" searchPlaceholder="Search stores..." onRowClick={(row) => navigate(`/stores/${row.id}`)} />
        )}
      </div>

      {/* Payment History */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" /> Payment History
          {customerTxns && customerTxns.length > 0 && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">({customerTxns.length})</span>
          )}
        </h2>
        {(customerTxns?.length || 0) === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-muted-foreground text-sm">No payments recorded</div>
        ) : (
          <DataTable
            columns={[
              { header: "Payment ID", accessor: "display_id" as const, className: "font-mono text-xs" },
              { header: "Store", accessor: (row: any) => (row.stores as any)?.name || "—", className: "font-medium" },
              { header: "Total", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
              { header: "Cash", accessor: (row: any) => `₹${Number(row.cash_amount).toLocaleString()}`, className: "text-sm hidden md:table-cell" },
              { header: "UPI", accessor: (row: any) => `₹${Number(row.upi_amount).toLocaleString()}`, className: "text-sm hidden md:table-cell" },
              { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), className: "text-muted-foreground text-xs" },
            ]}
            data={customerTxns || []}
            searchKey="display_id"
            searchPlaceholder="Search payments..."
          />
        )}
      </div>

      {/* Customer Statement Modal */}
      {showStatement && customer && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm overflow-y-auto">
          <div className="container max-w-4xl py-6">
            <CustomerStatement
              customerId={customer.id}
              customerName={customer.name}
              onClose={() => setShowStatement(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium text-foreground truncate">{value}</p>
    </div>
  );
}

function KycDocCard({
  label, url, getPublicUrl, canUpload, uploading, onUpload,
}: {
  label: string;
  url: string | null;
  getPublicUrl: (path: string | null) => string | null;
  canUpload: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const publicUrl = getPublicUrl(url);

  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-center space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      {publicUrl ? (
        <div className="space-y-1.5">
          <img src={publicUrl} alt={label} loading="lazy" className="w-full h-16 object-cover rounded" />
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
            View <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ) : canUpload ? (
        <>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }} />
          <Button variant="outline" size="sm" className="w-full text-[11px] h-7" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
            Upload
          </Button>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">Not uploaded</p>
      )}
    </div>
  );
}

export default CustomerDetail;
