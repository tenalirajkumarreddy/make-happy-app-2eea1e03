import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useWarehouse } from '@/contexts/WarehouseContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PlusCircle, Trash2, Upload, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { usePermission } from '@/hooks/usePermission';

interface PurchaseItem {
  raw_material_id: string;
  quantity: number;
  unit_price: number;
}

interface RecordPurchaseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const RecordPurchaseForm = ({ open, onOpenChange }: RecordPurchaseFormProps) => {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const { allowed: canManagePurchases } = usePermission("manage_purchases");
  const queryClient = useQueryClient();

  const [vendorId, setVendorId] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([{ raw_material_id: '', quantity: 1, unit_price: 0 }]);
  const [billAmount, setBillAmount] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [billFile, setBillFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: vendors, isLoading: vendorsLoading } = useQuery({
    queryKey: ['vendors', currentWarehouse?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, name, display_id')
        .eq('warehouse_id', currentWarehouse?.id ?? '')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!currentWarehouse?.id,
  });

  const { data: materials, isLoading: materialsLoading } = useQuery({
    queryKey: ['raw_materials', currentWarehouse?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raw_materials')
        .select('id, name, unit')
        .eq('warehouse_id', currentWarehouse?.id ?? '')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!currentWarehouse?.id,
  });

  const itemsTotal = items.reduce((sum, item) => {
    return sum + (item.quantity || 0) * (item.unit_price || 0);
  }, 0);

  const parsedBillAmount = parseFloat(billAmount) || 0;
  const difference = parsedBillAmount - itemsTotal;

  const addItem = () => {
    setItems([...items, { raw_material_id: '', quantity: 1, unit_price: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof PurchaseItem, value: string | number) => {
    const newItems = [...items];
    if (field === 'quantity' || field === 'unit_price') {
      newItems[index] = { ...newItems[index], [field]: Number(value) || 0 };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setItems(newItems);
  };

  const uploadBill = async (file: File): Promise<string | null> => {
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('File size must be under 5MB');
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${user?.id}/${Date.now()}.${fileExt}`;
    const filePath = `purchase-bills/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('purchase-bills')
      .upload(filePath, file);

    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData } = supabase.storage
      .from('purchase-bills')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  };

  const resetForm = () => {
    setVendorId('');
    setItems([{ raw_material_id: '', quantity: 1, unit_price: 0 }]);
    setBillAmount('');
    setBillNumber('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setBillFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canManagePurchases) {
      toast.error('You do not have permission to record purchases');
      return;
    }

    if (!currentWarehouse?.id) {
      toast.error('No warehouse selected');
      return;
    }

    if (!vendorId) {
      toast.error('Please select a vendor');
      return;
    }

    const validItems = items.filter(item => item.raw_material_id && item.quantity > 0);
    if (validItems.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    try {
      setUploading(true);
      let billUrl: string | null = null;

      if (billFile) {
        billUrl = await uploadBill(billFile);
      }

      const purchaseStatus = (role === 'super_admin' || role === 'manager') ? 'completed' : 'pending';

      const { data, error } = await supabase.rpc('record_purchase', {
        p_vendor_id: vendorId,
        p_warehouse_id: currentWarehouse?.id || null,
        p_items: validItems.map(item => ({
          raw_material_id: item.raw_material_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
        p_bill_amount: parsedBillAmount || itemsTotal,
        p_bill_number: billNumber.trim() || null,
        p_invoice_date: invoiceDate || null,
        p_notes: notes.trim() || null,
        p_bill_url: billUrl,
        p_user_id: user?.id || null,
        p_status: purchaseStatus,
      });

      if (error) throw error;

      toast.success(`Purchase recorded: ${data}`);
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['raw_materials'] });
      resetForm();
      onOpenChange(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to record purchase';
      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Purchase</DialogTitle>
          <DialogDescription>
            Record a completed purchase from a vendor with bill details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Vendor *</Label>
            <Select value={vendorId} onValueChange={setVendorId} required>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={vendorsLoading ? 'Loading...' : 'Select a vendor'} />
              </SelectTrigger>
              <SelectContent>
                {vendors?.map(vendor => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name} ({vendor.display_id})
                  </SelectItem>
                ))}
                {!vendorsLoading && vendors?.length === 0 && (
                  <SelectItem value="" disabled>No vendors found</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Items *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <PlusCircle className="mr-1 h-4 w-4" />
                Add Item
              </Button>
            </div>

            {items.map((item, index) => (
              <div key={index} className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Item {index + 1}</span>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(index)}
                      className="text-destructive h-8 px-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Raw Material *</Label>
                  <Select
                    value={item.raw_material_id}
                    onValueChange={(value) => updateItem(index, 'raw_material_id', value)}
                    required
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={materialsLoading ? 'Loading...' : 'Select material'} />
                    </SelectTrigger>
                    <SelectContent>
                      {materials?.map(material => (
                        <SelectItem key={material.id} value={material.id}>
                          {material.name} {material.unit ? `(${material.unit})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Quantity *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity || ''}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      className="mt-1"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Unit Price (₹) *</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.unit_price || ''}
                      onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                      className="mt-1"
                      required
                    />
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  Subtotal: ₹{((item.quantity || 0) * (item.unit_price || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Items Total:</span>
              <span className="text-lg font-semibold">
                ₹{itemsTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Bill Amount (₹) *</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                className="mt-1"
                placeholder="Vendor invoice amount"
                required
              />
            </div>
            <div>
              <Label>Bill Number</Label>
              <Input
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                className="mt-1"
                placeholder="Invoice number"
              />
            </div>
          </div>

          {parsedBillAmount > 0 && itemsTotal > 0 && (
            <div className={`p-3 rounded-lg ${difference !== 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
              <div className="flex justify-between items-center text-sm">
                <span className={difference !== 0 ? 'text-yellow-700' : 'text-green-700'}>
                  {difference > 0 ? 'Bill exceeds items by:' : difference < 0 ? 'Items exceed bill by:' : 'Perfect match!'}
                </span>
                <span className={`font-semibold ${difference !== 0 ? 'text-yellow-800' : 'text-green-800'}`}>
                  ₹{Math.abs(difference).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          <div>
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Invoice Date *
            </Label>
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label>Bill Image</Label>
            <div className="mt-1">
              <label className="flex items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => setBillFile(e.target.files?.[0] || null)}
                />
                <div className="text-center">
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-1">
                    {billFile ? billFile.name : 'Click to upload bill image'}
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
              rows={3}
              placeholder="Optional notes about this purchase"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={uploading || !vendorId || itemsTotal === 0}
            >
              {uploading ? 'Recording...' : (role === 'operator' ? 'Submit for Approval' : 'Record Purchase')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
