import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Upload, CheckCircle, Phone } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";

const CustomerProfile = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showKyc, setShowKyc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kycConsent, setKycConsent] = useState(false);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [aadharFront, setAadharFront] = useState<File | null>(null);
  const [aadharBack, setAadharBack] = useState<File | null>(null);

  const { data: customer, isLoading } = useQuery({
    queryKey: ["my-customer", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").eq("user_id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: stores } = useQuery({
    queryKey: ["my-stores", customer?.id],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("*, store_types(name)").eq("customer_id", customer!.id);
      return data || [];
    },
    enabled: !!customer,
  });

  const { data: settings } = useQuery({
    queryKey: ["company-settings-care"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("*").eq("key", "customer_care_number").single();
      return data;
    },
  });

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selfie || !aadharFront || !aadharBack) { toast.error("Upload all 3 documents"); return; }
    if (!kycConsent) { toast.error("Please provide consent"); return; }
    setSaving(true);

    const uploadFile = async (file: File, name: string) => {
      const path = `${user!.id}/${name}-${Date.now()}.${file.name.split(".").pop()}`;
      const { data, error } = await supabase.storage.from("kyc-documents").upload(path, file);
      if (error) throw error;
      return data.path;
    };

    try {
      const [selfieUrl, frontUrl, backUrl] = await Promise.all([
        uploadFile(selfie, "selfie"),
        uploadFile(aadharFront, "aadhar-front"),
        uploadFile(aadharBack, "aadhar-back"),
      ]);

      await supabase.from("customers").update({
        kyc_selfie_url: selfieUrl,
        kyc_aadhar_front_url: frontUrl,
        kyc_aadhar_back_url: backUrl,
        kyc_status: "pending",
        kyc_submitted_at: new Date().toISOString(),
      }).eq("id", customer!.id);

      toast.success("KYC documents submitted for verification!");
      setShowKyc(false);
      qc.invalidateQueries({ queryKey: ["my-customer"] });
      logActivity(user!.id, "Submitted KYC", "customer", customer!.name, customer!.id);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    }
    setSaving(false);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!customer) return null;

  const totalOutstanding = stores?.reduce((s, st) => s + Number(st.outstanding), 0) || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="My Profile" subtitle="Personal info and account settings" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Personal Information
              {customer.kyc_status === "verified" && <CheckCircle className="h-4 w-4 text-success" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{customer.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Customer ID</span>
              <span className="font-mono text-xs">{customer.display_id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Phone</span>
              <span>{customer.phone || "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span>{customer.email || "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Address</span>
              <span className="text-right max-w-[200px]">{customer.address || "—"}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground">KYC Status</span>
              <StatusBadge status={customer.kyc_status === "verified" ? "active" : customer.kyc_status as any} label={customer.kyc_status.replace("_", " ")} />
            </div>
            {(customer.kyc_status === "not_requested" || customer.kyc_status === "rejected") && (
              <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => setShowKyc(true)}>
                <Upload className="mr-2 h-4 w-4" />
                {customer.kyc_status === "rejected" ? "Re-upload KYC" : "Submit KYC"}
              </Button>
            )}
            {customer.kyc_status === "rejected" && customer.kyc_rejection_reason && (
              <p className="text-xs text-destructive">Reason: {customer.kyc_rejection_reason}</p>
            )}
          </CardContent>
        </Card>

        {/* Stores Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stores Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Stores</span>
              <span className="font-semibold">{stores?.length || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Outstanding</span>
              <span className="font-semibold text-warning">₹{totalOutstanding.toLocaleString()}</span>
            </div>
            <div className="border-t pt-3 space-y-2">
              {stores?.map((store) => (
                <div key={store.id} className="flex justify-between text-sm">
                  <span>{store.name}</span>
                  <span className="font-medium">₹{Number(store.outstanding).toLocaleString()}</span>
                </div>
              ))}
              {(!stores || stores.length === 0) && (
                <p className="text-xs text-muted-foreground text-center">No stores linked</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Call Agent */}
      {settings?.value && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium">Need Help?</p>
              <p className="text-xs text-muted-foreground">Contact customer care</p>
            </div>
            <Button variant="outline" asChild>
              <a href={`tel:${settings.value}`}>
                <Phone className="mr-2 h-4 w-4" />
                {settings.value}
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KYC Dialog */}
      <Dialog open={showKyc} onOpenChange={setShowKyc}>
        <DialogContent>
          <DialogHeader><DialogTitle>KYC Verification</DialogTitle></DialogHeader>
          <form onSubmit={handleKycSubmit} className="space-y-4">
            <div>
              <Label>Live Photo (Selfie)</Label>
              <Input type="file" accept="image/*" capture="user" onChange={(e) => setSelfie(e.target.files?.[0] || null)} className="mt-1" required />
            </div>
            <div>
              <Label>Aadhar Card (Front)</Label>
              <Input type="file" accept="image/*" onChange={(e) => setAadharFront(e.target.files?.[0] || null)} className="mt-1" required />
            </div>
            <div>
              <Label>Aadhar Card (Back)</Label>
              <Input type="file" accept="image/*" onChange={(e) => setAadharBack(e.target.files?.[0] || null)} className="mt-1" required />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox checked={kycConsent} onCheckedChange={(v) => setKycConsent(!!v)} id="kyc-consent" />
              <label htmlFor="kyc-consent" className="text-xs text-muted-foreground leading-tight">
                I consent to share my identity documents for verification purposes.
              </label>
            </div>
            <Button type="submit" className="w-full" disabled={saving || !kycConsent}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit for Verification
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerProfile;
