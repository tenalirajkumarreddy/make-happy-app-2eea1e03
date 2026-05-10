import { useState, useEffect } from "react";
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
  Download,
  FileSpreadsheet,
  Briefcase,
} from "lucide-react";

// Export utilities
function exportToCSV(data: any[], filename: string, headers: { key: string; label: string }[]) {
  const csvContent = [
    headers.map(h => h.label).join(","),
    ...data.map(row => headers.map(h => {
      const value = row[h.key];
      if (typeof value === "string" && value.includes(",")) return `"${value}"`;
      return value;
    }).join(","))
  ].join("\n");
  
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${format(new Date(), "yyyy-MM-dd")}.csv`;
  link.click();
}

function exportToPDF(title: string, data: any[], headers: { key: string; label: string }[]) {
  const content = `
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f5f5f5; }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <p>Generated: ${format(new Date(), "PPpp")}</p>
      <table>
        <tr>${headers.map(h => `<th>${h.label}</th>`).join("")}</tr>
        ${data.map(row => `<tr>${headers.map(h => `<td>${row[h.key] ?? ""}</td>`).join("")}</tr>`).join("")}
      </table>
    </body>
    </html>
  `;
  const blob = new Blob([content], { type: "text/html" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${title.replace(/\s+/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.html`;
  link.click();
}

interface Worker {
  id: string;
  display_id: string;
  name: string;
  phone?: string;
  is_active: boolean;
  wage_type?: string;
  daily_wage?: number;
  monthly_salary?: number;
  paid_leaves_allowed?: number;
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
  is_on_leave?: boolean;
  check_in_time?: string;
  check_out_time?: string;
  hours_worked: number;
  hourly_rate: number;
  amount_earned: number;
  adjustment_amount: number;
  adjustment_reason?: string;
  notes?: string;
  // Joined data
  worker?: { name: string; display_id: string; wage_type?: string; daily_wage?: number; monthly_salary?: number };
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
  if (!shiftRates || shiftRates.length === 0) return { rate: 0, amount: 0 };
  
  const hours = Number(hoursWorked);
  if (isNaN(hours) || hours <= 0) return { rate: 0, amount: 0 };
  
  // Find the closest matching shift rate
  let closestShift = shiftRates[0];
  let minDiff = Math.abs(hours - Number(shiftRates[0].duration_hours));
  
  for (const shift of shiftRates) {
    const shiftHours = Number(shift.duration_hours);
    if (isNaN(shiftHours) || shiftHours <= 0) continue;
    const diff = Math.abs(hours - shiftHours);
    if (diff < minDiff) {
      minDiff = diff;
      closestShift = shift;
    }
  }
  
  const rateAmount = Number(closestShift.rate_amount);
  const durationHours = Number(closestShift.duration_hours);
  
  if (!rateAmount || !durationHours || durationHours <= 0) {
    return { rate: 0, amount: 0 };
  }
  
  const proportionalAmount = (hours / durationHours) * rateAmount;
  
  return {
    rate: rateAmount / durationHours,
    amount: Math.round(proportionalAmount * 100) / 100
  };
}

// Calculate hours from check-in and check-out times
function calculateHours(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const [inH, inM] = checkIn.split(":").map(Number);
  const [outH, outM] = checkOut.split(":").map(Number);
  return Math.max(0, (outH * 60 + outM - inH * 60 - inM) / 60);
}

// Calculate pay based on worker wage type and times
// is_on_leave: for monthly workers, they can be on paid leave
function calculateWorkerPay(
  worker: Worker | undefined,
  checkIn: string | undefined,
  checkOut: string | undefined,
  shiftRates: any[],
  isOnLeave: boolean = false
): { rate: number; amount: number } {
  // If no worker, return 0
  if (!worker) return { rate: 0, amount: 0 };
  
  // Monthly workers get full daily rate if present OR on paid leave
  if (worker.wage_type === 'monthly' && worker.monthly_salary) {
    const dailyRate = Number(worker.monthly_salary) / 30;
    // If present or on paid leave → full daily rate
    if (isOnLeave) {
      return { rate: 0, amount: dailyRate }; // Paid leave
    }
    return { rate: 0, amount: dailyRate };
  }
  
  // If daily wage - just daily rate, no time tracking needed
  if (worker.wage_type === 'daily' && worker.daily_wage) {
    return { rate: 0, amount: Number(worker.daily_wage) };
  }
  
  // Otherwise use shift-based calculation for hourly workers
  if (checkIn && checkOut) {
    const hours = calculateHours(checkIn, checkOut);
    return calculateShiftPay(hours, shiftRates);
  }
  
  return { rate: 0, amount: 0 };
}

