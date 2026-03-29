import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  ShoppingCart, 
  Search, 
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  Receipt,
  User,
  X,
  Check
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Section, Card, Badge, Loading, EmptyState } from "../../components/ui";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CartItem {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
}

export function PosHome() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [customerName, setCustomerName] = useState("");

  // Fetch products
  const { data: products, isLoading } = useQuery({
    queryKey: ["mobile-v2-pos-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, unit_price, category, image_url, stock_quantity")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  // Complete sale mutation
  const completeSaleMutation = useMutation({
    mutationFn: async () => {
      const { data: displayIdData } = await supabase.rpc("generate_display_id", {
        prefix: "POS",
      });

      const total = cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          display_id: displayIdData,
          total_amount: total,
          payment_type: paymentMethod,
          status: "completed",
          agent_id: profile?.id,
          notes: customerName ? `Customer: ${customerName}` : "Walk-in customer",
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Insert sale items
      const items = cart.map(item => ({
        sale_id: sale.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }));

      const { error: itemsError } = await supabase
        .from("sale_items")
        .insert(items);

      if (itemsError) throw itemsError;

      return sale;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-v2-pos-products"] });
      setCart([]);
      setShowCheckout(false);
      setCustomerName("");
      toast.success("Sale completed successfully!");
    },
    onError: () => {
      toast.error("Failed to complete sale");
    },
  });

  const filteredProducts = products?.filter(product => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      product.name?.toLowerCase().includes(search) ||
      product.sku?.toLowerCase().includes(search)
    );
  });

  // Define product type for the cart
  type ProductType = NonNullable<typeof products>[number];

  const addToCart = (product: ProductType) => {
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        unit_price: product.unit_price,
        quantity: 1,
      }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product_id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product_id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-12 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Loading.Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mv2-page pb-32">
      {/* Page Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-foreground">Point of Sale</h1>
        <p className="text-sm text-muted-foreground">Quick sales terminal</p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 mv2-input"
        />
      </div>

      {/* Products Grid */}
      <Section title="Products">
        {filteredProducts && filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map((product) => {
              const inCart = cart.find(item => item.product_id === product.id);

              return (
                <Card 
                  key={product.id} 
                  variant="outline" 
                  className={`p-3 cursor-pointer transition-all ${
                    inCart ? "ring-2 ring-primary" : "hover:bg-muted/50"
                  }`}
                  onClick={() => addToCart(product)}
                >
                  <div className="w-full aspect-square rounded-lg bg-muted flex items-center justify-center mb-2 overflow-hidden relative">
                    {product.image_url ? (
                      <img 
                        src={product.image_url} 
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ShoppingCart className="w-8 h-8 text-muted-foreground" />
                    )}
                    {inCart && (
                      <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                        {inCart.quantity}
                      </div>
                    )}
                  </div>
                  <p className="font-medium text-foreground text-sm truncate">
                    {product.name}
                  </p>
                  <p className="font-bold text-primary">
                    {formatCurrency(product.unit_price)}
                  </p>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={ShoppingCart}
            title="No products found"
            description="Add products to start selling"
          />
        )}
      </Section>

      {/* Cart Summary Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 bg-card border-t border-border p-4 shadow-lg safe-area-bottom">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              <span className="font-medium text-foreground">
                {cartItemCount} items
              </span>
            </div>
            <span className="text-xl font-bold text-primary">
              {formatCurrency(cartTotal)}
            </span>
          </div>
          <Button 
            className="w-full mv2-btn-primary"
            onClick={() => setShowCheckout(true)}
          >
            <Receipt className="w-4 h-4 mr-2" />
            Checkout
          </Button>
        </div>
      )}

      {/* Checkout Dialog */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="max-w-md mx-4">
          <DialogHeader>
            <DialogTitle>Complete Sale</DialogTitle>
          </DialogHeader>

          {/* Cart Items */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {cart.map((item) => (
              <div key={item.product_id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-foreground text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(item.unit_price)} each
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => updateQuantity(item.product_id, -1)}
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="w-6 text-center font-medium">{item.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => updateQuantity(item.product_id, 1)}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeFromCart(item.product_id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between py-3 border-t border-border">
            <span className="font-medium text-foreground">Total</span>
            <span className="text-2xl font-bold text-primary">
              {formatCurrency(cartTotal)}
            </span>
          </div>

          {/* Customer Name (Optional) */}
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Customer name (optional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mv2-input"
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Payment Method</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "cash", icon: Banknote, label: "Cash" },
                { id: "card", icon: CreditCard, label: "Card" },
                { id: "mobile", icon: Smartphone, label: "Mobile" },
              ].map(method => (
                <Button
                  key={method.id}
                  variant={paymentMethod === method.id ? "default" : "outline"}
                  className="h-auto py-3 flex-col gap-1"
                  onClick={() => setPaymentMethod(method.id)}
                >
                  <method.icon className="w-5 h-5" />
                  <span className="text-xs">{method.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowCheckout(false)}
            >
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button
              className="flex-1 mv2-btn-primary"
              onClick={() => completeSaleMutation.mutate()}
              disabled={completeSaleMutation.isPending}
            >
              <Check className="w-4 h-4 mr-1" />
              Complete Sale
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
