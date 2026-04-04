import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";

/**
 * Hook that checks for fixed costs due soon and sends reminder notifications
 * to managers. Only runs once per session to avoid duplicate notifications.
 */
export function useFixedCostReminders() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "super_admin" || role === "manager";

  // Fetch fixed costs that are due soon or overdue
  const { data: dueFixedCosts } = useQuery({
    queryKey: ["fixed-costs-due-check"],
    queryFn: async () => {
      const today = new Date();
      const checkDate = new Date();
      checkDate.setDate(checkDate.getDate() + 7); // Check next 7 days

      const { data, error } = await supabase
        .from("fixed_costs")
        .select("id, name, amount, next_due_date, reminder_days_before, last_reminder_sent")
        .eq("is_active", true)
        .lte("next_due_date", checkDate.toISOString().split("T")[0])
        .order("next_due_date");
      
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin,
    staleTime: 1000 * 60 * 60, // Only check once per hour
  });

  useEffect(() => {
    if (!isAdmin || !user || !dueFixedCosts || dueFixedCosts.length === 0) return;

    const sendReminders = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split("T")[0];

      // Get admin user IDs to notify
      const adminIds = await getAdminUserIds();
      if (adminIds.length === 0) return;

      for (const fc of dueFixedCosts) {
        const dueDate = new Date(fc.next_due_date);
        dueDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const reminderDays = fc.reminder_days_before || 3;

        // Check if we should send a reminder
        const shouldRemind = daysUntil <= reminderDays;
        const lastReminder = fc.last_reminder_sent ? new Date(fc.last_reminder_sent).toISOString().split("T")[0] : null;
        const alreadySentToday = lastReminder === todayStr;

        if (shouldRemind && !alreadySentToday) {
          // Determine notification urgency
          let title: string;
          let message: string;
          
          if (daysUntil < 0) {
            title = `⚠️ Fixed Cost Overdue: ${fc.name}`;
            message = `${fc.name} payment of ₹${Number(fc.amount).toLocaleString()} was due ${Math.abs(daysUntil)} days ago!`;
          } else if (daysUntil === 0) {
            title = `🔔 Fixed Cost Due Today: ${fc.name}`;
            message = `${fc.name} payment of ₹${Number(fc.amount).toLocaleString()} is due today!`;
          } else {
            title = `📅 Fixed Cost Due Soon: ${fc.name}`;
            message = `${fc.name} payment of ₹${Number(fc.amount).toLocaleString()} is due in ${daysUntil} day${daysUntil > 1 ? 's' : ''}.`;
          }

          // Send notification to all admins
          await sendNotificationToMany(adminIds, {
            title,
            message,
            type: "system",
            entityType: "fixed_cost",
            entityId: fc.id,
          });

          // Update last_reminder_sent
          await supabase
            .from("fixed_costs")
            .update({ last_reminder_sent: todayStr })
            .eq("id", fc.id);
        }
      }

      // Invalidate to reflect updates
      qc.invalidateQueries({ queryKey: ["fixed-costs"] });
    };

    sendReminders();
  }, [dueFixedCosts, isAdmin, user, qc]);
}
