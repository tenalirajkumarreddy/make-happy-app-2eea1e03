import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Users, AlertTriangle, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface StaffStockItem {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  is_negative: boolean;
  amount_value: number;
  last_received_at?: string;
  last_sale_at?: string;
  transfer_count: number;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    base_price: number;
    image_url?: string;
  };
}

interface StaffMember {
  user_id: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
  role?: string;
  items: StaffStockItem[];
  totalValue: number;
  totalQuantity: number;
  negativeItems: number;
  lastActivity?: string;
}

interface StaffStockViewProps {
  staffStock?: StaffMember[];
  isLoading?: boolean;
  onViewDetails?: (staff: StaffMember) => void;
  onTransfer?: (staff: StaffMember) => void;
}

export function StaffStockView({ staffStock, isLoading, onViewDetails, onTransfer }: StaffStockViewProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!staffStock || staffStock.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">No Staff Holdings</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Stock will appear here once transferred to staff members. Use the transfer feature to assign stock.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalStaffValue = staffStock.reduce((sum, s) => sum + s.totalValue, 0);
  const totalNegativeValue = staffStock.reduce((sum, s) => 
    sum + s.items.filter(i => i.is_negative).reduce((isum, i) => isum + (i.amount_value || 0), 0), 0);
  const totalNegativeItems = staffStock.reduce((sum, s) => sum + s.negativeItems, 0);

  return (
    <div className="space-y-6">
      {/* Summary Banner */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700">Total Staff Holdings</p>
                <p className="text-2xl font-bold text-blue-900">₹{totalStaffValue.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-emerald-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-700">Staff Members</p>
                <p className="text-2xl font-bold text-emerald-900">{staffStock.length}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {totalNegativeItems > 0 && (
          <Card className="bg-gradient-to-br from-red-500/10 to-rose-500/10 border-red-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-700">Negative Stock</p>
                  <p className="text-2xl font-bold text-red-900">{totalNegativeItems} items</p>
                  <p className="text-xs text-red-600">₹{totalNegativeValue.toLocaleString()}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Staff Stock Cards */}
      <div className="grid gap-4">
        {staffStock.map((staff) => (
          <Card key={staff.user_id} className="overflow-hidden">
            <CardContent className="p-0">
              {/* Staff Header */}
              <div className={`flex items-center justify-between px-6 py-4 border-b ${
                staff.negativeItems > 0 ? "bg-red-50/60" : "bg-muted/30"
              }`}>
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12 border-2 border-background">
                    <AvatarImage src={staff.avatar_url} alt={staff.full_name} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                      {(staff.full_name || staff.email || "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-base">{staff.full_name || "Unknown Staff"}</p>
                      {staff.role && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {staff.role}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{staff.email}</p>
                    {staff.lastActivity && (
                      <p className="text-xs text-muted-foreground">
                        Last activity {formatDistanceToNow(new Date(staff.lastActivity), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  {staff.negativeItems > 0 && (
                    <div className="flex items-center gap-1 text-red-600 text-sm font-medium mb-1">
                      <AlertTriangle className="h-4 w-4" />
                      {staff.negativeItems} Negative
                    </div>
                  )}
                  <p className="text-xl font-bold">₹{staff.totalValue.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">{staff.items.length} products</p>
                </div>
              </div>

              {/* Product List */}
              <div className="divide-y">
                {staff.items.map((item) => (
                  <div 
                    key={item.id} 
                    className={`flex items-center gap-4 px-6 py-3 ${
                      item.is_negative ? "bg-red-50/40" : ""
                    }`}
                  >
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      {item.product.image_url ? (
                        <Avatar className="h-10 w-10 rounded-lg">
                          <AvatarImage src={item.product.image_url} className="object-cover" />
                          <AvatarFallback className="rounded-lg">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <Package className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">{item.product.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold text-base ${
                        item.is_negative ? "text-red-600" : 
                        item.quantity === 0 ? "text-muted-foreground" : 
                        "text-emerald-600"
                      }`}>
                        {item.quantity} <span className="text-xs font-normal text-muted-foreground">{item.product.unit}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ₹{(item.quantity * item.product.base_price).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="px-6 py-3 bg-muted/20 border-t flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => onViewDetails?.(staff)}
                >
                  View Details
                </Button>
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={() => onTransfer?.(staff)}
                >
                  <ArrowUpRight className="h-4 w-4 mr-1.5" />
                  Transfer Stock
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface StaffStockCompactViewProps {
  staffStock?: StaffStockItem[];
  isLoading?: boolean;
}

export function StaffStockCompactView({ staffStock, isLoading }: StaffStockCompactViewProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  if (!staffStock || staffStock.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No stock assigned</p>
      </div>
    );
  }

  const totalValue = staffStock.reduce((sum, item) => sum + (item.amount_value || 0), 0);
  const hasNegative = staffStock.some(item => item.is_negative);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div>
          <p className="text-sm font-medium">Total Stock Value</p>
          <p className="text-xl font-bold">₹{totalValue.toLocaleString()}</p>
        </div>
        {hasNegative && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Negative Stock
          </Badge>
        )}
      </div>

      <div className="divide-y border rounded-lg">
        {staffStock.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">{item.product.name}</p>
                <p className="text-xs text-muted-foreground">{item.product.sku}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-bold text-sm ${
                item.is_negative ? "text-red-600" : "text-emerald-600"
              }`}>
                {item.quantity} {item.product.unit}
              </p>
              <p className="text-xs text-muted-foreground">
                ₹{(item.quantity * item.product.base_price).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
