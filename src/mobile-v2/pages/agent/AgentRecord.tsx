import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { 
  Store, MapPin, Phone, Wallet, ShoppingCart, CreditCard, 
  Banknote, Navigation, CheckCircle, Clock, X, Plus, Minus, ArrowLeft
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getCurrentPosition } from "@/lib/capacitorUtils";
import { Card, CardContent } from "../../components/ui/Card";
import { Section } from "../../components/ui/Section";
import { Badge } from "../../components/ui/Badge";
import { StatCard } from "../../components/ui/StatCard";
import { LoadingCenter } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { addToQueue } from "@/lib/offlineQueue";

interface Props {
  store?: StoreOption;
  mode?: "sale" | "payment";
  onClose?: () => void;
  onSuccess?: () => void;
}

interface StoreOption {
  id: string;
  name: string;
  display_id: string;
  photo_url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  outstanding: number;
  customer_id: string | null;
  route_id: string | null;
  customers?: { name: string } | null;
}

interface ProductRow {
  id: string;
  name: string;
  price: number;
  unit: string | null;
}

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  unit: string | null;
}

export function AgentRecord({ store: storeProp, mode: modeProp, onClose, onSuccess }: Props = {}) {
  const navigate = useNavigate();
  const { storeId } = useParams<{ storeId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Get mode from URL query params if not provided via props
  const mode = modeProp || (searchParams.get("mode") as "sale" | "payment") || "sale";

  // Fetch store data if not provided via props
  const { data: fetchedStore, isLoading: loadingStore } = useQuery({
    queryKey: ["mobile-v2-record-store", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, display_id, photo_url, address, lat, lng, phone, outstanding, customer_id, route_id, customers(name)")
        .eq("id", storeId)
        .single();
      if (error) throw error;
      return data as StoreOption;
    },
    enabled: !storeProp && !!storeId,
  });

  const store = storeProp || fetchedStore;
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigate(-1);
    }
  };

  // Fetch products for sale mode
  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ["mobile-v2-products-for-sale"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, price, unit")
        .eq("is_active", true)
        .order("name");
      return (data as ProductRow[]) || [];
    },
    enabled: mode === "sale",
  });

  // Cart calculations
  const cartTotal = useMemo(() => 
    cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    [cart]
  );

  const cashNum = parseFloat(cashAmount) || 0;
  const upiNum = parseFloat(upiAmount) || 0;
  const totalPaid = cashNum + upiNum;
  const creditAmount = mode === "sale" ? Math.max(0, cartTotal - totalPaid) : 0;

  // Show loading or empty state if store not available
  if (loadingStore) {
    return <LoadingCenter className="min-h-[50vh]" />;
  }

  if (!store) {
    return (
      <div className="mv2-page">
        <div className="mv2-page-content p-4">
          <EmptyState
            icon={Store}
            title="Store Not Found"
            description="The store you're looking for could not be found."
            action={{ label: "Go Back", onClick: () => navigate(-1) }}
          />
        </div>
      </div>
    );
  }

  const addToCart = (product: ProductRow) => {
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
        price: product.price,
        quantity: 1,
        unit: product.unit,
      }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => 
      prev
        .map(item =>
          item.product_id === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter(item => item.quantity > 0)
    );
  };

  const handleSubmit = async () => {
    if (mode === "sale" && cart.length === 0) {
      toast.error("Please add items to cart");
      return;
    }

    if (mode === "payment" && totalPaid <= 0) {
      toast.error("Please enter payment amount");
      return;
    }

    setSubmitting(true);

    try {
      // Get current position
      const position = await getCurrentPosition();

      if (mode === "sale") {
        // Generate display ID
        const { data: displayIdData } = await supabase.rpc("generate_display_id", { prefix: "SAL" });
        const displayId = displayIdData || `SAL-${Date.now()}`;

        // Create sale
        const salePayload = {
          display_id: displayId,
          store_id: store.id,
          customer_id: store.customer_id,
          recorded_by: user!.id,
          total_amount: cartTotal,
          cash_amount: cashNum,
          upi_amount: upiNum,
          credit_amount: creditAmount,
          notes,
          lat: position?.lat || null,
          lng: position?.lng || null,
          items: cart.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.price,
            total_price: item.price * item.quantity,
          })),
        };

        const { error } = await supabase.rpc("record_sale", salePayload);
        if (error) throw error;

        toast.success("Sale recorded successfully!");
      } else {
        // Generate display ID for transaction
        const { data: displayIdData } = await supabase.rpc("generate_display_id", { prefix: "TXN" });
        const displayId = displayIdData || `TXN-${Date.now()}`;

        // Create transaction/payment
        const { error } = await supabase.from("transactions").insert({
          display_id: displayId,
          store_id: store.id,
          customer_id: store.customer_id,
          recorded_by: user!.id,
          total_amount: totalPaid,
          cash_amount: cashNum,
          upi_amount: upiNum,
          notes,
          lat: position?.lat || null,
          lng: position?.lng || null,
          type: "payment",
        });
        if (error) throw error;

        toast.success("Payment recorded successfully!");
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["mobile-v2-agent-sales"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-v2-agent-tx"] });
      
      onSuccess?.();
      handleClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to record");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mv2-page">
      <div className="mv2-page-content">
        {/* Store Header */}
        <Card className="mb-4" padding="md">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl mv2-bg-accent flex items-center justify-center shrink-0">
              {store.photo_url ? (
                <img src={store.photo_url} alt="" className="h-full w-full object-cover rounded-xl" />
              ) : (
                <Store className="h-6 w-6 mv2-text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{store.name}</p>
              <p className="text-sm mv2-text-muted truncate">{store.customers?.name || store.display_id}</p>
            </div>
            {store.outstanding > 0 && (
              <Badge variant="warning">
                ₹{store.outstanding.toLocaleString("en-IN")} due
              </Badge>
            )}
          </div>
        </Card>

        {mode === "sale" ? (
          <>
            {/* Product Selection */}
            <Section title="Select Products">
              {loadingProducts ? (
                <LoadingCenter />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {products?.map((product) => {
                    const inCart = cart.find(item => item.product_id === product.id);
                    return (
                      <Card
                        key={product.id}
                        padding="sm"
                        className={inCart ? "ring-2 ring-[var(--mv2-primary)]" : ""}
                        onClick={() => addToCart(product)}
                      >
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        <p className="text-xs mv2-text-muted">
                          ₹{product.price}/{product.unit || "unit"}
                        </p>
                        {inCart && (
                          <div className="flex items-center justify-between mt-2 pt-2 border-t">
                            <button
                              className="mv2-btn-icon h-7 w-7 mv2-bg-muted"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateQuantity(product.id, -1);
                              }}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="text-sm font-bold">{inCart.quantity}</span>
                            <button
                              className="mv2-btn-icon h-7 w-7 mv2-bg-primary text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateQuantity(product.id, 1);
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* Cart Summary */}
            {cart.length > 0 && (
              <Section title="Cart Summary" className="mt-4">
                <Card padding="md">
                  {cart.map((item) => (
                    <div key={item.product_id} className="flex justify-between py-2 border-b last:border-0">
                      <span className="text-sm">
                        {item.name} × {item.quantity}
                      </span>
                      <span className="text-sm font-medium">
                        ₹{(item.price * item.quantity).toLocaleString("en-IN")}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-3 mt-2 border-t">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold text-lg">₹{cartTotal.toLocaleString("en-IN")}</span>
                  </div>
                </Card>
              </Section>
            )}
          </>
        ) : null}

        {/* Payment Section */}
        <Section title={mode === "sale" ? "Payment" : "Record Payment"} className="mt-4">
          <Card padding="md">
            <div className="space-y-4">
              <div>
                <label className="mv2-input-label flex items-center gap-2">
                  <Banknote className="h-4 w-4" /> Cash Amount
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className="mv2-input"
                />
              </div>
              <div>
                <label className="mv2-input-label flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> UPI Amount
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={upiAmount}
                  onChange={(e) => setUpiAmount(e.target.value)}
                  className="mv2-input"
                />
              </div>
              <div>
                <label className="mv2-input-label">Notes (Optional)</label>
                <textarea
                  placeholder="Add notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mv2-input min-h-[80px] resize-none"
                />
              </div>
            </div>

            {mode === "sale" && cartTotal > 0 && (
              <div className="mt-4 p-3 rounded-xl mv2-bg-muted space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Total Amount</span>
                  <span className="font-medium">₹{cartTotal.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Paid (Cash + UPI)</span>
                  <span className="font-medium">₹{totalPaid.toLocaleString("en-IN")}</span>
                </div>
                {creditAmount > 0 && (
                  <div className="flex justify-between text-sm mv2-text-warning">
                    <span>Credit Amount</span>
                    <span className="font-medium">₹{creditAmount.toLocaleString("en-IN")}</span>
                  </div>
                )}
              </div>
            )}
          </Card>
        </Section>

        {/* Submit Button */}
        <div className="mt-6">
          <button
            className="mv2-btn mv2-btn-primary mv2-btn-full mv2-btn-lg"
            onClick={handleSubmit}
            disabled={submitting || (mode === "sale" && cart.length === 0) || (mode === "payment" && totalPaid <= 0)}
          >
            {submitting ? (
              <div className="mv2-spinner mv2-spinner-sm" />
            ) : (
              <>
                <CheckCircle className="h-5 w-5" />
                {mode === "sale" ? "Record Sale" : "Record Payment"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
