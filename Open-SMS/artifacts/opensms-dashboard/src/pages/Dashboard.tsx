import { 
  useGetGatewayHealth, 
  useGetStats, 
  useGetLogs 
} from "@workspace/api-client-react";
import { Card, Badge, Button } from "@/components/ui/Shared";
import { 
  Activity, 
  Server, 
  CheckCircle2, 
  AlertCircle, 
  MessageSquare,
  Clock,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: health, isLoading: isHealthLoading, refetch: refetchHealth } = useGetGatewayHealth({
    query: { refetchInterval: 5000 }
  });
  
  const { data: stats, isLoading: isStatsLoading } = useGetStats({
    query: { refetchInterval: 10000 }
  });
  
  const { data: logsData, isLoading: isLogsLoading } = useGetLogs({ limit: 5 }, {
    query: { refetchInterval: 10000 }
  });

  const isHealthy = health?.status === "ok";

  return (
    <div className="space-y-8 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Overview</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">Real-time status and metrics for your OpenSMS Gateway.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchHealth()} className="w-full md:w-auto">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh Status
        </Button>
      </header>

      {/* Gateway Status Panel */}
      <Card className="p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row gap-8 items-start lg:items-center">
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${isHealthy ? 'bg-primary/20 text-primary shadow-primary/20' : 'bg-destructive/20 text-destructive shadow-destructive/20'}`}>
                <Server className="w-8 h-8" />
              </div>
              {isHealthy && (
                <div className="absolute -inset-1 rounded-2xl border-2 border-primary/30 animate-pulse-slow pointer-events-none" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground mb-1">Gateway Connection</h2>
              <div className="flex items-center gap-3">
                {isHealthy ? (
                  <Badge variant="success" className="gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> Online & Routing</Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1.5"><AlertCircle className="w-3 h-3"/> Offline</Badge>
                )}
                {health?.paused && <Badge variant="warning">Paused</Badge>}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-px lg:h-16 bg-border/50 hidden lg:block" />
          <hr className="w-full border-border/50 lg:hidden" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full flex-1">
            <div>
              <p className="text-xs text-muted-foreground font-mono mb-1 uppercase">Uptime</p>
              <p className="text-xl font-bold font-mono">
                {health?.uptimeSeconds ? `${Math.floor(health.uptimeSeconds / 3600)}h ${Math.floor((health.uptimeSeconds % 3600) / 60)}m` : '0h 0m'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-mono mb-1 uppercase">Queue Depth</p>
              <p className="text-xl font-bold font-mono text-warning">{health?.queueDepth || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-mono mb-1 uppercase">URL</p>
              <p className="text-sm font-mono truncate text-secondary max-w-[120px] md:max-w-[160px]">{health?.gatewayUrl || 'Not configured'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-mono mb-1 uppercase">Version</p>
              <p className="text-sm font-mono truncate">{health?.version || 'Unknown'}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {[
          { label: "Sent Today", value: stats?.sentToday || 0, icon: MessageSquare, color: "text-primary", bg: "bg-primary/10" },
          { label: "Sent This Week", value: stats?.sentThisWeek || 0, icon: Activity, color: "text-secondary", bg: "bg-secondary/10" },
          { label: "Pending", value: stats?.pending || 0, icon: Clock, color: "text-warning", bg: "bg-warning/10" },
          { label: "Failed Today", value: stats?.failedToday || 0, icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10" },
        ].map((stat, i) => (
          <Card key={i} className="p-6 flex flex-col relative group hover:border-border transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
            <h3 className="text-3xl font-bold font-mono tracking-tight text-foreground mb-1">{stat.value}</h3>
            <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
          </Card>
        ))}
      </div>

      {/* Recent Logs Preview */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-bold">Recent Activity</h2>
        </div>
        <Card className="overflow-hidden">
          {isLogsLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading activity...</div>
          ) : logsData?.logs && logsData.logs.length > 0 ? (
            <div className="divide-y divide-border/50">
              {logsData.logs.map((log) => (
                <div key={log.id} className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      {log.status === 'delivered' ? <CheckCircle2 className="w-5 h-5 text-primary" /> :
                       log.status === 'sent' ? <CheckCircle2 className="w-5 h-5 text-secondary" /> :
                       log.status === 'failed' ? <AlertCircle className="w-5 h-5 text-destructive" /> :
                       <Clock className="w-5 h-5 text-warning" />}
                    </div>
                    <div>
                      <p className="font-mono text-sm font-medium text-foreground mb-1">{log.toMasked}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1 max-w-xl">{log.body}</p>
                    </div>
                  </div>
                  <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center w-full md:w-auto gap-2">
                    <Badge variant={
                      log.status === 'delivered' ? 'success' : 
                      log.status === 'sent' ? 'secondary' : 
                      log.status === 'failed' ? 'destructive' : 'warning'
                    }>
                      {log.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {format(new Date(log.createdAt), "MMM d, HH:mm:ss")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-foreground font-medium">No messages yet</p>
              <p className="text-sm text-muted-foreground mt-1">Sent messages will appear here.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
