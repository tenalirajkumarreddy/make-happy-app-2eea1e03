import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  History,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRightLeft,
  Plus,
  Minus,
  RotateCcw,
  Trash2,
  Search,
  User,
  Warehouse,
  Calendar,
  Filter,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useState, useMemo } from "react";

interface StockMovement {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  type: string;
  reason?: string;
  reference_id?: string;
  from_location?: string;
  to_location?: string;
  from_user_id?: string;
  to_user_id?: string;
  unit_price?: number;
  total_value?: number;
  created_at: string;
  created_by?: string;
  product?: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    image_url?: string;
  };
  from_user?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
  };
  to_user?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
  };
  creator?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
  };
}

interface StockHistoryViewProps {
  movements?: StockMovement[];
  isLoading?: boolean;
  products?: { id: string; name: string }[];
  warehouses?: { id: string; name: string }[];
  onFilterChange?: (filters: {
    productId?: string;
    type?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => void;
}

const MOVEMENT_TYPES: Record<string, { label: string; icon: typeof Plus; color: string }> = {
  purchase: { label: "Purchase", icon: Plus, color: "text-emerald-600", },
  sale: { label: "Sale", icon: Minus, color: "text-red-600" },
  adjustment: { label: "Adjustment", icon: RotateCcw, color: "text-amber-600" },
  return: { label: "Return", icon: RotateCcw, color: "text-blue-600" },
  damaged: { label: "Damaged", icon: Trash2, color: "text-red-600" },
  transfer_in: { label: "Transfer In", icon: ArrowRightLeft, color: "text-purple-600" },
  transfer_out: { label: "Transfer Out", icon: ArrowRightLeft, color: "text-orange-600" },
  warehouse_to_staff: { label: "To Staff", icon: ArrowUpRight, color: "text-indigo-600" },
  staff_to_warehouse: { label: "To Warehouse", icon: ArrowDownRight, color: "text-teal-600" },
};

export function StockHistoryView({
  movements,
  isLoading,
  products,
  warehouses,
  onFilterChange,
}: StockHistoryViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedType, setSelectedType] = useState("");

  const filteredMovements = useMemo(() => {
    if (!movements) return [];

    let filtered = movements;

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((m) =>
        m.product?.name?.toLowerCase().includes(term) ||
        m.product?.sku?.toLowerCase().includes(term) ||
        m.reason?.toLowerCase().includes(term) ||
        m.reference_id?.toLowerCase().includes(term)
      );
    }

    // Filter by product
    if (selectedProduct) {
      filtered = filtered.filter((m) => m.product_id === selectedProduct);
    }

    // Filter by type
    if (selectedType) {
      filtered = filtered.filter((m) => m.type === selectedType);
    }

    return filtered;
  }, [movements, searchTerm, selectedProduct, selectedType]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, StockMovement[]> = {};
    filteredMovements.forEach((movement) => {
      const date = format(parseISO(movement.created_at), "yyyy-MM-dd");
      if (!groups[date]) groups[date] = [];
      groups[date].push(movement);
    });
    return groups;
  }, [filteredMovements]);

  const sortedDates = useMemo(() =>
    Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a)),
    [groupedByDate]
  );

  const stats = useMemo(() => {
    if (!movements) return { total: 0, added: 0, removed: 0, value: 0 };
    return movements.reduce(
      (acc, m) => {
        acc.total++;
        if (m.quantity > 0) acc.added += m.quantity;
        else acc.removed += Math.abs(m.quantity);
        acc.value += m.total_value || 0;
        return acc;
      },
      { total: 0, added: 0, removed: 0, value: 0 }
    );
  }, [movements]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-32" />
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Movements</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <History className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Stock Added</p>
                <p className="text-2xl font-bold text-emerald-600">+{stats.added}</p>
              </div>
              <Plus className="h-8 w-8 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Stock Removed</p>
                <p className="text-2xl font-bold text-red-600">-{stats.removed}</p>
              </div>
              <Minus className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold">₹{stats.value.toLocaleString()}</p>
              </div>
              <ArrowRightLeft className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by product, SKU, or reference..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            {products && products.length > 0 && (
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter by product" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Products</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Types</SelectItem>
                {Object.entries(MOVEMENT_TYPES).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <config.icon className={`h-4 w-4 ${config.color}`} />
                      {config.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* History List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Movement History
            <Badge variant="secondary">{filteredMovements.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredMovements.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No stock movements found.</p>
              <p className="text-sm">
                Stock movements will appear here when inventory is adjusted.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-6 p-6">
                {sortedDates.map((date) => (
                  <div key={date}>
                    <div className="flex items-center gap-2 mb-3 sticky top-0 bg-card py-2 border-b z-10">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">
                        {format(parseISO(date), "EEEE, MMMM d, yyyy")}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {groupedByDate[date].length} movements
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {groupedByDate[date].map((movement) => (
                        <MovementItem key={movement.id} movement={movement} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MovementItem({ movement }: { movement: StockMovement }) {
  const typeConfig = MOVEMENT_TYPES[movement.type] || {
    label: movement.type,
    icon: ArrowRightLeft,
    color: "text-muted-foreground",
  };
  const TypeIcon = typeConfig.icon;

  const isPositive = movement.quantity > 0;

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors">
      {/* Icon */}
      <div
        className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
          isPositive ? "bg-emerald-50" : "bg-red-50"
        }`}
      >
        <TypeIcon
          className={`h-5 w-5 ${isPositive ? "text-emerald-600" : "text-red-600"}`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{movement.product?.name}</span>
              <Badge variant="outline" className="text-xs">
                {typeConfig.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {movement.product?.sku}
            </p>
          </div>
          <div className="text-right">
            <p
              className={`font-bold ${
                isPositive ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {isPositive ? "+" : ""}
              {movement.quantity} {movement.product?.unit}
            </p>
            {movement.total_value && movement.total_value > 0 && (
              <p className="text-xs text-muted-foreground">
                ₹{movement.total_value.toLocaleString()}
              </p>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {(movement.from_location || movement.to_location) && (
            <span className="flex items-center gap-1">
              <Warehouse className="h-3 w-3" />
              {movement.from_location || "Warehouse"} → {movement.to_location || "Warehouse"}
            </span>
          )}
          {(movement.from_user || movement.to_user) && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {movement.from_user?.full_name || "System"} → {movement.to_user?.full_name || "System"}
            </span>
          )}
          {movement.reason && (
            <span className="flex items-center gap-1">
              <History className="h-3 w-3" />
              {movement.reason}
            </span>
          )}
          {movement.reference_id && (
            <span className="font-mono">Ref: {movement.reference_id}</span>
          )}
        </div>

        {/* Timestamp */}
        <div className="mt-2 text-xs text-muted-foreground">
          {format(parseISO(movement.created_at), "h:mm a")}
          {movement.creator && (
            <span className="ml-2">by {movement.creator.full_name || "System"}</span>
          )}
        </div>
      </div>
    </div>
  );
}

interface MovementItemCompactProps {
  movement: StockMovement;
  onClick?: () => void;
}

export function MovementItemCompact({ movement, onClick }: MovementItemCompactProps) {
  const typeConfig = MOVEMENT_TYPES[movement.type] || {
    label: movement.type,
    icon: ArrowRightLeft,
    color: "text-muted-foreground",
  };
  const TypeIcon = typeConfig.icon;
  const isPositive = movement.quantity > 0;

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
    >
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
          isPositive ? "bg-emerald-50" : "bg-red-50"
        }`}
      >
        <TypeIcon
          className={`h-4 w-4 ${isPositive ? "text-emerald-600" : "text-red-600"}`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{movement.product?.name}</p>
        <p className="text-xs text-muted-foreground">
          {format(parseISO(movement.created_at), "MMM d, h:mm a")}
        </p>
      </div>
      <div className="text-right">
        <p
          className={`font-bold text-sm ${
            isPositive ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {isPositive ? "+" : ""}
          {movement.quantity}
        </p>
        <p className="text-xs text-muted-foreground">{movement.product?.unit}</p>
      </div>
    </div>
  );
}
