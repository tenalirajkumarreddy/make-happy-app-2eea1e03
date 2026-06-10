import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/integrations/supabase/client"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/contexts/AuthContext"
import { Loader2, FileText, CheckCircle2 } from "lucide-react"
import { fmtINR } from "@/lib/utils"

interface SaleItem {
  id: string
  product_id: string
  quantity: number
  unit_price: number
  total_price: number
  products?: { name: string; sku: string }
}

interface Sale {
  id: string
  display_id: string
  total_amount: number
  customer_name?: string
  customer_phone?: string
  store_id?: string
  warehouse_id?: string
  sale_items?: SaleItem[]
  stores?: { name: string }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  sale: Sale | null
}

export function InvoiceDialog({ open, onOpenChange, sale }: Props) {
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [invoiceType, setInvoiceType] = useState("tax")
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [invoiceId, setInvoiceId] = useState("")
  const qc = useQueryClient()
  const { user } = useAuth()

  // Reset state when dialog opens with a new sale
  useEffect(() => {
    if (open && sale) {
      setCustomerName(sale.customer_name || "")
      setCustomerPhone(sale.customer_phone || "")
      setNotes("")
      setError("")
      setSuccess(false)
      setInvoiceId("")
      generateInvoiceNumber()
    }
  }, [open, sale])

  const generateInvoiceNumber = async () => {
    try {
      const { data, error } = await supabase.rpc("get_next_invoice_number")
      if (error) throw error
      setInvoiceNumber(data || "")
    } catch {
      setInvoiceNumber(`INV-${Date.now()}`)
    }
  }

  const handleSubmit = async () => {
    if (!sale || !user?.id) return
    if (!customerName.trim()) { setError("Customer name is required"); return }

    setSubmitting(true)
    setError("")
    try {
      const invoiceItems = (sale.sale_items || []).map((item) => ({
        product_id: item.product_id,
        product_name: item.products?.name || "Unknown",
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_amount: item.total_price,
        sale_item_id: item.id,
      }))

      const subtotal = invoiceItems.reduce((sum, i) => sum + i.total_amount, 0)
      const taxAmount = 0
      const discountAmount = 0
      const totalAmount = subtotal + taxAmount - discountAmount

      const { data: newInvoice, error: insertError } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          invoice_date: new Date().toISOString().split("T")[0],
          invoice_type: invoiceType,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || null,
          subtotal,
          tax_amount: taxAmount,
          discount_amount: discountAmount,
          total_amount: totalAmount,
          notes: notes.trim() || null,
          status: "active",
          created_by: user.id,
          store_id: sale.store_id || null,
        })
        .select("id")
        .single()

      if (insertError) throw insertError

      if (invoiceItems.length > 0) {
        const { error: itemsError } = await supabase
          .from("invoice_items")
          .insert(invoiceItems.map((item) => ({
            invoice_id: newInvoice.id,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_amount: item.total_amount,
          })))
        if (itemsError) throw itemsError
      }

      const { error: linkError } = await supabase
        .from("invoice_sales")
        .insert({
          invoice_id: newInvoice.id,
          sale_id: sale.id,
          warehouse_id: sale.warehouse_id || null,
        })
      if (linkError) throw linkError

      setInvoiceId(newInvoice.id)
      setSuccess(true)
      qc.invalidateQueries({ queryKey: ["mobile-sales"] })
      qc.invalidateQueries({ queryKey: ["mobile-admin-dashboard"] })
    } catch (err) {
      setError((err as Error).message || "Failed to create invoice")
    } finally {
      setSubmitting(false)
    }
  }

  const totalAmount = (sale?.sale_items || []).reduce((sum, i) => sum + i.total_price, 0)

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) { onOpenChange(false); setSuccess(false); } }}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {success ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <FileText className="h-4 w-4" />}
            {success ? "Invoice Created" : "Generate Invoice"}
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 py-4 text-center">
            <div className="h-16 w-16 rounded-2xl bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Invoice #{invoiceNumber}</h3>
              <p className="text-sm text-muted-foreground mt-1">has been generated successfully</p>
            </div>
            <Button className="w-full rounded-xl" onClick={() => { onOpenChange(false); setSuccess(false); }}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {sale && (
              <div className="rounded-xl bg-muted/50 p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Sale</span>
                  <span className="text-xs font-medium">{sale.display_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Store</span>
                  <span className="text-xs">{sale.stores?.name || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Amount</span>
                  <span className="text-xs font-semibold">{fmtINR(sale.total_amount)}</span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Invoice Number</Label>
              <Input value={invoiceNumber} readOnly className="font-mono text-sm bg-muted/30" />
            </div>

            <div className="space-y-1.5">
              <Label>Invoice Type</Label>
              <Select value={invoiceType} onValueChange={setInvoiceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tax">Tax Invoice</SelectItem>
                  <SelectItem value="credit_note">Credit Note</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Customer Name *</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" />
            </div>

            <div className="space-y-1.5">
              <Label>Customer Phone</Label>
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" />
            </div>

            {sale?.sale_items && sale.sale_items.length > 0 && (
              <div className="space-y-1.5">
                <Label>Items</Label>
                <div className="rounded-xl border bg-card p-2 space-y-1.5">
                  {sale.sale_items.map((item) => (
                    <div key={item.id} className="flex justify-between text-xs">
                      <span className="truncate flex-1">{item.products?.name || "Unknown"} x{item.quantity}</span>
                      <span className="font-medium ml-2">{fmtINR(item.total_price)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs font-semibold pt-1.5 border-t">
                    <span>Total</span>
                    <span>{fmtINR(totalAmount)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <Button onClick={handleSubmit} disabled={submitting} className="w-full rounded-xl">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Generate Invoice
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
