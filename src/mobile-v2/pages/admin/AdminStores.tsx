import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Store, 
  Search, 
  MapPin,
  Phone,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Plus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Section, Card, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function AdminStores() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: stores, isLoading } = useQuery({
    queryKey: ["mobile-v2-admin-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          id,
          display_id,
          business_name,
          full_name,
          phone,
          address,
          outstanding_balance,
          kyc_status,
          is_active,
          created_at
        `)
        .eq("role", "customer")
        .order("business_name", { ascending: true })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
  });

  const filteredStores = stores?.filter(store => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      store.business_name?.toLowerCase().includes(search) ||
      store.full_name?.toLowerCase().includes(search) ||
      store.display_id?.toLowerCase().includes(search) ||
      store.address?.toLowerCase().includes(search)
    );
  });

  // Stats
  const totalOutstanding = stores?.reduce((sum, s) => sum + (s.outstanding_balance || 0), 0) || 0;
  const verifiedStores = stores?.filter(s => s.kyc_status === "verified").length || 0;
  const activeStores = stores?.filter(s => s.is_active !== false).length || 0;

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-12 mb-4" />
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Loading.Skeleton className="h-20" />
          <Loading.Skeleton className="h-20" />
          <Loading.Skeleton className="h-20" />
        </div>
        {[1, 2, 3, 4].map(i => (
          <Loading.Skeleton key={i} className="h-24 mb-3" />
        ))}
      </div>
    );
  }

  return (
    <div className="mv2-page">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Stores</h1>
          <p className="text-sm text-muted-foreground">
            {stores?.length || 0} registered stores
          </p>
        </div>
        <Button size="sm" className="mv2-btn-primary">
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search stores..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 mv2-input"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-primary">
            {activeStores}
          </p>
          <p className="text-xs text-muted-foreground">Active</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-green-600">
            {verifiedStores}
          </p>
          <p className="text-xs text-muted-foreground">Verified</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-amber-600">
            {formatCurrency(totalOutstanding)}
          </p>
          <p className="text-xs text-muted-foreground">Outstanding</p>
        </Card>
      </div>

      {/* Stores List */}
      <Section title="All Stores">
        {filteredStores && filteredStores.length > 0 ? (
          <div className="space-y-3">
            {filteredStores.map((store) => {
              const hasBalance = (store.outstanding_balance || 0) > 0;
              const isVerified = store.kyc_status === "verified";

              return (
                <Card 
                  key={store.id} 
                  variant="outline" 
                  className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/admin/stores/${store.id}`)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      hasBalance ? "bg-amber-100 dark:bg-amber-900/30" : "bg-primary/10"
                    }`}>
                      <Store className={`w-6 h-6 ${
                        hasBalance ? "text-amber-600" : "text-primary"
                      }`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground truncate">
                          {store.business_name || store.full_name || "Store"}
                        </p>
                        {isVerified && (
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {store.display_id || store.id.slice(0, 8)}
                      </p>

                      {store.address && (
                        <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{store.address}</span>
                        </div>
                      )}

                      {store.phone && (
                        <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                          <Phone className="w-3 h-3" />
                          <span>{store.phone}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {hasBalance && (
                        <Badge variant="warning" className="text-xs">
                          {formatCurrency(store.outstanding_balance || 0)}
                        </Badge>
                      )}
                      {!store.is_active && (
                        <Badge variant="danger" className="text-xs">Inactive</Badge>
                      )}
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Store}
            title="No stores found"
            description="Stores will appear here"
          />
        )}
      </Section>
    </div>
  );
}
