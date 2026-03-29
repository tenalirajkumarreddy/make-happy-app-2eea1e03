import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Shield, 
  Upload, 
  FileText, 
  CheckCircle, 
  Clock, 
  XCircle,
  Camera,
  Image,
  Trash2,
  AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Section, Card, Badge, Loading, EmptyState } from "../../components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const DOCUMENT_TYPES = [
  { value: "national_id", label: "National ID Card" },
  { value: "passport", label: "Passport" },
  { value: "drivers_license", label: "Driver's License" },
  { value: "business_license", label: "Business License" },
  { value: "utility_bill", label: "Utility Bill" },
];

export function CustomerKyc() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  // Fetch existing KYC documents
  const { data: documents, isLoading } = useQuery({
    queryKey: ["mobile-v2-kyc-documents", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      const { data, error } = await supabase
        .from("kyc_documents")
        .select("*")
        .eq("customer_id", profile.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Upload document mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!profile?.id || !selectedType) return;

      setUploading(true);

      // Upload file to storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${profile.id}/${selectedType}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("kyc-documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("kyc-documents")
        .getPublicUrl(fileName);

      // Create document record
      const { error: insertError } = await supabase
        .from("kyc_documents")
        .insert({
          customer_id: profile.id,
          document_type: selectedType,
          document_url: urlData.publicUrl,
          status: "pending",
        });

      if (insertError) throw insertError;

      // Update profile KYC status
      await supabase
        .from("profiles")
        .update({ kyc_status: "pending" })
        .eq("id", profile.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-v2-kyc-documents"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setSelectedType("");
      toast.success("Document uploaded successfully");
    },
    onError: () => {
      toast.error("Failed to upload document");
    },
    onSettled: () => {
      setUploading(false);
    },
  });

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase
        .from("kyc_documents")
        .delete()
        .eq("id", documentId)
        .eq("customer_id", profile?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-v2-kyc-documents"] });
      toast.success("Document deleted");
    },
    onError: () => {
      toast.error("Failed to delete document");
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!selectedType) {
      toast.error("Please select a document type first");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB");
      return;
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a JPG, PNG, WebP, or PDF file");
      return;
    }

    uploadMutation.mutate(file);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "verified": return CheckCircle;
      case "pending": return Clock;
      case "rejected": return XCircle;
      default: return AlertCircle;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "verified": return "success";
      case "pending": return "warning";
      case "rejected": return "danger";
      default: return "default";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "verified": return "text-green-600";
      case "pending": return "text-amber-600";
      case "rejected": return "text-red-600";
      default: return "text-muted-foreground";
    }
  };

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-32 mb-4" />
        <Loading.Skeleton className="h-24 mb-4" />
        {[1, 2].map(i => (
          <Loading.Skeleton key={i} className="h-20 mb-3" />
        ))}
      </div>
    );
  }

  const kycStatus = profile?.kyc_status || "not_submitted";
  const StatusIcon = getStatusIcon(kycStatus);

  return (
    <div className="mv2-page">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">KYC Verification</h1>
        <p className="text-sm text-muted-foreground">
          Upload documents to verify your identity
        </p>
      </div>

      {/* Status Card */}
      <Card className="mb-6 p-5">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
            kycStatus === "verified" 
              ? "bg-green-100 dark:bg-green-900/30" 
              : kycStatus === "pending"
                ? "bg-amber-100 dark:bg-amber-900/30"
                : kycStatus === "rejected"
                  ? "bg-red-100 dark:bg-red-900/30"
                  : "bg-muted"
          }`}>
            <StatusIcon className={`w-7 h-7 ${getStatusColor(kycStatus)}`} />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground">Verification Status</h2>
            <p className={`text-sm font-medium capitalize ${getStatusColor(kycStatus)}`}>
              {kycStatus.replace("_", " ")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {kycStatus === "verified" && "Your identity has been verified"}
              {kycStatus === "pending" && "Your documents are being reviewed"}
              {kycStatus === "rejected" && "Please upload new documents"}
              {kycStatus === "not_submitted" && "Please upload required documents"}
            </p>
          </div>
        </div>
      </Card>

      {/* Upload Section */}
      {kycStatus !== "verified" && (
        <Section title="Upload Document" className="mb-6">
          <Card variant="outline" className="p-4">
            <div className="space-y-4">
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="mv2-input">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="kyc-upload"
                  disabled={uploading || !selectedType}
                />
                <label
                  htmlFor="kyc-upload"
                  className={`cursor-pointer ${!selectedType ? "opacity-50" : ""}`}
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    {uploading ? (
                      <Loading.Spinner className="w-6 h-6" />
                    ) : (
                      <Upload className="w-6 h-6 text-primary" />
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {uploading ? "Uploading..." : "Tap to upload"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG, PNG, WebP or PDF (max 5MB)
                  </p>
                </label>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={uploading || !selectedType}
                  onClick={() => document.getElementById("kyc-upload")?.click()}
                >
                  <Image className="w-4 h-4 mr-2" />
                  Gallery
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={uploading || !selectedType}
                  onClick={() => document.getElementById("kyc-upload")?.click()}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Camera
                </Button>
              </div>
            </div>
          </Card>
        </Section>
      )}

      {/* Uploaded Documents */}
      <Section title="Uploaded Documents">
        {documents && documents.length > 0 ? (
          <div className="space-y-3">
            {documents.map((doc) => {
              const DocStatusIcon = getStatusIcon(doc.status);
              const typeLabel = DOCUMENT_TYPES.find(t => t.value === doc.document_type)?.label || doc.document_type;

              return (
                <Card key={doc.id} variant="outline" className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                      {doc.document_url?.includes(".pdf") ? (
                        <FileText className="w-6 h-6 text-muted-foreground" />
                      ) : (
                        <img 
                          src={doc.document_url} 
                          alt={typeLabel}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground truncate">
                          {typeLabel}
                        </p>
                        <Badge variant={getStatusVariant(doc.status)}>
                          <DocStatusIcon className="w-3 h-3 mr-1" />
                          {doc.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Uploaded {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                      {doc.rejection_reason && (
                        <p className="text-xs text-red-600 mt-1">
                          Reason: {doc.rejection_reason}
                        </p>
                      )}
                    </div>

                    {doc.status !== "verified" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(doc.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="No documents uploaded"
            description="Upload your identity documents to get verified"
          />
        )}
      </Section>

      {/* Help Text */}
      <Card variant="outline" className="mt-6 p-4 bg-muted/30">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Required Documents</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Valid government-issued ID (National ID, Passport, or Driver's License)</li>
              <li>Proof of address (Utility bill or Business license)</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
