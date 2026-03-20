import { useQuery } from "@tanstack/react-query";
import { Loader2, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveCustomer } from "@/lib/resolveCustomer";
import { useAuth } from "@/contexts/AuthContext";

interface CustomerRow {
  id: string;
  name: string;
  display_id: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  photo_url: string | null;
}

interface StoreRow {
  id: string;
  name: string;
  outstanding: number;
  auto_order_enabled: boolean | null; // Need to join store_types if per type, or check store override? 
  // Wait, auto_order is on store_types.
  store_type_id: string;
  store_types: {
      name: string;
      auto_order_enabled: boolean;
  } | null;
}

export function CustomerProfile() {
  const { user } = useAuth();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["mobile-customer-profile", user?.id],
    queryFn: async () => (await resolveCustomer(user!.id, "id, name, display_id, phone, email, address, photo_url")) as CustomerRow | null,
    enabled: !!user,
  });

  const { data: stores } = useQuery({
    queryKey: ["mobile-customer-profile-stores", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, outstanding, store_type_id, store_types(name, auto_order_enabled)")
        .eq("customer_id", customer!.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data as unknown as StoreRow[]) || [];
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
        <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-600">
                {customer.photo_url ? (
                    <img src={customer.photo_url} alt={customer.name} className="h-full w-full object-cover" />
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-slate-400 font-bold text-xl">
                        {customer.name.charAt(0)}
                    </div>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-slate-900 dark:text-white truncate">{customer.name}</p>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">{customer.display_id}</p>
            </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 space-y-2 text-sm">
            <div className="flex justify-between py-1">
                <span className="text-slate-500">Phone</span>
                <span className="font-medium text-slate-900 dark:text-slate-200">{customer.phone || "-"}</span>
            </div>
            <div className="flex justify-between py-1">
                <span className="text-slate-500">Email</span>
                <span className="font-medium text-slate-900 dark:text-slate-200">{customer.email || "-"}</span>
            </div>
            <div className="flex justify-between py-1">
                <span className="text-slate-500">Address</span>
                <span className="font-medium text-slate-900 dark:text-slate-200 text-right max-w-[60%]">{customer.address || "-"}</span>
            </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="px-1 text-sm font-bold text-slate-500 uppercase tracking-wider">Stores Summary</h3>
        {stores?.map((store) => (
            <div key={store.id} className="rounded-xl bg-white dark:bg-slate-800 p-4 border border-slate-100 dark:border-slate-700 shadow-sm flex justify-between items-center">
                <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">{store.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{store.store_types?.name || "Unknown Type"}</p>
                    {store.store_types?.auto_order_enabled && (
                       <span className="mt-1.5 inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                         Auto Order: ON
                       </span>
                    )}
                </div>
                <div className="text-right">
                    <p className="text-xs text-slate-500">Outstanding</p>
                    <p className={`text-sm font-bold ${Number(store.outstanding) > 0 ? "text-red-600" : "text-slate-700 dark:text-slate-300"}`}>
                        ₹{store.outstanding?.toLocaleString("en-IN") || "0"}
                    </p>
                </div>
            </div>
        ))}
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
