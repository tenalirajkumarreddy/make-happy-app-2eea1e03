import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Package, Plus, Minus, AlertTriangle, RotateCcw, Scale, ArrowRightLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
  base_price: number;
  image_url?: string;
  quantity: number;
}

interface AdjustmentType {
  value: string;
  label: string;
  description: string;
  icon: typeof Plus;
  color: string;
  defaultSign: 1 | -1;
}

const ADJUSTMENT_TYPES: AdjustmentType[] = [
  {
    value: "purchase",
    label: "Purchase",
    description: "New stock received from vendor",
    icon: Plus,
    color: "text-emerald-600",
    defaultSign: 1,
  },
  {
    value: "sale",
    label: "Sale",
    description: "Stock sold/deducted",
    icon: Minus,
    color: "text-red-600",
    defaultSign: -1,
  },
  {
    value: "adjustment",
    label: "Correction",
    description: "Stock count correction",
    icon: RotateCcw,
    color: "text-amber-600",
    defaultSign: 1,
  },
  {
    value: "return",
    label: "Return",
    description: "Stock returned by customer",
    icon: RotateCcw,
    color: "text-blue-600",
    defaultSign: 1,
  },
  {
    value: "damaged",
    label: "Damaged/Lost",
    description: "Stock damaged, expired, or lost",
    icon: Trash2,
    color: "text-red-600",
    defaultSign: -1,
  },
  {
    value: "transfer_in",
    label: "Transfer In",
    description: "Stock transferred from another location",
    icon: ArrowRightLeft,
    color: "text-purple-600",
    defaultSign: 1,
  },
  {
    value: "transfer_out",
    label: "Transfer Out",
    description: "Stock transferred to another location",
    icon: ArrowRightLeft,
    color: "text-orange-600",
    defaultSign: -1,
  },
];

interface StockAdjustmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  warehouseName?: string;
  onAdjust: (data: {
    productId: string;
    adjustmentType: string;
    quantity: number;
    reason?: string;
    notes?: string;
  }) => Promise<void>;
  preselectedProduct?: Product;
}

