import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Store, MapPin, Phone, Wallet, Filter, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Section } from "../../components/ui/Section";
import { ListItem } from "../../components/ui/ListItem";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingCenter } from "../../components/ui/Loading";
import { Card } from "../../components/ui/Card";

interface Props {
  onSelectStore?: (store: StoreOption) => void;
  onAddStore?: () => void;
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

interface StoreRow {
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
  is_active: boolean;
  customers: { name: string } | null;
  routes: { name: string } | null;
}

export function AgentCustomers({ onSelectStore, onAddStore }: Props) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  // Fetch stores on user's routes
  const { data: stores, isLoading } = useQuery({
    queryKey: ["mobile-v2-agent-stores", user?.id],
    queryFn: async () => {
      // Get routes assigned to user
      const { data: assignments } = await supabase
        .from("route_assignments")
        .select("route_id")
        .eq("user_id", user!.id);

      if (!assignments?.length) return [];

      const routeIds = assignments.map(a => a.route_id);
      
      const { data } = await supabase
        .from("stores")
        .select("id, name, display_id, photo_url, address, lat, lng, phone, outstanding, customer_id, route_id, is_active, customers(name), routes(name)")
        .in("route_id", routeIds)
        .eq("is_active", true)
        .order("name");

      return (data as StoreRow[]) || [];
    },
    enabled: !!user,
  });

  const filteredStores = stores?.filter(store =>
    store.name.toLowerCase().includes(search.toLowerCase()) ||
    store.display_id.toLowerCase().includes(search.toLowerCase()) ||
    store.customers?.name?.toLowerCase().includes(search.toLowerCase()) ||
    store.address?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const totalOutstanding = stores?.reduce((sum, store) => sum + Number(store.outstanding || 0), 0) || 0;

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
        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 mv2-text-muted" />
          <input
            type="text"
            placeholder="Search stores..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mv2-input pl-10"
          />
        </div>

        {/* Summary Card */}
        <Card className="mb-4" padding="md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs mv2-text-muted font-medium uppercase tracking-wide">Total Stores</p>
              <p className="text-xl font-bold mt-0.5">{stores?.length || 0}</p>
            </div>
            <div className="text-right">
              <p className="text-xs mv2-text-muted font-medium uppercase tracking-wide">Outstanding</p>
              <p className="text-xl font-bold mt-0.5 mv2-text-warning">
                ₹{totalOutstanding.toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        </Card>

        {/* Stores List */}
        <Section 
          title={`Stores${search ? ` (${filteredStores.length})` : ""}`}
          action={onAddStore ? { label: "Add", onClick: onAddStore } : undefined}
        >
          {filteredStores.length === 0 ? (
            <Card padding="lg">
              <EmptyState
                icon={Store}
                title={search ? "No Results" : "No Stores"}
                description={search ? "Try a different search term" : "No stores found on your routes"}
                action={onAddStore ? { label: "Add Store", onClick: onAddStore } : undefined}
              />
            </Card>
          ) : (
            <div className="mv2-list">
              {filteredStores.map((store) => (
                <ListItem
                  key={store.id}
                  title={store.name}
                  subtitle={store.customers?.name || store.routes?.name || "—"}
                  meta={store.address || undefined}
                  avatar={store.photo_url || undefined}
                  icon={!store.photo_url ? Store : undefined}
                  badge={
                    store.outstanding > 0 ? (
                      <Badge variant="warning">₹{store.outstanding.toLocaleString("en-IN")}</Badge>
                    ) : (
                      <Badge variant="success">Clear</Badge>
                    )
                  }
                  onClick={() => onSelectStore?.({
                    id: store.id,
                    name: store.name,
                    display_id: store.display_id,
                    photo_url: store.photo_url,
                    address: store.address,
                    lat: store.lat,
                    lng: store.lng,
                    phone: store.phone,
                    outstanding: store.outstanding,
                    customer_id: store.customer_id,
                    route_id: store.route_id,
                    customers: store.customers,
                  })}
                />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
