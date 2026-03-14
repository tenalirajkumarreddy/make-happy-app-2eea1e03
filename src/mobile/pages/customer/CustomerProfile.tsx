import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Loader2, Phone, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveCustomer } from "@/lib/resolveCustomer";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface CustomerRow {
  id: string;
  name: string;
  display_id: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  kyc_status: string;
  kyc_rejection_reason: string | null;
}

interface StoreRow {
  id: string;
  name: string;
  outstanding: number;
}

export function CustomerProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openKyc, setOpenKyc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [aadharFront, setAadharFront] = useState<File | null>(null);
  const [aadharBack, setAadharBack] = useState<File | null>(null);

  const { data: customer, isLoading } = useQuery({
    queryKey: ["mobile-customer-profile", user?.id],
    queryFn: async () => (await resolveCustomer(user!.id, "id, name, display_id, phone, email, address, kyc_status, kyc_rejection_reason")) as CustomerRow | null,
    enabled: !!user,
  });

  const { data: stores } = useQuery({
    queryKey: ["mobile-customer-profile-stores", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, outstanding")
        .eq("customer_id", customer!.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data as StoreRow[]) || [];
    },
    enabled: !!customer,
  });

  const { data: customerCare } = useQuery({
    queryKey: ["mobile-customer-profile-care"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("value")
        .eq("key", "customer_care_number")
        .maybeSingle();
      if (error) throw error;
      return data?.value || "";
    },
  });

  const uploadFile = async (file: File, label: string) => {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user!.id}/${label}-${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from("kyc-documents").upload(path, file);
    if (error) throw error;
    return data.path;
  };

  const handleSubmitKyc = async () => {
    if (!customer) return;
    if (!selfie || !aadharFront || !aadharBack) {
      toast.error("Upload selfie and both Aadhaar images");
      return;
    }

    setSubmitting(true);
    try {
      const [selfiePath, frontPath, backPath] = await Promise.all([
        uploadFile(selfie, "selfie"),
        uploadFile(aadharFront, "aadhar-front"),
        uploadFile(aadharBack, "aadhar-back"),
      ]);

      const { error } = await supabase
        .from("customers")
        .update({
          kyc_selfie_url: selfiePath,
          kyc_aadhar_front_url: frontPath,
          kyc_aadhar_back_url: backPath,
          kyc_status: "pending",
          kyc_submitted_at: new Date().toISOString(),
        })
        .eq("id", customer.id);
      if (error) throw error;

      toast.success("KYC submitted for review");
      setOpenKyc(false);
      setSelfie(null);
      setAadharFront(null);
      setAadharBack(null);
      qc.invalidateQueries({ queryKey: ["mobile-customer-profile"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "KYC upload failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!customer) {
    return <div className="px-4 py-10 text-center text-sm text-muted-foreground">No profile data found.</div>;
  }

  const totalOutstanding = (stores || []).reduce((sum, store) => sum + Number(store.outstanding || 0), 0);

  return (
    <div className="px-4 pt-4 pb-6 space-y-3">
      <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-bold text-slate-900 dark:text-white">{customer.name}</p>
          {customer.kyc_status === "verified" && <CheckCircle className="h-4 w-4 text-emerald-500" />}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">{customer.display_id}</p>

        <div className="mt-3 space-y-2 text-sm">
          <InfoRow label="Phone" value={customer.phone || "—"} />
          <InfoRow label="Email" value={customer.email || "—"} />
          <InfoRow label="Address" value={customer.address || "—"} />
          <InfoRow label="KYC" value={customer.kyc_status.replace("_", " ")} />
        </div>

        {(customer.kyc_status === "not_requested" || customer.kyc_status === "rejected") && (
          <Button variant="outline" className="w-full mt-3 rounded-xl" onClick={() => setOpenKyc(true)}>
            <Upload className="h-4 w-4 mr-2" />
            {customer.kyc_status === "rejected" ? "Re-upload KYC" : "Submit KYC"}
          </Button>
        )}

        {customer.kyc_status === "rejected" && customer.kyc_rejection_reason && (
          <p className="text-xs text-red-500 mt-2">Reason: {customer.kyc_rejection_reason}</p>
        )}
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Stores Summary</p>
        <div className="mt-2 space-y-1.5 text-sm">
          <InfoRow label="Total Stores" value={String((stores || []).length)} />
          <InfoRow label="Outstanding" value={`₹${totalOutstanding.toLocaleString("en-IN")}`} />
        </div>
        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 space-y-1.5">
          {(stores || []).map((store) => (
            <div key={store.id} className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300 truncate">{store.name}</span>
              <span className="font-semibold">₹{Number(store.outstanding || 0).toLocaleString("en-IN")}</span>
            </div>
          ))}
          {(stores || []).length === 0 && <p className="text-xs text-muted-foreground text-center">No active stores</p>}
        </div>
      </div>

      {customerCare && (
        <button
          type="button"
          onClick={() => window.open(`tel:${customerCare}`, "_self")}
          className="w-full h-11 rounded-xl border border-primary/30 text-primary font-semibold text-sm flex items-center justify-center gap-2"
        >
          <Phone className="h-4 w-4" />
          Call Support
        </button>
      )}

      <Sheet open={openKyc} onOpenChange={setOpenKyc}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0 max-h-[88vh] overflow-y-auto">
          <div className="px-6">
            <SheetHeader className="mb-5 text-left">
              <SheetTitle className="text-lg font-bold">KYC Verification</SheetTitle>
            </SheetHeader>

            <div className="space-y-4">
              <div>
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">Live Selfie</Label>
                <Input type="file" accept="image/*" capture="user" onChange={(e) => setSelfie(e.target.files?.[0] || null)} />
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">Aadhaar Front</Label>
                <Input type="file" accept="image/*" onChange={(e) => setAadharFront(e.target.files?.[0] || null)} />
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">Aadhaar Back</Label>
                <Input type="file" accept="image/*" onChange={(e) => setAadharBack(e.target.files?.[0] || null)} />
              </div>

              <Button className="w-full h-11 rounded-xl" onClick={handleSubmitKyc} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit KYC
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 dark:text-slate-100 text-right">{value}</span>
    </div>
  );
}
