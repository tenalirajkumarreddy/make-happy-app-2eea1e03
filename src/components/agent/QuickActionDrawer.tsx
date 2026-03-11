import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseUpiQr } from "@/lib/upiParser";
import { getCurrentPosition } from "@/lib/proximity";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  ScanLine, MapPin, ShoppingCart, Banknote, CheckCircle,
  Navigation, Loader2, Camera, RefreshCw, X, Store,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Html5Qrcode } from "html5-qrcode";

const SCANNER_ID = "quick-action-qr-reader";

interface ScannedStoreDetail {
  id: string;
  name: string;
  display_id: string;
  address: string | null;
  photo_url: string | null;
  store_type: string | null;
}

interface NearbyStore {
  id: string;
  name: string;
  display_id: string;
  distance: number;
}

export function QuickActionDrawer() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "super_admin" || role === "manager";
  const [open, setOpen] = useState(false);

  // scanner state
  const [scannerStarted, setScannerStarted] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  // scanned store (full detail for display)
  const [scannedStore, setScannedStore] = useState<ScannedStoreDetail | null>(null);

  // nearby
  const [nearbyStores, setNearbyStores] = useState<NearbyStore[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [showNearby, setShowNearby] = useState(false);

  // qr-not-found dialog
  const [notFoundDialog, setNotFoundDialog] = useState(false);
  const [scannedUpi, setScannedUpi] = useState({ upiId: "", payeeName: "", raw: "" });
  const [linkMode, setLinkMode] = useState(false);
  const [linkStoreId, setLinkStoreId] = useState("");
  const [allStores, setAllStores] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef<(data: string) => void>();

  // ── scanner controls ──────────────────────────────────────────────────────

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
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 200, height: 200 } },
        (decodedText) => { onScanRef.current?.(decodedText); },
        () => {}
      );
      setScannerStarted(true);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
        setScannerError("Camera permission denied. Allow access in browser settings.");
      } else if (msg.includes("NotFoundError") || msg.includes("not found")) {
        setScannerError("No camera found on this device.");
      } else {
        setScannerError("Could not start camera. Please retry.");
      }
    }
  }, []);

  // auto-start on drawer open; stop on close
  useEffect(() => {
    if (open && !scannedStore) {
      const t = setTimeout(() => startScanner(), 250);
      return () => clearTimeout(t);
    }
    if (!open) {
      stopScanner();
      setScannerError(null);
    }
  }, [open, scannedStore, startScanner, stopScanner]);

  // cleanup on unmount
  useEffect(() => () => { stopScanner(); }, [stopScanner]);

  // ── QR scan handler ───────────────────────────────────────────────────────

  const handleQrScan = useCallback(async (data: string) => {
    await stopScanner();

    const upi = parseUpiQr(data);
    if (!upi) {
      toast.error("Not a valid UPI QR code");
      setTimeout(() => startScanner(), 500);
      return;
    }

    const { data: qrRecord } = await supabase
      .from("store_qr_codes")
      .select("store_id, stores(id, name, display_id, address, photo_url, store_types(name))")
      .eq("upi_id", upi.pa)
      .maybeSingle();

    if (qrRecord?.store_id && qrRecord.stores) {
      const s = qrRecord.stores as any;
      setScannedStore({
        id: s.id,
        name: s.name,
        display_id: s.display_id,
        address: s.address ?? null,
        photo_url: s.photo_url ?? null,
        store_type: s.store_types?.name ?? null,
      });
      toast.success(`Store found: ${s.name}`);
    } else {
      setScannedUpi({ upiId: upi.pa, payeeName: upi.pn, raw: upi.raw });
      setNotFoundDialog(true);
    }
  }, [stopScanner, startScanner]);

  onScanRef.current = handleQrScan;

  // dismiss scanned store → restart camera
  const dismissStore = useCallback(async () => {
    setScannedStore(null);
    await stopScanner();
    setTimeout(() => startScanner(), 200);
  }, [stopScanner, startScanner]);

  // ── actions ───────────────────────────────────────────────────────────────

  const handleAction = (action: "sale" | "transaction" | "visit") => {
    setOpen(false);
    const storeParam = scannedStore ? `?store=${scannedStore.id}` : "";
    if (action === "sale") navigate(`/sales${storeParam}`);
    else if (action === "transaction") navigate(`/transactions${storeParam}`);
    else toast.info("Mark visit functionality requires an active route session");
  };

  const findNearbyStores = async () => {
    setLoadingNearby(true);
    setShowNearby(true);
    const loc = await getCurrentPosition();
    if (!loc) {
      toast.error("Could not get your location. Enable GPS.");
      setLoadingNearby(false);
      return;
    }
    const { data: stores } = await supabase
      .from("stores")
      .select("id, name, display_id, lat, lng")
      .eq("is_active", true)
      .not("lat", "is", null)
      .not("lng", "is", null);

    if (!stores?.length) {
      toast.info("No stores with GPS coordinates found");
      setNearbyStores([]);
      setLoadingNearby(false);
      return;
    }

    const nearby = stores
      .map((store) => {
        const R = 6371000;
        const dLat = ((store.lat! - loc.lat) * Math.PI) / 180;
        const dLng = ((store.lng! - loc.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((loc.lat * Math.PI) / 180) *
            Math.cos((store.lat! * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        return { ...store, distance: Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) };
      })
      .filter((s) => s.distance <= 100)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    setNearbyStores(nearby);
    setLoadingNearby(false);
    if (nearby.length === 0) toast.info("No stores within 100m");
    else toast.success(`Found ${nearby.length} nearby store(s)`);
  };

  // ── QR-not-found helpers ──────────────────────────────────────────────────

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
    if (error) { toast.error(error.message); return; }
    const store = allStores.find((s) => s.id === linkStoreId);
    toast.success("QR linked to store");
    setScannedStore({
      id: linkStoreId,
      name: store?.name || "",
      display_id: store?.display_id || "",
      address: null,
      photo_url: null,
      store_type: null,
    });
    setNotFoundDialog(false);
    setLinkMode(false);
    setLinkStoreId("");
  };

  const handleCreateStore = () => {
    setNotFoundDialog(false);
    setOpen(false);
    navigate("/stores", {
      state: { prefillQr: { name: scannedUpi.payeeName || "", upiId: scannedUpi.upiId, rawQr: scannedUpi.raw } },
    });
  };

  // ── render ────────────────────────────────────────────────────────────────

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

        <DrawerContent className="h-[92vh] flex flex-col p-0 overflow-hidden">

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TOP HALF: camera OR store card                                 */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <div className="relative flex-shrink-0 overflow-hidden" style={{ height: "48%" }}>

            {/* ── CAMERA VIEW (shown when no store selected) ── */}
            {!scannedStore && (
              <div className="absolute inset-0 bg-black">
                {/* Html5Qrcode video target */}
                <div
                  id={SCANNER_ID}
                  className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&_#qr-shaded-region]:!border-none"
                />

                {/* Viewfinder overlay */}
                {scannerStarted && !scannerError && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    {/* Dim corners */}
                    <div className="relative w-52 h-52">
                      <div className="absolute inset-0 rounded-lg" />
                      {/* corner brackets */}
                      <span className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-white rounded-tl-lg" />
                      <span className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white rounded-tr-lg" />
                      <span className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-white rounded-bl-lg" />
                      <span className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white rounded-br-lg" />
                      {/* animated scan line */}
                      <span className="absolute left-1 right-1 h-px bg-primary shadow-[0_0_6px_2px] shadow-primary/60 animate-[scan_2s_ease-in-out_infinite]" />
                    </div>
                    <p className="mt-4 text-xs text-white/70 tracking-wide">Align QR code within the frame</p>
                  </div>
                )}

                {/* Loading */}
                {!scannerStarted && !scannerError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
                    <Loader2 className="h-8 w-8 animate-spin text-white/50" />
                    <p className="text-xs text-white/50 tracking-wide">Starting camera…</p>
                  </div>
                )}

                {/* Error */}
                {scannerError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black px-8">
                    <Camera className="h-12 w-12 text-white/25" />
                    <p className="text-sm text-white/60 text-center leading-relaxed">{scannerError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={startScanner}
                      className="gap-2 bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Retry
                    </Button>
                  </div>
                )}

                {/* Close drawer button */}
                <button
                  onClick={() => setOpen(false)}
                  className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/80 hover:bg-black/80 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* Bottom label */}
                {scannerStarted && (
                  <div className="absolute bottom-0 inset-x-0 py-2 text-center bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-[11px] text-white/60 font-medium uppercase tracking-widest">Store QR Scanner</p>
                  </div>
                )}
              </div>
            )}

            {/* ── STORE CARD (shown after successful scan) ── */}
            {scannedStore && (
              <div className="absolute inset-0 bg-card">
                {/* Store photo or placeholder */}
                {scannedStore.photo_url ? (
                  <img
                    src={scannedStore.photo_url}
                    alt={scannedStore.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-background flex items-center justify-center">
                    <Store className="h-20 w-20 text-primary/30" />
                  </div>
                )}

                {/* Gradient overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                {/* Store info overlay at bottom */}
                <div className="absolute bottom-0 inset-x-0 px-4 pb-4 pt-12">
                  {scannedStore.store_type && (
                    <Badge variant="secondary" className="mb-1.5 text-[10px] bg-white/20 text-white border-white/30 backdrop-blur-sm">
                      {scannedStore.store_type}
                    </Badge>
                  )}
                  <h2 className="text-xl font-bold text-white leading-tight">{scannedStore.name}</h2>
                  <p className="text-xs text-white/70 mt-0.5">{scannedStore.display_id}</p>
                  {scannedStore.address && (
                    <p className="text-xs text-white/60 mt-1 flex items-start gap-1">
                      <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-1">{scannedStore.address}</span>
                    </p>
                  )}
                </div>

                {/* Dismiss (X) — restarts camera */}
                <button
                  onClick={dismissStore}
                  className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/90 hover:bg-black/80 hover:text-white transition-colors backdrop-blur-sm"
                  title="Dismiss & scan again"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* "Scan again" subtle hint */}
                <div className="absolute top-3 left-3">
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/90 text-white border-emerald-400/50 gap-1 backdrop-blur-sm">
                    <CheckCircle className="h-2.5 w-2.5" /> Scanned
                  </Badge>
                </div>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* BOTTOM HALF: actions + nearby                                  */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <div className="flex-1 overflow-y-auto bg-background">
            {/* Drag handle */}
            <div className="mx-auto mt-2.5 mb-0.5 h-1 w-10 rounded-full bg-border" />

            <div className="px-4 pb-safe-area-inset-bottom pb-6 pt-3 space-y-4">

              {/* ── Quick action buttons — always visible ── */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</p>
                  {scannedStore && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                      <CheckCircle className="h-3 w-3" />
                      {scannedStore.name}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => handleAction("sale")}
                  className="w-full flex items-center justify-between rounded-xl bg-primary px-4 py-3.5 text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
                >
                  <span className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                      <ShoppingCart className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-sm">Record Sale</p>
                      <p className="text-[11px] text-primary-foreground/70">
                        {scannedStore ? scannedStore.name : "Tap to go to Sales"}
                      </p>
                    </div>
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-60" />
                </button>

                <button
                  onClick={() => handleAction("transaction")}
                  className="w-full flex items-center justify-between rounded-xl border bg-card px-4 py-3.5 shadow-sm hover:bg-accent active:scale-[0.98] transition-all"
                >
                  <span className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                      <Banknote className="h-4 w-4 text-foreground/70" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-sm">Record Payment</p>
                      <p className="text-[11px] text-muted-foreground">
                        {scannedStore ? scannedStore.name : "Tap to go to Transactions"}
                      </p>
                    </div>
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-30" />
                </button>

                <button
                  onClick={() => handleAction("visit")}
                  className="w-full flex items-center justify-between rounded-xl border bg-card px-4 py-3.5 shadow-sm hover:bg-accent active:scale-[0.98] transition-all"
                >
                  <span className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                      <CheckCircle className="h-4 w-4 text-foreground/70" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-sm">Mark Visited</p>
                      <p className="text-[11px] text-muted-foreground">
                        {scannedStore ? scannedStore.name : "Requires active route session"}
                      </p>
                    </div>
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-30" />
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Nearby</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* ── Nearby stores ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Stores within 100m of your location</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={findNearbyStores}
                    disabled={loadingNearby}
                    className="h-7 gap-1.5 text-xs"
                  >
                    {loadingNearby
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Navigation className="h-3 w-3" />}
                    Find
                  </Button>
                </div>

                {showNearby && (
                  <div className="space-y-1.5">
                    {nearbyStores.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-3 rounded-lg bg-muted/30">
                        No stores found within 100m
                      </p>
                    ) : (
                      nearbyStores.map((store) => (
                        <button
                          key={store.id}
                          onClick={() => {
                            setScannedStore({ id: store.id, name: store.name, display_id: store.display_id, address: null, photo_url: null, store_type: null });
                            toast.success(`Store selected: ${store.name}`);
                          }}
                          className="w-full flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 text-left hover:bg-accent transition-colors"
                        >
                          <div>
                            <p className="font-medium text-sm">{store.name}</p>
                            <p className="text-xs text-muted-foreground">{store.display_id}</p>
                          </div>
                          <Badge variant="secondary" className="text-xs font-semibold">{store.distance}m</Badge>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* QR Not Found Dialog */}
      <Dialog open={notFoundDialog} onOpenChange={(v) => { if (!v) { setNotFoundDialog(false); setLinkMode(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QR Code Not Linked</DialogTitle>
          </DialogHeader>
          {!linkMode ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1.5">
                <p><span className="text-muted-foreground text-xs uppercase tracking-wide">UPI ID</span></p>
                <p className="font-mono text-sm">{scannedUpi.upiId}</p>
                {scannedUpi.payeeName && (
                  <>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide pt-1">Payee Name</p>
                    <p className="text-sm">{scannedUpi.payeeName}</p>
                  </>
                )}
              </div>
              <p className="text-sm text-muted-foreground">This QR is not linked to any store. What would you like to do?</p>
              <div className="flex flex-col gap-2">
                {isAdmin ? (
                  <>
                    <Button onClick={handleCreateStore} className="gap-2 w-full">
                      <Store className="h-4 w-4" /> Create New Store
                    </Button>
                    <Button variant="outline" onClick={handleLinkStore} className="gap-2 w-full">
                      <MapPin className="h-4 w-4" /> Link to Existing Store
                    </Button>
                  </>
                ) : (
                  <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground text-center">
                    This QR is not linked to any store yet. Ask your manager to set it up, then try scanning again.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Select Store to Link</Label>
                <Select value={linkStoreId} onValueChange={setLinkStoreId}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose a store…" /></SelectTrigger>
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
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Link QR"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
