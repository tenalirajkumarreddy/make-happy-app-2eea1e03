import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { parseUpiQr } from "@/lib/upiParser";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ScanLine, RefreshCw, Store, Banknote, ShoppingCart,
  MapPin, Loader2, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
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
        setScannerError("Camera permission denied. Enable it in Settings.");
      } else if (msg.includes("NotFoundError")) {
        setScannerError("No camera found on this device.");
      } else {
        setScannerError("Could not start camera. Tap retry.");
      }
    }
  }, []);

  // Start camera when component mounts, stop on unmount
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

    // Lookup store linked to this UPI ID
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

  const cameraHeight = foundStore || unknownUpi ? 200 : 320;

  return (
    <div className="flex flex-col">
      {/* Camera viewport */}
      <div
        className="relative bg-black overflow-hidden"
        style={{ height: cameraHeight }}
      >
        <div
          id={SCANNER_ID}
          className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&_div]:hidden"
        />

        {/* Overlay — only shown when camera is active and no result yet */}
        {!foundStore && !unknownUpi && !scannerError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="w-52 h-52 relative">
              {/* Corner brackets */}
              <span className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-primary rounded-tl-lg" />
              <span className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-primary rounded-tr-lg" />
              <span className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-primary rounded-bl-lg" />
              <span className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-primary rounded-br-lg" />
            </div>
            <p className="mt-4 text-white/80 text-sm font-medium drop-shadow-lg">
              {processing ? "Looking up store..." : "Point at a UPI QR code"}
            </p>
          </div>
        )}

        {/* Processing spinner */}
        {processing && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Loader2 className="h-10 w-10 text-white animate-spin" />
          </div>
        )}

        {/* Camera error state */}
        {scannerError && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-4 p-6">
            <ScanLine className="h-14 w-14 text-white/30" />
            <p className="text-white text-center text-sm leading-relaxed">{scannerError}</p>
            <Button size="sm" variant="secondary" onClick={() => startScanner()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Retry Camera
            </Button>
          </div>
        )}
      </div>

      {/* Results */}
      {foundStore && (
        <div className="p-4 space-y-3">
          {/* Store info card */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Store className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base leading-tight">{foundStore.name}</p>
                  <p className="text-xs text-muted-foreground">{foundStore.display_id}</p>
                  {foundStore.address && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{foundStore.address}</span>
                    </div>
                  )}
                  {foundStore.store_types?.name && (
                    <Badge variant="secondary" className="mt-2 text-xs">
                      {foundStore.store_types.name}
                    </Badge>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground">Balance</p>
                  <p className={`font-bold text-sm ${foundStore.outstanding > 0 ? "text-destructive" : "text-green-600"}`}>
                    ₹{Number(foundStore.outstanding).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              className="h-16 rounded-2xl flex-col gap-1.5"
              onClick={() => onGoRecord(foundStore, "sale")}
            >
              <ShoppingCart className="h-5 w-5" />
              <span className="text-[11px] font-semibold">Record Sale</span>
            </Button>
            <Button
              variant="outline"
              className="h-16 rounded-2xl flex-col gap-1.5"
              onClick={() => onGoRecord(foundStore, "payment")}
            >
              <Banknote className="h-5 w-5" />
              <span className="text-[11px] font-semibold">Collect Payment</span>
            </Button>
            <Button
              variant="outline"
              className="h-16 rounded-2xl flex-col gap-1.5 border-green-500/40 text-green-600 dark:text-green-400 hover:bg-green-500/10"
              onClick={() => handleVisitStore(foundStore)}
              disabled={visitLoading}
            >
              {visitLoading
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <CheckCircle2 className="h-5 w-5" />}
              <span className="text-[11px] font-semibold">Visit Store</span>
            </Button>
          </div>

          <Button variant="ghost" className="w-full" onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Scan Again
          </Button>
        </div>
      )}

      {unknownUpi && !foundStore && (
        <div className="p-4 space-y-3">
          <Card className="border-amber-400/40 bg-amber-500/5">
            <CardContent className="p-4 space-y-1.5">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                UPI QR — No Store Linked
              </p>
              <p className="font-mono text-sm break-all">{unknownUpi.upiId}</p>
              {unknownUpi.payeeName && (
                <p className="text-sm text-muted-foreground">{unknownUpi.payeeName}</p>
              )}
              <p className="text-xs text-muted-foreground pt-1">
                This UPI ID is not linked to any store. Ask your admin to link it.
              </p>
            </CardContent>
          </Card>
          <Button variant="outline" className="w-full" onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Scan Again
          </Button>
        </div>
      )}

      {!foundStore && !unknownUpi && !scannerError && (
        <div className="px-6 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            Scan a store's UPI QR to instantly record a sale or collect payment
          </p>
        </div>
      )}
    </div>
  );
}
