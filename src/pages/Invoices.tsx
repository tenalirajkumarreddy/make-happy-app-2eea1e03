import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { FileText, Plus, Eye, Download, XCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Invoices = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { currentWarehouse } = useWarehouse();
  const [cancelDialog, setCancelDialog] = useState<{ id: string; number: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", currentWarehouse?.id],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select(`
          *,
          customers(name),
          stores(name),
          warehouses:dispatch_warehouse_id(name),
          invoice_sales(sale_id)
        `);
      
      if (currentWarehouse?.id) {
        query = query.eq("dispatch_warehouse_id", currentWarehouse.id);
      }
      
      const { data, error } = await query.order("invoice_date", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!currentWarehouse?.id,
  });

  const handleCancel = async () => {
    if (!cancelDialog) return;
    setCancelling(true);

    try {
      const { error } = await supabase
        .from("invoices")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_reason: cancelReason.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cancelDialog.id);

      if (error) throw error;

      toast.success(`Invoice ${cancelDialog.number} cancelled`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setCancelDialog(null);
      setCancelReason("");
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel invoice");
    } finally {
      setCancelling(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "issued": return "active";
      case "draft": return "pending";
      case "cancelled": return "inactive";
      default: return "pending";
    }
  };

  const columns = [
    { 
      header: "Invoice #", 
      accessor: (row: any) => (
        <span className="font-mono font-medium">{row.invoice_number}</span>
      )
    },
    { 
      header: "Date", 
      accessor: (row: any) => new Date(row.invoice_date).toLocaleDateString("en-IN"),
      className: "text-sm"
    },
    { 
      header: "Customer", 
      accessor: (row: any) => (
        <div>
          <p className="font-medium text-sm">{row.customer_name}</p>
          {row.stores?.name && (
            <p className="text-xs text-muted-foreground">{row.stores.name}</p>
          )}
        </div>
      )
    },
    { 
      header: "Sales", 
      accessor: (row: any) => (
        <Badge variant="outline">{row.invoice_sales?.length || 0} linked</Badge>
      )
    },
    { 
      header: "Amount", 
      accessor: (row: any) => (
        <span className="font-semibold">₹{Number(row.total_amount).toLocaleString()}</span>
      )
    },
    { 
      header: "Status", 
      accessor: (row: any) => (
        <StatusBadge status={getStatusColor(row.status) as any} label={row.status} />
      )
    },
    {
      header: "Actions",
      accessor: (row: any) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => { e.stopPropagation(); navigate(`/invoices/${row.id}`); }}
            title="View"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => { e.stopPropagation(); navigate(`/invoices/${row.id}/print`); }}
            title="Print"
          >
            <Printer className="h-4 w-4" />
          </Button>
          {row.status !== "cancelled" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={(e) => { 
                e.stopPropagation(); 
                setCancelDialog({ id: row.id, number: row.invoice_number }); 
              }}
              title="Cancel"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (isLoading) {
    return <TableSkeleton columns={7} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Invoices"
        subtitle="Manage tax invoices and bills"
        primaryAction={{
          label: "Create Invoice",
          onClick: () => navigate("/invoices/new"),
          icon: Plus,
        }}
      />

      <DataTable
        columns={columns}
        data={invoices}
        searchKey="invoice_number"
        searchPlaceholder="Search by invoice number..."
        emptyMessage="No invoices yet"
        onRowClick={(row) => navigate(`/invoices/${row.id}`)}
        renderMobileCard={(row: any) => (
          <div className="entity-card-mobile flex-col !items-stretch">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="entity-card-subtitle">{row.invoice_number}</p>
                <h3 className="font-semibold text-sm mt-0.5 truncate">{row.customer_name}</h3>
                {row.stores?.name && (
                  <p className="text-xs text-muted-foreground truncate">{row.stores.name}</p>
                )}
              </div>
              <StatusBadge status={getStatusColor(row.status) as any} label={row.status} />
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t">
              <span className="text-xs text-muted-foreground">
                {new Date(row.invoice_date).toLocaleDateString("en-IN")}
              </span>
              <span className="font-semibold text-primary">₹{Number(row.total_amount).toLocaleString()}</span>
            </div>
          </div>
        )}
      />

      {/* Cancel Invoice Dialog */}
      <AlertDialog open={!!cancelDialog} onOpenChange={() => setCancelDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invoice {cancelDialog?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the invoice as cancelled. The linked sales will NOT be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label>Reason for cancellation (optional)</Label>
            <Input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter reason..."
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep Invoice</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? "Cancelling..." : "Cancel Invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Invoices;
