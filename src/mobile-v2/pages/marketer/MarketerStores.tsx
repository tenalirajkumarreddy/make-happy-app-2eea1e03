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
  Package
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Section, Card, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";

export function MarketerStores() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: stores, isLoading } = useQuery({
    queryKey: ["mobile-v2-marketer-stores", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select(`
          id,
          business_name,
          full_name,
          phone,
          address,
          outstanding_balance,
          kyc_status,
          created_at
        `)
        .eq("assigned_marketer_id", profile.id)
        .eq("role", "customer")
        .order("business_name", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const filteredStores = stores?.filter(store => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      store.business_name?.toLowerCase().includes(search) ||
      store.full_name?.toLowerCase().includes(search) ||
      store.address?.toLowerCase().includes(search)
    );
  });

  // Calculate stats
  const totalOutstanding = stores?.reduce((sum, s) => sum + (s.outstanding_balance || 0), 0) || 0;
  const storesWithBalance = stores?.filter(s => (s.outstanding_balance || 0) > 0).length || 0;
  const verifiedStores = stores?.filter(s => s.kyc_status === "verified").length || 0;

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
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">My Stores</h1>
        <p className="text-sm text-muted-foreground">
          {stores?.length || 0} stores assigned to you
        </p>
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
            {stores?.length || 0}
          </p>
          <p className="text-xs text-muted-foreground">Total Stores</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-amber-600">
            {storesWithBalance}
          </p>
          <p className="text-xs text-muted-foreground">With Balance</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-green-600">
            {verifiedStores}
          </p>
          <p className="text-xs text-muted-foreground">Verified</p>
        </Card>
      </div>

      {/* Total Outstanding */}
      {totalOutstanding > 0 && (
        <Card className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Total Outstanding Balance
              </p>
              <p className="text-lg font-bold text-amber-900 dark:text-amber-100">
                {formatCurrency(totalOutstanding)}
              </p>
            </div>
          </div>
        </Card>
      )}

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
                  onClick={() => navigate(`/marketer/stores/${store.id}`)}
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
            description={searchQuery ? "Try adjusting your search" : "No stores assigned to you"}
          />
        )}
      </Section>
    </div>
  );
}
