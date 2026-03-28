import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, HandCoins, CheckCircle2, XCircle, ArrowRight, Clock, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { useMemo } from "react";

export function AdminHandovers() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: handovers, isLoading } = useQuery({
    queryKey: ["admin-mobile-handovers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("handovers")
        .select("id, user_id, handed_to, cash_amount, upi_amount, status, created_at, notes")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as any[]) || [];
    },
    refetchInterval: 60_000,
  });

  const { data: profiles } = useQuery({
    queryKey: ["admin-mobile-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name").eq("is_active", true);
      const map = new Map<string, string>();
      (data || []).forEach((p: any) => map.set(p.user_id, p.full_name || "Staff"));
      return map;
    },
  });

  const getName = (id: string) => {
    if (id === user?.id) return "You";
    return profiles?.get(id) || "Staff";
  };

  const pendingCount = useMemo(() => (handovers || []).filter((h: any) => h.status === "awaiting_confirmation").length, [handovers]);

  const statusConfig = (status: string) => {
    if (status === "confirmed") return {
      color: "emerald",
      bgClass: "bg-emerald-50 dark:bg-emerald-500/10",
      textClass: "text-emerald-700 dark:text-emerald-400",
      icon: CheckCircle2
    };
    if (status === "rejected") return {
      color: "red",
      bgClass: "bg-red-50 dark:bg-red-500/10",
      textClass: "text-red-700 dark:text-red-400",
      icon: XCircle
    };
    return {
      color: "amber",
      bgClass: "bg-amber-50 dark:bg-amber-500/10",
      textClass: "text-amber-700 dark:text-amber-400",
      icon: Clock
    };
  };

  const handleAction = async (id: string, action: "confirm" | "reject") => {
    const update = action === "confirm"
      ? { status: "confirmed", confirmed_by: user!.id, confirmed_at: new Date().toISOString() }
      : { status: "rejected", rejected_at: new Date().toISOString() };
    const { error } = await supabase.from("handovers").update(update).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(action === "confirm" ? "Handover confirmed" : "Handover rejected");
    qc.invalidateQueries({ queryKey: ["admin-mobile-handovers"] });
  };

  return (
    <div className="pb-8 bg-slate-50 dark:bg-[#0f1115] min-h-full">
      {/* Premium Hero Header */}
      <div className="bg-white dark:bg-[#1a1d24] px-5 pt-3 pb-6 rounded-b-[2rem] shadow-sm mb-6 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute top-10 -left-10 w-32 h-32 bg-purple-500/10 blur-3xl rounded-full pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-1">Cash Handovers</p>
          <h2 className="text-slate-900 dark:text-white text-5xl font-black tracking-tighter mt-1 mb-2">
            {handovers?.length ?? 0}
          </h2>
          <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 rounded-full mt-1 border border-amber-100 dark:border-amber-500/20">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              {pendingCount} Pending Action
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-4">
        <div className="flex items-center justify-between px-1 mt-4 mb-2">
          <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-100 tracking-tight">Recent Activity</h3>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : (handovers?.length ?? 0) === 0 ? (
           <div className="bg-white dark:bg-[#1a1d24] rounded-2xl py-12 text-center shadow-sm">
            <div className="h-14 w-14 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
              <HandCoins className="h-6 w-6 text-slate-300 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">No handovers found</p>
            <p className="text-xs text-slate-500 mt-1">There are no recent cash handover requests.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(handovers || []).map((h: any) => {
              const total = Number(h.cash_amount || 0) + Number(h.upi_amount || 0);
              const canAct = h.handed_to === user?.id && h.status === "awaiting_confirmation";
              const config = statusConfig(h.status);
              const StatusIcon = config.icon;
              
              return (
                <div 
                  key={h.id} 
                  className={cn(
                    "rounded-2xl shadow-sm p-4 transition-all relative overflow-hidden border",
                    canAct 
                      ? "bg-white dark:bg-[#1a1d24] border-indigo-200 dark:border-indigo-500/30 ring-1 ring-indigo-500/10 dark:ring-indigo-500/20" 
                      : "bg-white dark:bg-[#1a1d24] border-slate-100 dark:border-slate-800 border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                  )}
                >
                  {canAct && (
                    <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-indigo-500/10 to-transparent pointer-events-none" />
                  )}
                  
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 mb-1 bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate max-w-[100px]">{getName(h.user_id)}</p>
                          <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[100px]">{getName(h.handed_to)}</p>
                        </div>
                      </div>
                      
                      {h.notes && (
                        <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-2 flex items-start gap-1.5">
                          <Info className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="line-clamp-2 italic">"{h.notes}"</span>
                        </p>
                      )}
                    </div>
                    
                    <div className="text-right shrink-0">
                      <p className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                        ₹{total.toLocaleString("en-IN")}
                      </p>
                      <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md mt-1", config.bgClass, config.textClass)}>
                        <StatusIcon className="h-3 w-3" />
                        <span className="text-[9px] font-bold uppercase tracking-widest">{h.status.replaceAll("_", " ")}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800/50 flex flex-col gap-3">
                    <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      {format(new Date(h.created_at), "dd MMM yyyy • hh:mm a")}
                    </p>
                    
                    {canAct && (
                      <div className="flex items-center gap-3 pt-1">
                        <button 
                          onClick={() => handleAction(h.id, "reject")}
                          className="flex-1 h-11 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm border border-slate-200 dark:border-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          <XCircle className="h-4 w-4 text-slate-400" />
                          Reject
                        </button>
                        <button 
                          onClick={() => handleAction(h.id, "confirm")}
                          className="flex-1 h-11 rounded-xl bg-indigo-600 dark:bg-indigo-500 text-white font-bold text-sm shadow-md shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="h-4 w-4 text-indigo-200" />
                          Confirm
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
