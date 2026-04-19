import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Calculator, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface FeasibilityResult {
  is_profitable: boolean;
  fuel_needed_liters: number;
  total_fuel_cost: number;
  total_transport_cost: number;
  transport_cost_per_unit: number;
  manufacturing_overhead_per_unit: number;
  product_other_expenses_per_unit: number;
  total_cost_per_unit: number;
  margin_per_unit: number;
  total_profit: number;
}

export default function DeliveryFeasibility() {
  const { warehouse } = useAuth();
  
  // Selection States
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  
  // Input States
  const [quantity, setQuantity] = useState<number>(100);
  const [bomCostPerUnit, setBomCostPerUnit] = useState<number>(70);
  const [sellingPricePerUnit, setSellingPricePerUnit] = useState<number>(100);
  const [distanceKm, setDistanceKm] = useState<number>(100);
  const [vehicleMileage, setVehicleMileage] = useState<number>(10); // kmpl
  const [fuelPrice, setFuelPrice] = useState<number>(100); // per liter
  const [tolls, setTolls] = useState<number>(0);
  const [transportOtherExpenses, setTransportOtherExpenses] = useState<number>(0); // e.g. driver allowance
  const [productOtherExpenses, setProductOtherExpenses] = useState<number>(0); // e.g. per unit packaging/labor
  const [manufacturingOverhead, setManufacturingOverhead] = useState<number>(0); // total monthly overhead 
  const [expectedMonthlyVolume, setExpectedMonthlyVolume] = useState<number>(1000); // expected volume
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);

  const [result, setResult] = useState<FeasibilityResult | null>(null);

  // Queries
  const { data: vehicles } = useQuery({
    queryKey: ['admin_vehicles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vehicles').select('*').eq('status', 'active');
      if (error) throw error;
      return data;
    },
  });

  const { data: stores } = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name, address, display_id, lat, lng').eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ['products', warehouse?.id],
    queryFn: async () => {
      let query = supabase.from('products').select('id, name, unit, cost_price, base_price');
      if (warehouse?.id) {
        query = query.eq('warehouse_id', warehouse.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: warehouseData } = useQuery({
    queryKey: ['warehouse', warehouse?.id],
    queryFn: async () => {
      if (!warehouse?.id) return null;
      const { data, error } = await supabase.from('warehouses').select('latitude, longitude').eq('id', warehouse.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!warehouse?.id
  });

  // Auto-fill vehicle mileage
  useEffect(() => {
    if (selectedVehicle && vehicles) {
      const v = vehicles.find(v => v.id === selectedVehicle);
      if (v && v.mileage_kmpl) {
        setVehicleMileage(v.mileage_kmpl);
      }
    }
  }, [selectedVehicle, vehicles]);

  // Auto-fill BOM Cost from RPC, Selling Price from product, and overhead from RPC
  useEffect(() => {
    const fetchCosts = async () => {
      if (!selectedProduct || !products) return;
      const prod = products.find(p => p.id === selectedProduct);
      if (prod) {
        setSellingPricePerUnit(prod.base_price || 0);
      }

      // Fetch BOM cost from RPC
      if (warehouse?.id) {
        try {
          const { data: bomCost, error: bomErr } = await supabase.rpc('calculate_bom_cost', {
            p_product_id: selectedProduct,
            p_warehouse_id: warehouse.id,
          });
          if (!bomErr && bomCost !== null) {
            setBomCostPerUnit(Number(bomCost));
          } else {
            setBomCostPerUnit(prod?.cost_price || 0);
          }
        } catch {
          setBomCostPerUnit(prod?.cost_price || 0);
        }

        // Fetch overhead from RPC
        try {
          const { data: overhead, error: ohErr } = await supabase.rpc('calculate_overhead_per_unit', {
            p_warehouse_id: warehouse.id,
          });
          if (!ohErr && overhead !== null) {
            setManufacturingOverhead(0); // Not needed since we use per-unit
            setExpectedMonthlyVolume(1); // Neutralize the manual division
            // Store the actual overhead per-unit value for display
            // The calculation below uses manufacturingOverhead / expectedMonthlyVolume
            // So set overhead = per_unit_value, volume = 1
            setManufacturingOverhead(Number(overhead));
            setExpectedMonthlyVolume(1);
          }
        } catch {
          // Keep existing manual values
        }
      }
    };
    fetchCosts();
  }, [selectedProduct, products, warehouse?.id]);

  // Auto-calculate distance based on OSRM API
  useEffect(() => {
    const fetchRoute = async () => {
      if (selectedStore && stores && warehouseData?.latitude && warehouseData?.longitude) {
        const store = stores.find(s => s.id === selectedStore);
        if (store && store.lat && store.lng) {
          setIsCalculatingDistance(true);
          try {
            const url = `https://router.project-osrm.org/route/v1/driving/${warehouseData.longitude},${warehouseData.latitude};${store.lng},${store.lat}?overview=false`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.routes && data.routes.length > 0) {
              setDistanceKm(parseFloat((data.routes[0].distance / 1000).toFixed(1)));
            }
          } catch (err) {
            console.error("OSRM Route fetching failed:", err);
          } finally {
            setIsCalculatingDistance(false);
          }
        }
      }
    };
    fetchRoute();
  }, [selectedStore, stores, warehouseData]);

  const calculateFeasibility = () => {
    if (quantity <= 0 || distanceKm <= 0 || vehicleMileage <= 0) {
      return;
    }

    // Overhead calculation: (Fixed Costs / Expected Total Monthly Volume)
    // As production volume increases, overhead per unit decreases
    const manufacturingOverheadPerUnit = expectedMonthlyVolume > 0 ? (manufacturingOverhead / expectedMonthlyVolume) : 0;

    // Transport calculation
    const fuelNeededLiters = distanceKm / vehicleMileage;
    const totalFuelCost = fuelNeededLiters * fuelPrice;
    const totalTransportCost = totalFuelCost + tolls + transportOtherExpenses;
    const transportCostPerUnit = totalTransportCost / quantity;
    
    // Total Unit Cost = Raw Material + Overhead + Transport + Unit specific expenses
    const totalCostPerUnit = bomCostPerUnit + manufacturingOverheadPerUnit + transportCostPerUnit + productOtherExpenses;
    const marginPerUnit = sellingPricePerUnit - totalCostPerUnit;
    const totalProfit = marginPerUnit * quantity;

    setResult({
      is_profitable: totalProfit >= 0,
      fuel_needed_liters: fuelNeededLiters,
      total_fuel_cost: totalFuelCost,
      total_transport_cost: totalTransportCost,
      transport_cost_per_unit: transportCostPerUnit,
      manufacturing_overhead_per_unit: manufacturingOverheadPerUnit,
      product_other_expenses_per_unit: productOtherExpenses,
      total_cost_per_unit: totalCostPerUnit,
      margin_per_unit: marginPerUnit,
      total_profit: totalProfit
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivery & Manufacturing Profitability Calculator"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Trip & Product Parameters</CardTitle>
            <CardDescription>Enter transportation, overhead, and product details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Destination & Transport */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Transport Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Store / Destination</Label>
                  <Select value={selectedStore} onValueChange={setSelectedStore}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Store (Optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores?.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.display_id} - {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex justify-between">
                    <span>Distance (km)</span>
                    {isCalculatingDistance && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
                  </Label>
                  <Input 
                    type="number" 
                    value={distanceKm} 
                    onChange={(e) => setDistanceKm(parseFloat(e.target.value) || 0)} 
                    min="0" step="0.1" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vehicle</Label>
                  <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles?.map(v => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.plate_number} ({v.capacity_kg}kg)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Vehicle Mileage (km/l)</Label>
                  <Input 
                    type="number" 
                    value={vehicleMileage} 
                    onChange={(e) => setVehicleMileage(parseFloat(e.target.value) || 0)} 
                    min="0.1" step="0.1" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Fuel Price (₹)</Label>
                  <Input 
                    type="number" 
                    value={fuelPrice} 
                    onChange={(e) => setFuelPrice(parseFloat(e.target.value) || 0)} 
                    min="0" step="0.1" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tolls (Total ₹)</Label>
                  <Input 
                    type="number" 
                    value={tolls} 
                    onChange={(e) => setTolls(parseFloat(e.target.value) || 0)} 
                    min="0" step="1" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Other Trip Exp. (₹)</Label>
                  <Input 
                    type="number" 
                    value={transportOtherExpenses} 
                    onChange={(e) => setTransportOtherExpenses(parseFloat(e.target.value) || 0)} 
                    min="0" step="1"
                    placeholder="e.g. driver"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Manufacturing & Overhead</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Total Monthly Overhead (₹)</Label>
                  <Input 
                    type="number" 
                    value={manufacturingOverhead} 
                    onChange={(e) => setManufacturingOverhead(parseFloat(e.target.value) || 0)} 
                    min="0" step="1" 
                    placeholder="Fixed Costs (Rent, Salaries, Electricity)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expected Monthly Volume</Label>
                  <Input 
                    type="number" 
                    value={expectedMonthlyVolume} 
                    onChange={(e) => setExpectedMonthlyVolume(parseFloat(e.target.value) || 1)} 
                    min="1" step="1" 
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Product Margins</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products?.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Delivery Quantity (Units)</Label>
                  <Input 
                    type="number" 
                    value={quantity} 
                    onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)} 
                    min="1" step="1" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>BOM Cost (₹/Unit)</Label>
                  <Input 
                    type="number" 
                    value={bomCostPerUnit} 
                    onChange={(e) => setBomCostPerUnit(parseFloat(e.target.value) || 0)} 
                    min="0" step="0.1" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Other Unit Exp. (₹)</Label>
                  <Input 
                    type="number" 
                    value={productOtherExpenses} 
                    onChange={(e) => setProductOtherExpenses(parseFloat(e.target.value) || 0)} 
                    min="0" step="1" 
                    placeholder="Pkg/Labor"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Selling Price (₹/Unit)</Label>
                  <Input 
                    type="number" 
                    value={sellingPricePerUnit} 
                    onChange={(e) => setSellingPricePerUnit(parseFloat(e.target.value) || 0)} 
                    min="0" step="0.1" 
                  />
                </div>
              </div>
            </div>

            <Button className="w-full mt-4" onClick={calculateFeasibility} disabled={quantity <= 0 || vehicleMileage <= 0}>
              <Calculator className="w-4 h-4 mr-2" /> Calculate Profitability
            </Button>
          </CardContent>
        </Card>

        {result && (
          <Card className={result.is_profitable ? "border-green-200" : "border-destructive"}>
            <CardHeader className="bg-muted/50 border-b">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.is_profitable ? (
                    <><CheckCircle2 className="w-5 h-5 text-green-500" /> Profitable Delivery</>
                  ) : (
                    <><AlertTriangle className="w-5 h-5 text-destructive" /> Loss-Making Delivery</>
                  )}
                </div>
                <div className={`text-2xl font-bold ${result.is_profitable ? 'text-green-600' : 'text-destructive'}`}>
                  ₹{result.total_profit.toFixed(2)}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              
              {!result.is_profitable && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Warning</AlertTitle>
                  <AlertDescription>
                    This delivery incurs a net loss. Consider increasing the selling price, quantity, or reducing transport costs.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <h4 className="font-semibold border-b pb-2">Unit Economics (per unit)</h4>
                
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Raw Material / BOM Cost</span>
                  <span>₹{bomCostPerUnit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Manufacturing Overhead</span>
                  <span>₹{result.manufacturing_overhead_per_unit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Transport Cost Allocation</span>
                  <span>₹{result.transport_cost_per_unit.toFixed(2)}</span>
                </div>
                {result.product_other_expenses_per_unit > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Other Product Expenses</span>
                    <span>₹{result.product_other_expenses_per_unit.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm border-t pt-2">
                  <span>Total Cost to Manufacture & Deliver</span>
                  <span>₹{result.total_cost_per_unit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Selling Price</span>
                  <span>₹{sellingPricePerUnit.toFixed(2)}</span>
                </div>
                <div className={`flex justify-between font-bold text-base border-t pt-2 ${result.is_profitable ? 'text-green-600' : 'text-destructive'}`}>
                  <span>Net Margin (per unit)</span>
                  <span>₹{result.margin_per_unit.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-semibold pb-2">Trip Summary</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted p-3 rounded-lg text-center">
                    <div className="text-xs text-muted-foreground mb-1">Fuel Required</div>
                    <div className="font-semibold">{result.fuel_needed_liters.toFixed(2)} Liters</div>
                  </div>
                  <div className="bg-muted p-3 rounded-lg text-center">
                    <div className="text-xs text-muted-foreground mb-1">Fuel Cost</div>
                    <div className="font-semibold">₹{result.total_fuel_cost.toFixed(2)}</div>
                  </div>
                  <div className="bg-muted p-3 rounded-lg text-center col-span-2">
                    <div className="text-xs text-muted-foreground mb-1">Total Transport Cost (inc. tolls & exp)</div>
                    <div className="font-semibold text-lg">₹{result.total_transport_cost.toFixed(2)}</div>
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
