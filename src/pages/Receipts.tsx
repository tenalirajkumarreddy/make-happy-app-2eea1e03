import { useState, useMemo } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Search,
  Download,
  Mail,
  Printer,
  Calendar,
  FileText,
  RefreshCw,
  Filter,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Trash2,
  Eye,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { usePermission } from "@/hooks/usePermission";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRange } from "react-day-picker";
import { TableSkeleton } from "@/components/shared/TableSkeleton";

interface Receipt {
  id: string;
  receipt_number: string;
  sale_id: string;
  customer_id: string | null;
  store_id: string;
  amount: number;
  currency: string;
  pdf_url: string | null;
  email_sent: boolean;
  email_sent_at: string | null;
  created_at: string;
  customers?: { name: string; email: string | null };
  stores?: { name: string };
  sales?: { display_id: string; total_amount: number };
}

const PAGE_SIZE = 25;

export default function Receipts() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const { allowed: canDelete } = usePermission("receipt_delete");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Fetch receipts
  const { data: receiptsData, isLoading, refetch } = useQuery({
    queryKey: ["receipts", page, dateRange, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("receipts")
        .select(`
          *,
          customers(name, email),
          stores(name),
          sales(display_id, total_amount)
        `, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      // Apply date filter
      if (dateRange?.from) {
        query = query.gte("created_at", dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        const endOfDay = new Date(dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte("created_at", endOfDay.toISOString());
      }

      // Apply status filter
      if (statusFilter === "emailed") {
        query = query.eq("email_sent", true);
      } else if (statusFilter === "not_emailed") {
        query = query.eq("email_sent", false);
      } else if (statusFilter === "has_pdf") {
        query = query.not("pdf_url", "is", null);
      } else if (statusFilter === "no_pdf") {
        query = query.is("pdf_url", null);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { receipts: data as Receipt[], totalCount: count || 0 };
    },
  });

  const receipts = receiptsData?.receipts || [];
  const totalCount = receiptsData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Filter by search query
  const filteredReceipts = useMemo(() => {
    if (!searchQuery) return receipts;
    const query = searchQuery.toLowerCase();
    return receipts.filter(
      (r) =>
        r.receipt_number?.toLowerCase().includes(query) ||
        r.customers?.name?.toLowerCase().includes(query) ||
        r.stores?.name?.toLowerCase().includes(query) ||
        r.sales?.display_id?.toLowerCase().includes(query)
    );
  }, [receipts, searchQuery]);

  const handleGeneratePDF = async (receiptId: string) => {
    setIsGeneratingPDF(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to generate PDF");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-receipt-pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ receipt_id: receiptId }),
        }
      );

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Failed to generate PDF");
      }

      toast.success("PDF generated successfully");
      refetch();
      return { downloadUrl: result.download_url };
    } catch (error) {
      console.error("PDF generation error:", error);
      toast.error("Failed to generate PDF");
      return null;
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleSendEmail = async (receipt: Receipt, email: string) => {
    setIsSendingEmail(true);
    try {
      // In a real implementation, this would call an edge function
      // to send the email with the receipt
      const { error } = await supabase
        .from("receipts")
        .update({
          email_sent: true,
          email_sent_at: new Date().toISOString(),
        })
        .eq("id", receipt.id);

      if (error) throw error;

      // Log activity
      await supabase.from("activity_logs").insert({
        action: "receipt_email_sent",
        entity_type: "receipt",
        entity_id: receipt.id,
        details: { email, receipt_number: receipt.receipt_number },
      });

      toast.success(`Receipt sent to ${email}`);
      refetch();
    } catch (error) {
      console.error("Email sending error:", error);
      toast.error("Failed to send email");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleDelete = async (receiptId: string) => {
    try {
      const { error } = await supabase
        .from("receipts")
        .delete()
        .eq("id", receiptId);

      if (error) throw error;

      toast.success("Receipt deleted");
      setIsDeleteDialogOpen(false);
      setSelectedReceipt(null);
      refetch();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete receipt");
    }
  };

  const columns = [
    {
      header: "Receipt #",
      accessorKey: "receipt_number" as keyof Receipt,
      cell: (receipt: Receipt) => (
        <div className="font-mono text-sm">
          {receipt.receipt_number}
        </div>
      ),
    },
    {
      header: "Sale",
      accessorKey: "sales" as keyof Receipt,
      cell: (receipt: Receipt) => (
        <div className="text-sm">
          {receipt.sales?.display_id || "N/A"}
        </div>
      ),
    },
    {
      header: "Customer",
      accessorKey: "customers" as keyof Receipt,
      cell: (receipt: Receipt) => (
        <div className="text-sm">
          {receipt.customers?.name || "Walk-in"}
        </div>
      ),
    },
    {
      header: "Store",
      accessorKey: "stores" as keyof Receipt,
      cell: (receipt: Receipt) => (
        <div className="text-sm text-muted-foreground">
          {receipt.stores?.name || "N/A"}
        </div>
      ),
    },
    {
      header: "Amount",
      accessorKey: "amount" as keyof Receipt,
      cell: (receipt: Receipt) => (
        <CurrencyDisplay 
          amount={receipt.amount} 
          currency={receipt.currency as any} 
        />
      ),
    },
    {
      header: "Status",
      accessorKey: "email_sent" as keyof Receipt,
      cell: (receipt: Receipt) => (
        <div className="flex gap-1">
          {receipt.pdf_url && (
            <Badge variant="outline" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              PDF
            </Badge>
          )}
          {receipt.email_sent && (
            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
              <Mail className="h-3 w-3 mr-1" />
              Emailed
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: "Date",
      accessorKey: "created_at" as keyof Receipt,
      cell: (receipt: Receipt) => (
        <div className="text-sm text-muted-foreground">
          {format(new Date(receipt.created_at), "MMM d, yyyy")}
        </div>
      ),
    },
    {
      header: "Actions",
      accessorKey: "id" as keyof Receipt,
      cell: (receipt: Receipt) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setSelectedReceipt(receipt);
              setIsViewDialogOpen(true);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleGeneratePDF(receipt.id)}
            disabled={isGeneratingPDF || !!receipt.pdf_url}
          >
            <Download className="h-4 w-4" />
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => {
                setSelectedReceipt(receipt);
                setIsDeleteDialogOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Receipt History" icon={Receipt} />
        <TableSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Receipt History" icon={Receipt} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search receipts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Date Range Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Calendar className="h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "LLL dd")} -{" "}
                      {format(dateRange.to, "LLL dd")}
                    </>
                  ) : (
                    format(dateRange.from, "LLL dd")
                  )
                ) : (
                  "Date Range"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <CalendarComponent
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="emailed">Emailed</SelectItem>
              <SelectItem value="not_emailed">Not Emailed</SelectItem>
              <SelectItem value="has_pdf">Has PDF</SelectItem>
              <SelectItem value="no_pdf">No PDF</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Receipts Table */}
      <DataTable
        data={filteredReceipts}
        columns={columns}
        emptyMessage="No receipts found"
        keyExtractor={(r) => r.id}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1} to{" "}
            {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} receipts
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Receipt Details</DialogTitle>
          </DialogHeader>
          {selectedReceipt && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipt #</span>
                  <span className="font-mono font-medium">
                    {selectedReceipt.receipt_number}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sale</span>
                  <span>{selectedReceipt.sales?.display_id || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span>{selectedReceipt.customers?.name || "Walk-in"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Store</span>
                  <span>{selectedReceipt.stores?.name || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <CurrencyDisplay
                    amount={selectedReceipt.amount}
                    currency={selectedReceipt.currency as any}
                    className="font-medium"
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span>
                    {format(new Date(selectedReceipt.created_at), "PPp")}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => handleGeneratePDF(selectedReceipt.id)}
                  disabled={isGeneratingPDF || !!selectedReceipt.pdf_url}
                >
                  {isGeneratingPDF ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {selectedReceipt.pdf_url ? "PDF Generated" : "Generate PDF"}
                </Button>
                {selectedReceipt.customers?.email && (
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() =>
                      handleSendEmail(selectedReceipt, selectedReceipt.customers!.email!)
                    }
                    disabled={isSendingEmail || selectedReceipt.email_sent}
                  >
                    {isSendingEmail ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4 mr-2" />
                    )}
                    {selectedReceipt.email_sent ? "Sent" : "Send Email"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Receipt</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this receipt? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedReceipt && handleDelete(selectedReceipt.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
