import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Phone, ShoppingCart, Wallet, ClipboardList, UserCircle2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveCustomer } from "@/lib/resolveCustomer";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  selectedStoreId: string | null;
  onStoreChange: (storeId: string | null) => void;
  onOpenSales: () => void;
  onOpenOrders: () => void;
  onOpenTransactions: () => void;
  onOpenProfile: () => void;
  onOpenKyc?: () => void;
}

interface CustomerRow { id: string; name: string; display_id: string; kyc_status: string; }
interface StoreRow { id: string; name: string; outstanding: number; }
interface OrderRow { id: string; status: string; store_id: string; }
interface SaleRow { id: string; display_id: string; created_at: string; total_amount: number; cash_amount: number; upi_amount: number; store_id: string; stores: { name: string } | null; }

export function CustomerHome({ selectedStoreId, onStoreChange, onOpenSales, onOpenOrders, onOpenTransactions, onOpenProfile, onOpenKyc }: Props) {
  const { user, profile } = useAuth();

  const { data: customer } = useQuery({
    queryKey: ["mobile-customer-self", user?.id],
    queryFn: async () => (await resolveCustomer(user!.id, "id, name, display_id, kyc_status")) as CustomerRow | null,
    enabled: !!user,
  });

  const { data: stores } = useQuery({
    queryKey: ["mobile-customer-home-stores", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, name, outstanding")
        .eq("customer_id", customer!.id).eq("is_active", true).order("name");
      if (error) throw error;
      return (data as StoreRow[]) || [];
    },
    enabled: !!customer,
  });

  const { data: orders } = useQuery({
    queryKey: ["mobile-customer-home-orders", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("id, status, store_id")
        .eq("customer_id", customer!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data as OrderRow[]) || [];
    },
    enabled: !!customer,
  });

  const { data: sales, isLoading: loadingSales } = useQuery({
    queryKey: ["mobile-customer-home-sales", customer?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales")
        .select("id, display_id, created_at, total_amount, cash_amount, upi_amount, store_id, stores(name)")
        .eq("customer_id", customer!.id).order("created_at", { ascending: false }).limit(3);
      if (error) throw error;
      return (data as unknown as SaleRow[]) || [];
    },
    enabled: !!customer,
  });

  const { data: settings } = useQuery({
    queryKey: ["mobile-customer-care-setting"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("value")
        .eq("key", "customer_care_number").maybeSingle();
      if (error) throw error;
      return data?.value || "";
    },
  });

  const scopedOrders = useMemo(() => {
    if (!orders) return [];
    return selectedStoreId ? orders.filter(o => o.store_id === selectedStoreId) : orders;
  }, [orders, selectedStoreId]);

  const pendingOrders = scopedOrders.filter(o => o.status === "pending").length;

  const totalOutstanding = useMemo(() => {
    if (!stores) return 0;
    if (!selectedStoreId) return stores.reduce((s, st) => s + Number(st.outstanding || 0), 0);
    return Number(stores.find(st => st.id === selectedStoreId)?.outstanding || 0);
  }, [stores, selectedStoreId]);

  const currentStoreName = useMemo(() => {
    if (!selectedStoreId) return "All Stores";
    return stores?.find(st => st.id === selectedStoreId)?.name || "Store";
  }, [selectedStoreId, stores]);

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  };

  const firstName = (profile?.full_name ?? customer?.name ?? "Customer").split(" ")[0];

  if (!customer) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        Your account is not linked to a customer profile yet.
      </div>
    );
  }

  return (
    <div className="pb-6">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-7">
        <p className="text-blue-200 text-sm font-medium">{greeting()},</p>
        <h2 className="text-white text-2xl font-bold mt-0.5">{firstName} 👋</h2>
        <p className="text-blue-200/80 text-xs mt-1">{currentStoreName}</p>
      </div>

      <div className="px-4 -mt-4 space-y-3">
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">Store</p>
          <Select value={selectedStoreId ?? "all"} onValueChange={(v) => onStoreChange(v === "all" ? null : v)}>
            <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select store" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
              {(stores || []).map(st => <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Pending Orders" value={String(pendingOrders)} icon={ShoppingCart} color="from-amber-500 to-orange-600" />
          <MiniStat label="Outstanding" value={`₹${totalOutstanding.toLocaleString("en-IN")}`} icon={Wallet} color="from-red-500 to-rose-600" />
          <MiniStat label="KYC" value={String(customer.kyc_status || "not_requested").replace("_", " ")} icon={UserCircle2} color="from-blue-500 to-indigo-600" />
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">Quick Actions</p>
          <div className="grid grid-cols-4 gap-2">
            <QuickButton label="Sales" onClick={onOpenSales} icon={ClipboardList} color="from-blue-500 to-blue-600" />
            <QuickButton label="Order" onClick={onOpenOrders} icon={ShoppingCart} color="from-amber-500 to-orange-600" />
            <QuickButton label="Ledger" onClick={onOpenTransactions} icon={Wallet} color="from-emerald-500 to-green-600" />
            <QuickButton label="Profile" onClick={onOpenProfile} icon={UserCircle2} color="from-violet-500 to-purple-600" />
            {onOpenKyc && <QuickButton label="KYC" onClick={onOpenKyc} icon={ShieldCheck} color="from-sky-500 to-blue-600" />}
          </div>
          {settings && (
            <button type="button" className="mt-3 w-full h-9 rounded-xl border border-primary/30 text-primary text-sm font-semibold flex items-center justify-center gap-2"
              onClick={() => window.open(`tel:${settings}`, "_self")}>
              <Phone className="h-4 w-4" /> Call Support
            </button>
          )}
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Recent Sales</p>
            <button type="button" className="text-xs font-semibold text-blue-600" onClick={onOpenSales}>View all</button>
          </div>
          {loadingSales ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>
          ) : (sales?.length || 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No sales found</p>
          ) : (
            <div className="space-y-2 mt-2">
              {(sales || []).map(sale => (
                <div key={sale.id} className="rounded-xl border border-slate-100 dark:border-slate-700 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{sale.display_id}</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">₹{Number(sale.total_amount).toLocaleString("en-IN")}</p>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{sale.stores?.name || "Store"}</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Paid ₹{(Number(sale.cash_amount || 0) + Number(sale.upi_amount || 0)).toLocaleString("en-IN")} • {new Date(sale.created_at).toLocaleDateString("en-IN")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-1">
        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide leading-tight">{label}</p>
        <div className={cn("h-6 w-6 rounded-md bg-gradient-to-br flex items-center justify-center shrink-0", color)}>
          <Icon className="h-3 w-3 text-white" />
        </div>
      </div>
      <p className="text-sm font-bold text-slate-900 dark:text-white mt-1 line-clamp-1">{value}</p>
    </div>
  );
}

function QuickButton({ label, onClick, icon: Icon, color }: { label: string; onClick: () => void; icon: React.ElementType; color: string }) {
  return (
    <button type="button" onClick={onClick}
      className="h-16 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all">
      <div className={cn("h-6 w-6 rounded-md bg-gradient-to-br flex items-center justify-center", color)}>
        <Icon className="h-3 w-3 text-white" />
      </div>
      <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">{label}</span>
    </button>
  );
}
