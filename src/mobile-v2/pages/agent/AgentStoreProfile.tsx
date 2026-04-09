import {
  Store, MapPin, Phone, Wallet, ShoppingCart, Navigation, 
  ExternalLink, Clock, TrendingUp, ArrowRight, ArrowLeft
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Card } from "../../components/ui/Card";
import { Section } from "../../components/ui/Section";
import { Badge } from "../../components/ui/Badge";
import { StatCard } from "../../components/ui/StatCard";
import { ListItem } from "../../components/ui/ListItem";
import { QuickAction, QuickActionsGrid } from "../../components/ui/QuickAction";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LoadingCenter } from "../../components/ui/Loading";
import { useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../../components/ui/EmptyState";

interface Props {
  store?: StoreOption;
  onRecordSale?: () => void;
  onRecordPayment?: () => void;
  onClose?: () => void;
}

interface StoreOption {
  id: string;
  name: string;
  display_id: string;
  photo_url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  outstanding: number;
  customer_id: string | null;
  route_id: string | null;
  customers?: { name: string } | null;
}

export function AgentStoreProfile({ store: storeProp, onRecordSale, onRecordPayment, onClose }: Props = {}) {
  const navigate = useNavigate();
  const { storeId } = useParams<{ storeId: string }>();
  
  // Fetch store data if not provided via props
  const { data: fetchedStore, isLoading: loadingStore } = useQuery({
    queryKey: ["mobile-v2-store-profile", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, display_id, photo_url, address, lat, lng, phone, outstanding, customer_id, route_id, customers(name)")
        .eq("id", storeId)
        .single();
      if (error) throw error;
      return data as StoreOption;
    },
    enabled: !storeProp && !!storeId,
  });

  const store = storeProp || fetchedStore;

  // Recent sales for this store
  const { data: recentSales, isLoading: loadingSales } = useQuery({
    queryKey: ["mobile-v2-store-sales", store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, display_id, total_amount, created_at")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!store,
  });

  // Recent transactions for this store
  const { data: recentTx, isLoading: loadingTx } = useQuery({
    queryKey: ["mobile-v2-store-tx", store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, display_id, total_amount, created_at")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!store,
  });

  const handleRecordSale = () => {
    if (onRecordSale) {
      onRecordSale();
    } else if (store) {
      navigate(`/agent/record/${store.id}?mode=sale`);
    }
  };

  const handleRecordPayment = () => {
    if (onRecordPayment) {
      onRecordPayment();
    } else if (store) {
      navigate(`/agent/record/${store.id}?mode=payment`);
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigate(-1);
    }
  };

  const openMaps = () => {
    if (store?.lat && store?.lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`, "_blank");
    }
  };

  const callStore = () => {
    if (store?.phone) {
      window.open(`tel:${store.phone}`, "_self");
    }
  };

  if (loadingStore) {
    return <LoadingCenter className="min-h-[50vh]" />;
  }

  if (!store) {
    return (
      <div className="mv2-page">
        <div className="mv2-page-content p-4">
          <EmptyState
            icon={Store}
            title="Store Not Found"
            description="The store you're looking for could not be found."
            action={{ label: "Go Back", onClick: () => navigate(-1) }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mv2-page">
      <div className="mv2-page-content">
        {/* Store Header */}
        <Card className="mb-4 overflow-hidden" padding="none">
          <div className="h-32 bg-gradient-to-br from-[var(--mv2-primary)] to-[oklch(0.50_0.22_280)] flex items-center justify-center">
            {store.photo_url ? (
              <img src={store.photo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Store className="h-12 w-12 text-white/80" />
            )}
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">{store.name}</h2>
                <p className="text-sm mv2-text-muted">{store.display_id}</p>
              </div>
              <Badge variant={store.outstanding > 0 ? "warning" : "success"}>
                {store.outstanding > 0 ? `₹${store.outstanding.toLocaleString("en-IN")} due` : "Clear"}
              </Badge>
            </div>
            {store.customers?.name && (
              <p className="text-sm mt-2">
                <span className="mv2-text-muted">Customer:</span> {store.customers.name}
              </p>
            )}
            {store.address && (
              <p className="text-sm mt-1 mv2-text-muted flex items-start gap-1.5">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                {store.address}
              </p>
            )}
          </div>
        </Card>

        {/* Quick Actions */}
        <QuickActionsGrid columns={4} className="mb-4">
          <QuickAction label="Record Sale" icon={ShoppingCart} onClick={handleRecordSale} primary />
          <QuickAction label="Payment" icon={Wallet} onClick={handleRecordPayment} />
          {store.lat && store.lng && (
            <QuickAction label="Navigate" icon={Navigation} onClick={openMaps} />
          )}
          {store.phone && (
            <QuickAction label="Call" icon={Phone} onClick={callStore} />
          )}
        </QuickActionsGrid>

        {/* Stats */}
        <div className="mv2-grid mv2-grid-cols-2 mv2-gap-3 mb-4">
          <StatCard
            label="Outstanding" 
            value={`₹${store.outstanding.toLocaleString("en-IN")}`}
            icon={Wallet}
          />
          <StatCard 
            label="Total Sales" 
            value={recentSales?.length || 0}
            icon={TrendingUp}
          />
        </div>

        {/* Recent Sales */}
        <Section title="Recent Sales">
          {loadingSales ? (
            <LoadingCenter />
          ) : !recentSales?.length ? (
            <Card padding="md">
              <p className="text-sm mv2-text-muted text-center py-4">No sales recorded yet</p>
            </Card>
          ) : (
            <div className="mv2-list">
              {recentSales.map((sale) => (
                <ListItem
                  key={sale.id}
                  title={sale.display_id || "Sale"}
                  subtitle={formatDate(sale.created_at)}
                  icon={ShoppingCart}
                  badge={
                    <span className="text-sm font-semibold">
                      ₹{Number(sale.total_amount).toLocaleString("en-IN")}
                    </span>
                  }
                  showArrow={false}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Recent Payments */}
        <Section title="Recent Payments" className="mt-4">
          {loadingTx ? (
            <LoadingCenter />
          ) : !recentTx?.length ? (
            <Card padding="md">
              <p className="text-sm mv2-text-muted text-center py-4">No payments recorded yet</p>
            </Card>
          ) : (
            <div className="mv2-list">
              {recentTx.map((tx) => (
                <ListItem
                  key={tx.id}
                  title={tx.display_id || "Payment"}
                  subtitle={formatDate(tx.created_at)}
                  icon={Wallet}
                  badge={
                    <span className="text-sm font-semibold mv2-text-success">
                      ₹{Number(tx.total_amount).toLocaleString("en-IN")}
                    </span>
                  }
                  showArrow={false}
                />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
