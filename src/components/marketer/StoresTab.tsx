import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Store, MapPin, Phone, Calendar, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface StoreData {
  id: string;
  name: string;
  outstanding: number;
  last_order_date?: string;
  customers: { name: string } | null;
}

export function StoresTab() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: stores, isLoading } = useQuery({
    queryKey: ['my-stores', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name, outstanding, created_at, customers(name)')
        .eq('created_by', user!.id)
        .eq('is_active', true)
        .order('outstanding', { ascending: false });

      if (error) throw error;
      return data as StoreData[];
    },
    enabled: !!user?.id,
  });

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Loading stores...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">My Stores</h3>
        <p className="text-sm text-muted-foreground">{stores?.length || 0} stores assigned</p>
      </div>

      {stores?.map((store) => (
        <Card key={store.id} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate(`/stores/${store.id}`)}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Store className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h4 className="font-medium">{store.name}</h4>
                <p className="text-sm text-muted-foreground">{store.customers?.name || 'No customer linked'}</p>
                
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  {store.outstanding > 0 && (
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">
                        Outstanding: ₹{store.outstanding.toLocaleString()}
                      </Badge>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>Added {new Date(store.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); }}>
                <Phone className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); }}>
                <MapPin className="h-4 w-4" />
              </Button>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
