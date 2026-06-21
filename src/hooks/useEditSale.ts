import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { afterSaleEdited } from "@/lib/mutationHelpers";
import { toast } from "sonner";

export function useEditSale() {
  const qc = useQueryClient();
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [editCash, setEditCash] = useState("");
  const [editUpi, setEditUpi] = useState("");
  const [editingItems, setEditingItems] = useState<any[]>([]);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const { data: editSaleItems } = useQuery({
    queryKey: ["edit-sale-items", editingSaleId],
    queryFn: async () => {
      const { data } = await supabase.from("sale_items").select("*, products(name, sku)").eq("sale_id", editingSaleId!);
      return data || [];
    },
    enabled: !!editingSaleId,
  });

  useEffect(() => {
    if (editSaleItems && editSaleItems.length > 0 && editingItems.length === 0 && editingSaleId) {
      setEditingItems(editSaleItems.map((item: any) => ({
        product_id: item.product_id, name: item.products?.name || "Product",
        quantity: item.quantity, unit_price: item.unit_price, total_price: item.quantity * item.unit_price,
      })));
    }
  }, [editSaleItems, editingItems.length, editingSaleId]);

  const openEditSale = (row: any) => {
    setEditCash(String(row.cash_amount || 0));
    setEditUpi(String(row.upi_amount || 0));
    setEditingItems([]);
    setEditingSaleId(row.id);
  };

  const closeEditSale = () => {
    setEditingSaleId(null); setEditCash(""); setEditUpi(""); setEditingItems([]);
  };

  const handleEditSale = async (editingSale: any) => {
    if (!editingSale || !editingSaleId) return;
    if (editingItems.length === 0) { toast.error("At least one product item is required"); return; }
    setSubmittingEdit(true);
    try {
      const editedTotalAmount = editingItems.reduce((sum: number, item: any) => sum + item.quantity * item.unit_price, 0);
      const editedOutstanding = editedTotalAmount - (Number(editCash) || 0) - (Number(editUpi) || 0);
      if (editedOutstanding < 0) { toast.error("Payment exceeds sale total. Reduce payment amount."); setSubmittingEdit(false); return; }
      const { error } = await (supabase as any).rpc("edit_sale", {
        p_original_sale_id: editingSaleId, p_store_id: editingSale.store_id, p_customer_id: editingSale.customer_id,
        p_display_id: editingSale.display_id, p_total_amount: editedTotalAmount, p_cash_amount: Number(editCash) || 0,
        p_upi_amount: Number(editUpi) || 0, p_outstanding_amount: editedOutstanding,
        p_sale_items: editingItems.map((si: any) => ({ product_id: si.product_id, quantity: si.quantity, unit_price: si.unit_price, total_price: si.quantity * si.unit_price })),
        p_recorded_by: editingSale.recorded_by, p_logged_by: (editingSale as any).logged_by || null,
        p_created_at: editingSale.created_at, p_expected_outstanding: (editingSale as any).outstanding ?? null,
      });
      if (error) throw error;
      toast.success("Sale updated successfully");
      closeEditSale();
      afterSaleEdited(qc);
    } catch (err: any) {
      toast.error(err.message || "Failed to edit sale");
    } finally { setSubmittingEdit(false); }
  };

  return {
    editingSaleId, setEditingSaleId, editCash, setEditCash, editUpi, setEditUpi,
    editingItems, setEditingItems, submittingEdit, openEditSale, closeEditSale, handleEditSale,
  };
}
