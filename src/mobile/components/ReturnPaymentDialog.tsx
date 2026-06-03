import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/integrations/supabase/client"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, RotateCcw } from "lucide-react"
import { fmtINR } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import { afterPaymentReturned } from "@/lib/mutationHelpers"

interface Transaction {
  id: string
  display_id: string
  total_amount: number
  cash_amount: number
  upi_amount: number
  store_id: string
  customer_id?: string
  stores?: { name: string; display_id: string }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
}

export function ReturnPaymentDialog({ open, onOpenChange, transaction }: Props) {
  const [returnType, setReturnType] = useState("cash")
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const qc = useQueryClient()
  const { user } = useAuth()

  const returnAmount = transaction?.total_amount || 0

  const handleSubmit = async () => {
    if (!returnAmount || returnAmount <= 0) { setError("Invalid return amount"); return }
    if (!reason) { setError("Select a reason"); return }
    if (!transaction || !user?.id) return

    setSubmitting(true)
    setError("")
    try {
      const { data: displayIdResult } = await supabase.rpc("generate_random_display_id", {
        p_prefix: "RET",
        p_table_name: "payment_returns",
      }) as any;
      const displayId = displayIdResult || ("RET-" + Date.now().toString().slice(-6));
      const { error: rpcError } = await supabase.rpc("record_payment_return", {
        p_display_id: displayId,
        p_original_transaction_id: transaction.id,
        p_store_id: transaction.store_id,
        p_customer_id: transaction.customer_id || null,
        p_return_amount: returnAmount,
        p_return_type: returnType,
        p_reason: reason,
        p_notes: notes || null,
        p_recorded_by: user.id,
        p_logged_by: user.id,
      })
      if (rpcError) throw rpcError

      afterPaymentReturned(qc, { isMobile: true })
      onOpenChange(false)
      setReturnType("cash")
      setReason("")
      setNotes("")
    } catch (err) {
      setError((err as Error).message || "Failed to process return")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) { onOpenChange(false); setError(""); } }}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Full Return Payment</DialogTitle>
        </DialogHeader>
        {transaction && (
          <div className="space-y-3">
            <div className="rounded-xl bg-muted/50 p-3 space-y-1">
              <p className="text-sm font-medium">{transaction.display_id}</p>
              <p className="text-xs text-muted-foreground">{transaction.stores?.name}</p>
              <p className="text-sm font-bold text-red-500">Full amount: {fmtINR(returnAmount)}</p>
              <p className="text-[10px] text-muted-foreground">For partial adjustments, edit the transaction instead.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Return Type</Label>
              <Select value={returnType} onValueChange={setReturnType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="duplicate_payment">Duplicate Payment</SelectItem>
                  <SelectItem value="wrong_amount">Wrong Amount</SelectItem>
                  <SelectItem value="cancelled_order">Cancelled Order</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea placeholder="Additional details..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <Button onClick={handleSubmit} disabled={!reason || submitting} className="w-full rounded-xl">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Return Full {fmtINR(returnAmount)}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
