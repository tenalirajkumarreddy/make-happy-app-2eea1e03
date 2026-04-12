import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, 
  Store, 
  ShoppingBag, 
  CreditCard, 
  TrendingUp,
  Package,
  Route,
  AlertCircle,
  ChevronRight,
  BarChart3,
  DollarSign
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard, Section, Card, ListItem, QuickAction, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";

export function AdminHome() {
  const { profile } = useAuth();
  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  });

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["mobile-v2-admin-dashboard"],
    queryFn: async () => {
      // Get today's date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [
        usersRes, 
        customersRes, 
        salesRes, 
        todaySalesRes,
        ordersRes,
        transactionsRes
      ] = await Promise.all([
        supabase.from("user_roles").select("id", { count: "exact" }).neq("role", "customer"),
        supabase.from("profiles").select("id", { count: "exact" }).eq("role", "customer"),
        supabase.from("sales").select("id, display_id, total_amount, created_at, status").order("created_at", { ascending: false }).limit(20),
        supabase.from("sales").select("id, total_amount").gte("created_at", today.toISOString()).lt("created_at", tomorrow.toISOString()),
        supabase.from("orders").select("id, total_amount, status, created_at, customer:profiles!customer_id(business_name)").order("created_at", { ascending: false }).limit(10),
        supabase.from("transactions").select("id, amount, type, created_at").order("created_at", { ascending: false }).limit(5),
      ]);

      const allSales = salesRes.data || [];
      const todaySales = todaySalesRes.data || [];
      const allOrders = ordersRes.data || [];

      const todayTotal = todaySales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
      const pendingOrders = allOrders.filter(o => o.status === "pending").length;

      return {
        recentSales: allSales.slice(0, 5),
        recentOrders: allOrders.slice(0, 5),
        recentTransactions: transactionsRes.data || [],
        stats: {
          totalStaff: usersRes.count || 0,
          totalCustomers: customersRes.count || 0,
          todaySales: todaySales.length,
          todayTotal,
          pendingOrders,
        },
      };
    },
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0b1120] p-4 text-white">
        <Loading.Skeleton className="h-32 mb-4 rounded-2xl bg-slate-800/50" />
        <Loading.Skeleton className="h-48 mb-4 rounded-2xl bg-slate-800/50" />
      </div>
    );
  }

  const stats = dashboardData?.stats;
  const firstName = (profile?.full_name || "Admin").split(" ")[0];

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 pb-24 font-sans">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-[#131d38] to-[#0b1120] px-5 pt-8 pb-10 rounded-b-3xl">
        <p className="text-slate-300 text-sm font-medium">{greeting},</p>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-2xl font-bold text-white">{firstName} 👋</h1>
        </div>
        <p className="text-slate-400 text-sm mt-1">Aqua Prime Admin</p>
      </div>

      <div className="px-4 -mt-6 space-y-4">
        {/* Main Stats Card */}
        <div className="bg-[#161e32] rounded-3xl p-5 shadow-lg border border-slate-800/50">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">OVERVIEW</p>
            <div className="bg-[#1e273e] px-3 py-1 rounded-lg border border-slate-700/50">
              <span className="text-sm font-medium text-slate-200">Today</span>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#1e273e] rounded-2xl p-3 border border-slate-700/50 flex flex-col justify-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                REVENUE
              </p>
              <p className="text-base font-bold text-white">₹{stats?.todayTotal?.toLocaleString('en-IN') || 0}</p>
            </div>
            
            <div className="bg-[#1e273e] rounded-2xl p-3 border border-slate-700/50 flex flex-col justify-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                SALES
              </p>
              <p className="text-base font-bold text-white">{stats?.todaySales || 0}</p>
            </div>

            <div className="bg-[#1e273e] rounded-2xl p-3 border border-slate-700/50 flex flex-col justify-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                STAFF
              </p>
              <p className="text-base font-bold text-white">{stats?.totalStaff || 0}</p>
            </div>
          </div>
        </div>

        {/* Quick Actions Card */}
        <div className="bg-[#161e32] rounded-3xl p-5 shadow-lg border border-slate-800/50">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">QUICK ACTIONS</p>
          
          <div className="grid grid-cols-4 gap-3 mb-5">
            <QuickActionButton icon={ShoppingBag} label="Sales" href="/admin/sales" />
            <QuickActionButton icon={Package} label="Orders" href="/admin/orders" />
            <QuickActionButton icon={Store} label="Stores" href="/admin/stores" />
            <QuickActionButton icon={Users} label="Users" href="/admin/customers" />
          </div>
          
          {(stats?.pendingOrders || 0) > 0 && (
            <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500/20 p-2 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-500">Pending Orders</p>
                  <p className="text-xs text-amber-500/70">{stats?.pendingOrders} orders require attention</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recent Sales Card */}
        <div className="bg-[#161e32] rounded-3xl p-5 shadow-lg border border-slate-800/50">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">RECENT SALES</p>
            <a href="/admin/sales" className="text-xs font-semibold text-blue-400">View all</a>
          </div>

          <div className="space-y-3">
            {dashboardData?.recentSales && dashboardData.recentSales.length > 0 ? (
              dashboardData.recentSales.map((sale) => (
                <div key={sale.id} className="bg-[#1e273e] rounded-2xl p-3 border border-slate-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-500/10 p-2.5 rounded-xl">
                      <ShoppingBag className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{sale.display_id || 'SALE'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{formatDate(sale.created_at)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">₹{sale.total_amount?.toLocaleString('en-IN') || 0}</p>
                    <span className={`text-[10px] uppercase font-bold tracking-wider ${
                      sale.status === 'completed' ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {sale.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">No recent sales</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActionButton({ icon: Icon, label, href }: { icon: any, label: string, href: string }) {
  return (
    <a href={href} className="flex flex-col items-center justify-center gap-2">
      <div className="bg-[#1e273e] border border-slate-700/50 w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm active:scale-95 transition-transform">
        <Icon className="w-6 h-6 text-blue-400" strokeWidth={1.5} />
      </div>
      <span className="text-[11px] font-semibold text-slate-300">{label}</span>
    </a>
  );
}
