import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Building, Phone, FileText, MapPin, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SETTINGS_KEYS = ["company_name", "customer_care_number", "gst_number", "address"] as const;

const CONFIG = {
  company_name: { label: "Company Name", icon: Building },
  customer_care_number: { label: "Customer Care Number", icon: Phone },
  gst_number: { label: "GST Number", icon: FileText },
  address: { label: "Company Address", icon: MapPin },
};

export function AdminSettings() {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ["admin-mobile-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("key, value");
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => { map[s.key] = s.value || ""; });
      setValues(map);
      return map;
    },
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const key of SETTINGS_KEYS) {
        if (values[key] !== undefined) {
          await supabase.from("company_settings").upsert({ key, value: values[key] }, { onConflict: "key" });
        }
      }
      toast.success("Settings saved successfully");
      qc.invalidateQueries({ queryKey: ["admin-mobile-settings"] });
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-8 bg-slate-50 dark:bg-[#0f1115] min-h-full">
      {/* Premium Hero Header */}
      <div className="bg-white dark:bg-[#1a1d24] px-5 pt-3 pb-6 rounded-b-[2rem] shadow-sm mb-6 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-zinc-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute top-10 -left-10 w-32 h-32 bg-slate-500/10 blur-3xl rounded-full pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center text-center mt-2">
          <div className="h-16 w-16 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-slate-200/50 dark:border-slate-700/50">
             <Settings2 className="h-8 w-8 text-slate-700 dark:text-slate-300" />
          </div>
          <h2 className="text-slate-900 dark:text-white text-3xl font-black tracking-tight">System Settings</h2>
          <p className="text-slate-500 dark:text-slate-400 text-[13px] font-medium mt-1">Manage global app configuration</p>
        </div>
      </div>

      <div className="px-5 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : (
          <div className="bg-white dark:bg-[#1a1d24] rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 p-2 overflow-hidden mb-8">
             <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 flex items-center gap-2">
               <Building className="h-5 w-5 text-slate-400" />
               <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Business Profile</h3>
             </div>
             
             <div className="p-4 space-y-5">
               {SETTINGS_KEYS.map((key) => {
                 const { label, icon: Icon } = CONFIG[key as keyof typeof CONFIG];
                 const isFocused = false; // Could add state for this if needed
                 
                 return (
                   <div key={key} className="relative">
                     <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                     </label>
                     <Input
                       value={values[key] || ""}
                       onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                       className="h-12 rounded-xl bg-slate-50 dark:bg-[#0f1115] border-transparent focus-visible:ring-1 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-600 focus-visible:border-slate-400 transition-all font-medium text-slate-900 dark:text-white"
                     />
                   </div>
                 );
               })}
             </div>
          </div>
        )}
        
        {!isLoading && (
          <div className="px-1 mt-6">
            <Button 
              onClick={handleSave} 
              disabled={saving} 
              className="w-full h-14 rounded-2xl bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-slate-200 dark:text-slate-900 text-white shadow-lg active:scale-[0.98] transition-all font-bold text-base gap-2"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Save All Changes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
