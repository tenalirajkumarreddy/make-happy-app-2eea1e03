import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  ShoppingBag, 
  Search, 
  Filter, 
  Calendar,
  Package,
  ChevronRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Section, Card, ListItem, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CustomerSales() {
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  const { data: sales, isLoading } = useQuery({
    queryKey: ["mobile-v2-customer-sales", profile?.id, statusFilter, dateFilter],
    queryFn: async () => {
      if (!profile?.id) return [];

      let query = supabase
        .from("sales")
        .select(`
          id,
          display_id,
          total_amount,
          status,
          payment_type,
          created_at,
          notes,
          sale_items:sale_items(
            id,
            quantity,
            unit_price,
            product:products(name)
          )
        `)
        .eq("customer_id", profile.id)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
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

  const filteredSales = sales?.filter(sale => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      sale.display_id?.toLowerCase().includes(search) ||
      sale.sale_items?.some(item => 
        item.product?.name?.toLowerCase().includes(search)
      )
    );
  });

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed": return "success";
      case "pending": return "warning";
      case "cancelled": return "danger";
      default: return "default";
    }
  };

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-12 mb-4" />
        <Loading.Skeleton className="h-12 mb-4" />
        {[1, 2, 3].map(i => (
          <Loading.Skeleton key={i} className="h-24 mb-3" />
        ))}
      </div>
    );
  }

  return (
    <div className="mv2-page">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">My Purchases</h1>
        <p className="text-sm text-muted-foreground">View your purchase history</p>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID or product..."
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

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">
            {filteredSales?.length || 0}
          </p>
          <p className="text-sm text-muted-foreground">Total Purchases</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">
            {formatCurrency(
              filteredSales?.reduce((sum, s) => sum + (s.total_amount || 0), 0) || 0
            )}
          </p>
          <p className="text-sm text-muted-foreground">Total Amount</p>
        </Card>
      </div>

      {/* Sales List */}
      <Section title="Purchase History">
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
                  <Badge variant={getStatusVariant(sale.status || "pending")}>
                    {sale.status}
                  </Badge>
                </div>

                {/* Items Preview */}
                <div className="space-y-2 mb-3">
                  {sale.sale_items?.slice(0, 2).map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <span className="text-foreground">
                          {item.product?.name || "Product"}
                        </span>
                        <span className="text-muted-foreground">×{item.quantity}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {formatCurrency(item.unit_price * item.quantity)}
                      </span>
                    </div>
                  ))}
                  {(sale.sale_items?.length || 0) > 2 && (
                    <p className="text-xs text-muted-foreground">
                      +{sale.sale_items!.length - 2} more items
                    </p>
                  )}
                </div>

                {/* Total */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <span className="font-medium text-foreground">Total</span>
                  <span className="font-bold text-lg text-primary">
                    {formatCurrency(sale.total_amount || 0)}
                  </span>
                </div>

                {/* Payment Type */}
                {sale.payment_type && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="px-2 py-0.5 bg-secondary rounded">
                      {sale.payment_type}
                    </span>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ShoppingBag}
            title="No purchases found"
            description={searchQuery ? "Try adjusting your search" : "Your purchase history will appear here"}
          />
        )}
      </Section>
    </div>
  );
}
