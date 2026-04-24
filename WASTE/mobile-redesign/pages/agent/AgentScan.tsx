import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { parseUpiQr } from "@/lib/upiParser";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ScanLine, RefreshCw, Store, Banknote, ShoppingCart,
  MapPin, Loader2, CheckCircle2, AlertTriangle, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import type { StoreOption } from "@/mobile/components/StorePickerSheet";

const SCANNER_ID = "mobile-qr-reader";

interface Props {
  onGoRecord: (store: StoreOption, action: "sale" | "payment") => void;
}

export function AgentScan({ onGoRecord }: Props) {
  const { user } = useAuth();
  const [scannerStarted, setScannerStarted] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [foundStore, setFoundStore] = useState<StoreOption | null>(null);
  const [unknownUpi, setUnknownUpi] = useState<{ upiId: string; payeeName: string } | null>(null);
  const [visitLoading, setVisitLoading] = useState(false);

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
      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => { onScanRef.current?.(decodedText); },
        () => {}
      );
      setScannerStarted(true);
    } catch (err: any) {
      const msg = err?.message || String(err);
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
    const t = setTimeout(() => startScanner(), 300);
    return () => {
      clearTimeout(t);
      stopScanner();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      .select("store_id, stores(id, name, display_id, outstanding, address, phone, lat, lng, route_id, is_active, store_type_id, customer_id, customers(name), store_types(name), routes(name))")
      .eq("upi_id", upi.pa)
      .maybeSingle();

    if (qrRecord?.store_id && qrRecord.stores) {
      const s = qrRecord.stores as any;
      const storeOption: StoreOption = {
        id: s.id,
        name: s.name,
        display_id: s.display_id,
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
      setFoundStore(storeOption);
      toast.success(`Store found: ${s.name}`);
    } else {
      setUnknownUpi({ upiId: upi.pa, payeeName: upi.pn });
      toast.warning("UPI QR found but no store is linked to it");
    }

    setProcessing(false);
  }, [processing, stopScanner, startScanner]);

  onScanRef.current = handleQrScan;

  const reset = async () => {
    setFoundStore(null);
    setUnknownUpi(null);
    await stopScanner();
    setTimeout(() => startScanner(), 200);
  };

  const handleVisitStore = async (store: StoreOption) => {
    if (!user) return;
    setVisitLoading(true);
    try {
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
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {}
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

  const hasResult = foundStore || unknownUpi;
  const cameraHeight = hasResult ? 200 : 320;

  return (
    <div className="flex flex-col min-h-full">
      {/* Camera section */}
      <div
        className="relative bg-slate-900 overflow-hidden"
        style={{ height: cameraHeight, transition: "height 0.3s ease" }}
      >
        <div
          id={SCANNER_ID}
          className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&_div]:hidden"
        />

        {/* Scanning overlay */}
        {!hasResult && !scannerError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {/* Dimmed edges */}
            <div className="absolute inset-0 bg-black/30" style={{
              maskImage: "radial-gradient(ellipse 260px 260px at center, transparent 40%, black 70%)",
              WebkitMaskImage: "radial-gradient(ellipse 260px 260px at center, transparent 40%, black 70%)",
            }} />

            {/* Corner frame */}
            <div className="w-56 h-56 relative">
              <span className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-blue-400 rounded-tl-xl" />
              <span className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-blue-400 rounded-tr-xl" />
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-blue-400 rounded-bl-xl" />
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-blue-400 rounded-br-xl" />

              {/* Scanning line animation */}
              {scannerStarted && !processing && (
                <div
                  className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent rounded-full opacity-80"
                  style={{
                    animation: "scan-line 2s ease-in-out infinite",
                  }}
                />
              )}
            </div>

            <div className="absolute bottom-5 left-0 right-0 flex justify-center">
              <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
                <ScanLine className="h-4 w-4 text-blue-400 animate-pulse" />
                <p className="text-white text-sm font-medium">
                  {processing ? "Looking up store..." : "Point at a UPI QR code"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Processing spinner */}
        {processing && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
            <div className="h-16 w-16 rounded-full bg-blue-500/20 border-2 border-blue-400/50 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
            </div>
            <p className="text-white text-sm font-medium">Identifying store...</p>
          </div>
        )}

        {/* Camera error */}
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

      {/* CSS for scan line animation */}
      <style>{`
        @keyframes scan-line {
          0%, 100% { top: 10%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          50% { top: 85%; }
        }
      `}</style>

      {/* Store found result */}
      {foundStore && (
        <div className="p-4 space-y-3">
          {/* Store card */}
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-800/40 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30 px-4 py-2.5 flex items-center gap-2 border-b border-emerald-100 dark:border-emerald-800/40">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Store Identified</span>
            </div>
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                  <Store className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 dark:text-white text-base leading-tight">{foundStore.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{foundStore.display_id}</p>
                  {foundStore.address && (
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{foundStore.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {foundStore.store_types?.name && (
                      <Badge variant="secondary" className="text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-0">
                        {foundStore.store_types.name}
                      </Badge>
                    )}
                    {foundStore.routes?.name && (
                      <Badge variant="secondary" className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-0">
                        {foundStore.routes.name}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-slate-400 mb-0.5">Balance</p>
                  <p className={cn(
                    "font-bold text-base",
                    foundStore.outstanding > 0 ? "text-red-500" : "text-emerald-500"
                  )}>
                    ₹{Number(foundStore.outstanding).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onGoRecord(foundStore, "sale")}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
            >
              <ShoppingCart className="h-6 w-6 text-white" />
              <span className="text-[11px] font-bold text-white leading-tight text-center">Record Sale</span>
            </button>
            <button
              onClick={() => onGoRecord(foundStore, "payment")}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 transition-all shadow-sm"
            >
              <Banknote className="h-6 w-6 text-emerald-500" />
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-tight text-center">Collect Payment</span>
            </button>
            <button
              onClick={() => handleVisitStore(foundStore)}
              disabled={visitLoading}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 active:scale-95 transition-all shadow-sm disabled:opacity-60"
            >
              {visitLoading
                ? <Loader2 className="h-6 w-6 text-emerald-500 animate-spin" />
                : <CheckCircle2 className="h-6 w-6 text-emerald-500" />}
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 leading-tight text-center">Mark Visited</span>
            </button>
          </div>

          <Button
            variant="ghost"
            className="w-full h-10 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={reset}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Scan Again
          </Button>
        </div>
      )}

      {/* Unknown UPI */}
      {unknownUpi && !foundStore && (
        <div className="p-4 space-y-3">
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">No Store Linked</p>
            </div>
            <p className="font-mono text-sm text-slate-700 dark:text-slate-300 break-all bg-white dark:bg-slate-800 px-3 py-2 rounded-xl">
              {unknownUpi.upiId}
            </p>
            {unknownUpi.payeeName && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{unknownUpi.payeeName}</p>
            )}
            <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-3 leading-relaxed">
              This UPI ID is not linked to any store. Ask your admin to register it.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full h-10 rounded-xl border-slate-200 dark:border-slate-700"
            onClick={reset}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Scan Again
          </Button>
        </div>
      )}

      {/* Idle hint */}
      {!hasResult && !scannerError && (
        <div className="px-6 py-5 text-center">
          <div className="flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500">
            <Zap className="h-3.5 w-3.5" />
            <p className="text-xs font-medium">
              Scan to instantly record a sale or collect payment
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
