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
import { Loader2, Package, ArrowRightLeft, ArrowRight, Warehouse, User } from "lucide-react";
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

interface Warehouse {
  id: string;
  name: string;
}

interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url?: string;
  warehouse_id?: string;
}

interface StockTransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouses: Warehouse[];
  staffMembers: StaffMember[];
  products: Product[];
  currentUserId: string;
  currentWarehouseId: string;
  onTransfer: (data: {
    transferType: string;
    fromWarehouseId?: string;
    fromUserId?: string;
    toWarehouseId?: string;
    toUserId?: string;
    productId: string;
    quantity: number;
    description?: string;
  }) => Promise<void>;
  preselectedProduct?: Product;
  preselectedStaff?: StaffMember;
}

const TRANSFER_TYPES = [
  { value: "warehouse_to_staff", label: "Warehouse → Staff", icon: ArrowRight },
  { value: "staff_to_warehouse", label: "Staff → Warehouse", icon: ArrowRight },
  { value: "warehouse_to_warehouse", label: "Warehouse → Warehouse", icon: ArrowRightLeft },
  { value: "staff_to_staff", label: "Staff → Staff", icon: ArrowRightLeft },
];

export function StockTransferModal({
  open,
  onOpenChange,
  warehouses,
  staffMembers,
  products,
  currentUserId,
  currentWarehouseId,
  onTransfer,
  preselectedProduct,
  preselectedStaff,
}: StockTransferModalProps) {
  const [transferType, setTransferType] = useState("warehouse_to_staff");
  const [fromWarehouseId, setFromWarehouseId] = useState(currentWarehouseId);
  const [fromUserId, setFromUserId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [toUserId, setToUserId] = useState(preselectedStaff?.id || "");
  const [productId, setProductId] = useState(preselectedProduct?.id || "");
  const [quantity, setQuantity] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const selectedProduct = useMemo(() =>
    products.find(p => p.id === productId) || preselectedProduct,
    [products, productId, preselectedProduct]
  );

  const availableFromUsers = useMemo(() =>
    transferType === "staff_to_warehouse" || transferType === "staff_to_staff"
      ? staffMembers
      : [],
    [staffMembers, transferType]
  );

  const availableToUsers = useMemo(() =>
    transferType === "warehouse_to_staff" || transferType === "staff_to_staff"
      ? staffMembers.filter(s => s.id !== fromUserId)
      : [],
    [staffMembers, transferType, fromUserId]
  );

  const handleTransferTypeChange = (value: string) => {
    setTransferType(value);
    setFromUserId("");
    setToUserId("");
    setToWarehouseId("");

    // Set defaults based on transfer type
    switch (value) {
      case "warehouse_to_staff":
        setFromWarehouseId(currentWarehouseId);
        break;
      case "staff_to_warehouse":
        setToWarehouseId(currentWarehouseId);
        break;
      case "warehouse_to_warehouse":
        setFromWarehouseId(currentWarehouseId);
        break;
      case "staff_to_staff":
        setFromUserId(currentUserId);
        break;
    }
  };

  const handleSubmit = async () => {
    if (!productId || !quantity || parseFloat(quantity) <= 0) {
      toast.error("Please select a product and enter a valid quantity");
      return;
    }

    // Validate based on transfer type
    if (transferType.includes("warehouse") && !fromWarehouseId && transferType !== "staff_to_warehouse") {
      toast.error("Please select a source warehouse");
      return;
    }
    if (transferType === "staff_to_warehouse" && !toWarehouseId) {
      toast.error("Please select a destination warehouse");
      return;
    }
    if (transferType.includes("warehouse") && transferType !== "staff_to_warehouse" && !toUserId && transferType !== "warehouse_to_warehouse") {
      toast.error("Please select a destination staff member");
      return;
    }
    if (transferType === "staff_to_staff" && !toUserId) {
      toast.error("Please select a destination staff member");
      return;
    }
    if (transferType === "warehouse_to_warehouse" && !toWarehouseId) {
      toast.error("Please select a destination warehouse");
      return;
    }

    setIsSubmitting(true);
    try {
      await onTransfer({
        transferType,
        fromWarehouseId: transferType.includes("warehouse") && transferType !== "staff_to_warehouse" ? fromWarehouseId : undefined,
        fromUserId: transferType.includes("staff") ? fromUserId : undefined,
        toWarehouseId: transferType === "warehouse_to_warehouse" || transferType === "staff_to_warehouse" ? toWarehouseId : undefined,
        toUserId: transferType.includes("staff") && transferType !== "staff_to_warehouse" ? toUserId : undefined,
        productId,
        quantity: parseFloat(quantity),
        description,
      });
      toast.success("Stock transferred successfully");
      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to transfer stock");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTransferType("warehouse_to_staff");
    setFromWarehouseId(currentWarehouseId);
    setFromUserId("");
    setToWarehouseId("");
    setToUserId("");
    setProductId("");
    setQuantity("");
    setDescription("");
    setStep(1);
  };

  const canProceed = () => {
    if (!productId) return false;
    if (!quantity || parseFloat(quantity) <= 0) return false;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetForm();
      onOpenChange(open);
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Transfer Stock
          </DialogTitle>
          <DialogDescription>
            Move stock between warehouses and staff members
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-6">
            {/* Transfer Type Selection */}
            <div className="space-y-2">
              <Label>Transfer Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {TRANSFER_TYPES.map((type) => (
                  <Button
                    key={type.value}
                    variant={transferType === type.value ? "default" : "outline"}
                    onClick={() => handleTransferTypeChange(type.value)}
                    className="justify-start h-auto py-3"
                  >
                    <type.icon className="h-4 w-4 mr-2" />
                    <span className="text-sm">{type.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Source Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                {transferType.startsWith("warehouse") ? (
                  <>
                    <Warehouse className="h-4 w-4" /> From Warehouse
                  </>
                ) : (
                  <>
                    <User className="h-4 w-4" /> From Staff
                  </>
                )}
              </Label>
              
              {transferType.startsWith("warehouse") ? (
                <Select value={fromWarehouseId} onValueChange={setFromWarehouseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={fromUserId} onValueChange={setFromUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFromUsers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={s.avatar_url} />
                            <AvatarFallback>{s.full_name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          {s.full_name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Destination Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                {transferType.endsWith("warehouse") ? (
                  <>
                    <Warehouse className="h-4 w-4" /> To Warehouse
                  </>
                ) : (
                  <>
                    <User className="h-4 w-4" /> To Staff
                  </>
                )}
              </Label>
              
              {transferType.endsWith("warehouse") ? (
                <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.filter(w => w.id !== fromWarehouseId).map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={toUserId} onValueChange={setToUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableToUsers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={s.avatar_url} />
                            <AvatarFallback>{s.full_name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          {s.full_name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

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
                        <Badge variant="outline">{p.quantity} {p.unit}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedProduct && (
                <div className="mt-3 p-3 bg-muted rounded-lg flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted-foreground/10 flex items-center justify-center">
                    {selectedProduct.image_url ? (
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={selectedProduct.image_url} />
                        <AvatarFallback><Package className="h-5 w-5" /></AvatarFallback>
                      </Avatar>
                    ) : (
                      <Package className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{selectedProduct.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Available: {selectedProduct.quantity} {selectedProduct.unit} | 
                      ₹{selectedProduct.base_price.toLocaleString()} per {selectedProduct.unit}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Enter quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              {selectedProduct && quantity && (
                <p className="text-xs text-muted-foreground">
                  Total value: ₹{(parseFloat(quantity || "0") * selectedProduct.base_price).toLocaleString()}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => setStep(2)} 
                disabled={!canProceed()}
              >
                Next
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary */}
            <div className="space-y-4 p-4 bg-muted rounded-lg">
              <h4 className="font-medium">Transfer Summary</h4>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="font-medium">
                    {TRANSFER_TYPES.find(t => t.value === transferType)?.label}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">From:</span>
                  <span className="font-medium">
                    {transferType.startsWith("warehouse")
                      ? warehouses.find(w => w.id === fromWarehouseId)?.name
                      : staffMembers.find(s => s.id === fromUserId)?.full_name}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">To:</span>
                  <span className="font-medium">
                    {transferType.endsWith("warehouse")
                      ? warehouses.find(w => w.id === toWarehouseId)?.name
                      : staffMembers.find(s => s.id === toUserId)?.full_name}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Product:</span>
                  <span className="font-medium">{selectedProduct?.name}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quantity:</span>
                  <span className="font-medium">
                    {quantity} {selectedProduct?.unit}
                  </span>
                </div>
                
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="text-muted-foreground">Total Value:</span>
                  <span className="font-bold text-emerald-600">
                    ₹{(parseFloat(quantity || "0") * (selectedProduct?.base_price || 0)).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description / Notes (Optional)</Label>
              <Textarea
                placeholder="Add any notes about this transfer..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
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
                Confirm Transfer
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
