import { useCallback, useEffect, useRef, useState } from "react";
import { logError } from "@/lib/logger";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, ScanLine } from "lucide-react";

interface QrScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (data: string) => void;
  title?: string;
}

export function QrScanner({ open, onOpenChange, onScan, title = "Scan QR Code" }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const containerId = "qr-reader";

  const startScanner = useCallback(async () => {
    setError(null);
    try {
      // Stop any existing scanner first
      if (scannerRef.current) {
        await scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }

      const scanner = new Html5Qrcode(containerId, {
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
            const size = Math.min(vw, vh, 280);
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          onScan(decodedText);
          scanner.stop().catch(() => {});
          scannerRef.current = null;
          setStarted(false);
          onOpenChange(false);
        },
        () => {}
      );
      setStarted(true);
    } catch (err: unknown) {
      logError("QR Scanner error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
        setError("Camera permission denied. Please allow camera access in your browser settings.");
      } else if (msg.includes("NotFoundError") || msg.includes("not found")) {
        setError("No camera found on this device.");
      } else {
        setError("Could not start camera: " + msg);
      }
    }
  }, [onScan, onOpenChange]);

  // Auto-start when dialog opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => startScanner(), 300);
      return () => clearTimeout(t);
    }
  }, [open, startScanner]);

  const handleClose = useCallback((v: boolean) => {
    if (!v) {
      scannerRef.current?.stop().catch(() => {});
      scannerRef.current = null;
      setStarted(false);
      setError(null);
    }
    onOpenChange(v);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="relative w-full rounded-lg overflow-hidden bg-black/5 dark:bg-white/5" style={{ minHeight: 200 }}>
          <div id={containerId} className="w-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&_div]:hidden" />
          {started && !error && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent rounded-full opacity-80" style={{ animation: "qr-scan-line 2s ease-in-out infinite" }} />
            </div>
          )}
        </div>

        <style>{`
          @keyframes qr-scan-line {
            0%, 100% { top: 15%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            50% { top: 80%; }
          }
        `}</style>

        {error ? (
          <div className="text-center py-4 space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => { setError(null); startScanner(); }} aria-label="Retry scanning">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
            </Button>
          </div>
        ) : !started ? (
          <div className="text-center py-4">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <ScanLine className="h-4 w-4 animate-pulse" />
              <p className="text-xs font-medium">Starting camera...</p>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
