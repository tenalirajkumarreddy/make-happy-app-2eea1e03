import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Product {
  id: string;
  name: string;
  base_price?: number;
  basePrice?: number;
}

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  selectedItems: Array<{ product_id: string }>;
  onAddProduct: (productId: string) => void;
}

/**
 * AddProductDialog
 * ─────────────────
 * Dialog for adding a non-associated product to a sale.
 * Filters out products already present in the sale.
 */
export function AddProductDialog({
  open, onOpenChange, products, selectedItems, onAddProduct,
}: AddProductDialogProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>("");

  const availableProducts = products.filter(
    (p) => !selectedItems.some((item) => item.product_id === p.id)
  );

  const handleAdd = () => {
    if (!selectedProductId) return;
    onAddProduct(selectedProductId);
    setSelectedProductId("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Product</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select a product to add to this sale. This product is not normally associated with this store type.
          </p>
          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger>
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {availableProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <div className="flex items-center gap-2">
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">- ₹{Number(p.base_price || p.basePrice || 0).toLocaleString()}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={!selectedProductId} onClick={handleAdd}>
              Add Product
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
