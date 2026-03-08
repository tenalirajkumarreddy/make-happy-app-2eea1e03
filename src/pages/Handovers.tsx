import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Banknote, Smartphone, CheckCircle, Clock, AlertCircle } from "lucide-react";

const handoverData = [
  {
    date: "2026-03-08",
    user: "Agent Rajesh Kumar",
    role: "Agent",
    cash: "₹3,000",
    upi: "₹1,000",
    status: "pending" as const,
    borderColor: "border-l-destructive",
  },
  {
    date: "2026-03-07",
    user: "Marketer Amit Patel",
    role: "Marketer",
    cash: "₹0",
    upi: "₹500",
    status: "pending" as const,
    borderColor: "border-l-warning",
    handedTo: "Manager Rajesh",
  },
  {
    date: "2026-03-06",
    user: "Agent Priya Sharma",
    role: "Agent",
    cash: "₹5,000",
    upi: "₹2,000",
    status: "active" as const,
    borderColor: "border-l-success",
    collectedBy: "Manager Rajesh",
  },
];

const Handovers = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Handovers" subtitle="Track cash and UPI collection handovers" />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Not Handed Over</p>
              <p className="text-xl font-bold">₹4,000</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Awaiting Confirmation</p>
              <p className="text-xl font-bold">₹500</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Confirmed Today</p>
              <p className="text-xl font-bold">₹7,000</p>
            </div>
          </div>
        </div>
      </div>

      {/* Handover List */}
      <div className="space-y-3">
        {handoverData.map((item, i) => (
          <div
            key={i}
            className={`rounded-xl border bg-card p-5 border-l-4 ${item.borderColor}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">📅 {item.date}</span>
                  <StatusBadge status={item.status} label={
                    item.collectedBy ? `Collected by ${item.collectedBy}` :
                    item.handedTo ? `Handed to ${item.handedTo}` :
                    "Not handed over"
                  } />
                </div>
                <p className="font-semibold">{item.user}</p>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <Banknote className="h-4 w-4 text-success" />
                    Cash: {item.cash}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="h-4 w-4 text-info" />
                    UPI: {item.upi}
                  </span>
                </div>
              </div>
              {!item.collectedBy && (
                <button className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  {item.handedTo ? "Confirm Receipt" : "Mark as Collected"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Handovers;
