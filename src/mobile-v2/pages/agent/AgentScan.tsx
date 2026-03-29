import { useState, useEffect } from "react";
import { ScanLine, Flashlight, Camera, Store, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "../../components/ui/Card";
import { Section } from "../../components/ui/Section";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingCenter } from "../../components/ui/Loading";

interface Props {
  onStoreFound?: (store: StoreOption) => void;
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

export function AgentScan({ onStoreFound }: Props = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [searching, setSearching] = useState(false);

  const handleStoreFound = (store: StoreOption) => {
    if (onStoreFound) {
      onStoreFound(store);
    } else {
      navigate(`/agent/stores/${store.id}`);
    }
  };

  const searchStore = async (code: string) => {
    if (!code.trim()) {
      toast.error("Please enter a store code");
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, display_id, photo_url, address, lat, lng, phone, outstanding, customer_id, route_id, customers(name)")
        .or(`display_id.ilike.%${code}%,name.ilike.%${code}%`)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        handleStoreFound({
          id: data.id,
          name: data.name,
          display_id: data.display_id,
          photo_url: data.photo_url,
          address: data.address,
          lat: data.lat,
          lng: data.lng,
          phone: data.phone,
          outstanding: data.outstanding,
          customer_id: data.customer_id,
          route_id: data.route_id,
          customers: data.customers,
        });
        setManualCode("");
        toast.success(`Found: ${data.name}`);
      } else {
        toast.error("Store not found");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to search store");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="mv2-page">
      <div className="mv2-page-content">
        {/* Scanner Area */}
        <Card className="mb-4 overflow-hidden" padding="none">
          <div className="relative aspect-square bg-black/90 flex items-center justify-center">
            {scanning ? (
              <div className="text-center text-white">
                <div className="w-48 h-48 border-2 border-white/50 rounded-2xl relative mx-auto">
                  {/* Scan animation */}
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-[var(--mv2-primary)] animate-[scan_2s_ease-in-out_infinite]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ScanLine className="h-8 w-8 text-white/50" />
                  </div>
                </div>
                <p className="text-sm text-white/70 mt-4">Point camera at QR code</p>
              </div>
            ) : (
              <div className="text-center p-8">
                <div className="w-20 h-20 rounded-2xl mv2-bg-accent flex items-center justify-center mx-auto mb-4">
                  <Camera className="h-10 w-10 mv2-text-primary" />
                </div>
                <p className="text-white font-medium mb-2">QR Scanner</p>
                <p className="text-white/60 text-sm mb-4">Scan store QR code to quickly access store details</p>
                <button
                  className="mv2-btn mv2-btn-primary"
                  onClick={() => setScanning(true)}
                >
                  <ScanLine className="h-4 w-4" />
                  Start Scanning
                </button>
              </div>
            )}

            {/* Scanner controls */}
            {scanning && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                <button
                  className="mv2-btn mv2-btn-icon bg-white/20 text-white"
                  onClick={() => {}}
                >
                  <Flashlight className="h-5 w-5" />
                </button>
                <button
                  className="mv2-btn mv2-btn-secondary"
                  onClick={() => setScanning(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* Manual Entry */}
        <Section title="Or Enter Store Code">
          <Card padding="md">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter store ID or name..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchStore(manualCode)}
                className="mv2-input flex-1"
              />
              <button
                className="mv2-btn mv2-btn-primary"
                onClick={() => searchStore(manualCode)}
                disabled={searching}
              >
                {searching ? (
                  <div className="mv2-spinner mv2-spinner-sm" />
                ) : (
                  "Search"
                )}
              </button>
            </div>
          </Card>
        </Section>

        {/* Help Text */}
        <div className="mt-6 p-4 rounded-xl bg-[var(--mv2-accent)] border border-[var(--mv2-border)]">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 mv2-text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">How to find a store</p>
              <p className="text-xs mv2-text-muted mt-1">
                Scan the QR code displayed at the store, or manually enter the store's display ID 
                (e.g., STR-001) or name to search.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
