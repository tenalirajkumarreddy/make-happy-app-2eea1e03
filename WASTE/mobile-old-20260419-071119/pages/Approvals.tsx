import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Eye, 
  Image as ImageIcon,
  IndianRupee,
  User,
  ArrowRightLeft,
  Filter,
  Upload,
  Camera,
  Trash2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";

export default function Approvals() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [sharedImage, setSharedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const isAdmin = ["super_admin", "manager"].includes(role || "");

  useEffect(() => {
    // Check for shared image data
    const sharedData = localStorage.getItem("shared_image_data");
    if (sharedData) {
      try {
        const parsed = JSON.parse(sharedData);
        if (parsed.data) {
          setSharedImage(parsed.data);
        }
      } catch (e) {
        console.error("Failed to parse shared image data", e);
      }
    }
  }, []);

  const clearSharedImage = () => {
    localStorage.removeItem("shared_image_data");
    setSharedImage(null);
  };

  // Fetch Expense Claims
  const { data: expenses, isLoading: loadingExpenses } = useQuery({
    queryKey: ["approvals-expenses"],
    queryFn: async () => {
      let query = supabase
        .from("expense_claims")
        .select(`
          *,
          profiles:user_id (full_name)
        `)
        .order("created_at", { ascending: false });

      if (!isAdmin) {
        query = query.eq("user_id", user?.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch P2P Transfers (Handovers with receipts)
  const { data: transfers, isLoading: loadingTransfers } = useQuery({
    queryKey: ["approvals-transfers"],
    queryFn: async () => {
      let query = supabase
        .from("handovers")
        .select(`
          *,
          sender:user_id (full_name),
          receiver:handed_to (full_name)
        `)
        .order("created_at", { ascending: false });

      if (!isAdmin) {
        query = query.or(`user_id.eq.${user?.id},handed_to.eq.${user?.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
  });

  const handleAction = async (table: "expense_claims" | "handovers", id: string, status: string, additionalData: any = {}) => {
    try {
      setIsUploading(true);
      const updateData: any = { ...additionalData, status };
      if (table === "expense_claims") {
        updateData.reviewed_by = user?.id;
        updateData.reviewed_at = new Date().toISOString();
      } else {
        if (status === "confirmed") {
          updateData.status = "confirmed";
          updateData.confirmed_by = user?.id;
          updateData.confirmed_at = new Date().toISOString();
        } else {
          updateData.status = "rejected";
        }
      }

      const { error } = await supabase
        .from(table)
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
      
      if (additionalData.receipt_url) {
        clearSharedImage();
      }

      toast.success(`Action processed successfully`);
      qc.invalidateQueries({ queryKey: [table === "expense_claims" ? "approvals-expenses" : "approvals-transfers"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleVerifyWithSharedImage = async (handoverId: string) => {
    if (!sharedImage) return;

    try {
      setIsUploading(true);
      
      // 1. Convert base64 to Blob
      const base64Data = sharedImage.split(',')[1] || sharedImage;
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      // 2. Upload to storage
      const fileName = `handover-verification-${handoverId}-${Date.now()}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(fileName);

      // 3. Update handover
      await handleAction("handovers", handoverId, "confirmed", { receipt_url: publicUrl });

    } catch (err: any) {
      toast.error("Failed to upload verification: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const config: any = {
      pending: "bg-amber-100 text-amber-700 border-amber-200",
      approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
      confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
      rejected: "bg-red-100 text-red-700 border-red-200",
      awaiting_confirmation: "bg-blue-100 text-blue-700 border-blue-200",
    };
    return (
      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border", config[status] || "bg-slate-100 text-slate-700")}>
        {status.replace("_", " ")}
      </span>
    );
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-[#0f1115] pb-24">
      {/* Header */}
      <div className="bg-white dark:bg-[#1a1d24] px-5 pt-8 pb-6 rounded-b-[2rem] shadow-sm mb-4">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Approvals</h1>
        <p className="text-slate-500 text-sm">Review expenses and transfers</p>
      </div>

      <div className="px-4">
        {/* Shared Image Context */}
        {sharedImage && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-4 rounded-2xl mb-6 animate-in slide-in-from-top duration-300">
            <div className="flex gap-4">
              <div className="h-20 w-16 bg-white rounded-lg overflow-hidden border border-blue-200 shrink-0 shadow-sm">
                <img src={sharedImage} className="w-full h-full object-cover" alt="Shared receipt" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-blue-900 dark:text-blue-100">Verify Receipt</h3>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">Select a pending transfer below to verify with this receipt.</p>
                <div className="flex gap-2 mt-3">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-7 text-[10px] gap-1 border-blue-200"
                    onClick={() => setPreviewImage(sharedImage)}
                  >
                    <Eye className="h-3 w-3" /> Preview
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 text-[10px] gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={clearSharedImage}
                  >
                    <Trash2 className="h-3 w-3" /> Clear
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <Tabs defaultValue={sharedImage ? "transfers" : "expenses"} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-xl">
            <TabsTrigger value="expenses" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Expenses</TabsTrigger>
            <TabsTrigger value="transfers" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Transfers</TabsTrigger>
          </TabsList>

          <TabsContent value="expenses">
            {loadingExpenses ? (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" /></div>
            ) : expenses?.length === 0 ? (
              <EmptyState title="No expenses found" />
            ) : (
              <div className="space-y-4">
                {expenses?.map((e: any) => (
                  <div key={e.id} className="bg-white dark:bg-[#1a1d24] p-4 rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-xs text-slate-400 font-medium">#{e.display_id}</p>
                        <h3 className="font-bold text-slate-900 dark:text-white">{(e.profiles as any)?.full_name || "Unknown"}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{e.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-violet-600">₹{e.amount}</p>
                        <StatusBadge status={e.status} />
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                      <p className="text-[10px] text-slate-400 font-medium">
                        {format(new Date(e.created_at), "dd MMM yyyy")}
                      </p>
                      <div className="flex gap-2">
                        {e.receipt_url && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 px-2 text-[11px] font-bold"
                            onClick={() => setPreviewImage(e.receipt_url)}
                          >
                            <ImageIcon className="h-3 w-3 mr-1" /> View Receipt
                          </Button>
                        )}
                        {isAdmin && e.status === "pending" && (
                          <>
                            <Button 
                              size="sm" 
                              className="h-8 px-2 bg-emerald-600 hover:bg-emerald-700 text-[11px] font-bold"
                              onClick={() => handleAction("expense_claims", e.id, "approved")}
                            >
                              Approve
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              className="h-8 px-2 text-[11px] font-bold"
                              onClick={() => handleAction("expense_claims", e.id, "rejected")}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="transfers">
            {loadingTransfers ? (
              <div className="flex justify-center py-12"><Loader2 className="animate-spin text-violet-600" /></div>
            ) : transfers?.length === 0 ? (
              <EmptyState title="No transfers found" />
            ) : (
              <div className="space-y-4">
                {transfers?.map((t: any) => {
                  const isRecipient = t.handed_to === user?.id;
                  const canConfirm = isRecipient && t.status === "pending";

                  return (
                    <div key={t.id} className="bg-white dark:bg-[#1a1d24] p-4 rounded-2xl border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-slate-700">{(t.sender as any)?.full_name}</span>
                            <ArrowRightLeft className="h-3 w-3 text-slate-300" />
                            <span className="text-xs font-bold text-slate-900">{(t.receiver as any)?.full_name}</span>
                          </div>
                          <p className="text-xs text-slate-500">{t.notes || "Funds Transfer"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-blue-600">₹{t.cash_amount}</p>
                          <StatusBadge status={t.status} />
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                        <p className="text-[10px] text-slate-400 font-medium">
                          {format(new Date(t.created_at), "dd MMM yyyy")}
                        </p>
                        <div className="flex gap-2">
                          {t.receipt_url && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 px-2 text-[11px] font-bold"
                              onClick={() => setPreviewImage(t.receipt_url)}
                            >
                              <ImageIcon className="h-3 w-3 mr-1" /> Preview
                            </Button>
                          )}
                          {canConfirm && (
                            <>
                              {sharedImage ? (
                                <Button 
                                  size="sm" 
                                  className="h-8 px-4 bg-blue-600 hover:bg-blue-700 text-[11px] font-bold"
                                  onClick={() => handleVerifyWithSharedImage(t.id)}
                                  disabled={isUploading}
                                >
                                  {isUploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                                  Verify with Receipt
                                </Button>
                              ) : (
                                <Button 
                                  size="sm" 
                                  className="h-8 px-2 bg-blue-600 hover:bg-blue-700 text-[11px] font-bold"
                                  onClick={() => handleAction("handovers", t.id, "confirmed")}
                                >
                                  Confirm
                                </Button>
                              )}
                              <Button 
                                size="sm" 
                                variant="destructive"
                                className="h-8 px-2 text-[11px] font-bold"
                                onClick={() => handleAction("handovers", t.id, "rejected")}
                                disabled={isUploading}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Image Preview Modal */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="p-1 sm:max-w-md bg-transparent border-none shadow-none">
          {previewImage && (
            <div className="relative rounded-2xl overflow-hidden bg-black/90">
              <img src={previewImage} alt="Receipt Preview" className="w-full h-auto object-contain max-h-[80vh]" />
              <div className="p-4 text-center">
                <Button onClick={() => setPreviewImage(null)} variant="secondary" className="rounded-full px-6">Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="py-20 flex flex-col items-center opacity-50">
      <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
        <Clock className="h-8 w-8 text-slate-300" />
      </div>
      <p className="text-slate-500 font-medium">{title}</p>
    </div>
  );
}

const Button = React.forwardRef<HTMLButtonElement, any>(({ className, variant, size, ...props }, ref) => {
  const variants: any = {
    default: "bg-slate-900 text-slate-50 hover:bg-slate-900/90",
    destructive: "bg-red-500 text-slate-50 hover:bg-red-500/90",
    outline: "border border-slate-200 bg-white hover:bg-slate-100 hover:text-slate-900",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-100/80",
    ghost: "hover:bg-slate-100 hover:text-slate-900",
    link: "text-slate-900 underline-offset-4 hover:underline",
  };
  const sizes: any = {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-md px-3",
    lg: "h-11 rounded-md px-8",
    icon: "h-10 w-10",
  };
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variants[variant || "default"],
        sizes[size || "default"],
        className
      )}
      {...props}
    />
  );
});
