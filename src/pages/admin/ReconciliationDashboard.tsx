import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, AlertCircle, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ReconciliationRun {
  run_id: string;
  run_at: string;
  status: string;
  total_stores: number;
  mismatched_stores: number;
  critical_issues: number;
  high_issues: number;
  medium_issues: number;
  auto_resolved: number;
  duration_seconds: number;
  open_issues: number;
  investigating_issues: number;
}

interface ReconciliationIssue {
  id: string;
  run_id: string;
  store_id: string;
  store_name?: string;
  current_outstanding: number;
  calculated_outstanding: number;
  difference: number;
  severity: string;
  status: string;
  created_at: string;
  resolved_at?: string;
  resolution_notes?: string;
}

const severityColors: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
};

const statusIcons: Record<string, React.ReactNode> = {
  open: <AlertCircle className="h-4 w-4 text-yellow-500" />,
  investigating: <Clock className="h-4 w-4 text-blue-500" />,
  resolved: <CheckCircle className="h-4 w-4 text-green-500" />,
  auto_resolved: <CheckCircle className="h-4 w-4 text-green-400" />,
  ignored: <XCircle className="h-4 w-4 text-gray-500" />,
};

export default function ReconciliationDashboard() {
  const qc = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<ReconciliationIssue | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<string>("");
  const [actionNotes, setActionNotes] = useState("");
  const [autoResolve, setAutoResolve] = useState(true);

  // Fetch latest run summary
  const { data: latestRun, isLoading: loadingLatest } = useQuery({
    queryKey: ["latest-reconciliation"],
    queryFn: async () => {
      const { data } = await supabase
        .from("reconciliation_status")
        .select("*")
        .order("run_at", { ascending: false })
        .limit(1)
        .single();
      return data as ReconciliationRun | null;
    },
  });

  // Fetch issues for selected run
  const { data: issues, isLoading: loadingIssues } = useQuery({
    queryKey: ["reconciliation-issues", selectedRun],
    queryFn: async () => {
      if (!selectedRun) return [];
      
      const { data, error } = await supabase
        .from("reconciliation_issues")
        .select(`
          *,
          stores(name)
        `)
        .eq("run_id", selectedRun)
        .order("severity", { ascending: false })
        .order("difference", { ascending: false });
      
      if (error) throw error;
      
      return (data || []).map((issue: any) => ({
        ...issue,
        store_name: issue.stores?.name || "Unknown Store",
      })) as ReconciliationIssue[];
    },
    enabled: !!selectedRun,
  });

  // Run reconciliation mutation
  const runReconciliation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reconcile_outstanding", {
        p_auto_resolve_minor: autoResolve,
        p_critical_threshold: 10000,
        p_high_threshold: 1000,
        p_medium_threshold: 100,
      });
      
      if (error) throw error;
      return data as string;
    },
    onSuccess: (runId) => {
      toast.success("Reconciliation completed successfully");
      setSelectedRun(runId);
      qc.invalidateQueries({ queryKey: ["latest-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["reconciliation-issues"] });
    },
    onError: (error: any) => {
      toast.error("Reconciliation failed: " + error.message);
    },
  });

  // Resolve issue mutation
  const resolveIssue = useMutation({
    mutationFn: async ({ issueId, action, notes }: { issueId: string; action: string; notes: string }) => {
      const { data, error } = await supabase.rpc("resolve_reconciliation_issue", {
        p_issue_id: issueId,
        p_action: action,
        p_notes: notes,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Issue resolved successfully");
      setActionDialogOpen(false);
      setSelectedIssue(null);
      setActionType("");
      setActionNotes("");
      qc.invalidateQueries({ queryKey: ["reconciliation-issues"] });
      qc.invalidateQueries({ queryKey: ["latest-reconciliation"] });
    },
    onError: (error: any) => {
      toast.error("Failed to resolve issue: " + error.message);
    },
  });

  const handleAction = (issue: ReconciliationIssue, action: string) => {
    setSelectedIssue(issue);
    setActionType(action);
    setActionDialogOpen(true);
  };

  const confirmAction = () => {
    if (!selectedIssue || !actionType) return;
    
    resolveIssue.mutate({
      issueId: selectedIssue.id,
      action: actionType,
      notes: actionNotes,
    });
  };

  const issueColumns = [
    {
      header: "Severity",
      accessor: (row: ReconciliationIssue) => (
        <Badge className={severityColors[row.severity] || "bg-gray-500"}>
          {row.severity.toUpperCase()}
        </Badge>
      ),
    },
    {
      header: "Status",
      accessor: (row: ReconciliationIssue) => (
        <div className="flex items-center gap-2">
          {statusIcons[row.status]}
          <span className="capitalize">{row.status.replace("_", " ")}</span>
        </div>
      ),
    },
    {
      header: "Store",
      accessor: (row: ReconciliationIssue) => row.store_name,
    },
    {
      header: "Current Outstanding",
      accessor: (row: ReconciliationIssue) => `₹${Number(row.current_outstanding).toLocaleString()}`,
      className: "text-right font-mono",
    },
    {
      header: "Calculated",
      accessor: (row: ReconciliationIssue) => `₹${Number(row.calculated_outstanding).toLocaleString()}`,
      className: "text-right font-mono",
    },
    {
      header: "Difference",
      accessor: (row: ReconciliationIssue) => (
        <span className={row.difference > 0 ? "text-red-600" : "text-green-600"}>
          {row.difference > 0 ? "+" : ""}₹{Number(row.difference).toLocaleString()}
        </span>
      ),
      className: "text-right font-mono font-semibold",
    },
    {
      header: "Actions",
      accessor: (row: ReconciliationIssue) => (
        <div className="flex gap-2">
          {row.status === "open" && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={() => handleAction(row, "correct")}
              >
                Correct
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleAction(row, "investigate")}
              >
                Investigate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleAction(row, "ignore")}
              >
                Ignore
              </Button>
            </>
          )}
          {row.status === "investigating" && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={() => handleAction(row, "correct")}
              >
                Correct
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleAction(row, "ignore")}
              >
                Ignore
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outstanding Reconciliation"
        subtitle="Verify and correct outstanding balance discrepancies"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Stores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingLatest ? "..." : latestRun?.total_stores || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Mismatches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {loadingLatest ? "..." : latestRun?.mismatched_stores || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-600">Critical Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {loadingLatest ? "..." : latestRun?.critical_issues || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Auto-Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {loadingLatest ? "..." : latestRun?.auto_resolved || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Run Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Run Reconciliation</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Button
            onClick={() => runReconciliation.mutate()}
            disabled={runReconciliation.isPending}
          >
            {runReconciliation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Run Now
          </Button>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto-resolve"
              checked={autoResolve}
              onChange={(e) => setAutoResolve(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="auto-resolve" className="text-sm">
              Auto-resolve minor discrepancies (&lt; ₹100)
            </label>
          </div>

          {latestRun && (
            <div className="ml-auto text-sm text-muted-foreground">
              Last run: {format(new Date(latestRun.run_at), "PPp")}
              {latestRun.duration_seconds && (
                <span className="ml-2">({latestRun.duration_seconds}s)</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Issues Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Open Issues
            {issues && (
              <Badge variant="secondary" className="ml-2">
                {issues.filter((i) => i.status === "open" || i.status === "investigating").length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingIssues ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : selectedRun && issues?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No issues found. Great job!
            </div>
          ) : !selectedRun ? (
            <div className="text-center py-8 text-muted-foreground">
              Run reconciliation to see issues
            </div>
          ) : (
            <DataTable
              columns={issueColumns}
              data={issues || []}
              keyExtractor={(row) => row.id}
            />
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{actionType} Issue</DialogTitle>
            <DialogDescription>
              {actionType === "correct" && "Update the store's outstanding balance to match the calculated value."}
              {actionType === "ignore" && "Mark this discrepancy as acceptable."}
              {actionType === "investigate" && "Mark this issue for manual review."}
            </DialogDescription>
          </DialogHeader>

          {selectedIssue && (
            <div className="py-4">
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <span className="text-muted-foreground">Store:</span>
                  <br />
                  <strong>{selectedIssue.store_name}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Severity:</span>
                  <br />
                  <Badge className={severityColors[selectedIssue.severity]}>
                    {selectedIssue.severity.toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Current:</span>
                  <br />
                  <strong>₹{Number(selectedIssue.current_outstanding).toLocaleString()}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Calculated:</span>
                  <br />
                  <strong>₹{Number(selectedIssue.calculated_outstanding).toLocaleString()}</strong>
                </div>
              </div>

              <Textarea
                placeholder="Add notes (optional)..."
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmAction} disabled={resolveIssue.isPending}>
              {resolveIssue.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Confirm"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
