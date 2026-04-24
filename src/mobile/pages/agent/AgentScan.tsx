import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { parseUpiQr } from "@/lib/upiParser";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ScanLine, RefreshCw, Store, Banknote, ShoppingCart,
  MapPin, Loader2, CheckCircle2, AlertTriangle, Zap, Navigation, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import type { StoreOption } from "@/mobile/components/StorePickerSheet";
import { useRouteAccess } from "@/hooks/useRouteAccess";
import { getCurrentPosition } from "@/lib/capacitorUtils";
import { addToQueue } from "@/lib/offlineQueue";

const SCANNER_ID = "mobile-qr-reader";

interface Props {
  onGoRecord: (store: StoreOption | null, action: "sale" | "payment") => void;
  onGoVisit: () => void;
  onOpenStore: (store: StoreOption) => void;
}

type NearbyStoreRow = StoreOption;

interface QrLinkedStore extends StoreOption {
  id: string;
  name: string;
  display_id: string;
}

interface QrLookupResult {
  store_id: string;
  stores: QrLinkedStore | null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function AgentScan({ onGoRecord, onGoVisit, onOpenStore }: Props) {
  const { user, role } = useAuth();
  const { canAccessRoute } = useRouteAccess(user?.id, role);

  const [mode, setMode] = useState<"qr" | "nearby">("qr");
  const [scannerStarted, setScannerStarted] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreOption | null>(null);
  const [unknownUpi, setUnknownUpi] = useState<{ upiId: string; payeeName: string } | null>(null);
  const [visitLoading, setVisitLoading] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyStores, setNearbyStores] = useState<Array<StoreOption & { _distKm: number }>>([]);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef<(data: string) => void>();

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    setScannerStarted(false);
  }, []);

  const startScanner = useCallback(async () => {
    setScannerError(null);
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      const scanner = new Html5Qrcode(SCANNER_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: (vw, vh) => {
            const size = Math.min(vw, vh, 240);
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
        },
        (decodedText) => { onScanRef.current?.(decodedText); },
        () => {}
      );
      setScannerStarted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
        setScannerError("Camera permission denied. Enable it in your device Settings.");
      } else if (msg.includes("NotFoundError")) {
        setScannerError("No camera found on this device.");
      } else {
        setScannerError("Could not start camera. Tap to retry.");
      }
    }
  }, []);

  useEffect(() => {
    if (mode !== "qr") {
      stopScanner();
      return;
    }
    const t = setTimeout(() => startScanner(), 250);
    return () => {
      clearTimeout(t);
      stopScanner();
    };
  }, [mode, startScanner, stopScanner]);

  const handleQrScan = useCallback(async (data: string) => {
    if (processing) return;
    setProcessing(true);
    await stopScanner();

    const upi = parseUpiQr(data);
    if (!upi) {
      toast.error("Not a valid UPI QR code");
      setProcessing(false);
      setTimeout(() => startScanner(), 500);
      return;
    }

    const { data: qrRecord } = await supabase
      .from("store_qr_codes")
      .select("store_id, stores(id, name, display_id, photo_url, outstanding, address, phone, lat, lng, route_id, is_active, store_type_id, customer_id, customers(name), store_types(name), routes(name))")
      .eq("upi_id", upi.pa)
      .maybeSingle();

    const lookupResult = qrRecord as unknown as QrLookupResult | null;

    if (lookupResult?.store_id && lookupResult.stores) {
      const s = lookupResult.stores;
      const storeOption: StoreOption = {
        id: s.id,
        name: s.name,
        display_id: s.display_id,
        photo_url: s.photo_url || null,
        outstanding: Number(s.outstanding ?? 0),
        store_type_id: s.store_type_id,
        customer_id: s.customer_id,
        lat: s.lat,
        lng: s.lng,
        address: s.address,
        phone: s.phone,
        route_id: s.route_id,
        is_active: s.is_active,
        customers: s.customers,
        store_types: s.store_types,
        routes: s.routes,
      };
      if (!canAccessRoute(storeOption.route_id)) {
        setSelectedStore(null);
        toast.error("You do not have access to this store's route");
      } else {
        setSelectedStore(storeOption);
        toast.success(`Store found: ${s.name}`);
      }
    } else {
      setUnknownUpi({ upiId: upi.pa, payeeName: upi.pn });
      toast.warning("UPI QR found but no store is linked to it");
    }

    setProcessing(false);
  }, [processing, stopScanner, startScanner, canAccessRoute]);

  onScanRef.current = handleQrScan;

  const reset = async () => {
    setSelectedStore(null);
    setUnknownUpi(null);
    if (mode === "qr") {
      await stopScanner();
      setTimeout(() => startScanner(), 200);
    }
  };

  const handleFindNearby = async () => {
    setNearbyLoading(true);
    try {
      const pos = await getCurrentPosition();
      if (!pos) throw new Error("Could not get location");

      const { data, error } = await supabase
        .from("stores")
        .select("id, name, display_id, photo_url, outstanding, store_type_id, customer_id, lat, lng, address, phone, route_id, is_active, customers(name), store_types(name), routes(name)")
        .eq("is_active", true)
        .not("lat", "is", null)
        .not("lng", "is", null);
      if (error) throw error;

      const baseStores = (data || []) as unknown as NearbyStoreRow[];
      const scopedStores = baseStores
        .filter((s) => canAccessRoute(s.route_id))
        .map((s) => ({
          ...(s as StoreOption),
          _distKm: haversineKm(pos.lat, pos.lng, Number(s.lat), Number(s.lng)),
        }))
        .sort((a, b) => a._distKm - b._distKm)
        .slice(0, 5);

      setNearbyStores(scopedStores);
      if (scopedStores.length === 0) {
        toast.warning("No nearby accessible stores found");
      }
    } catch {
      toast.error("Unable to fetch nearby stores. Check location permission.");
    } finally {
      setNearbyLoading(false);
    }
  };

  const handleVisitStore = async (store: StoreOption) => {
    if (!user) return;
    setVisitLoading(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      const pos = await getCurrentPosition();
      if (pos) {
        lat = pos.lat;
        lng = pos.lng;
      }

      if (!navigator.onLine) {
        await addToQueue({
          id: crypto.randomUUID(),
          type: "visit",
          payload: {
            userId: user.id,
            storeId: store.id,
            lat,
            lng,
          },
          createdAt: new Date().toISOString(),
        });
        toast.warning(`Offline — visit queued for ${store.name}`);
        reset();
        return;
      }

      const { data: session } = await supabase
        .from("route_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (!session) {
        toast.error("No active route session. Start a route first.");
        setVisitLoading(false);
        return;
      }

      const { error } = await supabase.from("store_visits").insert({
        session_id: session.id,
        store_id: store.id,
        lat,
        lng,
      });
      if (error) throw error;
      toast.success(`Visit recorded for ${store.name}`);
      reset();
    } catch {
      toast.error("Failed to record visit");
    } finally {
      setVisitLoading(false);
    }
  };

  const hasResult = selectedStore || unknownUpi;
  const cameraHeight = hasResult ? "min(200px, 30vh)" : "min(320px, 40vh)";

  const renderQuickActions = () => (
    <div className="grid grid-cols-3 gap-2">
      <button
        onClick={() => onGoRecord(selectedStore, "sale")}
        className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
      >
        <ShoppingCart className="h-6 w-6 text-white" />
        <span className="text-[11px] font-bold text-white leading-tight text-center">Record Sale</span>
      </button>
      <button
        onClick={() => onGoRecord(selectedStore, "payment")}
        className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
      >
        <Banknote className="h-6 w-6 text-emerald-500" />
        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-tight text-center">Record Transaction</span>
      </button>
      <button
        onClick={() => selectedStore ? handleVisitStore(selectedStore) : onGoVisit()}
        disabled={visitLoading}
        className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 active:scale-95 transition-all shadow-sm disabled:opacity-60"
      >
        {visitLoading ? <Loader2 className="h-6 w-6 text-emerald-500 animate-spin" /> : <CheckCircle2 className="h-6 w-6 text-emerald-500" />}
        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 leading-tight text-center">{selectedStore ? "Mark Visited" : "Routes & Visits"}</span>
      </button>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-4 pt-4 pb-2">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={mode === "qr" ? "default" : "outline"}
            className="rounded-xl"
            onClick={() => {
              setMode("qr");
              setNearbyStores([]);
              setSelectedStore(null);
              setUnknownUpi(null);
            }}
          >
            <ScanLine className="h-4 w-4 mr-2" />QR Scan
          </Button>
          <Button
            variant={mode === "nearby" ? "default" : "outline"}
            className="rounded-xl"
            onClick={() => {
              setMode("nearby");
              setSelectedStore(null);
              setUnknownUpi(null);
            }}
          >
            <Navigation className="h-4 w-4 mr-2" />Nearby
          </Button>
        </div>
      </div>

      {mode === "qr" ? (
        <div className="relative bg-slate-900 overflow-hidden" style={{ height: cameraHeight, transition: "height 0.3s ease" }}>
          <div id={SCANNER_ID} className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&_div]:hidden" />

          {!hasResult && !scannerError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="absolute inset-0 bg-black/30" style={{ maskImage: "radial-gradient(ellipse 260px 260px at center, transparent 40%, black 70%)", WebkitMaskImage: "radial-gradient(ellipse 260px 260px at center, transparent 40%, black 70%)" }} />
              <div className="w-56 h-56 relative">
                <span className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-blue-400 rounded-tl-xl" />
                <span className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-blue-400 rounded-tr-xl" />
                <span className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-blue-400 rounded-bl-xl" />
                <span className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-blue-400 rounded-br-xl" />
                {scannerStarted && !processing && (
                  <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent rounded-full opacity-80" style={{ animation: "scan-line 2s ease-in-out infinite" }} />
                )}
              </div>

              <div className="absolute bottom-5 left-0 right-0 flex justify-center">
                <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
                  <ScanLine className="h-4 w-4 text-blue-400 animate-pulse" />
                  <p className="text-white text-sm font-medium">{processing ? "Looking up store..." : "Point at a UPI QR code"}</p>
                </div>
              </div>
            </div>
          )}

          {processing && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <div className="h-16 w-16 rounded-full bg-blue-500/20 border-2 border-blue-400/50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
              </div>
              <p className="text-white text-sm font-medium">Identifying store...</p>
            </div>
          )}

          {scannerError && (
            <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center gap-5 px-8">
              <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <ScanLine className="h-8 w-8 text-red-400" />
              </div>
              <p className="text-white/80 text-center text-sm leading-relaxed">{scannerError}</p>
              <Button size="sm" onClick={() => startScanner()} className="rounded-xl px-6 bg-blue-600 hover:bg-blue-700">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Camera
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-3">
          <div className="rounded-2xl border bg-card p-4 space-y-3">
            <Button onClick={handleFindNearby} disabled={nearbyLoading} className="w-full rounded-xl">
              {nearbyLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Navigation className="h-4 w-4 mr-2" />}
              Find Nearest 5 Stores
            </Button>
            {nearbyStores.length > 0 && (
              <div className="space-y-2">
                {nearbyStores.map((store) => (
                  <button
                    key={store.id}
                    className={cn("w-full text-left rounded-xl border p-3", selectedStore?.id === store.id ? "border-primary bg-primary/5" : "border-border")}
                    onClick={() => setSelectedStore(store)}
                  >
                    <p className="font-semibold text-sm">{store.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{store.display_id} · {store._distKm < 1 ? `${Math.round(store._distKm * 1000)}m` : `${store._distKm.toFixed(1)}km`}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan-line {
          0%, 100% { top: 10%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          50% { top: 85%; }
        }
      `}</style>

      {selectedStore && (
        <div className="px-4 pt-3">
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-800/40 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30 px-4 py-2.5 flex items-center gap-2 border-b border-emerald-100 dark:border-emerald-800/40">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Store Identified</span>
            </div>
            <div className="p-4 flex items-start gap-3">
              <button className="h-14 w-14 rounded-xl bg-slate-100 dark:bg-slate-700 overflow-hidden shrink-0" onClick={() => onOpenStore(selectedStore)}>
                {selectedStore.photo_url ? (
                  <img src={selectedStore.photo_url} alt={selectedStore.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center"><Store className="h-5 w-5 text-slate-400" /></div>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 dark:text-white text-base leading-tight">{selectedStore.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{selectedStore.display_id}</p>
                {selectedStore.address && (
                  <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{selectedStore.address}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {selectedStore.store_types?.name && <Badge variant="secondary" className="text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-0">{selectedStore.store_types.name}</Badge>}
                  {selectedStore.routes?.name && <Badge variant="secondary" className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-0">{selectedStore.routes.name}</Badge>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-slate-400 mb-0.5">Balance</p>
                <p className={cn("font-bold text-base", selectedStore.outstanding > 0 ? "text-red-500" : "text-emerald-500")}>₹{Number(selectedStore.outstanding).toLocaleString("en-IN")}</p>
              </div>
            </div>
            <div className="px-4 pb-3">
              <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => onOpenStore(selectedStore)}>
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                Open Store Profile
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 pt-3">
        <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Actions</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-white mt-1">{selectedStore ? `Continue with ${selectedStore.name}` : "Use the same sale and payment flow as the web app"}</p>
            </div>
            {selectedStore && <Badge variant="outline" className="text-[10px] font-semibold border-emerald-200 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20">Store selected</Badge>}
          </div>
          {renderQuickActions()}
          {!selectedStore && <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">If you start before scanning, the next screen lets you choose the store manually.</p>}
        </div>
      </div>

      {unknownUpi && !selectedStore && (
        <div className="p-4 pt-0 space-y-3">
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center"><AlertTriangle className="h-4 w-4 text-amber-500" /></div>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">No Store Linked</p>
            </div>
            <p className="font-mono text-sm text-slate-700 dark:text-slate-300 break-all bg-white dark:bg-slate-800 px-3 py-2 rounded-xl">{unknownUpi.upiId}</p>
            {unknownUpi.payeeName && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{unknownUpi.payeeName}</p>}
            <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-3 leading-relaxed">This UPI ID is not linked to any store. Ask your admin to register it.</p>
          </div>
          <Button variant="outline" className="w-full h-10 rounded-xl border-slate-200 dark:border-slate-700" onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Scan Again
          </Button>
        </div>
      )}

      {!hasResult && !scannerError && (
        <div className="px-6 py-5 text-center">
          <div className="flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500">
            <Zap className="h-3.5 w-3.5" />
            <p className="text-xs font-medium">Scan to instantly record a sale or collect payment</p>
          </div>
        </div>
      )}
    </div>
  );
}
