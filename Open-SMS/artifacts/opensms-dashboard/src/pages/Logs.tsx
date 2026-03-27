import { useState } from "react";
import { useGetLogs } from "@workspace/api-client-react";
import { Card, Badge, Modal } from "@/components/ui/Shared";
import { CheckCircle2, AlertCircle, Clock, Send, Search, ListFilter } from "lucide-react";
import { format } from "date-fns";

type LogStatus = "all" | "delivered" | "sent" | "failed" | "pending";

export default function Logs() {
  const [statusFilter, setStatusFilter] = useState<LogStatus>("all");
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const { data, isLoading } = useGetLogs(
    { 
      status: statusFilter === "all" ? undefined : statusFilter, 
      limit: 100 
    }, 
    { query: { refetchInterval: 5000 } }
  );

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'delivered': return <CheckCircle2 className="w-4 h-4 text-primary" />;
      case 'sent': return <Send className="w-4 h-4 text-secondary" />;
      case 'failed': return <AlertCircle className="w-4 h-4 text-destructive" />;
      default: return <Clock className="w-4 h-4 text-warning" />;
    }
  };

  const getBadgeVariant = (status: string) => {
    switch(status) {
      case 'delivered': return 'success';
      case 'sent': return 'secondary';
      case 'failed': return 'destructive';
      default: return 'warning';
    }
  };

  return (
    <div className="space-y-8 pb-12 h-full flex flex-col">
      <header>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Message Logs</h1>
        <p className="text-muted-foreground mt-2">Comprehensive history of all API dispatches.</p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 p-1 bg-card border border-border/50 rounded-xl w-max shadow-sm">
        {(["all", "delivered", "sent", "failed", "pending"] as LogStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all duration-200 ${
              statusFilter === s 
                ? "bg-primary/20 text-primary shadow-[0_0_10px_-2px_rgba(0,240,160,0.2)]" 
                : "text-muted-foreground hover:bg-white/5"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col border-border/50">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="p-4 font-mono text-xs uppercase text-muted-foreground font-medium tracking-wider">Status</th>
                <th className="p-4 font-mono text-xs uppercase text-muted-foreground font-medium tracking-wider">Recipient</th>
                <th className="p-4 font-mono text-xs uppercase text-muted-foreground font-medium tracking-wider">Message Preview</th>
                <th className="p-4 font-mono text-xs uppercase text-muted-foreground font-medium tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground animate-pulse">Loading logs...</td></tr>
              ) : data?.logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-16 text-center">
                    <ListFilter className="w-12 h-12 text-border mx-auto mb-4" />
                    <p className="text-foreground font-medium">No messages found</p>
                    <p className="text-sm text-muted-foreground">Adjust filters or send a new message.</p>
                  </td>
                </tr>
              ) : (
                data?.logs.map((log) => (
                  <tr 
                    key={log.id} 
                    className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="p-4">
                      <Badge variant={getBadgeVariant(log.status)} className="flex w-max items-center gap-1.5 px-2.5 py-1">
                        {getStatusIcon(log.status)}
                        <span className="capitalize">{log.status}</span>
                      </Badge>
                    </td>
                    <td className="p-4 font-mono text-sm">{log.toMasked}</td>
                    <td className="p-4 text-sm text-foreground/80 max-w-xs md:max-w-md lg:max-w-lg truncate">
                      {log.template && <span className="text-xs text-secondary border border-secondary/30 rounded px-1 py-0.5 mr-2">{log.template}</span>}
                      {log.body}
                    </td>
                    <td className="p-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.createdAt), "MMM d, HH:mm:ss")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} title="Message Details">
        {selectedLog && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-border/50">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase mb-1">Message ID</p>
                <p className="font-mono text-sm text-foreground">{selectedLog.messageId}</p>
              </div>
              <Badge variant={getBadgeVariant(selectedLog.status)} className="capitalize text-sm px-3 py-1">
                {selectedLog.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase mb-1">To</p>
                <p className="font-mono text-sm">{selectedLog.toMasked}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase mb-1">Template</p>
                <p className="font-mono text-sm">{selectedLog.template || 'None (Raw)'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase mb-1">Created At</p>
                <p className="font-mono text-sm">{format(new Date(selectedLog.createdAt), "yyyy-MM-dd HH:mm:ss")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase mb-1">Delivered At</p>
                <p className="font-mono text-sm">{selectedLog.deliveredAt ? format(new Date(selectedLog.deliveredAt), "yyyy-MM-dd HH:mm:ss") : '--'}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground font-mono uppercase mb-2">Message Body</p>
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50 text-sm font-mono whitespace-pre-wrap">
                {selectedLog.body}
              </div>
            </div>

            {selectedLog.error && (
              <div>
                <p className="text-xs text-destructive font-mono uppercase mb-2">Error Detail</p>
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-mono border border-destructive/20">
                  {selectedLog.error}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