export default function Attendance() {
  const { user, role } = useAuth();
  const qc = useQueryClient();

  const isSuperAdmin = role === "super_admin";
  const isManager = role === "manager";
  const isOperator = role === "operator";
  const canAddWorkers = isSuperAdmin || isManager || isOperator;
  const canEditWorkers = isSuperAdmin || isManager;
  const canViewBalances = isSuperAdmin || isManager || isOperator;

  useEffect(() => { document.title = "Attendance"; }, []);

  // Reports state - must be before the useEffect that uses it
  const [reportMonth, setReportMonth] = useState(format(new Date(), "yyyy-MM"));
  const [reportStats, setReportStats] = useState({ daysWorked: 0, workersPresent: 0, staffPresent: 0, totalCost: 0 });
  const [dailyBreakdown, setDailyBreakdown] = useState<any[]>([]);

  // Load report data when month changes
  useEffect(() => {
    if (!reportMonth) return;
    
    const loadReportData = async () => {
      const [year, month] = reportMonth.split("-").map(Number);
      const startDate = new Date(year, month - 1, 1).toISOString().split("T")[0];
      const endDate = new Date(year, month, 0).toISOString().split("T")[0];
      
      // Get attendance records for the month
      const { data: records } = await supabase
        .from("attendance_records")
        .select("*, attendance_entries(count, is_present)")
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate)
        .order("attendance_date");
      
      if (!records) {
        setReportStats({ daysWorked: 0, workersPresent: 0, staffPresent: 0, totalCost: 0 });
        setDailyBreakdown([]);
        return;
      }
      
      // Calculate stats
      let daysWorked = 0;
      let workersPresent = 0;
      let staffPresent = 0;
      let totalCost = 0;
      const breakdown: any[] = [];
      
      for (const record of records) {
        if (!record.is_working_day) continue;
        
        daysWorked++;
        
        // Get entries for this record
        const { data: entries } = await supabase
          .from("attendance_entries")
          .select("is_present, amount_earned, worker_id, user_id")
          .eq("attendance_id", record.id);
        
        const dayWorkers = entries?.filter(e => e.worker_id && e.is_present).length || 0;
        const dayStaff = entries?.filter(e => e.user_id && e.is_present).length || 0;
        const dayCost = entries?.reduce((sum, e) => sum + (Number(e.amount_earned) || 0), 0) || 0;
        
        workersPresent += dayWorkers;
        staffPresent += dayStaff;
        totalCost += dayCost;
        
        breakdown.push({
          date: record.attendance_date,
          workersPresent: dayWorkers,
          staffPresent: dayStaff,
          batch_numbers: record.batch_numbers,
          cost: dayCost
        });
      }
      
      setReportStats({ daysWorked, workersPresent, staffPresent, totalCost });
      setDailyBreakdown(breakdown);
    };
    
    loadReportData();
  }, [reportMonth]);

  const [activeTab, setActiveTab] = useState("records");
  
  // Workers state
  const [showWorkerDialog, setShowWorkerDialog] = useState(false);
  const [selectedWorkerProfile, setSelectedWorkerProfile] = useState<Worker | null>(null);
  const [showWorkerProfileDialog, setShowWorkerProfileDialog] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [workerName, setWorkerName] = useState("");
  const [workerPhone, setWorkerPhone] = useState("");
  const [workerWageType, setWorkerWageType] = useState("daily");
  const [workerDailyWage, setWorkerDailyWage] = useState("");
  const [workerMonthlySalary, setWorkerMonthlySalary] = useState("");
  const [workerPaidLeaves, setWorkerPaidLeaves] = useState("");
  const [workerActive, setWorkerActive] = useState(true);
  const [deletingWorkerId, setDeletingWorkerId] = useState<string | null>(null);
  
  // Staff edit state
  const [showStaffDialog, setShowStaffDialog] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [staffWageType, setStaffWageType] = useState("monthly");
  const [staffMonthlySalary, setStaffMonthlySalary] = useState("");
  const [staffDailyWage, setStaffDailyWage] = useState("");
  const [staffPaidLeaves, setStaffPaidLeaves] = useState("");
  
  // Shift rates state
  const [showShiftRatesDialog, setShowShiftRatesDialog] = useState(false);
  const [editingShiftRate, setEditingShiftRate] = useState<any>(null);
  const [shiftRateName, setShiftRateName] = useState("");
  const [shiftRateDuration, setShiftRateDuration] = useState("");
  const [shiftRateAmount, setShiftRateAmount] = useState("");
  
  // Attendance record state
  const [showAttendanceDialog, setShowAttendanceDialog] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isWorkingDay, setIsWorkingDay] = useState(true);
  const [batchNumbers, setBatchNumbers] = useState("");
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
    worker?: Worker; // Attach worker for pay calculation
  }[]>([]);
  
  // Payment state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentPersonType, setPaymentPersonType] = useState<"staff" | "worker">("worker");
  const [paymentPersonId, setPaymentPersonId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  
  // Reports state
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

  const { data: workerBalances = [] } = useQuery({
    queryKey: ["worker-balances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_balances")
        .select("*")
        .order("outstanding_balance", { ascending: false });
      if (error) throw error;
      return data as WorkerBalance[];
    },
  });

  const { data: workerPayments = [] } = useQuery({
    queryKey: ["worker-payments", selectedWorkerProfile?.id],
    queryFn: async () => {
      if (!selectedWorkerProfile?.id) return [];
      const { data, error } = await supabase
        .from("worker_payments")
        .select("*")
        .eq("worker_id", selectedWorkerProfile.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedWorkerProfile?.id,
  });

  const { data: workerAttendance = [] } = useQuery({
    queryKey: ["worker-attendance", selectedWorkerProfile?.id],
    queryFn: async () => {
      if (!selectedWorkerProfile?.id) return [];
      const { data, error } = await supabase
        .from("attendance_entries")
        .select(`
          *,
          record:attendance_records(attendance_date)
        `)
        .eq("worker_id", selectedWorkerProfile.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedWorkerProfile?.id,
  });

  const { data: staffUsers = [] } = useQuery({
    queryKey: ["staff-for-attendance"],
    queryFn: async () => {
      // Get all staff (agents, marketers, operators) - exclude managers and customers
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .not("role", "in", "(manager,super_admin,customer)");
      if (error) throw error;
      
      if (!data || data.length === 0) return [];
      
      // Get profiles for these users (including wage info)
      const userIds = data.map(d => d.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, wage_type, monthly_salary, daily_wage, paid_leaves_allowed")
        .in("user_id", userIds);
      
      // Merge data
      return data.map(ur => ({
        ...ur,
        profiles: profiles?.find(p => p.user_id === ur.user_id) || { full_name: "Unknown" }
      }));
    },
  });

  const PAGE_SIZE = 100;
  const [loadedPages, setLoadedPages] = useState(1);

  const { data: attendanceRecords = [], isLoading: loadingRecords, isFetching: fetchingRecords } = useQuery({
    queryKey: ["attendance-records", loadedPages],
    queryFn: async () => {
      let query = supabase
        .from("attendance_records")
        .select(`
          *,
          attendance_entries(count)
        `)
        .order("attendance_date", { ascending: false });
        
      query = query.range(0, loadedPages * PAGE_SIZE - 1);
      const { data, error } = await query;
      if (error) throw error;
      return data.map(r => ({
        ...r,
        entries_count: r.attendance_entries?.[0]?.count || 0
      })) as AttendanceRecord[];
    },
  });

  const hasMoreRecords = attendanceRecords.length >= loadedPages * PAGE_SIZE;

  const { data: balances = [], isLoading: loadingBalances } = useQuery({
    queryKey: ["worker-balances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_balances")
        .select(`
          *,
          worker:workers(name, display_id, wage_type, daily_wage, monthly_salary, paid_leaves_allowed)
        `)
        .order("outstanding_balance", { ascending: false });
      if (error) throw error;
      
      if (!data || data.length === 0) return [];
      
      // Get profiles for users with user_id
      const userIds = data.filter(d => d.user_id).map(d => d.user_id!);
      const profilesMap: Record<string, { full_name: string }> = {};
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        
        profiles?.forEach(p => { profilesMap[p.user_id] = { full_name: p.full_name }; });
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
    setWorkerWageType("daily");
    setWorkerDailyWage("");
    setWorkerMonthlySalary("");
    setWorkerPaidLeaves("");
    setWorkerActive(true);
  };

  const saveWorkerMutation = useMutation({
    mutationFn: async () => {
      if (editingWorker) {
        const { error } = await supabase
          .from("workers")
          .update({
            name: workerName,
            phone: workerPhone || null,
            wage_type: workerWageType,
            daily_wage: workerWageType === 'daily' ? parseFloat(workerDailyWage) || 0 : null,
            monthly_salary: workerWageType === 'monthly' ? parseFloat(workerMonthlySalary) || 0 : null,
            paid_leaves_allowed: workerWageType === 'monthly' ? parseInt(workerPaidLeaves) || 0 : 0,
            is_active: workerActive,
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
          wage_type: workerWageType,
          daily_wage: workerWageType === 'daily' ? parseFloat(workerDailyWage) || 0 : null,
          monthly_salary: workerWageType === 'monthly' ? parseFloat(workerMonthlySalary) || 0 : null,
          paid_leaves_allowed: workerWageType === 'monthly' ? parseInt(workerPaidLeaves) || 0 : 0,
          is_active: true,
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

  // Save staff salary mutation
  const saveStaffMutation = useMutation({
    mutationFn: async () => {
      if (!editingStaff) return;
      
      const { error } = await supabase
        .from("profiles")
        .update({
          wage_type: staffWageType,
          monthly_salary: staffWageType === 'monthly' ? parseFloat(staffMonthlySalary) || 0 : null,
          daily_wage: staffWageType === 'daily' ? parseFloat(staffDailyWage) || 0 : null,
          paid_leaves_allowed: staffWageType === 'monthly' ? parseInt(staffPaidLeaves) || 0 : 0,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", editingStaff.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-for-attendance"] });
      toast.success("Staff salary updated");
      setShowStaffDialog(false);
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
        worker: w, // Attach worker for pay calculation
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
      // Operator can only record today's attendance
      if (isOperator) {
        const today = new Date().toISOString().split("T")[0];
        if (attendanceDate !== today) {
          throw new Error("You can only record today's attendance");
        }
      }
      
      // Check for duplicate attendance for this date
      const { data: existing } = await supabase
        .from("attendance_records")
        .select("id, display_id, is_working_day")
        .eq("attendance_date", attendanceDate)
        .limit(1);
      
      if (existing && existing.length > 0) {
        if (isWorkingDay) {
          throw new Error(`Attendance already exists for ${attendanceDate} (${existing[0].display_id})`);
        }
      }
      
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
          is_working_day: isWorkingDay,
          batch_numbers: batchNumbers || null,
          factory_start_time: factoryStartTime,
          factory_end_time: factoryEndTime,
          notes: attendanceNotes || null,
        })
        .select()
        .single();

      if (recordError) throw recordError;

      // Only create attendance entries if it's a working day
      if (isWorkingDay) {
        // Create attendance entries for present people
        const entries = attendanceEntries
        .filter(e => e.is_present)
        .map(e => {
          // Calculate hours worked
          const checkIn = new Date(`2000-01-01T${e.check_in}:00`);
          const checkOut = new Date(`2000-01-01T${e.check_out}:00`);
          const hoursWorked = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
          
          // Get worker data for proper pay calculation
          const worker = e.person_type === "worker" 
            ? workers.find(w => w.id === e.person_id)
            : undefined;
          
          // Calculate pay based on worker type (monthly/daily/shift)
          const { rate, amount } = calculateWorkerPay(
            worker,
            e.check_in,
            e.check_out,
            shiftRates
          );
          
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

      // Also record as expense for accounting
      const { data: expenseIdData } = await supabase.rpc("generate_display_id", {
        prefix: "EXP",
        seq_name: "expenses_display_id_seq"
      });

      // Get person name for reference
      const personName = paymentPersonType === "worker"
        ? workers.find(w => w.id === paymentPersonId)?.name
        : staffUsers.find(s => s.user_id === paymentPersonId)?.profiles?.full_name || "Unknown";

      const { error: expenseError } = await supabase.from("expenses").insert({
        display_id: expenseIdData,
        amount: parseFloat(paymentAmount),
        expense_category_id: "8792d094-d08b-48fc-a487-cb0d0986ff5f",
        payment_method: paymentMethod,
        notes: `Worker/Staff payment: ${personName} - ${paymentNotes || "Wages"}`,
        expense_date: new Date().toISOString().split("T")[0],
        created_by: user!.id,
      });
      if (expenseError) {
        console.error("Failed to record expense:", expenseError);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-balances"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
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
    // Operator can only edit today's attendance
    if (isOperator) {
      const today = new Date().toISOString().split("T")[0];
      if (record.attendance_date !== today) {
        toast.error("You can only edit today's attendance");
        return;
      }
    }
    
    const { data, error } = await supabase
      .from("attendance_entries")
      .select(`
        *,
        worker:workers(name, display_id, wage_type, daily_wage, monthly_salary, paid_leaves_allowed)
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
    
    // Get profiles for staff users (user_id)
    const userIds = data.filter(d => d.user_id).map(d => d.user_id!);
    const profilesMap: Record<string, { full_name: string }> = {};
    
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      
      profiles?.forEach(p => { profilesMap[p.user_id] = { full_name: p.full_name }; });
    }
    
    const entriesWithProfiles = data.map(e => ({
      ...e,
      profile: e.user_id ? profilesMap[e.user_id] || null : null
    }));
    
    setEditingRecord(record);
    setEditEntries(entriesWithProfiles as AttendanceEntry[]);
    setShowEditEntriesDialog(true);
  };

  const updateEntryMutation = useMutation({
    mutationFn: async (entry: AttendanceEntry) => {
      // Operator can only edit today's attendance (checked on open, but double-check here)
      if (isOperator && editingRecord) {
        const today = new Date().toISOString().split("T")[0];
        if (editingRecord.attendance_date !== today) {
          throw new Error("You can only edit today's attendance");
        }
      }
      
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

  // Save all entries mutation
  const saveAllEntriesMutation = useMutation({
    mutationFn: async (entries: AttendanceEntry[]) => {
      for (const entry of entries) {
        // Force recalculate before save to get correct hourly_rate
        let hourlyRate = entry.hourly_rate || 0;
        if (entry.is_present && entry.check_in_time && entry.check_out_time) {
          const pay = calculateWorkerPay(entry.worker, entry.check_in_time, entry.check_out_time, shiftRates);
          hourlyRate = pay.rate;
        }
        
        const updateData = {
          is_present: entry.is_present,
          is_on_leave: entry.is_on_leave || false,
          check_in_time: entry.check_in_time,
          check_out_time: entry.check_out_time,
          hourly_rate: hourlyRate,
          adjustment_amount: entry.adjustment_amount || 0,
          adjustment_reason: entry.adjustment_reason,
          notes: entry.notes,
          updated_at: new Date().toISOString(),
        };
        
        const { error } = await supabase
          .from("attendance_entries")
          .update(updateData)
          .eq("id", entry.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-records"] });
      qc.invalidateQueries({ queryKey: ["attendance-entries"] });
      qc.invalidateQueries({ queryKey: ["worker-balances"] });
      qc.invalidateQueries({ queryKey: ["worker-payments"] });
      qc.invalidateQueries({ queryKey: ["worker-attendance"] });
      toast.success("All changes saved");
      setShowEditEntriesDialog(false);
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  // Finalize mutation - manager/admin can finalize attendance
  const finalizeMutation = useMutation({
    mutationFn: async (record: AttendanceRecord) => {
      const { error } = await supabase
        .from("attendance_records")
        .update({ is_finalized: true })
        .eq("id", record.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-records"] });
      toast.success("Attendance finalized");
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  const handleEditWorker = (w: Worker) => {
    setEditingWorker(w);
    setWorkerName(w.name);
    setWorkerPhone(w.phone || "");
    setWorkerWageType(w.wage_type || "daily");
    setWorkerDailyWage(w.daily_wage?.toString() || "");
    setWorkerMonthlySalary(w.monthly_salary?.toString() || "");
    setWorkerPaidLeaves(w.paid_leaves_allowed?.toString() || "0");
    setWorkerActive(w.is_active ?? true);
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
          ...(canAddWorkers ? [{ label: "Add Worker", onClick: () => { resetWorkerForm(); setShowWorkerDialog(true); }, priority: 1 }] : []),
          ...(isSuperAdmin || isManager ? [{ label: "Make Payment", onClick: () => setShowPaymentDialog(true), priority: 2 }] : []),
          ...(isSuperAdmin || isManager ? [{ label: "Shift Rates", onClick: () => setShowShiftRatesDialog(true), priority: 3 }] : []),
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
                <p className="text-sm text-muted-foreground">Total Staff</p>
                <p className="text-2xl font-bold">{staffUsers.length}</p>
              </div>
              <Briefcase className="h-8 w-8 text-green-500 opacity-80" />
            </div>
</CardContent>
        </Card>
      </div>

      {/* Reports Tab */}
      <TabsContent value="reports" className="mt-4">
        <Card>
            <CardHeader>
              <CardTitle>Attendance & Labor Reports</CardTitle>
              <CardDescription>Monthly summaries and labor costs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Month Selector */}
                <div className="flex items-center gap-4">
                  <div className="space-y-2">
                    <Label>Select Month</Label>
                    <Input 
                      type="month" 
                      value={reportMonth} 
                      onChange={(e) => setReportMonth(e.target.value)} 
                    />
                  </div>
                </div>

                {reportMonth && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground">Total Days Worked</p>
                      <p className="text-2xl font-bold">{reportStats.daysWorked}</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground">Total Workers Present</p>
                      <p className="text-2xl font-bold">{reportStats.workersPresent}</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground">Total Staff Present</p>
                      <p className="text-2xl font-bold">{reportStats.staffPresent}</p>
                    </div>
                    <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-900/20">
                      <p className="text-sm text-muted-foreground">Total Labor Cost</p>
                      <p className="text-2xl font-bold text-green-600">₹{reportStats.totalCost.toLocaleString()}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium">Daily Breakdown</Label>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => {
                        const headers = [
                          { key: "date", label: "Date" },
                          { key: "workersPresent", label: "Workers Present" },
                          { key: "staffPresent", label: "Staff Present" },
                          { key: "batch_numbers", label: "Batch Numbers" },
                          { key: "cost", label: "Cost (₹)" }
                        ];
                        const data = dailyBreakdown.map(r => ({ ...r, cost: r.cost.toLocaleString() }));
                        exportToCSV(data, `attendance_report_${reportMonth}`, headers);
                      }}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" /> CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        const headers = [
                          { key: "date", label: "Date" },
                          { key: "workersPresent", label: "Workers Present" },
                          { key: "staffPresent", label: "Staff Present" },
                          { key: "batch_numbers", label: "Batch Numbers" },
                          { key: "cost", label: "Cost (₹)" }
                        ];
                        const data = dailyBreakdown.map(r => ({ ...r, cost: r.cost.toLocaleString() }));
                        exportToPDF(`Attendance Report - ${reportMonth}`, data, headers);
                      }}>
                        <Download className="h-4 w-4 mr-2" /> PDF
                      </Button>
                    </div>
                  </div>
                  <DataTable
                    columns={[
                      { header: "Date", accessor: (r: any) => r.date, className: "font-medium" },
                      { header: "Workers Present", accessor: (r: any) => r.workersPresent },
                      { header: "Staff Present", accessor: (r: any) => r.staffPresent },
                      { header: "Batch #", accessor: (r: any) => r.batch_numbers || "—" },
                      { header: "Cost", accessor: (r: any) => `₹${r.cost.toLocaleString()}` },
                    ]}
                    data={dailyBreakdown}
                    searchKey="date"
                    searchPlaceholder="Search dates..."
                    emptyMessage="No data for selected month"
                  />
                </div>
              </div>
</CardContent>
        </Card>
        </TabsContent>

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
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch 
                checked={workerActive}
                onCheckedChange={setWorkerActive}
              />
            </div>
            <div className="space-y-2">
              <Label>Wage Type</Label>
              <Select value={workerWageType} onValueChange={setWorkerWageType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily Wage</SelectItem>
                  <SelectItem value="monthly">Monthly Salary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {workerWageType === 'daily' && (
              <div className="space-y-2">
                <Label>Daily Wage (₹)</Label>
                <Input 
                  type="number" 
                  value={workerDailyWage} 
                  onChange={(e) => setWorkerDailyWage(e.target.value)} 
                  placeholder="0" 
                />
              </div>
            )}
            {workerWageType === 'monthly' && (
              <div className="space-y-2">
                <Label>Monthly Salary (₹)</Label>
                <Input 
                  type="number" 
                  value={workerMonthlySalary} 
                  onChange={(e) => setWorkerMonthlySalary(e.target.value)} 
                  placeholder="0" 
                />
                <Label className="text-xs text-muted-foreground mt-2">Paid Leaves per Month</Label>
                <Input 
                  type="number" 
                  value={workerPaidLeaves} 
                  onChange={(e) => setWorkerPaidLeaves(e.target.value)} 
                  placeholder="0" 
                />
              </div>
            )}
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

      {/* Edit Staff Salary Dialog */}
      <Dialog open={showStaffDialog} onOpenChange={(open) => { setShowStaffDialog(open); if (!open) setEditingStaff(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Staff Salary - {editingStaff?.profiles?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Wage Type</Label>
              <Select value={staffWageType} onValueChange={setStaffWageType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily Wage</SelectItem>
                  <SelectItem value="monthly">Monthly Salary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {staffWageType === 'daily' && (
              <div className="space-y-2">
                <Label>Daily Wage (₹)</Label>
                <Input 
                  type="number" 
                  value={staffDailyWage} 
                  onChange={(e) => setStaffDailyWage(e.target.value)} 
                  placeholder="0" 
                />
              </div>
            )}
            {staffWageType === 'monthly' && (
              <div className="space-y-2">
                <Label>Monthly Salary (₹)</Label>
                <Input 
                  type="number" 
                  value={staffMonthlySalary} 
                  onChange={(e) => setStaffMonthlySalary(e.target.value)} 
                  placeholder="0" 
                />
                <Label className="text-xs text-muted-foreground mt-2">Paid Leaves per Month</Label>
                <Input 
                  type="number" 
                  value={staffPaidLeaves} 
                  onChange={(e) => setStaffPaidLeaves(e.target.value)} 
                  placeholder="0" 
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStaffDialog(false)}>Cancel</Button>
            <Button onClick={() => saveStaffMutation.mutate()} disabled={saveStaffMutation.isPending}>
              {saveStaffMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Attendance Dialog */}
      <Dialog open={showAttendanceDialog} onOpenChange={(open) => { setShowAttendanceDialog(open); if (!open) { setIsWorkingDay(true); setBatchNumbers(""); } }}>
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

            {/* Working Day & Batch Numbers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30">
                <Switch 
                  checked={isWorkingDay} 
                  onCheckedChange={setIsWorkingDay}
                  id="workingDay"
                />
                <div>
                  <Label htmlFor="workingDay" className="font-medium cursor-pointer">
                    Working Day
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {isWorkingDay ? "Workers expected to attend" : "Holiday/Closed - no attendance"}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Batch Numbers (optional)</Label>
                <Input 
                  value={batchNumbers} 
                  onChange={(e) => setBatchNumbers(e.target.value)} 
                  placeholder="e.g., BATCH-001, BATCH-002"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated batch numbers for production
                </p>
              </div>
            </div>

            {/* Attendance Entries */}
            <div>
              <Label className="mb-3 block">Attendance ({attendanceEntries.filter(e => e.is_present).length} present)</Label>
              <div className="border rounded-lg divide-y">
                {attendanceEntries.map((entry, index) => {
                  // Calculate pay based on worker type (monthly/daily/shift)
                  const worker = entry.worker;
                  const { amount } = calculateWorkerPay(
                    worker,
                    entry.check_in,
                    entry.check_out,
                    shiftRates
                  );
                  const displayAmount = entry.is_present ? amount : 0;
                  const hours = calculateHours(entry.check_in, entry.check_out);
                  
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
                              {entry.person_type === "worker" ? "Worker" : "Staff"} • {displayAmount > 0 ? `₹${Number(displayAmount).toLocaleString()}` : "₹0"}
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
                  .reduce((sum, e) => {
                    const hrs = calculateHours(e.check_in, e.check_out);
                    const sp = calculateShiftPay(hrs, shiftRates);
                    return sum + (sp?.amount || 0);
                  }, 0)
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
                  {/* Present toggle - 1 col */}
                  <div className="col-span-1">
                    <Switch 
                      checked={entry.is_present ?? true}
                      onCheckedChange={(checked) => {
                        const updated = [...editEntries];
                        updated[index] = { ...updated[index], is_present: checked };
                        // Calculate pay based on worker type (monthly vs daily vs shift)
                        const pay = calculateWorkerPay(
                          entry.worker,
                          entry.check_in_time,
                          entry.check_out_time,
                          shiftRates,
                          updated[index].is_on_leave
                        );
                        updated[index].hourly_rate = pay.rate;
                        updated[index].amount_earned = pay.amount;
                        setEditEntries(updated);
                      }}
                      disabled={isOperator && (editingRecord?.is_finalized || false)}
                    />
                  </div>
                  
                  {/* Leave toggle for monthly workers - 1 col */}
                  {entry.worker?.wage_type === 'monthly' && (
                    <div className="col-span-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Switch 
                              checked={entry.is_on_leave ?? false}
                              onCheckedChange={(checked) => {
                                const updated = [...editEntries];
                                updated[index] = { ...updated[index], is_on_leave: checked };
                                // On leave = get full daily rate regardless of time
                                const pay = calculateWorkerPay(
                                  entry.worker,
                                  entry.check_in_time,
                                  entry.check_out_time,
                                  shiftRates,
                                  checked
                                );
                                updated[index].hourly_rate = pay.rate;
                                updated[index].amount_earned = pay.amount;
                                setEditEntries(updated);
                              }}
                              disabled={isOperator && (editingRecord?.is_finalized || false)}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Paid Leave</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                    
                    {/* Name - 2 cols */}
                    <div className="col-span-2">
                      <p className="font-medium">{entry.worker?.name || entry.profile?.full_name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.worker?.wage_type === 'monthly' ? 'Monthly' : 
                         entry.worker?.wage_type === 'daily' ? 'Daily' : 
                         entry.worker_id ? "Worker" : "Staff"}
                      </p>
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
                          if (entry.is_present && e.target.value && entry.check_out_time) {
                            const pay = calculateWorkerPay(entry.worker, e.target.value, entry.check_out_time, shiftRates);
                            updated[index].hourly_rate = pay.rate;
                            updated[index].amount_earned = pay.amount;
                          }
                          setEditEntries(updated);
                        }}
                        className="h-9"
                        disabled={isOperator && (editingRecord?.is_finalized || false)}
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
                          if (entry.is_present && entry.check_in_time && e.target.value) {
                            const pay = calculateWorkerPay(entry.worker, entry.check_in_time, e.target.value, shiftRates);
                            updated[index].hourly_rate = pay.rate;
                            updated[index].amount_earned = pay.amount;
                          }
                          setEditEntries(updated);
                        }}
                        className="h-9"
                        disabled={isOperator && (editingRecord?.is_finalized || false)}
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
                      disabled={isOperator}
                    />
                  </div>
                  
{/* Amount - 2 cols */}
                  <div className="col-span-2 text-right">
                    <p className="text-xs text-muted-foreground">Earned</p>
                    <p className="font-semibold text-green-600">
                      {entry.is_present 
                        ? `₹${(
                          calculateWorkerPay(
                            entry.worker,
                            entry.check_in_time,
                            entry.check_out_time,
                            shiftRates
                          ).amount || Number(entry.amount_earned)
                        ).toFixed(0)}`
                        : `₹0`
                      }
                    </p>
                  </div>
                </div>
              </div>
            ))}
            </div>
          <DialogFooter>
            <Button 
              onClick={() => saveAllEntriesMutation.mutate(editEntries)} 
              disabled={saveAllEntriesMutation.isPending || (isOperator && (editingRecord?.is_finalized || false))}
            >
              {saveAllEntriesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save All Changes
            </Button>
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
      
      {/* Worker Profile Dialog */}
      <Dialog open={showWorkerProfileDialog} onOpenChange={setShowWorkerProfileDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Worker Profile - {selectedWorkerProfile?.name}</DialogTitle>
            <DialogDescription>
              {selectedWorkerProfile?.display_id} • {selectedWorkerProfile?.phone || "No phone"} • {selectedWorkerProfile?.is_active ? "Active" : "Inactive"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {(() => {
              const balance = workerBalances.find(b => b.worker_id === selectedWorkerProfile?.id);
              const earned = balance ? Number(balance.total_earned) : 0;
              const paid = balance ? Number(balance.total_paid) : 0;
              const bal = balance ? Number(balance.outstanding_balance) : 0;
              return (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 border rounded-lg">
                      <p className="text-xs text-muted-foreground">Total Earned</p>
                      <p className="text-lg font-semibold">₹{earned.toLocaleString()}</p>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <p className="text-xs text-muted-foreground">Total Paid</p>
                      <p className="text-lg font-semibold">₹{paid.toLocaleString()}</p>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className={`text-lg font-semibold ${bal > 0 ? "text-red-600" : "text-green-600"}`}>
                        ₹{Math.abs(bal).toLocaleString()}{bal > 0 ? " (owed)" : bal < 0 ? " (advance)" : ""}
                      </p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Ledger</Label>
                    <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
                      {workerAttendance.length === 0 && workerPayments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No transactions yet.</p>
                      ) : (
                        <>
                          {workerAttendance.map((entry: any) => (
                            <div key={entry.id} className="flex justify-between text-sm p-2 border-b">
                              <span className="text-muted-foreground">
                                {entry.record?.attendance_date ? format(parseISO(entry.record.attendance_date), "dd MMM yyyy") : "—"}
                              </span>
                              <span className="text-green-600">+₹{Number(entry.amount_earned).toFixed(0)}</span>
                            </div>
                          ))}
                          {workerPayments.map((payment: any) => (
                            <div key={payment.id} className="flex justify-between text-sm p-2 border-b">
                              <span className="text-muted-foreground">
                                {format(parseISO(payment.created_at), "dd MMM yyyy")}
                              </span>
                              <span className="text-red-600">-₹{Number(payment.amount).toFixed(0)}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkerProfileDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
