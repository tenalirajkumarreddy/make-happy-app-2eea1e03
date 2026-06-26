/**
 * Realtime Health Monitoring Utility
 * 
 * Provides debugging and monitoring tools for Supabase Realtime channels.
 * Use in development to inspect channel health and diagnose sync issues.
 * 
 * @example
 * // In browser console or debug panel:
 * import { getChannelStatuses, getMobileChannelStatuses, logRealtimeHealth } from '@/lib/realtimeHealth';
 * 
 * // Get all channel statuses
 * const statuses = getChannelStatuses();
 * console.table(statuses);
 * 
 * // Log health summary
 * logRealtimeHealth();
 */

import { supabase } from "@/integrations/supabase/client";
import { getChannelStatuses as getGlobalChannelStatuses } from "@/hooks/useRealtimeSync";
import { getMobileChannelStatuses } from "@/hooks/useMobileRealtimeSync";

export interface ChannelHealthStatus {
  name: string;
  status: string;
  tables: string[];
  lastStatusChange: string;
  retryCount: number;
  age: string;
}

export interface RealtimeHealthReport {
  timestamp: string;
  isConnected: boolean;
  globalChannels: ChannelHealthStatus[];
  mobileChannels: ChannelHealthStatus[];
  totalSubscriptions: number;
  unhealthyChannels: ChannelHealthStatus[];
  summary: string;
}

/**
 * Get status of all global realtime channels
 */
export function getChannelStatuses(): ChannelHealthStatus[] {
  const statuses = getGlobalChannelStatuses();
  return statuses.map((s) => ({
    ...s,
    age: getTimeAgo(new Date(s.lastStatusChange)),
  }));
}

/**
 * Get status of all mobile realtime channels
 */
export function getMobileStatuses(): ChannelHealthStatus[] {
  const statuses = getMobileChannelStatuses();
  return statuses.map((s) => ({
    ...s,
    tables: [],
    lastStatusChange: new Date().toISOString(),
    retryCount: 0,
    age: "N/A",
  }));
}

/**
 * Get comprehensive realtime health report
 */
export function getRealtimeHealthReport(): RealtimeHealthReport {
  const globalChannels = getChannelStatuses();
  const mobileChannels = getMobileStatuses();
  const allChannels = [...globalChannels, ...mobileChannels];
  
  const unhealthyChannels = allChannels.filter(
    (ch) => ch.status !== "SUBSCRIBED" && ch.status !== "connected"
  );
  
  const isConnected = unhealthyChannels.length === 0 && allChannels.length > 0;
  
  let summary = "Healthy";
  if (allChannels.length === 0) {
    summary = "No active channels";
  } else if (unhealthyChannels.length > 0) {
    summary = `${unhealthyChannels.length} unhealthy channel(s)`;
  }
  
  return {
    timestamp: new Date().toISOString(),
    isConnected,
    globalChannels,
    mobileChannels,
    totalSubscriptions: allChannels.length,
    unhealthyChannels,
    summary,
  };
}

/**
 * Log realtime health to console (for debugging)
 */
export function logRealtimeHealth() {
  const report = getRealtimeHealthReport();
  
  console.group("📡 Realtime Health Report");
  console.log("Timestamp:", report.timestamp);
  console.log("Status:", report.summary);
  console.log("Total Channels:", report.totalSubscriptions);
  
  if (report.globalChannels.length > 0) {
    console.log("\n🌐 Global Channels:");
    console.table(report.globalChannels.map((ch) => ({
      Name: ch.name,
      Status: ch.status,
      Tables: ch.tables.length,
      Retries: ch.retryCount,
      "Last Change": ch.lastStatusChange,
      Age: ch.age,
    })));
  }
  
  if (report.mobileChannels.length > 0) {
    console.log("\n📱 Mobile Channels:");
    console.table(report.mobileChannels.map((ch) => ({
      Name: ch.name,
      Status: ch.status,
      Age: ch.age,
    })));
  }
  
  if (report.unhealthyChannels.length > 0) {
    console.warn("\n⚠️ Unhealthy Channels:");
    console.table(report.unhealthyChannels.map((ch) => ({
      Name: ch.name,
      Status: ch.status,
      Retries: ch.retryCount,
      Age: ch.age,
    })));
  }
  
  console.groupEnd();
  
  return report;
}

/**
 * Check if realtime is connected and healthy
 */
export function isRealtimeHealthy(): boolean {
  const report = getRealtimeHealthReport();
  return report.isConnected;
}

/**
 * Get count of active channels
 */
export function getActiveChannelCount(): number {
  const globalCount = getChannelStatuses().length;
  const mobileCount = getMobileStatuses().length;
  return globalCount + mobileCount;
}

/**
 * Get count of unhealthy channels
 */
export function getUnhealthyChannelCount(): number {
  const globalUnhealthy = getChannelStatuses().filter(
    (ch) => ch.status !== "SUBSCRIBED"
  ).length;
  const mobileUnhealthy = getMobileStatuses().filter(
    (ch) => ch.status !== "connected"
  ).length;
  return globalUnhealthy + mobileUnhealthy;
}

/**
 * Helper: Format time ago
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.floor(diffHour / 24)}d ago`;
}

/**
 * Manually trigger reconnection of Supabase Realtime
 * Use this in debugging or recovery scenarios
 */
export async function forceRealtimeReconnect(): Promise<void> {
  try {
    console.log("[RealtimeHealth] Forcing realtime reconnect...");
    await supabase.realtime.connect();
    console.log("[RealtimeHealth] Realtime reconnected successfully");
  } catch (err) {
    console.error("[RealtimeHealth] Failed to reconnect:", err);
    throw err;
  }
}

/**
 * Watch realtime health and log warnings
 * Call this once in your app initialization for continuous monitoring
 */
export function watchRealtimeHealth(intervalMs = 30000): () => void {
  const intervalId = setInterval(() => {
    const report = getRealtimeHealthReport();
    
    if (report.unhealthyChannels.length > 0) {
      console.warn("[RealtimeHealth] Unhealthy channels detected:", report.unhealthyChannels);
    }
    
    if (import.meta.env.DEV) {
      console.log("[RealtimeHealth] Status:", report.summary);
    }
  }, intervalMs);
  
  return () => clearInterval(intervalId);
}