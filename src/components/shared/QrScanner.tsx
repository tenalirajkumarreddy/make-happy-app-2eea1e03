import { useCallback, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw } from "lucide-react";

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
      // Request camera access directly in user gesture context
      await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });

      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
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
    } catch {
      setError("Camera access denied or not available");
    }
  }, [onScan, onOpenChange]);

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

        <div id={containerId} className="w-full rounded-lg overflow-hidden" />

        {error ? (
          <div className="text-center py-4 space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => { setError(null); }}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
            </Button>
          </div>
        ) : !started ? (
          <div className="text-center py-4">
            <Button onClick={startScanner}>
              <Camera className="h-4 w-4 mr-2" /> Start Camera
            </Button>
            <p className="text-xs text-muted-foreground mt-2">Tap to allow camera access</p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
