import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, CreditCard } from "lucide-react";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";

const VendorPayments = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [vendorId, setVendorId] = useState(location.state?.vendorId || "");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["vendor_payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_payments")
        .select("*, vendors(name, display_id)")
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-with-outstanding"],
    queryFn: async () => {
      const { data } = await supabase
        .from("vendors")
        .select("id, name, display_id, outstanding")
        .eq("is_active", true);
      return data || [];
    },
  });

  const selectedVendor = vendors.find((v: any) => v.id === vendorId);

  const resetForm = () => {
    setVendorId(location.state?.vendorId || "");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setAmount("");
    setPaymentMethod("cash");
    setPaymentReference("");
    setNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const paymentAmount = parseFloat(amount);
      
      if (paymentAmount <= 0) {
        toast.error("Amount must be greater than zero");
        setSaving(false);
        return;
      }

      // Generate display ID
      const { data: idData } = await supabase.rpc("generate_display_id", {
        prefix: "VPY",
        seq_name: "vendor_payments_display_id_seq"
      });

      // Create payment
      const { error } = await supabase
        .from("vendor_payments")
        .insert({
          display_id: idData,
          vendor_id: vendorId,
          payment_date: paymentDate,
          amount: paymentAmount,
          payment_method: paymentMethod,
          payment_reference: paymentReference.trim() || null,
          notes: notes.trim() || null,
          status: "completed",
          created_by: user!.id
        });

      if (error) throw error;

      toast.success("Payment recorded successfully");
      logActivity(user!.id, `Recorded payment ${idData}`, "vendor_payment");
      
      qc.invalidateQueries({ queryKey: ["vendor_payments"] });
      qc.invalidateQueries({ queryKey: ["vendors"] });
      qc.invalidateQueries({ queryKey: ["vendor-payments"] });
      
      setShowAdd(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Date", accessor: (row: any) => new Date(row.payment_date).toLocaleDateString("en-IN"), className: "text-sm" },
    { header: "Vendor", accessor: (row: any) => row.vendors?.name || "—", className: "text-sm font-medium" },
    { 
      header: "Method", 
      accessor: (row: any) => (
        <Badge variant="outline" className="capitalize">
          {row.payment_method.replace("_", " ")}
        </Badge>
      )
    },
    { header: "Reference", accessor: (row: any) => row.payment_reference || "—", className: "text-xs text-muted-foreground font-mono" },
    { header: "Amount", accessor: (row: any) => `₹${Number(row.amount).toLocaleString()}`, className: "font-semibold text-green-600" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.status === "completed" ? "active" : row.status as any} label={row.status} /> },
  ];

  if (isLoading) {
    return <TableSkeleton columns={7} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Vendor Payments"
        subtitle="Record payments made to vendors"
        primaryAction={{ label: "Record Payment", onClick: () => { resetForm(); setShowAdd(true); }, icon: CreditCard }}
      />

      <DataTable
        columns={columns}
        data={payments}
        searchKey="display_id"
        searchPlaceholder="Search payments..."
        emptyMessage="No payments recorded yet"
        renderMobileCard={(row: any) => (
          <div className="entity-card-mobile">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
              <CreditCard className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm truncate">{row.vendors?.name || "Unknown Vendor"}</h3>
                  <p className="entity-card-subtitle">{row.display_id}</p>
                </div>
                <StatusBadge status={row.status === "completed" ? "active" : row.status as any} label={row.status} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{new Date(row.payment_date).toLocaleDateString("en-IN")}</span>
                  <Badge variant="outline" className="capitalize text-[10px] h-5">{row.payment_method}</Badge>
                </div>
                <span className="font-bold text-green-600">₹{Number(row.amount).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      />

      {/* Record Payment Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { setShowAdd(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Vendor Payment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Vendor *</Label>
              <Select value={vendorId} onValueChange={setVendorId} required>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{v.name} ({v.display_id})</span>
                        {v.outstanding > 0 && (
                          <span className="ml-4 text-xs text-red-600">
                            Outstanding: ₹{Number(v.outstanding).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedVendor && selectedVendor.outstanding > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Current outstanding balance: <span className="font-semibold text-red-600">₹{Number(selectedVendor.outstanding).toLocaleString()}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Payment Date *</Label>
                <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required className="mt-1" />
              </div>
              <div>
                <Label>Amount (₹) *</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  min="0.01"
                  value={amount} 
                  onChange={e => setAmount(e.target.value)} 
                  required 
                  className="mt-1" 
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <Label>Payment Method *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod} required>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Payment Reference</Label>
              <Input 
                value={paymentReference} 
                onChange={e => setPaymentReference(e.target.value)} 
                className="mt-1" 
                placeholder="Cheque #, UPI Ref, Transaction ID, etc."
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" rows={3} placeholder="Add any notes about this payment..." />
            </div>

            {selectedVendor && amount && parseFloat(amount) > 0 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-900 mb-2">Payment Summary</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-green-700">Current Outstanding:</span>
                    <span className="font-semibold text-red-600">₹{Number(selectedVendor.outstanding).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700">Payment Amount:</span>
                    <span className="font-semibold text-green-600">₹{parseFloat(amount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-green-300">
                    <span className="font-semibold text-green-900">New Outstanding:</span>
                    <span className={`font-bold ${(selectedVendor.outstanding - parseFloat(amount)) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      ₹{(selectedVendor.outstanding - parseFloat(amount)).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => { setShowAdd(false); resetForm(); }} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record Payment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendorPayments;
