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
import { addToQueue, generateBusinessKey } from "@/mobile-v2/lib/offlineQueue";
import { validateCreditLimitOffline } from "@/mobile-v2/lib/offlineCreditValidation";
import { isAdminOrManager } from "@/mobile-v2/lib/permissionCheck";

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
  price: number; // base price
  unit: string | null;
  effectivePrice?: number; // calculated price with overrides
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

  // Fetch products for sale mode with pricing hierarchy
  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ["mobile-v2-products-for-sale", store?.id],
    queryFn: async () => {
      if (!store?.id) return [];

      // Get base products
      const { data: baseProducts } = await supabase
        .from("products")
        .select("id, name, price, unit")
        .eq("is_active", true)
        .order("name");

      let productList: ProductRow[] = (baseProducts as ProductRow[]) || [];

      // If we have a store, apply pricing hierarchy
      if (store?.id) {
        // Get store-type pricing (applies to all products of this store type)
        const { data: typePricing } = await supabase
          .from("store_type_pricing")
          .select("product_id, price")
          .eq("store_type_id", store.store_type_id);
        const typePriceMap: Record<string, number> = {};
        typePricing?.forEach((p: any) => { typePriceMap[p.product_id] = Number(p.price); });

        // Get store-specific pricing (highest priority)
        const { data: storePricing } = await supabase
          .from("store_pricing")
          .select("product_id, price")
          .eq("store_id", store.id);
        const storePriceMap: Record<string, number> = {};
        storePricing?.forEach((p: any) => { storePriceMap[p.product_id] = Number(p.price); });

        // Apply hierarchy: base -> type -> store (store overrides type, type overrides base)
        productList = productList.map((p) => {
          let effectivePrice = p.price; // Start with base price
          let priceSource = "base";

          // Check store-type pricing
          if (typePriceMap[p.id]) {
            effectivePrice = typePriceMap[p.id];
            priceSource = "type";
          }

          // Check store-specific pricing (highest priority)
          if (storePriceMap[p.id]) {
            effectivePrice = storePriceMap[p.id];
            priceSource = "store";
          }

          return { ...p, effectivePrice };
        });
      }

      return productList;
    },
    enabled: mode === "sale" && !!store?.id,
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
        price: product.effectivePrice || product.price, // Use effective price with fallback to base price
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

  // Validate sale/payment amounts
  if (cashNum < 0 || upiNum < 0) {
    toast.error("Payment amounts cannot be negative");
    return;
  }

  // For sales, validate credit limit
  let isAdmin = false;
  if (mode === "sale" && creditAmount > 0) {
    isAdmin = await isAdminOrManager(user!.id);
    const creditCheck = await validateCreditLimitOffline(
      store.id,
      creditAmount,
      isAdmin
    );

    if (!creditCheck.valid) {
      toast.error(creditCheck.warning || "Credit limit exceeded");
      setSubmitting(false);
      return;
    }

    if (creditCheck.warning) {
      toast.warning(creditCheck.warning);
    }
  }

  setSubmitting(true);

  try {
    // Get current position
    const position = await getCurrentPosition();

    // Check if offline
    if (!navigator.onLine) {
      // Queue the action for later sync
      const businessKey = generateBusinessKey(
        mode === "sale" ? "sale" : "transaction",
        {
          storeId: store.id,
          customerId: store.customer_id,
          amount: mode === "sale" ? cartTotal : totalPaid,
          timestamp: new Date().toISOString(),
        }
      );

      if (mode === "sale") {
        await addToQueue({
          type: "sale",
          payload: {
            saleData: {
              store_id: store.id,
              customer_id: store.customer_id,
              recorded_by: user!.id,
              total_amount: cartTotal,
              cash_amount: cashNum,
              upi_amount: upiNum,
              outstanding_amount: creditAmount,
              notes,
              lat: position?.lat || null,
              lng: position?.lng || null,
            },
            saleItems: cart.map((item) => ({
              product_id: item.product_id,
              quantity: item.quantity,
              unit_price: item.price,
              total_price: item.price * item.quantity,
            })),
          },
          businessKey,
          context: {
            storeId: store.id,
            creditLimit: creditAmount,
            cached: true,
          },
        });
      } else {
        await addToQueue({
          type: "transaction",
          payload: {
            txData: {
              store_id: store.id,
              customer_id: store.customer_id,
              recorded_by: user!.id,
              total_amount: totalPaid,
              cash_amount: cashNum,
              upi_amount: upiNum,
              notes,
              lat: position?.lat || null,
              lng: position?.lng || null,
            },
          },
          businessKey,
        });
      }

      toast.success(
        `${mode === "sale" ? "Sale" : "Payment"} queued for sync when online`
      );
      onSuccess?.();
      handleClose();
      setSubmitting(false);
      return;
    }

    if (mode === "sale") {
      // Generate display ID
      const { data: displayIdData, error: displayIdError } = await supabase.rpc(
        "generate_display_id",
        { prefix: "SAL", seq_name: "sale_display_seq" }
      );
      if (displayIdError) throw displayIdError;
      if (!displayIdData) throw new Error("Failed to generate display ID");
      const displayId = displayIdData;

      // Create sale using atomic RPC
      const { error } = await supabase.rpc("record_sale", {
        p_display_id: displayId,
        p_store_id: store.id,
        p_customer_id: store.customer_id,
        p_recorded_by: user!.id,
        p_logged_by: null,
        p_total_amount: cartTotal,
        p_cash_amount: cashNum,
        p_upi_amount: upiNum,
        p_outstanding_amount: creditAmount,
        p_sale_items: cart.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.price * item.quantity,
        })),
      });

      if (error) {
        // Handle specific errors
        if (error.message?.includes("credit_limit_exceeded")) {
          toast.error("Credit limit exceeded. Reduce outstanding amount.");
        } else if (error.message?.includes("insufficient_stock")) {
          toast.error("Insufficient stock for one or more products.");
        } else {
          throw error;
        }
        setSubmitting(false);
        return;
      }

      toast.success("Sale recorded successfully!");
    } else {
      // Generate display ID for transaction
      const { data: displayIdData, error: displayIdError } = await supabase.rpc(
        "generate_display_id",
        { prefix: "PAY", seq_name: "pay_display_seq" }
      );
      if (displayIdError) throw displayIdError;
      if (!displayIdData) throw new Error("Failed to generate display ID");
      const displayId = displayIdData;

      // Use atomic RPC for transaction
      const { error } = await supabase.rpc("record_transaction", {
        p_display_id: displayId,
        p_store_id: store.id,
        p_customer_id: store.customer_id,
        p_recorded_by: user!.id,
        p_logged_by: null,
        p_cash_amount: cashNum,
        p_upi_amount: upiNum,
        p_notes: notes,
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
    // Log to error tracking but don't expose details to user
    console.error("Submit error:", err);
    toast.error(err.message || "Failed to record. Please try again.");
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
                          ₹{(product.effectivePrice || product.price)}/{product.unit || "unit"}
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
