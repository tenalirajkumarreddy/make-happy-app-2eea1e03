import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, CheckCircle2, Clock, XCircle, Camera, Image as ImageIcon, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type KycField = "kyc_selfie_url" | "kyc_aadhar_front_url" | "kyc_aadhar_back_url";

interface CustomerKycData {
  id: string;
  name: string;
  kyc_status: string | null;
  kyc_selfie_url: string | null;
  kyc_aadhar_front_url: string | null;
  kyc_aadhar_back_url: string | null;
  kyc_rejection_reason: string | null;
  kyc_submitted_at: string | null;
}

const DOC_FIELDS: { label: string; hint: string; field: KycField; icon: React.ReactNode }[] = [
  { label: "Selfie Photo", hint: "Clear face photo in good lighting", field: "kyc_selfie_url", icon: <Camera className="h-5 w-5" /> },
  { label: "Aadhaar Front", hint: "Front side showing name and number", field: "kyc_aadhar_front_url", icon: <FileText className="h-5 w-5" /> },
  { label: "Aadhaar Back", hint: "Back side showing address", field: "kyc_aadhar_back_url", icon: <FileText className="h-5 w-5" /> },
];

function StatusBadge({ status }: { status: string | null }) {
  if (!status || status === "not_requested") return <Badge variant="outline">Not submitted</Badge>;
  if (status === "pending") return <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">Under review</Badge>;
  if (status === "verified") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Verified</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function CustomerKyc() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState<KycField | null>(null);
  const fileRefs = {
    kyc_selfie_url: useRef<HTMLInputElement>(null),
    kyc_aadhar_front_url: useRef<HTMLInputElement>(null),
    kyc_aadhar_back_url: useRef<HTMLInputElement>(null),
  };

  const { data: customer, isLoading } = useQuery<CustomerKycData | null>({
    queryKey: ["customer-kyc", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, kyc_status, kyc_selfie_url, kyc_aadhar_front_url, kyc_aadhar_back_url, kyc_rejection_reason, kyc_submitted_at")
        .eq("linked_user_id", user!.id)
        .maybeSingle();
      return (data as CustomerKycData) || null;
    },
    enabled: !!user,
  });

  const uploadDoc = async (field: KycField, file: File) => {
    if (!customer) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("File too large. Max 10MB."); return; }
    const allowed = ["image/jpeg", "image/png", "image/heic", "image/webp"];
    if (!allowed.includes(file.type)) { toast.error("Only JPG, PNG, HEIC or WebP images allowed."); return; }

    setUploading(field);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${customer.id}/${field}_${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("kyc-documents")
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      toast.error("Upload failed: " + uploadErr.message);
      setUploading(null);
      return;
    }

    const { data: urlData } = supabase.storage.from("kyc-documents").getPublicUrl(path);

    const updated: Record<string, string | null> = { [field]: urlData.publicUrl };

    const current = {
      kyc_selfie_url: customer.kyc_selfie_url,
      kyc_aadhar_front_url: customer.kyc_aadhar_front_url,
      kyc_aadhar_back_url: customer.kyc_aadhar_back_url,
      [field]: urlData.publicUrl,
    };

    if (current.kyc_selfie_url && current.kyc_aadhar_front_url && current.kyc_aadhar_back_url) {
      updated.kyc_status = "pending";
      updated.kyc_submitted_at = new Date().toISOString();
    }

    const { error: dbErr } = await supabase.from("customers").update(updated).eq("id", customer.id);
    setUploading(null);

    if (dbErr) { toast.error("Failed to save: " + dbErr.message); return; }

    if (updated.kyc_status === "pending") {
      toast.success("All documents uploaded! Your KYC is now under review.");
    } else {
      toast.success("Document uploaded successfully.");
    }
    qc.invalidateQueries({ queryKey: ["customer-kyc"] });
    qc.invalidateQueries({ queryKey: ["mobile-customer"] });
  };

  const handleFileChange = (field: KycField) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadDoc(field, file);
    e.target.value = "";
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading KYC details…</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-6 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No customer account linked to your profile.</p>
      </div>
    );
  }

  const status = customer.kyc_status || "not_requested";
  const isVerified = status === "verified";
  const isPending = status === "pending";
  const isRejected = status === "rejected";
  const canUpload = !isPending && !isVerified;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 pb-24">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-4 pt-10 pb-5 safe-top">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">KYC Verification</p>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{customer.name}</h1>
        <div className="mt-2"><StatusBadge status={status} /></div>
      </div>

      <div className="px-4 py-5 space-y-4">
        {isVerified && (
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-4">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">KYC Verified</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">Your identity has been verified. You enjoy higher credit limits.</p>
            </div>
          </div>
        )}

        {isPending && (
          <div className="flex items-center gap-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-4">
            <Clock className="h-6 w-6 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300">Under Review</p>
              <p className="text-sm text-amber-600 dark:text-amber-400">Your documents have been submitted and are being reviewed by our team.</p>
            </div>
          </div>
        )}

        {isRejected && (
          <div className="flex items-center gap-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-4">
            <XCircle className="h-6 w-6 text-red-600 shrink-0" />
            <div>
              <p className="font-semibold text-red-800 dark:text-red-300">KYC Rejected</p>
              {customer.kyc_rejection_reason && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">{customer.kyc_rejection_reason}</p>
              )}
              <p className="text-xs text-red-500 mt-1">Please re-upload your documents below.</p>
            </div>
          </div>
        )}

        {!isVerified && !isPending && (
          <div className="rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-4 py-3">
            <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">Why complete KYC?</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Verified customers enjoy higher credit limits and faster order approvals.</p>
          </div>
        )}

        <div className="space-y-3">
          {DOC_FIELDS.map(({ label, hint, field, icon }) => {
            const hasDoc = !!customer[field];
            const isUploadingThis = uploading === field;
            const { data: publicUrlData } = customer[field]
              ? { data: { publicUrl: customer[field]! } }
              : supabase.storage.from("kyc-documents").getPublicUrl("");

            return (
              <div
                key={field}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 dark:border-slate-800">
                  <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", hasDoc ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500")}>
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900 dark:text-white">{label}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>
                  </div>
                  {hasDoc && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />}
                </div>

                {hasDoc && (
                  <div className="px-4 py-3">
                    <img
                      src={customer[field]!}
                      alt={label}
                      className="h-24 w-full object-cover rounded-xl border border-slate-100 dark:border-slate-700"
                    />
                  </div>
                )}

                {canUpload && (
                  <div className="px-4 py-3">
                    <input
                      ref={fileRefs[field]}
                      type="file"
                      accept="image/jpeg,image/png,image/heic,image/webp"
                      className="hidden"
                      onChange={handleFileChange(field)}
                    />
                    <Button
                      variant={hasDoc ? "outline" : "default"}
                      size="sm"
                      className="w-full h-10 rounded-xl"
                      onClick={() => fileRefs[field].current?.click()}
                      disabled={!!uploading}
                    >
                      {isUploadingThis ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</>
                      ) : hasDoc ? (
                        <><ImageIcon className="h-4 w-4 mr-2" />Replace</>
                      ) : (
                        <><Upload className="h-4 w-4 mr-2" />Upload</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {canUpload && (
          <p className="text-xs text-center text-slate-400 leading-relaxed px-4">
            Upload all three documents to submit your KYC for review. Files must be under 10MB each.
          </p>
        )}
      </div>
    </div>
  );
}
