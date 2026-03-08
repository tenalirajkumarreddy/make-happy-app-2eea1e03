import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface KycReviewDialogProps {
  customer: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function KycReviewDialog({ customer, open, onOpenChange, onDone }: KycReviewDialogProps) {
  const { user } = useAuth();
  const [rejectionReason, setRejectionReason] = useState("");
  const [saving, setSaving] = useState(false);

  if (!customer) return null;

  const getPublicUrl = (path: string | null) => {
    if (!path) return null;
    const { data } = supabase.storage.from("kyc-documents").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleApprove = async () => {
    setSaving(true);
    const { error } = await supabase.from("customers").update({
      kyc_status: "verified",
      kyc_verified_at: new Date().toISOString(),
      kyc_verified_by: user!.id,
      kyc_rejection_reason: null,
    }).eq("id", customer.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("KYC approved");
      logActivity(user!.id, "Approved KYC", "customer", customer.name, customer.id);
      onDone();
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) { toast.error("Please provide a rejection reason"); return; }
    setSaving(true);
    const { error } = await supabase.from("customers").update({
      kyc_status: "rejected",
      kyc_rejection_reason: rejectionReason,
      kyc_verified_by: user!.id,
    }).eq("id", customer.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("KYC rejected");
      logActivity(user!.id, "Rejected KYC", "customer", customer.name, customer.id);
      onDone();
    }
  };

  const docs = [
    { label: "Selfie", url: customer.kyc_selfie_url },
    { label: "Aadhar Front", url: customer.kyc_aadhar_front_url },
    { label: "Aadhar Back", url: customer.kyc_aadhar_back_url },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>KYC Review — {customer.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Current Status:</span>
            <Badge variant={customer.kyc_status === "verified" ? "default" : customer.kyc_status === "pending" ? "secondary" : "destructive"}>
              {customer.kyc_status.replace("_", " ")}
            </Badge>
          </div>

          <div className="space-y-2">
            <Label>Uploaded Documents</Label>
            <div className="grid grid-cols-3 gap-3">
              {docs.map((doc) => (
                <div key={doc.label} className="rounded-lg border bg-muted/30 p-3 text-center space-y-2">
                  <p className="text-xs font-medium">{doc.label}</p>
                  {doc.url ? (
                    <a href={getPublicUrl(doc.url) || "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not uploaded</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {customer.kyc_status === "pending" && (
            <>
              <div>
                <Label>Rejection Reason (if rejecting)</Label>
                <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="mt-1" placeholder="Blurry photo, name mismatch..." />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleApprove} disabled={saving} className="flex-1">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Approve
                </Button>
                <Button onClick={handleReject} disabled={saving} variant="destructive" className="flex-1">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                  Reject
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
