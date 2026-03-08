import { useState } from "react";
import { QrScanner } from "./QrScanner";
import { parseUpiQr, isMerchantUpi } from "@/lib/upiParser";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScanLine, Plus, Link } from "lucide-react";
import { toast } from "sonner";

interface QrStoreSelectorProps {
  onStoreSelected: (storeId: string) => void;
  onCreateStore?: (prefill: { name?: string; upiId: string; rawQr: string }) => void;
  triggerClassName?: string;
}

export function QrStoreSelector({ onStoreSelected, onCreateStore, triggerClassName }: QrStoreSelectorProps) {
  const [scanning, setScanning] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [scannedUpi, setScannedUpi] = useState({ upiId: "", payeeName: "", raw: "" });
  const [linkMode, setLinkMode] = useState(false);
  const [linkStoreId, setLinkStoreId] = useState("");
  const [stores, setStores] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const handleScan = async (data: string) => {
    const upi = parseUpiQr(data);
    if (!upi) {
      toast.error("Not a valid UPI QR code");
      return;
    }

    // Look up store by upi_id
    const { data: qrRecord } = await supabase
      .from("store_qr_codes")
      .select("store_id")
      .eq("upi_id", upi.pa)
      .maybeSingle();

    if (qrRecord?.store_id) {
      onStoreSelected(qrRecord.store_id);
      toast.success("Store found via QR");
    } else {
      // Not found — show options
      setScannedUpi({ upiId: upi.pa, payeeName: upi.pn, raw: upi.raw });
      setNotFound(true);
    }
  };

  const handleCreateStore = () => {
    setNotFound(false);
    const isMerchant = scannedUpi.raw ? isMerchantUpi(parseUpiQr(scannedUpi.raw)!) : false;
    onCreateStore?.({
      name: scannedUpi.payeeName || "",
      upiId: scannedUpi.upiId,
      rawQr: scannedUpi.raw,
    });
  };

  const handleLinkStore = async () => {
    // Load stores for selection
    const { data } = await supabase.from("stores").select("id, name, display_id").eq("is_active", true);
    setStores(data || []);
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
    toast.success("QR linked to store");
    onStoreSelected(linkStoreId);
    setNotFound(false);
    setLinkMode(false);
    setLinkStoreId("");
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={triggerClassName}
        onClick={() => setScanning(true)}
        title="Scan QR"
      >
        <ScanLine className="h-4 w-4" />
      </Button>

      <QrScanner
        open={scanning}
        onOpenChange={setScanning}
        onScan={handleScan}
        title="Scan Store QR"
      />

      {/* Not Found Dialog */}
      <Dialog open={notFound} onOpenChange={(v) => { if (!v) { setNotFound(false); setLinkMode(false); } }}>
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
                {onCreateStore && (
                  <Button onClick={handleCreateStore} className="gap-2">
                    <Plus className="h-4 w-4" /> Create New Store
                  </Button>
                )}
                <Button variant="outline" onClick={handleLinkStore} className="gap-2">
                  <Link className="h-4 w-4" /> Link to Existing Store
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
                    {stores.map((s) => (
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
