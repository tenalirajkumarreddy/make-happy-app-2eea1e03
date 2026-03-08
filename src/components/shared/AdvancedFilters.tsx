import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Filter, X, CalendarIcon } from "lucide-react";
import { format } from "date-fns";

export interface FilterConfig {
  dateRange?: boolean;
  outstandingRange?: boolean;
  storeType?: { options: { id: string; name: string }[] };
  route?: { options: { id: string; name: string }[] };
  kycStatus?: boolean;
  status?: boolean;
}

export interface FilterValues {
  dateFrom?: Date;
  dateTo?: Date;
  outstandingMin?: string;
  outstandingMax?: string;
  storeTypeId?: string;
  routeId?: string;
  kycStatus?: string;
  status?: string;
}

interface Props {
  config: FilterConfig;
  values: FilterValues;
  onChange: (values: FilterValues) => void;
}

export function AdvancedFilters({ config, values, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const activeCount = Object.values(values).filter((v) => v !== undefined && v !== "").length;

  const clear = () => onChange({});

  const set = (key: keyof FilterValues, value: any) => {
    onChange({ ...values, [key]: value || undefined });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 rounded-full bg-primary text-primary-foreground text-[10px] h-4 w-4 flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 space-y-4" align="end">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Filters</p>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clear}>
              <X className="h-3 w-3 mr-1" />Clear all
            </Button>
          )}
        </div>

        {config.dateRange && (
          <div className="space-y-2">
            <Label className="text-xs">Date Range</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("flex-1 justify-start text-left text-xs", !values.dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {values.dateFrom ? format(values.dateFrom, "dd MMM yy") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={values.dateFrom} onSelect={(d) => set("dateFrom", d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("flex-1 justify-start text-left text-xs", !values.dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {values.dateTo ? format(values.dateTo, "dd MMM yy") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={values.dateTo} onSelect={(d) => set("dateTo", d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}

        {config.outstandingRange && (
          <div className="space-y-2">
            <Label className="text-xs">Outstanding Range (₹)</Label>
            <div className="flex gap-2">
              <Input type="number" placeholder="Min" className="h-8 text-xs" value={values.outstandingMin || ""} onChange={(e) => set("outstandingMin", e.target.value)} />
              <Input type="number" placeholder="Max" className="h-8 text-xs" value={values.outstandingMax || ""} onChange={(e) => set("outstandingMax", e.target.value)} />
            </div>
          </div>
        )}

        {config.storeType && (
          <div className="space-y-2">
            <Label className="text-xs">Store Type</Label>
            <Select value={values.storeTypeId || ""} onValueChange={(v) => set("storeTypeId", v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {config.storeType.options.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {config.route && (
          <div className="space-y-2">
            <Label className="text-xs">Route</Label>
            <Select value={values.routeId || ""} onValueChange={(v) => set("routeId", v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All routes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All routes</SelectItem>
                {config.route.options.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {config.kycStatus && (
          <div className="space-y-2">
            <Label className="text-xs">KYC Status</Label>
            <Select value={values.kycStatus || ""} onValueChange={(v) => set("kycStatus", v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="not_requested">Not Requested</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {config.status && (
          <div className="space-y-2">
            <Label className="text-xs">Status</Label>
            <Select value={values.status || ""} onValueChange={(v) => set("status", v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Helper to apply filters to data arrays
export function applyFilters<T extends Record<string, any>>(
  data: T[],
  filters: FilterValues,
  fieldMap: {
    dateField?: string;
    outstandingField?: string;
    storeTypeField?: string;
    routeField?: string;
    kycField?: string;
    statusField?: string;
  }
): T[] {
  return data.filter((item) => {
    if (filters.dateFrom && fieldMap.dateField) {
      const d = new Date(item[fieldMap.dateField]);
      if (d < filters.dateFrom) return false;
    }
    if (filters.dateTo && fieldMap.dateField) {
      const d = new Date(item[fieldMap.dateField]);
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      if (d > to) return false;
    }
    if (filters.outstandingMin && fieldMap.outstandingField) {
      if (Number(item[fieldMap.outstandingField]) < Number(filters.outstandingMin)) return false;
    }
    if (filters.outstandingMax && fieldMap.outstandingField) {
      if (Number(item[fieldMap.outstandingField]) > Number(filters.outstandingMax)) return false;
    }
    if (filters.storeTypeId && fieldMap.storeTypeField) {
      if (item[fieldMap.storeTypeField] !== filters.storeTypeId) return false;
    }
    if (filters.routeId && fieldMap.routeField) {
      if (item[fieldMap.routeField] !== filters.routeId) return false;
    }
    if (filters.kycStatus && fieldMap.kycField) {
      if (item[fieldMap.kycField] !== filters.kycStatus) return false;
    }
    if (filters.status && fieldMap.statusField) {
      const isActive = item[fieldMap.statusField];
      if (filters.status === "active" && !isActive) return false;
      if (filters.status === "inactive" && isActive) return false;
    }
    return true;
  });
}
