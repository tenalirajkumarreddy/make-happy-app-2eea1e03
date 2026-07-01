import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { User, Mail, Phone, Shield, ShieldCheck } from "lucide-react";

export function AdminProfile() {
  const { user, role, profile } = useAuth();

  const { data: extraProfile } = useQuery({
    queryKey: ["admin-mobile-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const roleLabel: Record<string, string> = {
    super_admin: "Super Admin",
    manager: "Manager",
    agent: "Field Agent",
    marketer: "Marketer",
    pos: "POS Operator",
  };

  return (
    <div className="pb-8 bg-slate-50 dark:bg-[#0f1115] min-h-full">
      {/* Premium Hero Header with Profile Image */}
      <div className="bg-white dark:bg-[#1a1d24] px-5 pt-8 pb-10 rounded-b-[2rem] shadow-sm mb-6 relative overflow-hidden flex flex-col items-center text-center">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute top-20 -left-20 w-48 h-48 bg-purple-500/10 blur-3xl rounded-full pointer-events-none" />
        
        <div className="relative z-10 w-28 h-28 relative mb-4">
          <div className="w-full h-full rounded-full bg-gradient-to-tr from-violet-600 to-purple-500 p-1">
            <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden border-2 border-white dark:border-slate-900">
               <span className="text-4xl font-black bg-gradient-to-br from-violet-600 to-purple-500 text-transparent bg-clip-text">
                  {(profile?.full_name ?? "U").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
               </span>
            </div>
          </div>
          <div className="absolute bottom-0 right-1 h-8 w-8 bg-emerald-500 border-4 border-white dark:border-[#1a1d24] rounded-full flex items-center justify-center">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
        </div>
        
        <div className="relative z-10">
          <h2 className="text-slate-900 dark:text-white text-2xl font-black tracking-tight">{profile?.full_name ?? "User"}</h2>
          <div className="inline-flex items-center gap-1.5 bg-violet-50 dark:bg-violet-500/10 px-3 py-1.5 rounded-full mt-2 border border-violet-100 dark:border-violet-500/20">
            <Shield className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            <span className="text-xs font-bold text-violet-700 dark:text-violet-400 tracking-wide uppercase">
              {roleLabel[role ?? ""] ?? role ?? "Staff"}
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 space-y-6">
        <div className="bg-white dark:bg-[#1a1d24] rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 p-2 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800/50">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Personal Information</h3>
          </div>
          <div className="p-2 space-y-1">
            <InfoRow icon={User} label="Full Name" value={profile?.full_name ?? extraProfile?.full_name ?? "Not set"} />
            <InfoRow icon={Mail} label="Email" value={user?.email ?? extraProfile?.email ?? "Not set"} />
            <InfoRow icon={Phone} label="Phone Number" value={extraProfile?.phone ?? "Not set"} />
          </div>
        </div>
        
        <div className="bg-white dark:bg-[#1a1d24] rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 p-2 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800/50">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Account System Details</h3>
          </div>
          <div className="p-2 space-y-1">
             <InfoRow icon={Shield} label="Access Level" value={roleLabel[role ?? ""] ?? role ?? "Staff"} />
             <div className="flex items-center gap-4 p-3 rounded-2xl">
               <div className="min-w-0 flex-1">
                 <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">User ID</p>
                 <p className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                    {user?.id ?? "Unknown"}
                 </p>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">{label}</p>
        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{value}</p>
      </div>
    </div>
  );
}
