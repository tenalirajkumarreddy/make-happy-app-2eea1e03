import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Filter, X, RefreshCw } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, startOfYear } from "date-fns";
import { cn } from "@/lib/utils";

export interface DateRange {
  from: Date;
  to: Date;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface ReportFiltersProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  stores?: FilterOption[];
  selectedStore?: string;
  onStoreChange?: (value: string) => void;
  customers?: FilterOption[];
  selectedCustomer?: string;
  onCustomerChange?: (value: string) => void;
  vendors?: FilterOption[];
  selectedVendor?: string;
  onVendorChange?: (value: string) => void;
  products?: FilterOption[];
  selectedProduct?: string;
  onProductChange?: (value: string) => void;
  categories?: FilterOption[];
  selectedCategory?: string;
  onCategoryChange?: (value: string) => void;
  statuses?: FilterOption[];
  selectedStatus?: string;
  onStatusChange?: (value: string) => void;
  showStoreFilter?: boolean;
  showCustomerFilter?: boolean;
  showVendorFilter?: boolean;
  showProductFilter?: boolean;
  showCategoryFilter?: boolean;
  showStatusFilter?: boolean;
  onRefresh?: () => void;
  isLoading?: boolean;
}

const PRESET_RANGES = [
  { label: "Today", getValue: () => ({ from: new Date(), to: new Date() }) },
  { label: "Yesterday", getValue: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { label: "Last 7 days", getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: "Last 30 days", getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: "This Month", getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: "Last Month", getValue: () => {
    const lastMonth = subDays(startOfMonth(new Date()), 1);
    return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
  }},
  { label: "This Year", getValue: () => ({ from: startOfYear(new Date()), to: new Date() }) },
];

export function ReportFilters({
  dateRange,
  onDateRangeChange,
  stores = [],
  selectedStore,
  onStoreChange,
  customers = [],
  selectedCustomer,
  onCustomerChange,
  vendors = [],
  selectedVendor,
  onVendorChange,
  products = [],
  selectedProduct,
  onProductChange,
  categories = [],
  selectedCategory,
  onCategoryChange,
  statuses = [],
  selectedStatus,
  onStatusChange,
  showStoreFilter = false,
  showCustomerFilter = false,
  showVendorFilter = false,
  showProductFilter = false,
  showCategoryFilter = false,
  showStatusFilter = false,
  onRefresh,
  isLoading = false,
}: ReportFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasActiveFilters = 
    (showStoreFilter && selectedStore && selectedStore !== "all") ||
    (showCustomerFilter && selectedCustomer && selectedCustomer !== "all") ||
    (showVendorFilter && selectedVendor && selectedVendor !== "all") ||
    (showProductFilter && selectedProduct && selectedProduct !== "all") ||
    (showCategoryFilter && selectedCategory && selectedCategory !== "all") ||
    (showStatusFilter && selectedStatus && selectedStatus !== "all");

  const clearAllFilters = () => {
    if (onStoreChange) onStoreChange("all");
    if (onCustomerChange) onCustomerChange("all");
    if (onVendorChange) onVendorChange("all");
    if (onProductChange) onProductChange("all");
    if (onCategoryChange) onCategoryChange("all");
    if (onStatusChange) onStatusChange("all");
  };

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium whitespace-nowrap">Date Range:</Label>
            <Popover open={isOpen} onOpenChange={setIsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal min-w-[240px]",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
                      </>
                    ) : (
                      format(dateRange.from, "MMM d, yyyy")
                    )
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="flex">
                  <div className="border-r p-2 space-y-1">
                    {PRESET_RANGES.map((preset) => (
                      <Button
                        key={preset.label}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs"
                        onClick={() => {
                          onDateRangeChange(preset.getValue());
                          setIsOpen(false);
                        }}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                  <div className="p-2">
                    <Calendar
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={{ from: dateRange?.from, to: dateRange?.to }}
                      onSelect={(range) => {
                        if (range?.from && range?.to) {
                          onDateRangeChange({ from: range.from, to: range.to });
                        } else if (range?.from) {
                          onDateRangeChange({ from: range.from, to: range.from });
                        }
                      }}
                      numberOfMonths={2}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground">
                <X className="h-4 w-4 mr-1" />
                Clear filters
              </Button>
            )}
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              </Button>
            )}
          </div>
        </div>

        {(showStoreFilter || showCustomerFilter || showVendorFilter || showProductFilter || showCategoryFilter || showStatusFilter) && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
            <Filter className="h-4 w-4 text-muted-foreground" />
            
            {showStoreFilter && stores.length > 0 && (
              <Select value={selectedStore || "all"} onValueChange={onStoreChange}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="All Stores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stores</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {showCustomerFilter && customers.length > 0 && (
              <Select value={selectedCustomer || "all"} onValueChange={onCustomerChange}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {showVendorFilter && vendors.length > 0 && (
              <Select value={selectedVendor || "all"} onValueChange={onVendorChange}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="All Vendors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vendors</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {showProductFilter && products.length > 0 && (
              <Select value={selectedProduct || "all"} onValueChange={onProductChange}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="All Products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {showCategoryFilter && categories.length > 0 && (
              <Select value={selectedCategory || "all"} onValueChange={onCategoryChange}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {showStatusFilter && statuses.length > 0 && (
              <Select value={selectedStatus || "all"} onValueChange={onStatusChange}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
