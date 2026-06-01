import { PageHeader } from "@/components/shared/PageHeader";
import { formatDate } from "@/lib/utils";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveCustomer } from "@/lib/resolveCustomer";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, PackageOpen } from "lucide-react";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const CustomerSales = () => {
  const { user } = useAuth();
  const [selectedSale, setSelectedSale] = useState<any>(null);

  const { data: customer } = useQuery({
    queryKey: ["my-customer", user?.id],
    queryFn: async () => {
      const res = await resolveCustomer(user!.id);
      return res as any;
    },
    enabled: !!user,
  });

  const { data: sales, isLoading } = useQuery({
    queryKey: ["my-sales", customer?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("*, stores(name), sale_items(*, products(name, unit))")
        .eq("customer_id", customer!.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!customer,
  });

  const columns = [
    {
      header: "Sale ID",
      accessor: (row: any) => (
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className={row.is_fully_returned ? "line-through text-muted-foreground" : ""}>
            {row.display_id}
          </span>
          {row.is_fully_returned && (
            <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-600 bg-amber-50 rounded px-1 py-0">Returned</Badge>
          )}
        </div>
      )
    },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—" },
    { header: "Items", accessor: (row: any) => <Badge variant="secondary">{row.sale_items?.length || 0} items</Badge> },
    {
      header: "Total",
      accessor: (row: any) => (
        <span className={row.is_fully_returned ? "line-through text-muted-foreground font-normal" : "font-semibold"}>
          ₹{Number(row.total_amount).toLocaleString()}
        </span>
      )
    },
    {
      header: "Paid",
      accessor: (row: any) => (
        <span className={row.is_fully_returned ? "line-through text-muted-foreground" : ""}>
          ₹{(Number(row.cash_amount) + Number(row.upi_amount)).toLocaleString()}
        </span>
      )
    },
    {
      header: "Outstanding",
      accessor: (row: any) => (
        <span className={row.is_fully_returned ? "text-muted-foreground line-through font-normal" : "text-warning font-medium"}>
          ₹{Number(row.outstanding_amount).toLocaleString()}
        </span>
      )
    },
    { header: "Date", accessor: (row: any) => formatDate(row.created_at), className: "text-muted-foreground text-xs" },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="My Sales" subtitle="View all recorded deliveries and sales" />
      <DataTable 
        columns={columns} 
        data={sales || []} 
        searchKey="display_id" 
        searchPlaceholder="Search by sale ID..." 
        onRowClick={(row) => setSelectedSale(row)}
      />

      <Dialog open={!!selectedSale} onOpenChange={(o) => !o && setSelectedSale(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sale Details ({selectedSale?.display_id})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {selectedSale?.is_fully_returned && (
              <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-3 text-amber-800 text-xs font-medium">
                This sale has been fully returned and cancelled. All balances were reversed.
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Store:</span>
              <span className="font-medium">{selectedSale?.stores?.name || "—"}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Date:</span>
              <span>{selectedSale?.created_at ? new Date(selectedSale.created_at).toLocaleString('en-IN') : "—"}</span>
            </div>
            
            <Separator />
            
            <div>
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <PackageOpen className="w-4 h-4 text-primary" />
                Purchased Items
              </h4>
              <ScrollArea className="h-[200px] w-full rounded-md border p-3">
                {selectedSale?.sale_items?.length === 0 ? (
                  <div className="text-center text-muted-foreground py-4 text-sm">No items found</div>
                ) : (
                  <div className="space-y-3">
                    {selectedSale?.sale_items?.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm">
                        <div className={selectedSale?.is_fully_returned ? "line-through text-muted-foreground" : ""}>
                          <p className="font-medium text-foreground">{item.products?.name || "Unknown Product"}</p>
                          <p className="text-muted-foreground text-xs">
                            {item.quantity} {item.products?.unit || 'unit'} × ₹{item.unit_price}
                          </p>
                        </div>
                        <div className={`font-semibold ${selectedSale?.is_fully_returned ? "line-through text-muted-foreground" : ""}`}>
                          ₹{(item.quantity * item.unit_price).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
            
            <Separator />
            
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Amount</span>
                <span className={`font-medium ${selectedSale?.is_fully_returned ? "line-through text-muted-foreground" : ""}`}>₹{Number(selectedSale?.total_amount || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className={`text-success font-medium ${selectedSale?.is_fully_returned ? "line-through text-muted-foreground" : ""}`}>₹{(Number(selectedSale?.cash_amount || 0) + Number(selectedSale?.upi_amount || 0)).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-semibold pt-1 border-t">
                <span>Balance Due</span>
                <span className={selectedSale?.is_fully_returned ? "line-through text-muted-foreground" : Number(selectedSale?.outstanding_amount || 0) > 0 ? "text-destructive" : "text-foreground"}>
                  ₹{Number(selectedSale?.outstanding_amount || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerSales;
