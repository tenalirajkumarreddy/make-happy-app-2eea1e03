import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";

interface QrScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (data: string) => void;
  title?: string;
}

export function QrScanner({ open, onOpenChange, onScan, title = "Scan QR Code" }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerId = "qr-reader";

  useEffect(() => {
    if (!open) return;

    let mounted = true;
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (!mounted) return;
          onScan(decodedText);
          scanner.stop().catch(() => {});
          onOpenChange(false);
        },
        () => {} // ignore scan failures
      )
      .catch((err) => {
        if (mounted) setError("Camera access denied or not available");
      });

    return () => {
      mounted = false;
      scanner.stop().catch(() => {});
      scannerRef.current = null;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && scannerRef.current) scannerRef.current.stop().catch(() => {}); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            {title}
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => { setError(null); onOpenChange(false); }}>Close</Button>
          </div>
        ) : (
          <div id={containerId} className="w-full rounded-lg overflow-hidden" />
        )}
      </DialogContent>
    </Dialog>
  );
}
