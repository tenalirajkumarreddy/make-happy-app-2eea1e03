import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  CreditCard, 
  Search, 
  Filter, 
  Calendar,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Receipt
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Section, Card, StatCard, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CustomerTransactions() {
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["mobile-v2-customer-transactions", profile?.id, typeFilter, dateFilter],
    queryFn: async () => {
      if (!profile?.id) return [];

      let query = supabase
        .from("transactions")
        .select(`
          id,
          display_id,
          amount,
          type,
          description,
          created_at,
          reference_number,
          payment_method
        `)
        .eq("customer_id", profile.id)
        .order("created_at", { ascending: false });

      if (typeFilter !== "all") {
        query = query.eq("type", typeFilter);
      }

      // Date filtering
      if (dateFilter !== "all") {
        const now = new Date();
        let startDate: Date;
        
        switch (dateFilter) {
          case "today":
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
          case "week":
            startDate = new Date(now.setDate(now.getDate() - 7));
            break;
          case "month":
            startDate = new Date(now.setMonth(now.getMonth() - 1));
            break;
          default:
            startDate = new Date(0);
        }
        query = query.gte("created_at", startDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const filteredTransactions = transactions?.filter(txn => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      txn.display_id?.toLowerCase().includes(search) ||
      txn.description?.toLowerCase().includes(search) ||
      txn.reference_number?.toLowerCase().includes(search)
    );
  });

  // Calculate summary stats
  const totalPayments = transactions
    ?.filter(t => t.type === "payment")
    .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

  const totalCharges = transactions
    ?.filter(t => t.type !== "payment")
    .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-12 mb-4" />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Loading.Skeleton className="h-24" />
          <Loading.Skeleton className="h-24" />
        </div>
        {[1, 2, 3, 4].map(i => (
          <Loading.Skeleton key={i} className="h-20 mb-3" />
        ))}
      </div>
    );
  }

  return (
    <div className="mv2-page">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Transaction Ledger</h1>
        <p className="text-sm text-muted-foreground">View your payment history</p>
      </div>

      {/* Balance Card */}
      <Card className="mb-6 bg-gradient-to-br from-primary to-primary/80 text-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
            <Wallet className="w-6 h-6" />
          </div>
          <Badge className="bg-white/20 text-white border-0">
            Current Balance
          </Badge>
        </div>
        <p className="text-sm text-white/70">Outstanding Balance</p>
        <p className="text-3xl font-bold">
          {formatCurrency(profile?.outstanding_balance || 0)}
        </p>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard
          icon={TrendingDown}
          label="Total Payments"
          value={formatCurrency(totalPayments)}
          variant="success"
        />
        <StatCard
          icon={TrendingUp}
          label="Total Charges"
          value={formatCurrency(totalCharges)}
          variant="default"
        />
      </div>

      {/* Search & Filters */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 mv2-input"
          />
        </div>

        <div className="flex gap-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="flex-1 mv2-input">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="payment">Payments</SelectItem>
              <SelectItem value="sale">Sales</SelectItem>
              <SelectItem value="adjustment">Adjustments</SelectItem>
            </SelectContent>
          </Select>

          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="flex-1 mv2-input">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Transactions List */}
      <Section title="Transaction History">
        {filteredTransactions && filteredTransactions.length > 0 ? (
          <div className="space-y-3">
            {filteredTransactions.map((txn) => {
              const isPayment = txn.type === "payment";
              const Icon = isPayment ? ArrowDownRight : ArrowUpRight;
              const iconBg = isPayment ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30";
              const iconColor = isPayment ? "text-green-600" : "text-red-600";
              const amountColor = isPayment ? "text-green-600" : "text-red-600";

              return (
                <Card key={txn.id} variant="outline" className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${iconColor}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground truncate">
                          {txn.description || txn.type}
                        </p>
                        <span className={`font-bold ${amountColor}`}>
                          {isPayment ? "-" : "+"}{formatCurrency(txn.amount || 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-sm text-muted-foreground">
                          {formatDate(txn.created_at)}
                        </p>
                        {txn.payment_method && (
                          <Badge variant="secondary" className="text-xs">
                            {txn.payment_method}
                          </Badge>
                        )}
                      </div>
                      {txn.reference_number && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Ref: {txn.reference_number}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Receipt}
            title="No transactions found"
            description={searchQuery ? "Try adjusting your filters" : "Your transactions will appear here"}
          />
        )}
      </Section>
    </div>
  );
}
