import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/integrations/supabase/client"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, RotateCcw } from "lucide-react"
import { fmtINR } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"

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
  const [returnAmount, setReturnAmount] = useState("")
  const [returnType, setReturnType] = useState("cash")
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const qc = useQueryClient()
  const { user } = useAuth()

  const maxReturn = transaction?.total_amount || 0

  const handleSubmit = async () => {
    const amount = Number.parseFloat(returnAmount)
    if (!amount || amount <= 0) { setError("Enter a valid amount"); return }
    if (amount > maxReturn) { setError(`Amount cannot exceed ${fmtINR(maxReturn)}`); return }
    if (!reason) { setError("Select a reason"); return }
    if (!transaction || !user?.id) return

    setSubmitting(true)
    setError("")
    try {
      const { error: rpcError } = await supabase.rpc("record_payment_return", {
        p_original_transaction_id: transaction.id,
        p_store_id: transaction.store_id,
        p_customer_id: transaction.customer_id || null,
        p_return_amount: amount,
        p_return_type: returnType,
        p_reason: reason,
        p_notes: notes || null,
        p_recorded_by: user.id,
      })
      if (rpcError) throw rpcError

      qc.invalidateQueries({ queryKey: ["mobile-transactions"] })
      qc.invalidateQueries({ queryKey: ["mobile-admin-dashboard"] })
      qc.invalidateQueries({ queryKey: ["mobile-recent-activity"] })
      onOpenChange(false)
      setReturnAmount("")
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
          <DialogTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Return Payment</DialogTitle>
        </DialogHeader>
        {transaction && (
          <div className="space-y-3">
            <div className="rounded-xl bg-muted/50 p-3 space-y-1">
              <p className="text-sm font-medium">{transaction.display_id}</p>
              <p className="text-xs text-muted-foreground">{transaction.stores?.name}</p>
              <p className="text-xs text-muted-foreground">Max return: {fmtINR(maxReturn)}</p>
            </div>

            <div className="space-y-1.5">
              <Label>Return Amount</Label>
              <Input type="number" placeholder="0" value={returnAmount} onChange={(e) => setReturnAmount(e.target.value)} max={maxReturn} />
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

            <Button onClick={handleSubmit} disabled={!returnAmount || !reason || submitting} className="w-full rounded-xl">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Process Return
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
