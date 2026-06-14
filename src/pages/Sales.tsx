import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermission } from "@/hooks/usePermission";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  HoverCard, HoverCardContent, HoverCardTrigger,
} from "@/components/ui/hover-card";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { SaleReceipt } from "@/components/shared/SaleReceipt";
import { SaleDetailsDialog } from "@/components/sales/SaleDetailsDialog";
import { SaleReturnDialog } from "@/components/sales/SaleReturnDialog";
import { OrderFulfillmentDialog } from "@/components/orders/OrderFulfillmentDialog";
import { Loader2, Plus, Download, Banknote, UserCircle, Store as StoreIcon, Package, X, CalendarIcon, Receipt, FileText, RotateCcw, ShoppingCart, ChevronRight, ClipboardList, Wallet, QrCode, Minus, MapPin, Phone, Mail, AlertCircle, Pencil, XCircle } from "lucide-react";
import { useSalesList } from "@/hooks/useSalesList";
import { useRecordSale } from "@/hooks/useRecordSale";
import { useEditSale } from "@/hooks/useEditSale";
import { useCancelSale } from "@/hooks/useCancelSale";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useDebounce } from "@/hooks/useDebounce";

interface SaleRecord {
  id: string; display_id: string; store_id: string; customer_id: string | null; recorded_by: string;
  recorded_at: string; total_amount: number; total_quantity: number; payment_mode: string;
  payment_ref: string | null; payment_status: string; notes: string | null; status: string;
  sale_type: string; is_imported: boolean; approved_by: string | null; approved_at: string | null;
  created_at: string; updated_at: string; cash_amount?: number; upi_amount?: number;
  outstanding_amount?: number; invoice_sales?: Array<{ invoice_id: string }>;
  fulfilled_order_id?: string; logged_by?: string | null;
  stores?: { id: string; name: string; display_id?: string; store_type_id?: string; route_id?: string; address?: string; outstanding?: number; routes?: { name: string }; store_types?: { name: string } } | null;
  customers?: { id: string; name: string; display_id?: string; phone?: string; email?: string } | null;
  is_fully_returned?: boolean;
}

