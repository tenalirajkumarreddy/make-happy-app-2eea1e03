import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { QrScanner } from "@/components/shared/QrScanner";
import { parseUpiQr } from "@/lib/upiParser";
import { getCurrentPosition } from "@/lib/proximity";
import { supabase } from "@/integrations/supabase/client";
import { ScanLine, MapPin, ShoppingCart, Banknote, CheckCircle, Navigation, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface NearbyStore {
  id: string;
  name: string;
  display_id: string;
  distance: number;
  lat: number | null;
  lng: number | null;
}

export function QuickActionDrawer() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedStore, setSelectedStore] = useState<{ id: string; name: string } | null>(null);
  const [nearbyStores, setNearbyStores] = useState<NearbyStore[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [showNearby, setShowNearby] = useState(false);
  
  // QR not found dialog
  const [notFoundDialog, setNotFoundDialog] = useState(false);
  const [scannedUpi, setScannedUpi] = useState({ upiId: "", payeeName: "", raw: "" });
  const [linkMode, setLinkMode] = useState(false);
  const [linkStoreId, setLinkStoreId] = useState("");
  const [allStores, setAllStores] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const handleQrScan = async (data: string) => {
    const upi = parseUpiQr(data);
    if (!upi) {
      toast.error("Not a valid UPI QR code");
      return;
    }

    // Look up store by upi_id
    const { data: qrRecord } = await supabase
      .from("store_qr_codes")
      .select("store_id, stores(id, name)")
      .eq("upi_id", upi.pa)
      .maybeSingle();

    if (qrRecord?.store_id && qrRecord.stores) {
      setSelectedStore({ id: qrRecord.store_id, name: (qrRecord.stores as any).name });
      toast.success(`Store selected: ${(qrRecord.stores as any).name}`);
      setScanning(false);
    } else {
      // Not found — show options
      setScannedUpi({ upiId: upi.pa, payeeName: upi.pn, raw: upi.raw });
      setNotFoundDialog(true);
      setScanning(false);
    }
  };

  const handleLinkStore = async () => {
    const { data } = await supabase.from("stores").select("id, name, display_id").eq("is_active", true);
    setAllStores(data || []);
    setLinkMode(true);
  };

  const confirmLink = async () => {
    if (!linkStoreId) return;
    setSaving(true);
    const { error } = await supabase.from("store_qr_codes").insert({
      store_id: linkStoreId,
      upi_id: scannedUpi.upiId,
      payee_name: scannedUpi.payeeName || null,
      raw_data: scannedUpi.raw,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const store = allStores.find((s) => s.id === linkStoreId);
    toast.success("QR linked to store");
    setSelectedStore({ id: linkStoreId, name: store?.name || "" });
    setNotFoundDialog(false);
    setLinkMode(false);
    setLinkStoreId("");
  };

  const handleCreateStore = () => {
    setNotFoundDialog(false);
    setOpen(false);
    navigate("/stores", { 
      state: { 
        prefillQr: { 
          name: scannedUpi.payeeName || "", 
          upiId: scannedUpi.upiId, 
          rawQr: scannedUpi.raw 
        } 
      } 
    });
  };

  const findNearbyStores = async () => {
    setLoadingNearby(true);
    setShowNearby(true);
    const loc = await getCurrentPosition();
    
    if (!loc) {
      toast.error("Could not get your location. Please enable GPS.");
      setLoadingNearby(false);
      return;
    }

    // Fetch all active stores with GPS coordinates
    const { data: stores } = await supabase
      .from("stores")
      .select("id, name, display_id, lat, lng")
      .eq("is_active", true)
      .not("lat", "is", null)
      .not("lng", "is", null);

    if (!stores || stores.length === 0) {
      toast.info("No stores with GPS coordinates found");
      setNearbyStores([]);
      setLoadingNearby(false);
      return;
    }

    // Calculate distances and filter within 100m
    const nearby = stores
      .map((store) => {
        const R = 6371000; // Earth radius in meters
        const dLat = ((store.lat! - loc.lat) * Math.PI) / 180;
        const dLng = ((store.lng! - loc.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((loc.lat * Math.PI) / 180) *
            Math.cos((store.lat! * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return { ...store, distance: Math.round(distance) };
      })
      .filter((store) => store.distance <= 100)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    setNearbyStores(nearby);
    setLoadingNearby(false);

    if (nearby.length === 0) {
      toast.info("No stores within 100m");
    } else {
      toast.success(`Found ${nearby.length} nearby store(s)`);
    }
  };

  const handleAction = (action: "sale" | "transaction" | "visit") => {
    if (!selectedStore) {
      toast.error("Please select a store first");
      return;
    }

    setOpen(false);
    
    switch (action) {
      case "sale":
        navigate(`/sales?store=${selectedStore.id}`);
        break;
      case "transaction":
        navigate(`/transactions?store=${selectedStore.id}`);
        break;
      case "visit":
        // Mark as visited - would need route session logic
        toast.info("Mark visit functionality requires active route session");
        break;
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button size="lg" className="gap-2 rounded-full shadow-lg px-4 sm:px-6">
            <ScanLine className="h-5 w-5" />
            <span className="hidden sm:inline">Quick Actions</span>
            <span className="sm:hidden">Scan</span>
          </Button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>Quick Actions</DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-6 space-y-4 overflow-y-auto">
            {/* Selected Store Display */}
            {selectedStore && (
              <div className="rounded-lg border border-primary bg-primary/5 p-3">
                <p className="text-xs text-muted-foreground mb-1">Selected Store</p>
                <p className="font-semibold text-primary">{selectedStore.name}</p>
              </div>
            )}

            {/* Scanner Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Scan QR Code</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={findNearbyStores}
                  disabled={loadingNearby}
                  className="gap-2"
                >
                  {loadingNearby ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Navigation className="h-4 w-4" />
                  )}
                  Nearby
                </Button>
              </div>

              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setScanning(true)}
              >
                <ScanLine className="h-4 w-4" />
                Scan Store QR
              </Button>
            </div>

            {/* Nearby Stores */}
            {showNearby && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Nearby Stores (within 100m)
                </h3>
                {nearbyStores.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No stores found nearby
                  </p>
                ) : (
                  <div className="space-y-2">
                    {nearbyStores.map((store) => (
                      <button
                        key={store.id}
                        onClick={() => {
                          setSelectedStore({ id: store.id, name: store.name });
                          toast.success(`Store selected: ${store.name}`);
                        }}
                        className="w-full flex items-center justify-between rounded-lg border bg-card p-3 text-left hover:bg-accent transition-colors"
                      >
                        <div>
                          <p className="font-medium text-sm">{store.name}</p>
                          <p className="text-xs text-muted-foreground">{store.display_id}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-medium text-primary">{store.distance}m</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Quick Action Buttons */}
            <div className="space-y-2 pt-4 border-t">
              <h3 className="text-sm font-semibold">Actions</h3>
              <div className="grid grid-cols-1 gap-2">
                <Button
                  onClick={() => handleAction("sale")}
                  disabled={!selectedStore}
                  variant="default"
                  className="gap-2 justify-start"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Record Sale
                </Button>
                <Button
                  onClick={() => handleAction("transaction")}
                  disabled={!selectedStore}
                  variant="outline"
                  className="gap-2 justify-start"
                >
                  <Banknote className="h-4 w-4" />
                  Record Payment
                </Button>
                <Button
                  onClick={() => handleAction("visit")}
                  disabled={!selectedStore}
                  variant="outline"
                  className="gap-2 justify-start"
                >
                  <CheckCircle className="h-4 w-4" />
                  Mark Visited
                </Button>
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* QR Scanner Dialog */}
      <QrScanner
        open={scanning}
        onOpenChange={setScanning}
        onScan={handleQrScan}
        title="Scan Store QR"
      />

      {/* QR Not Found Dialog */}
      <Dialog open={notFoundDialog} onOpenChange={(v) => { if (!v) { setNotFoundDialog(false); setLinkMode(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QR Code Not Linked</DialogTitle>
          </DialogHeader>

          {!linkMode ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">UPI ID:</span> <span className="font-mono">{scannedUpi.upiId}</span></p>
                {scannedUpi.payeeName && <p><span className="text-muted-foreground">Name:</span> {scannedUpi.payeeName}</p>}
              </div>
              <p className="text-sm text-muted-foreground">This QR is not linked to any store. What would you like to do?</p>
              <div className="flex flex-col gap-2">
                <Button onClick={handleCreateStore} className="gap-2">
                  <ShoppingCart className="h-4 w-4" /> Create New Store
                </Button>
                <Button variant="outline" onClick={handleLinkStore} className="gap-2">
                  <MapPin className="h-4 w-4" /> Link to Existing Store
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Select Store</Label>
                <Select value={linkStoreId} onValueChange={setLinkStoreId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a store" /></SelectTrigger>
                  <SelectContent>
                    {allStores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.display_id})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setLinkMode(false)}>Back</Button>
                <Button className="flex-1" disabled={!linkStoreId || saving} onClick={confirmLink}>
                  Link QR
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
