import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { logActivity } from "@/lib/activityLogger";
import {
  Calendar,
  Clock,
  Users,
  UserPlus,
  DollarSign,
  Calculator,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface Worker {
  id: string;
  display_id: string;
  name: string;
  phone?: string;
  is_active: boolean;
}

interface AttendanceRecord {
  id: string;
  display_id: string;
  attendance_date: string;
  factory_start_time: string;
  factory_end_time: string;
  is_finalized: boolean;
  recorded_by: string;
  notes?: string;
  entries_count?: number;
}

interface AttendanceEntry {
  id: string;
  attendance_id: string;
  user_id?: string;
  worker_id?: string;
  is_present: boolean;
  check_in_time?: string;
  check_out_time?: string;
  hours_worked: number;
  hourly_rate: number;
  amount_earned: number;
  adjustment_amount: number;
  adjustment_reason?: string;
  notes?: string;
  // Joined data
  worker?: { name: string; display_id: string };
  profile?: { full_name: string };
}

interface WorkerBalance {
  id: string;
  user_id?: string;
  worker_id?: string;
  total_earned: number;
  total_paid: number;
  outstanding_balance: number;
  worker?: { name: string; display_id: string };
  profile?: { full_name: string };
}

// Helper function to calculate pay based on hours worked and shift rates
function calculateShiftPay(hoursWorked: number, shiftRates: any[]): { rate: number; amount: number } {
  if (shiftRates.length === 0) return { rate: 0, amount: 0 };
  
  // Find the closest matching shift rate
  let closestShift = shiftRates[0];
  let minDiff = Math.abs(hoursWorked - shiftRates[0].duration_hours);
  
  for (const shift of shiftRates) {
    const diff = Math.abs(hoursWorked - shift.duration_hours);
    if (diff < minDiff) {
      minDiff = diff;
      closestShift = shift;
    }
  }
  
  // Calculate proportional pay based on closest shift
  // Guard against division by zero
  if (!closestShift.duration_hours || closestShift.duration_hours <= 0) {
    return { rate: 0, amount: 0 };
  }
  
  const proportionalAmount = (hoursWorked / closestShift.duration_hours) * closestShift.rate_amount;
  
  return {
    rate: closestShift.rate_amount / closestShift.duration_hours, // hourly rate for reference
    amount: Math.round(proportionalAmount * 100) / 100 // round to 2 decimals
  };
}

export default function Attendance() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("records");
  
  // Workers state
  const [showWorkerDialog, setShowWorkerDialog] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [workerName, setWorkerName] = useState("");
  const [workerPhone, setWorkerPhone] = useState("");
  const [deletingWorkerId, setDeletingWorkerId] = useState<string | null>(null);
  
  // Shift rates state
  const [showShiftRatesDialog, setShowShiftRatesDialog] = useState(false);
  const [editingShiftRate, setEditingShiftRate] = useState<any>(null);
  const [shiftRateName, setShiftRateName] = useState("");
  const [shiftRateDuration, setShiftRateDuration] = useState("");
  const [shiftRateAmount, setShiftRateAmount] = useState("");
  
  // Attendance record state
  const [showAttendanceDialog, setShowAttendanceDialog] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [factoryStartTime, setFactoryStartTime] = useState("09:00");
  const [factoryEndTime, setFactoryEndTime] = useState("18:00");
  const [attendanceNotes, setAttendanceNotes] = useState("");
  const [attendanceEntries, setAttendanceEntries] = useState<{
    person_type: "staff" | "worker";
    person_id: string;
    person_name: string;
    is_present: boolean;
    check_in: string;
    check_out: string;
  }[]>([]);
  
  // Payment state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentPersonType, setPaymentPersonType] = useState<"staff" | "worker">("worker");
  const [paymentPersonId, setPaymentPersonId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  
  // Edit attendance state
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [showEditEntriesDialog, setShowEditEntriesDialog] = useState(false);
  const [editEntries, setEditEntries] = useState<AttendanceEntry[]>([]);
  
  const [saving, setSaving] = useState(false);

  // Queries
  const { data: shiftRates = [] } = useQuery({
    queryKey: ["shift-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_rates")
        .select("*")
        .eq("is_active", true)
        .order("duration_hours");
      if (error) throw error;
      return data;
    },
  });

  const { data: workers = [], isLoading: loadingWorkers } = useQuery({
    queryKey: ["workers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Worker[];
    },
  });

  const { data: staffUsers = [] } = useQuery({
    queryKey: ["staff-for-attendance"],
    queryFn: async () => {
      // Get all staff (agents, marketers, pos) - exclude managers and customers
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .not("role", "in", "(manager,super_admin,customer)");
      if (error) throw error;
      
      if (!data || data.length === 0) return [];
      
      // Get profiles for these users
      const userIds = data.map(d => d.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, hourly_rate")
        .in("id", userIds);
      
      // Merge data
      return data.map(ur => ({
        ...ur,
        profiles: profiles?.find(p => p.id === ur.user_id) || { full_name: "Unknown", hourly_rate: 0 }
      }));
    },
  });

  const { data: attendanceRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey: ["attendance-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select(`
          *,
          attendance_entries(count)
        `)
        .order("attendance_date", { ascending: false });
      if (error) throw error;
      return data.map(r => ({
        ...r,
        entries_count: r.attendance_entries?.[0]?.count || 0
      })) as AttendanceRecord[];
    },
  });

  const { data: balances = [], isLoading: loadingBalances } = useQuery({
    queryKey: ["worker-balances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_balances")
        .select(`
          *,
          workers(name, display_id)
        `)
        .order("outstanding_balance", { ascending: false });
      if (error) throw error;
      
      if (!data || data.length === 0) return [];
      
      // Get profiles for users with user_id
      const userIds = data.filter(d => d.user_id).map(d => d.user_id!);
      let profilesMap: Record<string, { full_name: string }> = {};
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        
        profiles?.forEach(p => { profilesMap[p.id] = { full_name: p.full_name }; });
      }
      
      return data.map(b => ({
        ...b,
        profiles: b.user_id ? profilesMap[b.user_id] : null
      })) as WorkerBalance[];
    },
  });

  // Worker mutations
  const resetWorkerForm = () => {
    setEditingWorker(null);
    setWorkerName("");
    setWorkerPhone("");
  };

  const saveWorkerMutation = useMutation({
    mutationFn: async () => {
      if (editingWorker) {
        const { error } = await supabase
          .from("workers")
          .update({
            name: workerName,
            phone: workerPhone || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingWorker.id);
        if (error) throw error;
      } else {
        const { data: idData } = await supabase.rpc("generate_display_id", {
          prefix: "WRK",
          seq_name: "workers_display_id_seq"
        });
        
        const { error } = await supabase.from("workers").insert({
          display_id: idData,
          name: workerName,
          phone: workerPhone || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workers"] });
      toast.success(editingWorker ? "Worker updated" : "Worker added");
      setShowWorkerDialog(false);
      resetWorkerForm();
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  const deleteWorkerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workers").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workers"] });
      toast.success("Worker deactivated");
      setDeletingWorkerId(null);
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  // Shift rates mutations
  const resetShiftRateForm = () => {
    setEditingShiftRate(null);
    setShiftRateName("");
    setShiftRateDuration("");
    setShiftRateAmount("");
  };

  const saveShiftRateMutation = useMutation({
    mutationFn: async () => {
      if (editingShiftRate) {
        const { error } = await supabase
          .from("shift_rates")
          .update({
            shift_name: shiftRateName,
            duration_hours: parseFloat(shiftRateDuration),
            rate_amount: parseFloat(shiftRateAmount),
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingShiftRate.id);
        if (error) throw error;
      } else {
        const { data: idData } = await supabase.rpc("generate_display_id", {
          prefix: "SR",
          seq_name: "shift_rates_display_id_seq"
        });
        
        const { error } = await supabase.from("shift_rates").insert({
          display_id: idData,
          shift_name: shiftRateName,
          duration_hours: parseFloat(shiftRateDuration),
          rate_amount: parseFloat(shiftRateAmount),
          created_by: user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-rates"] });
      toast.success(editingShiftRate ? "Shift rate updated" : "Shift rate added");
      resetShiftRateForm();
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  const deleteShiftRateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shift_rates").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-rates"] });
      toast.success("Shift rate deleted");
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  // Attendance mutations
  const initAttendanceEntries = () => {
    const entries: typeof attendanceEntries = [];
    
    // Add all active workers
    workers.filter(w => w.is_active).forEach(w => {
      entries.push({
        person_type: "worker",
        person_id: w.id,
        person_name: w.name,
        is_present: true,
        check_in: factoryStartTime,
        check_out: factoryEndTime,
      });
    });
    
    // Add all staff (non-manager, non-admin)
    staffUsers.forEach((s: any) => {
      entries.push({
        person_type: "staff",
        person_id: s.user_id,
        person_name: s.profiles?.full_name || "Unknown",
        is_present: true,
        check_in: factoryStartTime,
        check_out: factoryEndTime,
      });
    });
    
    setAttendanceEntries(entries);
  };

  const saveAttendanceMutation = useMutation({
    mutationFn: async () => {
      // Generate display ID
      const { data: idData } = await supabase.rpc("generate_display_id", {
        prefix: "ATT",
        seq_name: "attendance_display_id_seq"
      });

      // Create attendance record
      const { data: record, error: recordError } = await supabase
        .from("attendance_records")
        .insert({
          display_id: idData,
          attendance_date: attendanceDate,
          recorded_by: user!.id,
          factory_start_time: factoryStartTime,
          factory_end_time: factoryEndTime,
          notes: attendanceNotes || null,
        })
        .select()
        .single();

      if (recordError) throw recordError;

      // Create attendance entries for present people
      const entries = attendanceEntries
        .filter(e => e.is_present)
        .map(e => {
          // Calculate hours worked
          const checkIn = new Date(`2000-01-01T${e.check_in}:00`);
          const checkOut = new Date(`2000-01-01T${e.check_out}:00`);
          const hoursWorked = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
          
          // Calculate pay based on shift rates
          const { rate, amount } = calculateShiftPay(hoursWorked, shiftRates);
          
          return {
            attendance_id: record.id,
            user_id: e.person_type === "staff" ? e.person_id : null,
            worker_id: e.person_type === "worker" ? e.person_id : null,
            is_present: true,
            check_in_time: e.check_in,
            check_out_time: e.check_out,
            hourly_rate: rate, // Store calculated hourly rate for reference
          };
        });

      if (entries.length > 0) {
        const { error: entriesError } = await supabase
          .from("attendance_entries")
          .insert(entries);
        if (entriesError) throw entriesError;
      }

      return record;
    },
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ["attendance-records"] });
      qc.invalidateQueries({ queryKey: ["worker-balances"] });
      toast.success(`Attendance recorded: ${record.display_id}`);
      logActivity(user!.id, `Recorded attendance for ${attendanceDate}`, "attendance");
      setShowAttendanceDialog(false);
      setAttendanceEntries([]);
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  // Payment mutation
  const savePaymentMutation = useMutation({
    mutationFn: async () => {
      const { data: idData } = await supabase.rpc("generate_display_id", {
        prefix: "WPY",
        seq_name: "worker_payments_display_id_seq"
      });

      const { error } = await supabase.from("worker_payments").insert({
        display_id: idData,
        user_id: paymentPersonType === "staff" ? paymentPersonId : null,
        worker_id: paymentPersonType === "worker" ? paymentPersonId : null,
        amount: parseFloat(paymentAmount),
        payment_method: paymentMethod,
        notes: paymentNotes || null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-balances"] });
      toast.success("Payment recorded");
      setShowPaymentDialog(false);
      setPaymentPersonId("");
      setPaymentAmount("");
      setPaymentNotes("");
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  // Edit entries for a record
  const loadEntriesForEdit = async (record: AttendanceRecord) => {
    const { data, error } = await supabase
      .from("attendance_entries")
      .select(`
        *,
        workers(name, display_id)
      `)
      .eq("attendance_id", record.id);
    
    if (error) {
      toast.error("Failed to load entries");
      return;
    }
    
    if (!data || data.length === 0) {
      setEditingRecord(record);
      setEditEntries([]);
      setShowEditEntriesDialog(true);
      return;
    }
    
    // Get profiles for users
    const userIds = data.filter(d => d.user_id).map(d => d.user_id!);
    let profilesMap: Record<string, { full_name: string }> = {};
    
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      
      profiles?.forEach(p => { profilesMap[p.id] = { full_name: p.full_name }; });
    }
    
    const entriesWithProfiles = data.map(e => ({
      ...e,
      profiles: e.user_id ? profilesMap[e.user_id] : null
    }));
    
    setEditingRecord(record);
    setEditEntries(entriesWithProfiles as AttendanceEntry[]);
    setShowEditEntriesDialog(true);
  };

  const updateEntryMutation = useMutation({
    mutationFn: async (entry: AttendanceEntry) => {
      const { error } = await supabase
        .from("attendance_entries")
        .update({
          check_in_time: entry.check_in_time,
          check_out_time: entry.check_out_time,
          hourly_rate: entry.hourly_rate,
          adjustment_amount: entry.adjustment_amount,
          adjustment_reason: entry.adjustment_reason,
          notes: entry.notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-records"] });
      qc.invalidateQueries({ queryKey: ["worker-balances"] });
      toast.success("Entry updated");
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  const handleEditWorker = (w: Worker) => {
    setEditingWorker(w);
    setWorkerName(w.name);
    setWorkerPhone(w.phone || "");
    setShowWorkerDialog(true);
  };

  const calculateHours = (checkIn: string, checkOut: string) => {
    if (!checkIn || !checkOut) return 0;
    const [inH, inM] = checkIn.split(":").map(Number);
    const [outH, outM] = checkOut.split(":").map(Number);
    return Math.max(0, (outH * 60 + outM - inH * 60 - inM) / 60);
  };

  const updateEntryTime = (index: number, field: "check_in" | "check_out", value: string) => {
    const updated = [...attendanceEntries];
    updated[index] = { ...updated[index], [field]: value };
    setAttendanceEntries(updated);
  };

  const totalOwed = balances.reduce((sum, b) => sum + Math.max(0, Number(b.outstanding_balance)), 0);
  const totalAdvance = balances.reduce((sum, b) => sum + Math.max(0, -Number(b.outstanding_balance)), 0);

  if (loadingRecords && loadingWorkers) {
    return <TableSkeleton columns={6} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Attendance"
        subtitle="Track daily attendance and calculate wages"
        primaryAction={{
          label: "Record Attendance",
          icon: Calendar,
          onClick: () => {
            initAttendanceEntries();
            setShowAttendanceDialog(true);
          },
        }}
        actions={[
          { label: "Add Worker", onClick: () => { resetWorkerForm(); setShowWorkerDialog(true); }, priority: 1 },
          { label: "Make Payment", onClick: () => setShowPaymentDialog(true), priority: 2 },
          { label: "Shift Rates", onClick: () => setShowShiftRatesDialog(true), priority: 3 },
        ]}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Workers</p>
                <p className="text-2xl font-bold">{workers.filter(w => w.is_active).length}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Staff Members</p>
                <p className="text-2xl font-bold">{staffUsers.length}</p>
              </div>
              <UserPlus className="h-8 w-8 text-purple-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Company Owes</p>
                <p className="text-2xl font-bold text-red-600">₹{totalOwed.toLocaleString()}</p>
              </div>
              <ArrowUpRight className="h-8 w-8 text-red-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Advance Paid</p>
                <p className="text-2xl font-bold text-green-600">₹{totalAdvance.toLocaleString()}</p>
              </div>
              <ArrowDownRight className="h-8 w-8 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="records">Attendance Records</TabsTrigger>
          <TabsTrigger value="workers">Workers</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
        </TabsList>

        {/* Attendance Records Tab */}
        <TabsContent value="records" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Attendance History</CardTitle>
              <CardDescription>View and edit past attendance records</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={[
                  { header: "ID", accessor: "display_id", className: "font-mono text-xs" },
                  { header: "Date", accessor: (r: AttendanceRecord) => format(parseISO(r.attendance_date), "dd MMM yyyy") },
                  { header: "Hours", accessor: (r: AttendanceRecord) => `${r.factory_start_time} - ${r.factory_end_time}` },
                  { header: "Entries", accessor: (r: AttendanceRecord) => r.entries_count || 0, className: "text-center" },
                  {
                    header: "Status",
                    accessor: (r: AttendanceRecord) => (
                      <StatusBadge status={r.is_finalized ? "active" : "pending"} label={r.is_finalized ? "Finalized" : "Draft"} />
                    ),
                  },
                  {
                    header: "Actions",
                    accessor: (r: AttendanceRecord) => (
                      <Button variant="ghost" size="sm" onClick={() => loadEntriesForEdit(r)}>
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    ),
                  },
                ]}
                data={attendanceRecords}
                searchKey="display_id"
                searchPlaceholder="Search by ID..."
                emptyMessage="No attendance records yet"
                renderMobileCard={(r: AttendanceRecord) => (
                  <div className="entity-card-mobile flex-col !items-stretch">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="entity-card-subtitle">{r.display_id}</p>
                        <p className="font-semibold">{format(parseISO(r.attendance_date), "dd MMM yyyy")}</p>
                        <p className="text-sm text-muted-foreground">{r.factory_start_time} - {r.factory_end_time}</p>
                      </div>
                      <StatusBadge status={r.is_finalized ? "active" : "pending"} label={r.is_finalized ? "Final" : "Draft"} />
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t">
                      <span className="text-sm">{r.entries_count} entries</span>
                      <Button variant="outline" size="sm" onClick={() => loadEntriesForEdit(r)}>
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </div>
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workers Tab */}
        <TabsContent value="workers" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Workers List</CardTitle>
              <CardDescription>Manage non-staff workers</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={[
                  { header: "ID", accessor: "display_id", className: "font-mono text-xs" },
                  { header: "Name", accessor: "name", className: "font-medium" },
                  { header: "Phone", accessor: (w: Worker) => w.phone || "—" },
                  { header: "Hourly Rate", accessor: (w: Worker) => `₹${w.hourly_rate}/hr` },
                  {
                    header: "Status",
                    accessor: (w: Worker) => (
                      <StatusBadge status={w.is_active ? "active" : "inactive"} />
                    ),
                  },
                  {
                    header: "Actions",
                    accessor: (w: Worker) => (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditWorker(w)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingWorkerId(w.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ),
                  },
                ]}
                data={workers}
                searchKey="name"
                searchPlaceholder="Search workers..."
                emptyMessage="No workers added yet"
                renderMobileCard={(w: Worker) => (
                  <div className="entity-card-mobile flex-col !items-stretch">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="entity-card-subtitle">{w.display_id}</p>
                        <p className="font-semibold">{w.name}</p>
                        <p className="text-sm text-muted-foreground">{w.phone || "No phone"}</p>
                      </div>
                      <StatusBadge status={w.is_active ? "active" : "inactive"} />
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t">
                      <span className="font-medium">₹{w.hourly_rate}/hr</span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEditWorker(w)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeletingWorkerId(w.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Balances Tab */}
        <TabsContent value="balances" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Outstanding Balances</CardTitle>
              <CardDescription>Track what company owes to workers/staff</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={[
                  { 
                    header: "Person", 
                    accessor: (b: WorkerBalance) => b.workers?.name || (b as any).profiles?.full_name || "Unknown",
                    className: "font-medium"
                  },
                  { header: "Type", accessor: (b: WorkerBalance) => b.worker_id ? "Worker" : "Staff", className: "text-sm" },
                  { header: "Total Earned", accessor: (b: WorkerBalance) => `₹${Number(b.total_earned).toLocaleString()}` },
                  { header: "Total Paid", accessor: (b: WorkerBalance) => `₹${Number(b.total_paid).toLocaleString()}` },
                  { 
                    header: "Balance", 
                    accessor: (b: WorkerBalance) => {
                      const bal = Number(b.outstanding_balance);
                      return (
                        <span className={bal > 0 ? "text-red-600 font-semibold" : bal < 0 ? "text-green-600 font-semibold" : ""}>
                          ₹{Math.abs(bal).toLocaleString()}
                          {bal > 0 ? " (owed)" : bal < 0 ? " (advance)" : ""}
                        </span>
                      );
                    }
                  },
                ]}
                data={balances}
                searchKey="workers.name"
                searchPlaceholder="Search..."
                emptyMessage="No balance records yet"
                renderMobileCard={(b: WorkerBalance) => (
                  <div className="entity-card-mobile flex-col !items-stretch">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold">{b.workers?.name || (b as any).profiles?.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{b.worker_id ? "Worker" : "Staff"}</p>
                      </div>
                      {Number(b.outstanding_balance) > 0 ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-red-500/10 text-red-600 font-medium">Owed</span>
                      ) : Number(b.outstanding_balance) < 0 ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-green-500/10 text-green-600 font-medium">Advance</span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Earned</p>
                        <p className="font-medium">₹{Number(b.total_earned).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Paid</p>
                        <p className="font-medium">₹{Number(b.total_paid).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Balance</p>
                        <p className={`font-bold ${Number(b.outstanding_balance) > 0 ? "text-red-600" : Number(b.outstanding_balance) < 0 ? "text-green-600" : ""}`}>
                          ₹{Math.abs(Number(b.outstanding_balance)).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Worker Dialog */}
      <Dialog open={showWorkerDialog} onOpenChange={(open) => { setShowWorkerDialog(open); if (!open) resetWorkerForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingWorker ? "Edit Worker" : "Add Worker"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={workerName} onChange={(e) => setWorkerName(e.target.value)} placeholder="Worker name" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={workerPhone} onChange={(e) => setWorkerPhone(e.target.value)} placeholder="Phone number" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkerDialog(false)}>Cancel</Button>
            <Button onClick={() => saveWorkerMutation.mutate()} disabled={!workerName.trim() || saveWorkerMutation.isPending}>
              {saveWorkerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingWorker ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Attendance Dialog */}
      <Dialog open={showAttendanceDialog} onOpenChange={setShowAttendanceDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Attendance</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Date and Time Settings */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Factory Start Time</Label>
                <Input 
                  type="time" 
                  value={factoryStartTime} 
                  onChange={(e) => {
                    setFactoryStartTime(e.target.value);
                    // Update all entries to use new start time
                    setAttendanceEntries(prev => prev.map(entry => ({ ...entry, check_in: e.target.value })));
                  }} 
                />
              </div>
              <div className="space-y-2">
                <Label>Factory End Time</Label>
                <Input 
                  type="time" 
                  value={factoryEndTime} 
                  onChange={(e) => {
                    setFactoryEndTime(e.target.value);
                    // Update all entries to use new end time
                    setAttendanceEntries(prev => prev.map(entry => ({ ...entry, check_out: e.target.value })));
                  }} 
                />
              </div>
            </div>

            {/* Attendance Entries */}
            <div>
              <Label className="mb-3 block">Attendance ({attendanceEntries.filter(e => e.is_present).length} present)</Label>
              <div className="border rounded-lg divide-y">
                {attendanceEntries.map((entry, index) => {
                  const hours = calculateHours(entry.check_in, entry.check_out);
                  const amount = hours * entry.hourly_rate;
                  
                  return (
                    <div key={`${entry.person_type}-${entry.person_id}`} className="p-3">
                      <div className="grid grid-cols-12 gap-3 items-center">
                        {/* Present toggle + Name - 4 cols */}
                        <div className="col-span-4 flex items-center gap-3">
                          <Switch 
                            checked={entry.is_present} 
                            onCheckedChange={(checked) => {
                              const updated = [...attendanceEntries];
                              updated[index] = { ...updated[index], is_present: checked };
                              setAttendanceEntries(updated);
                            }}
                          />
                          <div className="min-w-0">
                            <p className={`font-medium truncate ${!entry.is_present ? "text-muted-foreground line-through" : ""}`}>
                              {entry.person_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {entry.person_type === "worker" ? "Worker" : "Staff"} • ₹{entry.hourly_rate}/hr
                            </p>
                          </div>
                        </div>
                        
                        {/* Check In - 2 cols */}
                        <div className="col-span-2">
                          <Input 
                            type="time" 
                            value={entry.check_in} 
                            onChange={(e) => updateEntryTime(index, "check_in", e.target.value)}
                            disabled={!entry.is_present}
                            className="h-9"
                          />
                        </div>
                        
                        {/* Check Out - 2 cols */}
                        <div className="col-span-2">
                          <Input 
                            type="time" 
                            value={entry.check_out} 
                            onChange={(e) => updateEntryTime(index, "check_out", e.target.value)}
                            disabled={!entry.is_present}
                            className="h-9"
                          />
                        </div>
                        
                        {/* Hours - 2 cols */}
                        <div className="col-span-2 text-center">
                          <p className="text-sm font-medium">{entry.is_present ? hours.toFixed(1) : "—"} hrs</p>
                        </div>
                        
                        {/* Amount - 2 cols */}
                        <div className="col-span-2 text-right">
                          <p className="font-semibold text-green-600">
                            {entry.is_present ? `₹${amount.toFixed(0)}` : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <span className="font-medium">Total Wages for Today</span>
              <span className="text-xl font-bold text-green-600">
                ₹{attendanceEntries
                  .filter(e => e.is_present)
                  .reduce((sum, e) => sum + calculateHours(e.check_in, e.check_out) * e.hourly_rate, 0)
                  .toFixed(0)}
              </span>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={attendanceNotes} onChange={(e) => setAttendanceNotes(e.target.value)} placeholder="Any notes for this day..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAttendanceDialog(false)}>Cancel</Button>
            <Button 
              onClick={() => saveAttendanceMutation.mutate()} 
              disabled={saveAttendanceMutation.isPending || attendanceEntries.filter(e => e.is_present).length === 0}
            >
              {saveAttendanceMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Attendance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Make Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Make Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Person Type</Label>
              <Select value={paymentPersonType} onValueChange={(v: "staff" | "worker") => { setPaymentPersonType(v); setPaymentPersonId(""); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="worker">Worker</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Select Person *</Label>
              <Select value={paymentPersonId} onValueChange={setPaymentPersonId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select person" />
                </SelectTrigger>
                <SelectContent>
                  {paymentPersonType === "worker"
                    ? workers.filter(w => w.is_active).map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.name} ({w.display_id})</SelectItem>
                      ))
                    : staffUsers.map((s: any) => (
                        <SelectItem key={s.user_id} value={s.user_id}>{s.profiles?.full_name}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
            <Button 
              onClick={() => savePaymentMutation.mutate()} 
              disabled={!paymentPersonId || !paymentAmount || savePaymentMutation.isPending}
            >
              {savePaymentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Entries Dialog */}
      <Dialog open={showEditEntriesDialog} onOpenChange={setShowEditEntriesDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Attendance - {editingRecord?.display_id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editEntries.map((entry, index) => (
              <div key={entry.id} className="p-4 border rounded-lg">
                <div className="grid grid-cols-12 gap-4 items-center">
                  {/* Name - 3 cols */}
                  <div className="col-span-3">
                    <p className="font-medium">{entry.workers?.name || (entry as any).profiles?.full_name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{entry.worker_id ? "Worker" : "Staff"}</p>
                  </div>
                  
                  {/* Check In - 2 cols */}
                  <div className="col-span-2">
                    <Label className="text-xs">Check In</Label>
                    <Input 
                      type="time" 
                      value={entry.check_in_time || ""} 
                      onChange={(e) => {
                        const updated = [...editEntries];
                        updated[index] = { ...updated[index], check_in_time: e.target.value };
                        setEditEntries(updated);
                      }}
                      className="h-9"
                    />
                  </div>
                  
                  {/* Check Out - 2 cols */}
                  <div className="col-span-2">
                    <Label className="text-xs">Check Out</Label>
                    <Input 
                      type="time" 
                      value={entry.check_out_time || ""} 
                      onChange={(e) => {
                        const updated = [...editEntries];
                        updated[index] = { ...updated[index], check_out_time: e.target.value };
                        setEditEntries(updated);
                      }}
                      className="h-9"
                    />
                  </div>
                  
                  {/* Rate - 2 cols */}
                  <div className="col-span-2">
                    <Label className="text-xs">Rate (₹/hr)</Label>
                    <Input 
                      type="number" 
                      min="0"
                      step="0.01"
                      value={entry.hourly_rate} 
                      onChange={(e) => {
                        const updated = [...editEntries];
                        updated[index] = { ...updated[index], hourly_rate: parseFloat(e.target.value) || 0 };
                        setEditEntries(updated);
                      }}
                      className="h-9"
                    />
                  </div>
                  
                  {/* Amount - 2 cols */}
                  <div className="col-span-2 text-right">
                    <p className="text-xs text-muted-foreground">Earned</p>
                    <p className="font-semibold text-green-600">₹{Number(entry.amount_earned).toFixed(0)}</p>
                  </div>
                  
                  {/* Save button - 1 col */}
                  <div className="col-span-1">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => updateEntryMutation.mutate(entry)}
                      disabled={updateEntryMutation.isPending}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditEntriesDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Worker Confirmation */}
      <AlertDialog open={!!deletingWorkerId} onOpenChange={() => setDeletingWorkerId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Worker?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the worker. They won't appear in attendance forms but their history will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingWorkerId && deleteWorkerMutation.mutate(deletingWorkerId)}>
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Shift Rates Dialog */}
      <Dialog open={showShiftRatesDialog} onOpenChange={(open) => { setShowShiftRatesDialog(open); if (!open) resetShiftRateForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Shift Rates</DialogTitle>
            <DialogDescription>
              Define pay rates for different shift durations. Workers are paid proportionally based on hours worked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Existing shift rates */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Current Shift Rates</Label>
              {shiftRates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shift rates defined yet. Add your first rate below.</p>
              ) : (
                <div className="border rounded-lg divide-y">
                  {shiftRates.map((rate: any) => (
                    <div key={rate.id} className="p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{rate.shift_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {rate.duration_hours} hours = ₹{rate.rate_amount.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setEditingShiftRate(rate);
                            setShiftRateName(rate.shift_name);
                            setShiftRateDuration(String(rate.duration_hours));
                            setShiftRateAmount(String(rate.rate_amount));
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => deleteShiftRateMutation.mutate(rate.id)}
                          disabled={deleteShiftRateMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add/Edit form */}
            <div className="border-t pt-4">
              <Label className="text-sm font-medium">{editingShiftRate ? "Edit Shift Rate" : "Add New Shift Rate"}</Label>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input 
                    value={shiftRateName} 
                    onChange={(e) => setShiftRateName(e.target.value)} 
                    placeholder="e.g., Full Day"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Duration (hours)</Label>
                  <Input 
                    type="number" 
                    min="0.5" 
                    step="0.5"
                    value={shiftRateDuration} 
                    onChange={(e) => setShiftRateDuration(e.target.value)} 
                    placeholder="e.g., 9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Rate (₹)</Label>
                  <Input 
                    type="number" 
                    min="0" 
                    step="0.01"
                    value={shiftRateAmount} 
                    onChange={(e) => setShiftRateAmount(e.target.value)} 
                    placeholder="e.g., 500"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button 
                  onClick={() => saveShiftRateMutation.mutate()} 
                  disabled={!shiftRateName.trim() || !shiftRateDuration || !shiftRateAmount || saveShiftRateMutation.isPending}
                  size="sm"
                >
                  {saveShiftRateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingShiftRate ? "Update" : "Add"} Rate
                </Button>
                {editingShiftRate && (
                  <Button variant="outline" size="sm" onClick={resetShiftRateForm}>Cancel Edit</Button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShiftRatesDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
