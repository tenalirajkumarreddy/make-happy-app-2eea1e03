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
}

interface StoreRow {
  id: string;
  name: string;
  outstanding: number;
}

export function CustomerProfile() {
  const { user } = useAuth();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["mobile-customer-profile", user?.id],
    queryFn: async () => (await resolveCustomer(user!.id, "id, name, display_id, phone, email, address")) as CustomerRow | null,
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
        <p className="text-base font-bold text-slate-900 dark:text-white">{customer.name}</p>
        <p className="text-xs text-slate-500 mt-0.5">{customer.display_id}</p>

        <div className="mt-3 space-y-2 text-sm">
          <InfoRow label="Phone" value={customer.phone || "—"} />
          <InfoRow label="Email" value={customer.email || "—"} />
          <InfoRow label="Address" value={customer.address || "—"} />
        </div>
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