export function StockAdjustmentModal({
  open,
  onOpenChange,
  products,
  warehouseName,
  onAdjust,
  preselectedProduct,
}: StockAdjustmentModalProps) {
  const [adjustmentType, setAdjustmentType] = useState("purchase");
  const [productId, setProductId] = useState(preselectedProduct?.id || "");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const selectedProduct = useMemo(() =>
    products.find(p => p.id === productId) || preselectedProduct,
    [products, productId, preselectedProduct]
  );

  const selectedType = ADJUSTMENT_TYPES.find(t => t.value === adjustmentType) || ADJUSTMENT_TYPES[0];

  const handleSubmit = async () => {
    if (!productId || !quantity || parseFloat(quantity) <= 0) {
      toast.error("Please select a product and enter a valid quantity");
      return;
    }

    const qty = parseFloat(quantity) * selectedType.defaultSign;
    
    // Validate for sale/damage/transfer_out that we have enough stock
    if ((adjustmentType === "sale" || adjustmentType === "damaged" || adjustmentType === "transfer_out") && selectedProduct) {
      if (Math.abs(qty) > selectedProduct.quantity) {
        toast.error(`Cannot ${adjustmentType} more than available stock (${selectedProduct.quantity})`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onAdjust({
        productId,
        adjustmentType,
        quantity: qty,
        reason: reason || selectedType.label,
        notes,
      });
      toast.success("Stock adjusted successfully");
      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to adjust stock");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setAdjustmentType("purchase");
    setProductId("");
    setQuantity("");
    setReason("");
    setNotes("");
    setStep(1);
  };

  const getNewStockLevel = () => {
    if (!selectedProduct || !quantity) return null;
    const qty = parseFloat(quantity) * selectedType.defaultSign;
    return selectedProduct.quantity + qty;
  };

  const newStockLevel = getNewStockLevel();

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetForm();
      onOpenChange(open);
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Adjust Stock
          </DialogTitle>
          <DialogDescription>
            {warehouseName ? `Adjust stock in ${warehouseName}` : "Adjust inventory stock levels"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-6">
            {/* Product Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Package className="h-4 w-4" /> Select Product
              </Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center justify-between w-full gap-4">
                        <span>{p.name}</span>
                        <Badge variant="outline" className={p.quantity <= 0 ? "text-red-600" : p.quantity < 10 ? "text-amber-600" : "text-emerald-600"}>
                          {p.quantity} {p.unit}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedProduct && (
                <div className="mt-3 p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-muted-foreground/10 flex items-center justify-center">
                      {selectedProduct.image_url ? (
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={selectedProduct.image_url} />
                          <AvatarFallback><Package className="h-6 w-6" /></AvatarFallback>
                        </Avatar>
                      ) : (
                        <Package className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{selectedProduct.name}</p>
                      <p className="text-sm text-muted-foreground">{selectedProduct.sku}</p>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-sm">
                          Current: <span className="font-semibold">{selectedProduct.quantity} {selectedProduct.unit}</span>
                        </span>
                        <span className="text-sm">
                          Price: <span className="font-semibold">₹{selectedProduct.base_price.toLocaleString()}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Adjustment Type */}
            <div className="space-y-2">
              <Label>Adjustment Type</Label>
              <RadioGroup
                value={adjustmentType}
                onValueChange={setAdjustmentType}
                className="grid grid-cols-2 gap-3"
              >
                {ADJUSTMENT_TYPES.map((type) => (
                  <div key={type.value}>
                    <RadioGroupItem
                      value={type.value}
                      id={type.value}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={type.value}
                      className="flex flex-col items-start p-3 border rounded-lg cursor-pointer transition-all hover:bg-muted peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <type.icon className={`h-4 w-4 ${type.color}`} />
                        <span className="font-medium text-sm">{type.label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground leading-tight">
                        {type.description}
                      </span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                {selectedType.defaultSign === 1 ? (
                  <><Plus className="h-4 w-4 text-emerald-600" /> Quantity to Add</>
                ) : (
                  <><Minus className="h-4 w-4 text-red-600" /> Quantity to Remove</>
                )}
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground w-16">
                  {selectedProduct?.unit || "units"}
                </span>
              </div>
              {selectedProduct && quantity && (
                <div className="p-3 bg-muted rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Current Stock:</span>
                    <span className="font-medium">{selectedProduct.quantity} {selectedProduct.unit}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Adjustment:</span>
                    <span className={`font-medium ${selectedType.defaultSign === 1 ? "text-emerald-600" : "text-red-600"}`}>
                      {selectedType.defaultSign === 1 ? "+" : "-"}{quantity} {selectedProduct.unit}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="text-muted-foreground">New Stock Level:</span>
                    <span className={`font-bold ${
                      (newStockLevel || 0) < 0 ? "text-red-600" : 
                      (newStockLevel || 0) === 0 ? "text-amber-600" : 
                      "text-emerald-600"
                    }`}>
                      {newStockLevel} {selectedProduct.unit}
                    </span>
                  </div>
                  {(newStockLevel || 0) < 0 && (
                    <div className="flex items-center gap-2 text-red-600 text-xs">
                      <AlertTriangle className="h-4 w-4" />
                      This adjustment will result in negative stock
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                placeholder={`e.g. ${selectedType.description}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Default: &quot;{selectedType.label}&quot; - add custom details if needed
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => setStep(2)} 
                disabled={!productId || !quantity || parseFloat(quantity) <= 0}
              >
                Review
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary */}
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Adjustment Summary
              </h4>
              
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="flex items-center gap-3 pb-3 border-b">
                  <div className="h-10 w-10 rounded-lg bg-muted-foreground/10 flex items-center justify-center">
                    {selectedProduct?.image_url ? (
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={selectedProduct.image_url} />
                        <AvatarFallback><Package className="h-5 w-5" /></AvatarFallback>
                      </Avatar>
                    ) : (
                      <Package className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{selectedProduct?.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedProduct?.sku}</p>
                  </div>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Adjustment Type:</span>
                    <span className="font-medium flex items-center gap-1">
                      <selectedType.icon className={`h-4 w-4 ${selectedType.color}`} />
                      {selectedType.label}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Stock:</span>
                    <span className="font-medium">
                      {selectedProduct?.quantity} {selectedProduct?.unit}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Adjustment:</span>
                    <span className={`font-medium ${selectedType.defaultSign === 1 ? "text-emerald-600" : "text-red-600"}`}>
                      {selectedType.defaultSign === 1 ? "+" : "-"}{quantity} {selectedProduct?.unit}
                    </span>
                  </div>
                  
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-muted-foreground">New Stock Level:</span>
                    <span className={`font-bold ${
                      (newStockLevel || 0) < 0 ? "text-red-600" : 
                      (newStockLevel || 0) === 0 ? "text-amber-600" : 
                      "text-emerald-600"
                    }`}>
                      {newStockLevel} {selectedProduct?.unit}
                    </span>
                  </div>
                  
                  {selectedProduct && quantity && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Value Impact:</span>
                      <span className="font-medium">
                        ₹{(parseFloat(quantity) * selectedProduct.base_price).toLocaleString()}
                      </span>
                    </div>
                  )}
                  
                  {reason && (
                    <div className="pt-2">
                      <span className="text-muted-foreground text-xs">Reason:</span>
                      <p className="text-sm mt-1">{reason}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Additional Notes (Optional)</Label>
                <Textarea
                  placeholder="Add any additional notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Adjustment
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
