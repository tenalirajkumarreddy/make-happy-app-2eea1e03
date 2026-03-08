import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { KycReviewDialog } from "@/components/customers/KycReviewDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";
import { Loader2 } from "lucide-react";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const Customers = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [kycCustomer, setKycCustomer] = useState<any>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const canReviewKyc = role === "super_admin" || role === "manager";
  const canBulk = role === "super_admin" || role === "manager";

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*, stores(id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const count = (customers?.length || 0) + 1;
    const displayId = `CUST-${String(count).padStart(6, "0")}`;

    const { error } = await supabase.from("customers").insert({
      display_id: displayId,
      name,
      phone: phone || null,
      email: email || null,
      address: address || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Customer added");
      logActivity(user!.id, "Added customer", "customer", name);
      setShowAdd(false);
      setName(""); setPhone(""); setEmail(""); setAddress("");
      qc.invalidateQueries({ queryKey: ["customers"] });
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === (customers?.length || 0)) {
      setSelected(new Set());
    } else {
      setSelected(new Set(customers?.map((c) => c.id) || []));
    }
  };

  const handleBulkStatus = async (active: boolean) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("customers").update({ is_active: active }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} customers ${active ? "activated" : "deactivated"}`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["customers"] });
  };

  const columns = [
    ...(canBulk ? [{
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
    }] : []),
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Name", accessor: "name" as const, className: "font-medium cursor-pointer text-primary hover:underline" },
    { header: "Phone", accessor: (row: any) => row.phone || "—", className: "text-muted-foreground text-sm" },
    { header: "Stores", accessor: (row: any) => row.stores?.length || 0, className: "text-center" },
    { header: "Outstanding", accessor: (row: any) => `₹${Number(row.opening_balance).toLocaleString()}` },
    { header: "KYC", accessor: (row: any) => (
      <button onClick={() => canReviewKyc && row.kyc_status !== "not_requested" ? setKycCustomer(row) : null} className={canReviewKyc && row.kyc_status !== "not_requested" ? "cursor-pointer hover:opacity-80" : ""}>
        <StatusBadge status={row.kyc_status === "verified" ? "verified" : row.kyc_status === "pending" ? "pending" : row.kyc_status === "rejected" ? "rejected" : "inactive"} label={row.kyc_status.replace("_", " ")} />
      </button>
    )},
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.is_active ? "active" : "inactive"} /> },
  ];

  if (isLoading) {
    return <TableSkeleton columns={7} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Customers"
        subtitle="Manage customer accounts and KYC verification"
        actionLabel="Add Customer"
        onAction={() => setShowAdd(true)}
      />

      {/* Bulk actions bar */}
      {canBulk && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-accent/50 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button variant="outline" size="sm" onClick={() => handleBulkStatus(true)}>Activate</Button>
          <Button variant="outline" size="sm" onClick={() => handleBulkStatus(false)}>Deactivate</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <DataTable columns={columns} data={customers || []} searchKey="name" searchPlaceholder="Search customers..." onRowClick={(row) => navigate(`/customers/${row.id}`)} />

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} required className="mt-1" /></div>
            <div><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} className="mt-1" placeholder="+91 98765 43210" /></div>
            <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" /></div>
            <div><Label>Address</Label><Input value={address} onChange={e => setAddress(e.target.value)} className="mt-1" /></div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Customer
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <KycReviewDialog
        customer={kycCustomer}
        open={!!kycCustomer}
        onOpenChange={(open) => { if (!open) setKycCustomer(null); }}
        onDone={() => { setKycCustomer(null); qc.invalidateQueries({ queryKey: ["customers"] }); }}
      />
    </div>
  );
};

export default Customers;