const Sales = () => {
  const navigate = useNavigate();
  const list = useSalesList();
  const record = useRecordSale();
  const edit = useEditSale();
  const cancel = useCancelSale();
  const { allowed: canCancelSales } = usePermission("cancel_sales");
  const sentinelRef = useInfiniteScroll(
    useCallback(() => list.setLoadedPages((p: number) => p + 1), [list.setLoadedPages]),
    list.hasMoreSales,
    list.isFetching
  );

  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [receiptSaleId, setReceiptSaleId] = useState<string | null>(null);
  const [returnSale, setReturnSale] = useState<SaleRecord | null>(null);

  const { data: saleItems, isLoading: loadingSaleItems } = useQuery({
    queryKey: ["sale-items", selectedSaleId],
    queryFn: async () => { const { data } = await supabase.from("sale_items").select("*, products(name, sku)").eq("sale_id", selectedSaleId!); return data || []; },
    enabled: !!selectedSaleId,
  });

  useEffect(() => {
    list.setFilterSearch(debouncedSearch);
  }, [debouncedSearch, list.setFilterSearch]);

  const selectedSale = list.sales?.find((s: any) => s.id === selectedSaleId);
  const editingSale = list.sales?.find((s: any) => s.id === edit.editingSaleId);

  useEffect(() => { document.title = "Sales | BizManager"; return () => { document.title = "BizManager"; }; }, []);

  // Store Hover Card
  const StoreHoverCard = ({ store, children }: { store: any; children: React.ReactNode }) => {
    if (!store) return <>{children}</>;
    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <Link to={`/stores/${store.id}`} className="hover:underline cursor-pointer">{children}</Link>
        </HoverCardTrigger>
        <HoverCardContent className="w-72 p-0" align="start">
          <div className="p-3 space-y-3">
            <div className="flex items-start gap-3">
              {store.image_url ? <img src={store.image_url} alt={store.name} className="h-14 w-14 rounded-lg object-cover border" />
                : <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center border"><StoreIcon className="h-6 w-6 text-primary" /></div>}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{store.name}</p>
                <p className="text-xs text-muted-foreground">{store.display_id}</p>
                {store.routes?.name && <div className="flex items-center gap-1 mt-1"><MapPin className="h-3 w-3 text-muted-foreground" /><span className="text-xs text-muted-foreground truncate">{store.routes.name}</span></div>}
              </div>
            </div>
            <div className="space-y-2 text-xs">
              {store.store_types?.name && <div className="flex items-center gap-2"><span className="text-muted-foreground min-w-[60px]">Type:</span><span className="font-medium">{store.store_types.name}</span></div>}
              {store.address && <div className="flex items-start gap-2"><span className="text-muted-foreground min-w-[60px]">Address:</span><span className="text-muted-foreground line-clamp-2">{store.address}</span></div>}
            </div>
            {store.outstanding !== undefined && (
              <div className="flex items-center justify-between py-2 border-t text-sm">
                <span className="text-muted-foreground">Balance:</span>
                <span className={`font-bold ${Number(store.outstanding) > 0 ? "text-destructive" : "text-success"}`}>₹{Number(store.outstanding || 0).toLocaleString()}</span>
              </div>
            )}
            <Button size="sm" variant="outline" className="w-full text-xs" asChild><Link to={`/stores/${store.id}`}>View Store Profile</Link></Button>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  };

  // Customer Hover Card
  const CustomerHoverCard = ({ customer, children }: { customer: any; children: React.ReactNode }) => {
    if (!customer) return <>{children}</>;
    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <Link to={`/customers/${customer.id}`} className="hover:underline cursor-pointer">{children}</Link>
        </HoverCardTrigger>
        <HoverCardContent className="w-64 p-0" align="start">
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-3">
              {customer.image_url ? <img src={customer.image_url} alt={customer.name} className="h-12 w-12 rounded-full object-cover border" />
                : <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center border"><UserCircle className="h-6 w-6 text-primary" /></div>}
              <div className="flex-1 min-w-0"><p className="font-semibold text-sm truncate">{customer.name}</p><p className="text-xs text-muted-foreground">{customer.display_id}</p></div>
            </div>
            {(customer.phone || customer.email) && (
              <div className="space-y-2 border-t py-2 text-xs">
                {customer.phone && <div className="flex items-center gap-2"><Phone className="h-3 w-3 text-muted-foreground shrink-0" /><span>{customer.phone}</span></div>}
                {customer.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3 text-muted-foreground shrink-0" /><span className="truncate">{customer.email}</span></div>}
              </div>
            )}
            <Button size="sm" variant="outline" className="w-full text-xs" asChild><Link to={`/customers/${customer.id}`}>View Customer Profile</Link></Button>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  };

  const returnedClass = (row: any) => row.is_fully_returned ? "line-through text-muted-foreground" : "";

  const columns = [
    { header: "Sale ID", accessor: (row: any) => (
      <span className={`font-mono text-xs ${returnedClass(row)}`}>
        {row.display_id}
        {row.is_fully_returned && <span className="ml-2 text-4xs font-bold bg-warning/20 text-warning border border-warning/30 rounded px-1 py-0">Returned</span>}
      </span>
    ), className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => (
      <div className={`flex items-center gap-2 ${returnedClass(row)}`}>
        <StoreIcon className={`h-4 w-4 text-muted-foreground shrink-0 ${returnedClass(row)}`} />
        <StoreHoverCard store={row.stores}>
          <span>{row.stores?.name || "—"}</span>
        </StoreHoverCard>
      </div>
    ), className: "font-medium" },
    { header: "Customer", accessor: (row: any) => (
      <div className={`flex items-center gap-2 ${returnedClass(row)}`}>
        <UserCircle className={`h-4 w-4 text-muted-foreground shrink-0 ${returnedClass(row)}`} />
        <CustomerHoverCard customer={row.customers}>
          <span>{row.customers?.name || "—"}</span>
        </CustomerHoverCard>
      </div>
    ), className: "text-sm hidden md:table-cell" },
    { header: "Total", accessor: (row: any) => <span className={`font-semibold ${returnedClass(row)}`}>₹{Number(row.total_amount || 0).toLocaleString()}</span>, className: "font-semibold" },
    { header: "Cash", accessor: (row: any) => <span className={`text-sm hidden md:table-cell ${returnedClass(row)}`}>₹{Number(row.cash_amount || 0).toLocaleString()}</span>, className: "text-sm hidden md:table-cell" },
    { header: "UPI", accessor: (row: any) => <span className={`text-sm hidden md:table-cell ${returnedClass(row)}`}>₹{Number(row.upi_amount || 0).toLocaleString()}</span>, className: "text-sm hidden md:table-cell" },
    { header: "Outstanding", accessor: (row: any) => <span className={`${Number(row.outstanding_amount || 0) > 0 ? "text-destructive font-medium" : "text-muted-foreground"} ${returnedClass(row)}`}>₹{Number(row.outstanding_amount || 0).toLocaleString()}</span>, className: "text-sm hidden md:table-cell" },
    { header: "Recorded By", accessor: (row: any) => <div className={`flex items-center gap-2 ${returnedClass(row)}`}><Avatar className="h-6 w-6"><AvatarImage src={list.getRecorderAvatar(row.recorded_by) || undefined} /><AvatarFallback className="text-2xs bg-primary/10 text-primary">{list.getRecorderName(row.recorded_by).charAt(0)}</AvatarFallback></Avatar><span className="text-xs text-muted-foreground">{list.getRecorderName(row.recorded_by)}</span></div>, className: "hidden lg:table-cell" },
    { header: "Date", accessor: (row: any) => <span className={`text-xs text-muted-foreground ${returnedClass(row)}`}>{format(new Date(row.created_at), "dd MMM yy, hh:mm a")}</span>, className: "hidden sm:table-cell" },
    {
      header: "Actions", accessor: (row: any) => (
        <div className="flex items-center gap-1">
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10" onClick={(e) => { e.stopPropagation(); setReceiptSaleId(row.id); }}><Receipt className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>View Receipt</p></TooltipContent></Tooltip>
          {list.isAdmin && (
            <Tooltip><TooltipTrigger asChild>
              {row.invoice_sales?.length > 0 ? (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-success hover:bg-success/10" onClick={(e) => { e.stopPropagation(); const invId = row.invoice_sales[0]?.invoice_id; if (invId) navigate(`/invoices/${invId}`); }}><FileText className="h-4 w-4" /></Button>
              ) : (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-info hover:bg-info/10" onClick={(e) => { e.stopPropagation(); navigate("/invoices/new", { state: { saleIds: [row.id] } }); }}><FileText className="h-4 w-4" /></Button>
              )}
            </TooltipTrigger><TooltipContent><p>{row.invoice_sales?.length > 0 ? "View Invoice" : "Generate Invoice"}</p></TooltipContent></Tooltip>
          )}
          {!row.is_fully_returned && (
            <Tooltip><TooltipTrigger asChild><span><Button variant="ghost" size="icon" className="h-7 w-7 text-info hover:bg-info/10 disabled:opacity-30" onClick={(e) => { e.stopPropagation(); edit.openEditSale(row); }} disabled={list.isPastDate(row.created_at, row.updated_at)}><Pencil className="h-4 w-4" /></Button></span></TooltipTrigger><TooltipContent><p>{list.isPastDate(row.created_at, row.updated_at) ? "Edits are locked after the day recorded" : "Edit Sale"}</p></TooltipContent></Tooltip>
          )}
          <Tooltip><TooltipTrigger asChild><span><Button variant="ghost" size="icon" className={`h-7 w-7 disabled:opacity-30 ${row.is_fully_returned ? "text-slate-300 cursor-not-allowed" : "text-warning hover:bg-warning/10"}`} onClick={(e) => { e.stopPropagation(); if (!row.is_fully_returned) setReturnSale(row); }} disabled={row.is_fully_returned || list.isPastDate(row.created_at, row.updated_at)}><RotateCcw className="h-4 w-4" /></Button></span></TooltipTrigger><TooltipContent><p>{row.is_fully_returned ? "Sale already returned" : list.isPastDate(row.created_at, row.updated_at) ? "Returns are locked after the day recorded" : "Return Sale"}</p></TooltipContent></Tooltip>
          {canCancelSales && !row.is_fully_returned && (
            <Tooltip><TooltipTrigger asChild><span><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); cancel.setCancelSale(row); }}><XCircle className="h-4 w-4" /></Button></span></TooltipTrigger><TooltipContent><p>Cancel Sale</p></TooltipContent></Tooltip>
          )}
          {row.fulfilled_order_id && (
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-info hover:bg-info/10" onClick={(e) => { e.stopPropagation(); navigate(`/orders?highlight=${row.fulfilled_order_id}`); }}><ClipboardList className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>View Source Order</p></TooltipContent></Tooltip>
          )}
        </div>
      ), className: "hidden sm:table-cell" },
  ];

  if (list.isLoading) return <TableSkeleton columns={7} />;

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title="Sales"
          subtitle="View and record sales transactions"
          primaryAction={{ label: "Record Sale", onClick: () => record.setShowAdd(true) }}
          actions={[
            { label: "Returns", icon: RotateCcw, priority: 0, onClick: () => navigate("/sale-returns") },
            { label: "Export CSV", icon: Download, priority: 1, onClick: () => {
              list.exportCSV(list.filteredSales.map((s: any) => ({ ...s, store_name: s.stores?.name || "", customer_name: s.customers?.name || "", recorder: list.getRecorderName(s.recorded_by) })), [
                { header: "Sale ID", key: "display_id" }, { header: "Store", key: "store_name" }, { header: "Customer", key: "customer_name" },
                { header: "Total", key: "total_amount" }, { header: "Cash", key: "cash_amount" }, { header: "UPI", key: "upi_amount" },
                { header: "Outstanding", key: "outstanding_amount" }, { header: "Recorded By", key: "recorder" }, { header: "Date", key: "created_at" },
              ], "sales-export.csv");
            }},
          ]}
        />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-muted/30">
          <Popover><PopoverTrigger asChild><Button variant="outline" className="h-8 flex-1 min-w-[100px] justify-start gap-2 text-xs font-normal sm:flex-none"><CalendarIcon className="h-3 w-3 shrink-0" />{list.filterFrom ? format(new Date(list.filterFrom + "T00:00:00"), "dd MMM yy") : "From"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={list.filterFrom ? new Date(list.filterFrom + "T00:00:00") : undefined} onSelect={(d) => list.setFilterFrom(d ? format(d, "yyyy-MM-dd") : "")} initialFocus /></PopoverContent></Popover>
          <Popover><PopoverTrigger asChild><Button variant="outline" className="h-8 flex-1 min-w-[100px] justify-start gap-2 text-xs font-normal sm:flex-none"><CalendarIcon className="h-3 w-3 shrink-0" />{list.filterTo ? format(new Date(list.filterTo + "T00:00:00"), "dd MMM yy") : "To"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={list.filterTo ? new Date(list.filterTo + "T00:00:00") : undefined} onSelect={(d) => list.setFilterTo(d ? format(d, "yyyy-MM-dd") : "")} initialFocus /></PopoverContent></Popover>
          <Select value={list.filterStore} onValueChange={list.setFilterStore}><SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="All stores" /></SelectTrigger><SelectContent><SelectItem value="all">All stores</SelectItem>{list.stores?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
          <Select value={list.filterStoreType} onValueChange={list.setFilterStoreType}><SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="All store types" /></SelectTrigger><SelectContent><SelectItem value="all">All store types</SelectItem>{list.storeTypes?.map((st: any) => <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>)}</SelectContent></Select>
          <Select value={list.filterRoute} onValueChange={list.setFilterRoute}><SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="All routes" /></SelectTrigger><SelectContent><SelectItem value="all">All routes</SelectItem>{list.routes?.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select>
          <Select value={list.filterUser} onValueChange={list.setFilterUser}><SelectTrigger className="h-8 text-xs flex-1 min-w-[120px] sm:flex-none sm:w-40"><SelectValue placeholder="All users" /></SelectTrigger><SelectContent><SelectItem value="all">All users</SelectItem>{list.profiles?.map((p: any) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent></Select>
          <Select value={list.filterPayment} onValueChange={list.setFilterPayment}><SelectTrigger className="h-8 text-xs flex-1 min-w-[80px] sm:flex-none sm:w-32"><SelectValue placeholder="All payments" /></SelectTrigger><SelectContent><SelectItem value="all">All payments</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="outstanding">Outstanding</SelectItem></SelectContent></Select>
          {list.activeFilterCount > 0 && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={list.clearFilters}>Clear ({list.activeFilterCount})</Button>}
          <span className="ml-auto text-xs text-muted-foreground">{list.filteredSales.length}{list.hasMoreSales ? "+" : ""} result{list.filteredSales.length !== 1 ? "s" : ""}</span>
        </div>

        <DataTable
          columns={columns}
          data={list.filteredSales}
          searchKey="display_id"
          searchPlaceholder="Search by sale ID..."
          emptyMessage="No sales recorded yet."
          onRowClick={(row: any) => setSelectedSaleId(row.id)}
          onSearch={setSearchInput}
          searchValue={searchInput}
          renderMobileCard={(row: any) => {
            const returnedClass = row.is_fully_returned ? "line-through text-muted-foreground" : "";
            return (
            <div className={`rounded-lg border bg-card p-3 ${row.is_fully_returned ? "opacity-70 bg-slate-50 dark:bg-slate-900/40 border-dashed border-destructive/30 dark:border-destructive/30" : ""}`}>
              {/* Header row: ID + Date */}
              <div className="mb-2 flex items-center justify-between">
                <span className={`font-mono text-xs font-medium ${row.is_fully_returned ? "line-through text-muted-foreground" : "text-primary"}`}>
                  {row.display_id}
                  {row.is_fully_returned && <span className="ml-2 text-4xs font-bold bg-warning/20 dark:bg-warning/20 text-warning dark:text-warning border border-warning/30 dark:border-warning/30 rounded px-2 py-0">Returned</span>}
                </span>
                <span className="text-2xs text-muted-foreground">{format(new Date(row.created_at), "dd MMM yy, hh:mm a")}</span>
              </div>
              {/* Store name */}
              <div className={`mb-2 flex items-center gap-2 ${returnedClass}`}>
                <StoreIcon className={`h-4 w-4 shrink-0 ${returnedClass} text-muted-foreground`} />
                <span className={`font-medium text-sm truncate ${returnedClass}`}>{row.stores?.name || "—"}</span>
              </div>
              {/* Amounts row - inline compact */}
              <div className="flex items-center gap-3 text-xs">
                <span className={`font-bold ${returnedClass}`}>₹{Number(row.total_amount || 0).toLocaleString()}</span>
                <span className={returnedClass}>Cash: ₹{Number(row.cash_amount || 0).toLocaleString()}</span>
                <span className={returnedClass}>UPI: ₹{Number(row.upi_amount || 0).toLocaleString()}</span>
              </div>
              {/* Footer: Recorder + Balance */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={list.getRecorderAvatar(row.recorded_by) || undefined} />
                    <AvatarFallback className="text-5xs bg-primary/10 text-primary">{list.getRecorderName(row.recorded_by).charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-2xs text-muted-foreground truncate max-w-[100px]">{list.getRecorderName(row.recorded_by)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Due:</span>
                  <span className={`${returnedClass} ${!row.is_fully_returned && Number(row.outstanding_amount || 0) > 0 ? "font-semibold text-destructive" : ""}`}>
                    ₹{Number(row.outstanding_amount || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          );}}
        />

        <div ref={sentinelRef} className="flex justify-center py-4">
          {list.isFetching ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : !list.hasMoreSales && list.sales.length > 0 ? (
            <span className="text-xs text-muted-foreground">All {list.sales.length} results loaded</span>
          ) : null}
        </div>

        {/* Sale Details Dialog */}
        <SaleDetailsDialog
          open={!!selectedSaleId}
          onOpenChange={(v) => { if (!v) setSelectedSaleId(null); }}
          sale={selectedSale ?? null}
          saleItems={saleItems || []}
          loadingSaleItems={loadingSaleItems}
          isAdmin={list.isAdmin}
          canCancelSales={canCancelSales}
          onReturn={(sale: any) => { setReturnSale(sale); setSelectedSaleId(null); }}
          onCancel={(sale: any) => { cancel.setCancelSale(sale); setSelectedSaleId(null); }}
          onEdit={(sale: any) => { edit.openEditSale(sale); setSelectedSaleId(null); }}
          onViewOrder={(orderId: string) => navigate(`/orders?highlight=${orderId}`)}
          getRecorderName={list.getRecorderName}
          getRecorderAvatar={list.getRecorderAvatar}
          isPastDate={list.isPastDate}
        />

        {/* Sale Return Dialog */}
        <SaleReturnDialog
          key={`return-${returnSale?.id || "none"}`}
          open={!!returnSale}
          onOpenChange={(v) => { if (!v) setReturnSale(null); }}
          sale={returnSale as any}
          onSuccess={() => {}}
        />

        {/* Cancel Sale Dialog */}
        <Dialog key={`cancel-${cancel.cancelSale?.id || "none"}`} open={!!cancel.cancelSale} onOpenChange={(v) => { if (!v) cancel.closeCancel(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive"><XCircle className="h-5 w-5" /> Cancel Sale — {cancel.cancelSale?.display_id}</DialogTitle>
            </DialogHeader>
            {cancel.cancelSale && (
              <CancelSaleContent
                sale={cancel.cancelSale}
                agentProfiles={list.agentProfiles}
                restockTarget={cancel.cancelRestockTarget}
                selectedAgentId={cancel.cancelSelectedAgentId}
                isCancelling={cancel.isCancellingSale}
                onRestockTargetChange={cancel.setCancelRestockTarget}
                onAgentIdChange={cancel.setCancelSelectedAgentId}
                onCancel={cancel.closeCancel}
                onConfirm={cancel.handleCancel}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Sale Dialog */}
        <Dialog key={`edit-${edit.editingSaleId || "none"}`} open={!!edit.editingSaleId} onOpenChange={(v) => { if (!v) edit.closeEditSale(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-info" /> Edit Sale — {editingSale?.display_id}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Products & Quantities</Label>
                {edit.editingItems.length === 0 ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    {edit.editingItems.map((item: any) => (
                      <div key={item.product_id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">₹{item.unit_price.toLocaleString()} × {item.quantity} = ₹{(item.quantity * item.unit_price).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            <span className="text-2xs text-muted-foreground">₹</span>
                            <Input type="number" min={0} value={item.unit_price} onChange={(e) => { const v = Number(e.target.value) || 0; edit.setEditingItems((prev: any[]) => prev.map((i: any) => i.product_id === item.product_id ? { ...i, unit_price: v, total_price: i.quantity * v } : i)); }} className="w-16 h-7 text-xs font-semibold px-1" />
                          </div>
                          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => edit.setEditingItems((prev: any[]) => prev.map((i: any) => i.product_id === item.product_id ? { ...i, quantity: Math.max(1, i.quantity - 1), total_price: Math.max(1, i.quantity - 1) * i.unit_price } : i))}><Minus className="h-3 w-3" /></Button>
                          <Input type="number" min={1} value={item.quantity} onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); edit.setEditingItems((prev: any[]) => prev.map((i: any) => i.product_id === item.product_id ? { ...i, quantity: v, total_price: v * i.unit_price } : i)); }} className="w-14 h-7 text-center text-sm px-1" />
                          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => edit.setEditingItems((prev: any[]) => prev.map((i: any) => i.product_id === item.product_id ? { ...i, quantity: i.quantity + 1, total_price: (i.quantity + 1) * i.unit_price } : i))}><Plus className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {edit.editingItems.length > 0 && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Original Total:</span><span className="line-through text-muted-foreground">₹{(editingSale?.total_amount || 0).toLocaleString()}</span></div>
                  <div className="flex justify-between font-bold"><span>New Total:</span><span className="text-info">₹{edit.editingItems.reduce((sum: number, i: any) => sum + i.quantity * i.unit_price, 0).toLocaleString()}</span></div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label className="text-sm text-muted-foreground flex items-center gap-1"><Banknote className="h-3 w-3" /> Cash</Label><Input type="number" min={0} value={edit.editCash} onChange={(e) => edit.setEditCash(e.target.value)} className="text-lg font-semibold" placeholder="0" /></div>
                <div className="space-y-1"><Label className="text-sm text-muted-foreground flex items-center gap-1"><QrCode className="h-3 w-3" /> UPI</Label><Input type="number" min={0} value={edit.editUpi} onChange={(e) => edit.setEditUpi(e.target.value)} className="text-lg font-semibold" placeholder="0" /></div>
              </div>

              {edit.editingItems.length > 0 && (
                <div className="rounded-lg border border-dashed p-3 flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Calculated Outstanding:</span>
                  <span className={`font-bold ${(() => { const nt = edit.editingItems.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0); const os = Math.max(nt - (Number(edit.editCash) || 0) - (Number(edit.editUpi) || 0), 0); return os > 0 ? "text-destructive" : "text-success"; })()}`}>
                    ₹{(() => { const nt = edit.editingItems.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0); return Math.max(nt - (Number(edit.editCash) || 0) - (Number(edit.editUpi) || 0), 0).toLocaleString(); })()}
                  </span>
                </div>
              )}

              <Button className="w-full" onClick={() => edit.handleEditSale(editingSale)} disabled={edit.submittingEdit || edit.editingItems.length === 0}>
                {edit.submittingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />} Save & Update Sale
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Record Sale Dialog */}
        <Dialog open={record.showAdd} onOpenChange={(v) => { record.setShowAdd(v); if (!v) record.resetForm(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Record Sale</DialogTitle></DialogHeader>
            <form onSubmit={record.handleAdd} className="space-y-4">
              {record.canRecordBehalf && (
                <div>
                  <Label>Record on behalf of</Label>
                  <Select value={record.recordedFor || "self"} onValueChange={(v) => record.setRecordedFor(v === "self" ? "" : v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Myself (default)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="self">Myself</SelectItem>
                      {record.staffUsers?.map((s: any) => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {record.isAdmin && (
                <div>
                  <Label>Sale Date <span className="text-muted-foreground text-xs font-normal">(leave blank to use current time)</span></Label>
                  <Input type="datetime-local" value={record.saleDate} onChange={(e) => record.setSaleDate(e.target.value)} className="mt-1" />
                </div>
              )}

              <div>
                <Label>Store</Label>
                {record.isPosUser ? (
                  <div className="mt-1 flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                    {record.selectedStore?.name || "POS Store"}
                  </div>
                ) : (
                  <Select value={record.storeId} onValueChange={record.handleStoreChange}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select a store..." /></SelectTrigger>
                    <SelectContent>
                      {record.stores?.filter((s: any) => s.is_active !== false).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Pending Orders */}
              {record.pendingOrders.length > 0 && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-primary" /><span className="text-sm font-semibold text-primary">Pending Orders</span></div>
                  {record.pendingOrders.map((order: any) => (
                    <Card key={order.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => record.handleFulfillOrder(order.id)}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2"><span className="font-mono text-xs font-medium text-primary">{order.display_id}</span><Badge variant="secondary" className="text-2xs px-1 h-4">{order.order_type}</Badge></div>
                          {order.order_type === "detailed" && order.order_items?.length > 0 ? (
                            <p className="text-3xs text-muted-foreground truncate">{order.order_items.slice(0, 2).map((i: any) => i.products?.name || "Item").join(", ")}{order.order_items.length > 2 && ` +${order.order_items.length - 2} more`}</p>
                          ) : order.requirement_note ? <p className="text-3xs text-muted-foreground truncate">{order.requirement_note}</p> : null}
                          <p className="text-2xs text-muted-foreground/70">{format(new Date(order.created_at), "dd MMM, hh:mm a")}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {record.loadingOrderId === order.id ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <><span className="text-xs text-primary font-medium">Fulfill</span><ChevronRight className="h-4 w-4 text-primary" /></>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <div className="pt-1 border-t border-primary/20"><p className="text-3xs text-center text-muted-foreground">- or create a new sale below -</p></div>
                </div>
              )}

              {/* Product items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Products & Quantities</Label>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={record.addItem}><Plus className="h-3 w-3 mr-1" />Add Other Product</Button>
                </div>

                {record.storeProducts && record.storeProducts.length === 0 && record.storeId && record.selectedStore?.store_type_id && (
                  <div className="text-center py-4 border border-dashed rounded-lg"><p className="text-sm text-muted-foreground">No products configured for this store type</p><p className="text-xs text-muted-foreground">Use "Add Other Product" to add items</p></div>
                )}

                {record.items.length > 0 && (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {record.items.map((item: any, idx: number) => {
                      const product = item.product_id ? record.allProducts?.find((p: any) => p.id === item.product_id) : null;
                      return (
                        <div key={idx} className="flex items-center gap-3 p-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                          <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                            {product?.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" /> : <Package className="h-5 w-5 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{product?.name || item.product_name || "Select Product"}</p>
                            {item.quantity > 0 ? (
                              <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">₹{item.unit_price.toLocaleString()} × {item.quantity}</span><span className="text-xs font-bold text-foreground">= ₹{(item.quantity * item.unit_price).toLocaleString()}</span></div>
                            ) : <span className="text-xs text-muted-foreground">₹{item.unit_price.toLocaleString()} each</span>}
                            {product?.stock !== undefined && <p className="text-2xs text-muted-foreground/70">Stock: {product.stock}</p>}
                          </div>
                          {item.product_id && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => record.removeItem(idx)}><X className="h-3 w-3" /></Button>
                              <div className="flex items-center gap-1">
                                <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => record.updateItem(idx, "quantity", Math.max(1, item.quantity - 1))}><Minus className="h-3 w-3" /></Button>
                                <Input type="number" min={1} value={item.quantity} onChange={(e) => record.updateItem(idx, "quantity", Math.max(1, Number(e.target.value) || 1))} className="w-14 h-7 text-center text-sm px-1" />
                                <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => record.updateItem(idx, "quantity", item.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {record.storeProducts && record.storeProducts.length > 0 && record.items.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">No products selected. Add products above.</p>
                )}
              </div>

              {/* Totals */}
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold text-foreground">₹{record.totalAmount.toLocaleString()}</span></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-3xs text-muted-foreground flex items-center gap-1"><Banknote className="h-3 w-3" /> Cash</Label><Input type="number" min={0} value={record.cashAmount} onChange={(e) => record.setCashAmount(e.target.value)} className="text-base font-semibold h-9" placeholder="0" /></div>
                  <div className="space-y-1"><Label className="text-3xs text-muted-foreground flex items-center gap-1"><QrCode className="h-3 w-3" /> UPI</Label><Input type="number" min={0} value={record.upiAmount} onChange={(e) => record.setUpiAmount(e.target.value)} className="text-base font-semibold h-9" placeholder="0" /></div>
                </div>
                <div className="flex justify-between pt-1 border-t"><span className="text-muted-foreground">Outstanding</span><span className={`font-bold ${record.outstandingFromSale > 0 ? "text-destructive" : "text-success"}`}>₹{record.outstandingFromSale.toLocaleString()}</span></div>
                {record.selectedStore && (
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Store outstanding: ₹{Number(record.selectedStore.outstanding || 0).toLocaleString()}</span><span>New: ₹{record.newOutstanding.toLocaleString()}</span></div>
                )}
              </div>

              {/* Credit Limit Warning */}
              {record.creditLimitInfo && (
                <div className={`rounded-lg border p-3 text-sm ${record.creditExceeded ? "bg-destructive/10 border-destructive/30 text-destructive" : record.creditWarning ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-muted/30"}`}>
                  <div className="flex items-center gap-2 mb-1"><AlertCircle className="h-4 w-4" /><span className="font-semibold">{record.creditExceeded ? "Credit Limit Exceeded" : record.creditWarning ? "Credit Limit Warning" : "Credit Limit"}</span></div>
                  <div className="flex justify-between text-xs"><span>Limit: ₹{record.creditLimitInfo.limit.toLocaleString()}</span><span>Current: ₹{record.creditLimitInfo.currentOutstanding.toLocaleString()}</span><span>After Sale: ₹{record.newOutstanding.toLocaleString()}</span></div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={record.saving}>
                {record.saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Record Sale
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Add Product Dialog */}
        <Dialog open={record.showAddProductDialog} onOpenChange={record.setShowAddProductDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
            <Select value={record.selectedProductToAdd} onValueChange={record.setSelectedProductToAdd}>
              <SelectTrigger><SelectValue placeholder="Choose a product..." /></SelectTrigger>
              <SelectContent>
                {record.allProducts?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} (₹{p.base_price})</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={record.addProductToSale} disabled={!record.selectedProductToAdd}>Add to Sale</Button>
          </DialogContent>
        </Dialog>

        {/* Order Fulfillment Dialog */}
        {record.fulfillOrder && (
          <OrderFulfillmentDialog
            open={!!record.fulfillOrder}
            onOpenChange={(v: boolean) => { if (!v) record.setFulfillOrder(null); }}
            order={record.fulfillOrder}
          />
        )}

        {/* Sale Receipt Dialog */}
        <SaleReceipt
          saleId={receiptSaleId}
          open={!!receiptSaleId}
          onClose={() => setReceiptSaleId(null)}
        />
      </div>
    </TooltipProvider>
  );
};

function CancelSaleContent({
  sale, agentProfiles, restockTarget, selectedAgentId, isCancelling,
  onRestockTargetChange, onAgentIdChange, onCancel, onConfirm,
}: {
  sale: SaleRecord; agentProfiles: any[]; restockTarget: "warehouse" | "agent";
  selectedAgentId: string; isCancelling: boolean;
  onRestockTargetChange: (t: "warehouse" | "agent") => void;
  onAgentIdChange: (id: string) => void; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
        <p className="font-semibold">This action cannot be undone</p>
        <p className="text-xs mt-1">The sale will be voided, outstanding reversed, and all items restored to stock.</p>
      </div>
      <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Sale Date</span><span>{format(new Date(sale.created_at), "dd MMM yyyy")}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Total Amount</span><span className="font-semibold">₹{(sale.total_amount ?? 0).toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Outstanding</span><span className="font-semibold text-destructive">₹{(sale.outstanding_amount ?? 0).toLocaleString()}</span></div>
      </div>
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Where should the stock go?</Label>
        <div className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50" onClick={() => onRestockTargetChange("agent")}>
          <input type="radio" checked={restockTarget === "agent"} readOnly className="accent-primary" />
          <div className="flex-1"><p className="text-sm font-medium">Return to an agent</p><p className="text-xs text-muted-foreground">Stock restored to the selected agent's holding</p></div>
        </div>
        {restockTarget === "agent" && (
          <Select value={selectedAgentId} onValueChange={onAgentIdChange}>
            <SelectTrigger className="ml-7"><SelectValue placeholder="Select agent..." /></SelectTrigger>
            <SelectContent>{agentProfiles.map((ap: any) => <SelectItem key={ap.user_id} value={ap.user_id}>{ap.full_name || ap.user_id.slice(0, 8)}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50" onClick={() => { onRestockTargetChange("warehouse"); onAgentIdChange(""); }}>
          <input type="radio" checked={restockTarget === "warehouse"} readOnly className="accent-primary" />
          <div className="flex-1"><p className="text-sm font-medium">Return to warehouse</p><p className="text-xs text-muted-foreground">Stock restored to warehouse product stock</p></div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" onClick={onCancel}>Keep Sale</Button>
        <Button variant="destructive" onClick={onConfirm} disabled={isCancelling || (restockTarget === "agent" && !selectedAgentId)}>
          {isCancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirm Cancellation
        </Button>
      </div>
    </div>
  );
}

export default Sales;
