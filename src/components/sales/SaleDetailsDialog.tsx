import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, StoreIcon, Package, ClipboardList, RotateCcw, XCircle, Pencil } from "lucide-react";
import { format } from "date-fns";

interface SaleRecord {
  id: string;
  display_id: string;
  store_id: string;
  customer_id: string | null;
  recorded_by: string;
  recorded_at: string;
  total_amount: number;
  cash_amount?: number;
  upi_amount?: number;
  outstanding_amount?: number;
  created_at: string;
  updated_at: string;
  fulfilled_order_id?: string;
  is_fully_returned?: boolean;
  status?: string;
  stores?: { name: string } | null;
}

interface SaleDetailsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sale: SaleRecord | null;
  saleItems: any[];
  loadingSaleItems: boolean;
  isAdmin: boolean;
  canCancelSales: boolean;
  onReturn: (sale: SaleRecord) => void;
  onCancel: (sale: SaleRecord) => void;
  onEdit: (sale: SaleRecord) => void;
  onViewOrder: (orderId: string) => void;
  getRecorderName: (userId: string) => string;
  getRecorderAvatar: (userId: string) => string;
  isPastDate: (created: string, updated?: string) => boolean;
}

export function SaleDetailsDialog({
  open, onOpenChange, sale, saleItems, loadingSaleItems,
  isAdmin, canCancelSales, onReturn, onCancel, onEdit, onViewOrder,
  getRecorderName, getRecorderAvatar, isPastDate,
}: SaleDetailsDialogProps) {
  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Sale Details</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{sale.display_id}</span>
              {(sale as any).status === 'cancelled' && (
                <Badge className="text-2xs h-5 bg-red-100 text-red-600 border border-red-200 rounded px-1.5 py-0">
                  CANCELLED
                </Badge>
              )}
              {(sale as any).is_fully_returned && (
                <Badge className="text-2xs h-5 bg-amber-100 text-amber-600 border border-amber-200 rounded px-1.5 py-0">
                  RETURNED
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{format(new Date(sale.created_at), "dd MMM yy, hh:mm a")}</span>
          </div>
          <div className="flex items-center gap-2">
            <StoreIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{(sale as any).stores?.name || "—"}</span>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span>Total</span><span className="font-bold">₹{Number(sale.total_amount || 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Cash</span><span>₹{Number(sale.cash_amount || 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span>UPI</span><span>₹{Number(sale.upi_amount || 0).toLocaleString()}</span></div>
            <div className="flex justify-between font-medium"><span>Outstanding</span><span className={Number(sale.outstanding_amount || 0) > 0 ? "text-destructive" : ""}>₹{Number(sale.outstanding_amount || 0).toLocaleString()}</span></div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1.5"><Package className="h-4 w-4 text-muted-foreground" /> Items</p>
            {loadingSaleItems ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : saleItems && saleItems.length > 0 ? (
              <div className="space-y-1.5">
                {saleItems.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border bg-card p-2.5 text-sm">
                    <div>
                      <p className="font-medium">{item.products?.name || "—"}</p>
                      <p className="text-3xs text-muted-foreground">{item.products?.sku} · Qty: {Number(item.quantity) || 0}</p>
                      <p className="font-semibold">₹{Number(item.total_price || 0).toLocaleString()}</p>
                      <p className="text-3xs text-muted-foreground">@ ₹{Number(item.unit_price || 0).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No items recorded</p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t">
            <Avatar className="h-5 w-5">
              <AvatarImage src={getRecorderAvatar(sale.recorded_by) || undefined} />
              <AvatarFallback className="text-4xs bg-primary/10 text-primary">{getRecorderName(sale.recorded_by).charAt(0)}</AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">Recorded by {getRecorderName(sale.recorded_by)}</span>
          </div>
          {(sale as any).logged_by && (
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage src={getRecorderAvatar((sale as any).logged_by) || undefined} />
                <AvatarFallback className="text-4xs bg-accent/20 text-accent-foreground">{getRecorderName((sale as any).logged_by).charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">Logged by {getRecorderName((sale as any).logged_by)}</span>
            </div>
          )}

          {(sale as any).fulfilled_order_id && (
            <div className="pt-2 border-t">
              <Button variant="outline" className="w-full" onClick={() => onViewOrder((sale as any).fulfilled_order_id)}>
                <ClipboardList className="mr-2 h-4 w-4" /> View Source Order
              </Button>
            </div>
          )}

          {isAdmin && (sale as any).status !== 'cancelled' && !(sale as any).is_fully_returned && (
            <div className="pt-2 border-t">
              <Button variant="outline" className="w-full" onClick={() => onReturn(sale)}>
                <RotateCcw className="mr-2 h-4 w-4" /> Process Return
              </Button>
            </div>
          )}

          {canCancelSales && (sale as any).status !== 'cancelled' && !(sale as any).is_fully_returned && (
            <div className="pt-2 border-t">
              <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50" onClick={() => onCancel(sale)}>
                <XCircle className="mr-2 h-4 w-4" /> Cancel Sale
              </Button>
            </div>
          )}

          {(sale as any).status !== 'cancelled' && !(sale as any).is_fully_returned && !isPastDate(sale.created_at, sale.updated_at) && (
            <div className="pt-2 border-t">
              <Button variant="outline" className="w-full" onClick={() => onEdit(sale)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit Sale
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
