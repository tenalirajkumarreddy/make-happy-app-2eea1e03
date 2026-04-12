import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, Download, Eye, ArrowRight, ArrowLeft, Plus, Minus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface AuditLogEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  changed_fields: string[] | null;
  performed_by: string;
  performed_by_name?: string;
  performed_at: string;
  record_display?: string;
}

const actionColors: Record<string, string> = {
  INSERT: "bg-green-500",
  UPDATE: "bg-blue-500",
  DELETE: "bg-red-500",
};

const tableIcons: Record<string, string> = {
  sales: "💰",
  transactions: "💳",
  orders: "📋",
  stores: "🏪",
  customers: "👥",
  handovers: "🤝",
};

export default function AuditLogDashboard() {
  const [filters, setFilters] = useState({
    table: "all",
    action: "all",
    search: "",
    dateFrom: "",
    dateTo: "",
  });
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ["audit-log", filters],
    queryFn: async () => {
      let query = supabase
        .from("audit_summary")
        .select("*")
        .order("performed_at", { ascending: false })
        .limit(500);

      if (filters.table !== "all") {
        query = query.eq("table_name", filters.table);
      }

      if (filters.action !== "all") {
        query = query.eq("action", filters.action);
      }

      if (filters.dateFrom) {
        query = query.gte("performed_at", filters.dateFrom + "T00:00:00");
      }

      if (filters.dateTo) {
        query = query.lte("performed_at", filters.dateTo + "T23:59:59");
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filter by search term (client-side for complex search)
      let filtered = data || [];
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(
          (entry: any) =>
            entry.table_name?.toLowerCase().includes(searchLower) ||
            entry.action?.toLowerCase().includes(searchLower) ||
            entry.performed_by_name?.toLowerCase().includes(searchLower) ||
            entry.record_display?.toLowerCase().includes(searchLower) ||
            JSON.stringify(entry.old_values)?.toLowerCase().includes(searchLower) ||
            JSON.stringify(entry.new_values)?.toLowerCase().includes(searchLower)
        );
      }

      return filtered as AuditLogEntry[];
    },
  });

  const exportToCSV = () => {
    if (!auditLogs || auditLogs.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = [
      "Date",
      "User",
      "Action",
      "Table",
      "Record ID",
      "Changes",
    ];

    const rows = auditLogs.map((entry) => [
      format(new Date(entry.performed_at), "yyyy-MM-dd HH:mm:ss"),
      entry.performed_by_name || entry.performed_by,
      entry.action,
      entry.table_name,
      entry.record_display || entry.record_id,
      entry.changed_fields?.join(", ") || "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success(`Exported ${auditLogs.length} records`);
  };

  const viewDetails = (entry: AuditLogEntry) => {
    setSelectedEntry(entry);
    setDetailOpen(true);
  };

  const renderValueDiff = (oldVal: any, newVal: any, field: string) => {
    if (oldVal === null && newVal !== null) {
      return (
        <div key={field} className="flex items-start gap-2 py-1">
          <Plus className="h-4 w-4 text-green-500 mt-0.5" />
          <div>
            <span className="font-medium">{field}:</span>
            <span className="text-green-600 ml-2">{JSON.stringify(newVal)}</span>
          </div>
        </div>
      );
    }

    if (oldVal !== null && newVal === null) {
      return (
        <div key={field} className="flex items-start gap-2 py-1">
          <Minus className="h-4 w-4 text-red-500 mt-0.5" />
          <div>
            <span className="font-medium">{field}:</span>
            <span className="text-red-600 ml-2 line-through">{JSON.stringify(oldVal)}</span>
          </div>
        </div>
      );
    }

    return (
      <div key={field} className="flex items-start gap-2 py-1">
        <div className="flex items-center gap-1">
          <ArrowLeft className="h-3 w-3 text-red-500" />
          <ArrowRight className="h-3 w-3 text-green-500 -ml-1" />
        </div>
        <div className="flex-1">
          <span className="font-medium">{field}:</span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-red-600 line-through">{JSON.stringify(oldVal)}</span>
            <span className="text-green-600">{JSON.stringify(newVal)}</span>
          </div>
        </div>
      </div>
    );
  };

  const columns = [
    {
      header: "Time",
      accessor: (row: AuditLogEntry) => format(new Date(row.performed_at), "MMM dd, yyyy HH:mm"),
      className: "whitespace-nowrap text-xs",
    },
    {
      header: "Action",
      accessor: (row: AuditLogEntry) => (
        <Badge className={actionColors[row.action] || "bg-gray-500"}>{row.action}</Badge>
      ),
    },
    {
      header: "Table",
      accessor: (row: AuditLogEntry) => (
        <div className="flex items-center gap-2">
          <span>{tableIcons[row.table_name] || "📄"}</span>
          <span className="capitalize">{row.table_name}</span>
        </div>
      ),
    },
    {
      header: "Record",
      accessor: (row: AuditLogEntry) => row.record_display || row.record_id,
      className: "max-w-xs truncate",
    },
    {
      header: "Changed Fields",
      accessor: (row: AuditLogEntry) =>
        row.changed_fields?.slice(0, 3).join(", ") +
        (row.changed_fields && row.changed_fields.length > 3 ? "..." : ""),
      className: "text-xs max-w-xs truncate",
    },
    {
      header: "User",
      accessor: (row: AuditLogEntry) => row.performed_by_name || "Unknown",
      className: "text-sm",
    },
    {
      header: "",
      accessor: (row: AuditLogEntry) => (
        <Button size="sm" variant="ghost" onClick={() => viewDetails(row)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
      className: "w-12",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" subtitle="Track all data changes across the system" />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Select
              value={filters.table}
              onValueChange={(v) => setFilters({ ...filters, table: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Table" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tables</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="transactions">Transactions</SelectItem>
                <SelectItem value="orders">Orders</SelectItem>
                <SelectItem value="stores">Stores</SelectItem>
                <SelectItem value="customers">Customers</SelectItem>
                <SelectItem value="handovers">Handovers</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.action}
              onValueChange={(v) => setFilters({ ...filters, action: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="INSERT">Insert</SelectItem>
                <SelectItem value="UPDATE">Update</SelectItem>
                <SelectItem value="DELETE">Delete</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              placeholder="From Date"
            />

            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              placeholder="To Date"
            />

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  placeholder="Search..."
                  className="pl-8"
                />
              </div>
              <Button variant="outline" onClick={exportToCSV}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Change History
            {auditLogs && (
              <Badge variant="secondary" className="ml-2">
                {auditLogs.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={auditLogs || []}
              keyExtractor={(row) => row.id}
            />
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{tableIcons[selectedEntry?.table_name || ""] || "📄"}</span>
              <span className="capitalize">{selectedEntry?.table_name}</span>
              <Badge className={actionColors[selectedEntry?.action || ""]}>
                {selectedEntry?.action}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Time:</span>
                  <br />
                  <strong>
                    {format(new Date(selectedEntry.performed_at), "PPpp")}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground">User:</span>
                  <br />
                  <strong>{selectedEntry.performed_by_name || "Unknown"}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Record ID:</span>
                  <br />
                  <code className="text-xs">{selectedEntry.record_id}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Display:</span>
                  <br />
                  <strong>{selectedEntry.record_display || "N/A"}</strong>
                </div>
              </div>

              {selectedEntry.action === "UPDATE" &&
                selectedEntry.changed_fields &&
                selectedEntry.changed_fields.length > 0 && (
                  <div className="border rounded-lg p-4 bg-muted/50">
                    <h4 className="font-medium mb-3">Changes</h4>
                    <div className="space-y-1 text-sm">
                      {selectedEntry.changed_fields.map((field) =>
                        renderValueDiff(
                          selectedEntry.old_values?.[field],
                          selectedEntry.new_values?.[field],
                          field
                        )
                      )}
                    </div>
                  </div>
                )}

              {selectedEntry.action === "INSERT" && selectedEntry.new_values && (
                <div className="border rounded-lg p-4 bg-green-50">
                  <h4 className="font-medium mb-3 text-green-700">New Values</h4>
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(selectedEntry.new_values, null, 2)}
                  </pre>
                </div>
              )}

              {selectedEntry.action === "DELETE" && selectedEntry.old_values && (
                <div className="border rounded-lg p-4 bg-red-50">
                  <h4 className="font-medium mb-3 text-red-700">Deleted Values</h4>
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(selectedEntry.old_values, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
