import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Calendar, Filter, TrendingUp, Wallet, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Section } from "../../components/ui/Section";
import { ListItem } from "../../components/ui/ListItem";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingCenter } from "../../components/ui/Loading";
import { Card } from "../../components/ui/Card";
import { StatCard } from "../../components/ui/StatCard";

type TabType = "sales" | "payments";

interface SaleRow {
  id: string;
  display_id: string;
  total_amount: number;
  cash_amount: number;
  upi_amount: number;
  credit_amount: number;
  created_at: string;
  stores: { name: string } | null;
}

interface TransactionRow {
  id: string;
  display_id: string;
  total_amount: number;
  cash_amount: number;
  upi_amount: number;
  created_at: string;
  stores: { name: string } | null;
}

export function AgentHistory() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("sales");
  const today = new Date().toISOString().split("T")[0];

  // Sales history
  const { data: sales, isLoading: loadingSales } = useQuery({
    queryKey: ["mobile-v2-agent-sales-history", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, display_id, total_amount, cash_amount, upi_amount, credit_amount, created_at, stores(name)")
        .eq("recorded_by", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data as SaleRow[]) || [];
    },
    enabled: !!user,
  });

  // Transactions history
  const { data: transactions, isLoading: loadingTx } = useQuery({
    queryKey: ["mobile-v2-agent-tx-history", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, display_id, total_amount, cash_amount, upi_amount, created_at, stores(name)")
        .eq("recorded_by", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data as TransactionRow[]) || [];
    },
    enabled: !!user,
  });

  // Today's totals
  const todaySales = sales?.filter(s => s.created_at.startsWith(today)) || [];
  const todayTx = transactions?.filter(t => t.created_at.startsWith(today)) || [];
  
  const todaySalesTotal = todaySales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const todayCollected = todayTx.reduce((sum, t) => sum + Number(t.cash_amount || 0) + Number(t.upi_amount || 0), 0);

  const isLoading = loadingSales || loadingTx;

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    }
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  if (isLoading) {
    return (
      <div className="mv2-page">
        <LoadingCenter />
      </div>
    );
  }

  return (
    <div className="mv2-page">
      <div className="mv2-page-content">
        {/* Today's Stats */}
        <div className="mv2-grid mv2-grid-cols-2 mv2-gap-3 mb-4">
          <StatCard 
            label="Today's Sales" 
            value={`₹${todaySalesTotal.toLocaleString("en-IN")}`}
            icon={TrendingUp}
          />
          <StatCard 
            label="Collected" 
            value={`₹${todayCollected.toLocaleString("en-IN")}`}
            icon={Wallet}
          />
        </div>

        {/* Tabs */}
        <div className="mv2-tabs mb-4">
          <button
            className={`mv2-tab ${activeTab === "sales" ? "active" : ""}`}
            onClick={() => setActiveTab("sales")}
          >
            Sales ({sales?.length || 0})
          </button>
          <button
            className={`mv2-tab ${activeTab === "payments" ? "active" : ""}`}
            onClick={() => setActiveTab("payments")}
          >
            Payments ({transactions?.length || 0})
          </button>
        </div>

        {/* Content */}
        {activeTab === "sales" ? (
          <Section title="Recent Sales">
            {!sales?.length ? (
              <Card padding="lg">
                <EmptyState
                  icon={History}
                  title="No Sales Yet"
                  description="Your recorded sales will appear here"
                />
              </Card>
            ) : (
              <div className="mv2-list">
                {sales.map((sale) => (
                  <ListItem
                    key={sale.id}
                    title={sale.display_id || "Sale"}
                    subtitle={sale.stores?.name || "Unknown store"}
                    meta={formatTime(sale.created_at)}
                    icon={ArrowUpRight}
                    iconBgClass="!bg-green-100 !text-green-600 dark:!bg-green-900/30 dark:!text-green-400"
                    badge={
                      <span className="text-sm font-semibold mv2-text-success">
                        +₹{Number(sale.total_amount).toLocaleString("en-IN")}
                      </span>
                    }
                    showArrow={false}
                  >
                    <div className="flex gap-2 mt-1.5">
                      {Number(sale.cash_amount) > 0 && (
                        <span className="text-[11px] mv2-text-muted">
                          Cash: ₹{Number(sale.cash_amount).toLocaleString("en-IN")}
                        </span>
                      )}
                      {Number(sale.upi_amount) > 0 && (
                        <span className="text-[11px] mv2-text-muted">
                          UPI: ₹{Number(sale.upi_amount).toLocaleString("en-IN")}
                        </span>
                      )}
                      {Number(sale.credit_amount) > 0 && (
                        <span className="text-[11px] mv2-text-warning">
                          Credit: ₹{Number(sale.credit_amount).toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>
                  </ListItem>
                ))}
              </div>
            )}
          </Section>
        ) : (
          <Section title="Recent Payments">
            {!transactions?.length ? (
              <Card padding="lg">
                <EmptyState
                  icon={History}
                  title="No Payments Yet"
                  description="Your recorded payments will appear here"
                />
              </Card>
            ) : (
              <div className="mv2-list">
                {transactions.map((tx) => (
                  <ListItem
                    key={tx.id}
                    title={tx.display_id || "Payment"}
                    subtitle={tx.stores?.name || "Unknown store"}
                    meta={formatTime(tx.created_at)}
                    icon={ArrowDownLeft}
                    iconBgClass="!bg-blue-100 !text-blue-600 dark:!bg-blue-900/30 dark:!text-blue-400"
                    badge={
                      <span className="text-sm font-semibold mv2-text-primary">
                        ₹{Number(tx.total_amount).toLocaleString("en-IN")}
                      </span>
                    }
                    showArrow={false}
                  >
                    <div className="flex gap-2 mt-1.5">
                      {Number(tx.cash_amount) > 0 && (
                        <span className="text-[11px] mv2-text-muted">
                          Cash: ₹{Number(tx.cash_amount).toLocaleString("en-IN")}
                        </span>
                      )}
                      {Number(tx.upi_amount) > 0 && (
                        <span className="text-[11px] mv2-text-muted">
                          UPI: ₹{Number(tx.upi_amount).toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>
                  </ListItem>
                ))}
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}
