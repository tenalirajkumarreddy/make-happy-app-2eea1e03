import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, ExternalLink } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase";
import { toast } from "sonner";
import type { PurchaseRecord, PurchaseRecordStatus } from "@/types/purchases";

const StatusBadge = ({ status }: { status: PurchaseRecordStatus }) => {
  const styles: Record<PurchaseRecordStatus, string> = {
    pending: "bg-amber-100 text-amber-800 hover:bg-amber-100",
    completed: "bg-green-100 text-green-800 hover:bg-green-100",
  };

  return (
    <Badge variant="secondary" className={`capitalize ${styles[status]}`}>
      {status}
    </Badge>
  );
};

interface ApproveCellProps {
  purchase: PurchaseRecord;
  currentUserId: string;
}

const ApproveCell = ({ purchase, currentUserId }: ApproveCellProps) => {
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("approve_purchase", {
        p_purchase_id: purchase.id,
        p_user_id: currentUserId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Purchase ${purchase.display_id} approved`);
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
    },
    onError: (error) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });

  if (purchase.status !== "pending") return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => approveMutation.mutate()}
      disabled={approveMutation.isPending}
    >
      <CheckCircle className="mr-1 h-3 w-3" />
      Approve
    </Button>
  );
};

export function createPurchaseColumns(
  canApprove: boolean,
  currentUserId: string
): ColumnDef<PurchaseRecord>[] {
  return [
    {
      accessorKey: "display_id",
      header: "ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.display_id}</span>
      ),
    },
    {
      accessorKey: "vendors.name",
      header: "Vendor",
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.vendors?.name || "Unknown"}
        </span>
      ),
    },
    {
      accessorKey: "purchase_date",
      header: "Date",
      cell: ({ row }) => {
        try {
          return new Date(row.original.purchase_date).toLocaleDateString(
            "en-IN",
            { year: "numeric", month: "short", day: "numeric" }
          );
        } catch {
          return row.original.purchase_date;
        }
      },
    },
    {
      accessorKey: "bill_number",
      header: "Bill #",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.bill_number || "-"}
        </span>
      ),
    },
    {
      accessorKey: "total_amount",
      header: "Amount",
      cell: ({ row }) => {
        const formatted = new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          minimumFractionDigits: 2,
        }).format(row.original.total_amount || 0);
        return <div className="text-right font-medium">{formatted}</div>;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const purchase = row.original;
        return (
          <div className="flex items-center gap-2">
            {canApprove && (
              <ApproveCell purchase={purchase} currentUserId={currentUserId} />
            )}
            {purchase.bill_url && (
              <a
                href={purchase.bill_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        );
      },
    },
  ];
}
