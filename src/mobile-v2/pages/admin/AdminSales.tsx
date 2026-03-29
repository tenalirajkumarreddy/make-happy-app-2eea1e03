import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  ShoppingBag, 
  Search, 
  Filter, 
  Calendar,
  Store,
  User
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Section, Card, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AdminSales() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  const { data: sales, isLoading } = useQuery({
    queryKey: ["mobile-v2-admin-sales", statusFilter, dateFilter],
    queryFn: async () => {
      let query = supabase
        .from("sales")
        .select(`
          id,
          display_id,
          total_amount,
          status,
          payment_type,
          created_at,
          customer:profiles!customer_id(business_name, full_name),
          agent:profiles!agent_id(full_name)
        `)
        .order("created_at", { ascending: false })
        .limit(50);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

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
  });

  const filteredSales = sales?.filter(sale => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      sale.display_id?.toLowerCase().includes(search) ||
      sale.customer?.business_name?.toLowerCase().includes(search) ||
      sale.customer?.full_name?.toLowerCase().includes(search)
    );
  });

  // Stats
  const totalAmount = filteredSales?.reduce((sum, s) => sum + (s.total_amount || 0), 0) || 0;
  const completedCount = filteredSales?.filter(s => s.status === "completed").length || 0;

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-12 mb-4" />
        <Loading.Skeleton className="h-12 mb-4" />
        {[1, 2, 3, 4].map(i => (
          <Loading.Skeleton key={i} className="h-24 mb-3" />
        ))}
      </div>
    );
  }

  return (
    <div className="mv2-page">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Sales</h1>
        <p className="text-sm text-muted-foreground">All sales transactions</p>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 mv2-input"
          />
        </div>

        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 mv2-input">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
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

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">
            {filteredSales?.length || 0}
          </p>
          <p className="text-sm text-muted-foreground">Total Sales</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(totalAmount)}
          </p>
          <p className="text-sm text-muted-foreground">Total Amount</p>
        </Card>
      </div>

      {/* Sales List */}
      <Section title="Sales List">
        {filteredSales && filteredSales.length > 0 ? (
          <div className="space-y-3">
            {filteredSales.map((sale) => (
              <Card key={sale.id} variant="outline" className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {sale.display_id || `#${sale.id.slice(0, 8)}`}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(sale.created_at)}
                    </p>
                  </div>
                  <Badge 
                    variant={
                      sale.status === "completed" ? "success" : 
                      sale.status === "pending" ? "warning" : 
                      "danger"
                    }
                  >
                    {sale.status}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground">
                      {sale.customer?.business_name || sale.customer?.full_name || "Customer"}
                    </span>
                  </div>
                  {sale.agent && (
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Agent: {sale.agent.full_name}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">
                    {sale.payment_type || "Cash"}
                  </span>
                  <span className="font-bold text-lg text-primary">
                    {formatCurrency(sale.total_amount || 0)}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ShoppingBag}
            title="No sales found"
            description="Sales will appear here"
          />
        )}
      </Section>
    </div>
  );
}
