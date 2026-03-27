import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, messageLogsTable } from "@workspace/db";
import { GetLogsQueryParams, GetLogsResponse, GetStatsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/logs", async (req, res): Promise<void> => {
  const queryParsed = GetLogsQueryParams.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ error: queryParsed.error.message });
    return;
  }

  const { status, limit } = queryParsed.data;
  const maxLimit = limit ?? 500;

  let query = db
    .select()
    .from(messageLogsTable)
    .orderBy(desc(messageLogsTable.createdAt))
    .limit(maxLimit);

  let logs = await query;

  if (status && status !== "all") {
    logs = logs.filter((l) => l.status === status);
  }

  res.json(
    GetLogsResponse.parse({
      logs: logs.map((l) => ({
        ...l,
        template: l.template ?? null,
        sentAt: l.sentAt?.toISOString() ?? null,
        deliveredAt: l.deliveredAt?.toISOString() ?? null,
        error: l.error ?? null,
      })),
      total: logs.length,
    }),
  );
});

router.get("/logs/stats", async (_req, res): Promise<void> => {
  const allLogs = await db.select().from(messageLogsTable);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const sentToday = allLogs.filter(
    (l) =>
      (l.status === "sent" || l.status === "delivered") &&
      l.createdAt >= todayStart,
  ).length;

  const sentThisWeek = allLogs.filter(
    (l) =>
      (l.status === "sent" || l.status === "delivered") &&
      l.createdAt >= weekStart,
  ).length;

  const failedToday = allLogs.filter(
    (l) => l.status === "failed" && l.createdAt >= todayStart,
  ).length;

  const pending = allLogs.filter(
    (l) => l.status === "queued" || l.status === "pending",
  ).length;

  const delivered = allLogs.filter((l) => l.status === "delivered").length;

  res.json(
    GetStatsResponse.parse({
      sentToday,
      sentThisWeek,
      failedToday,
      pending,
      delivered,
      total: allLogs.length,
    }),
  );
});

export default router;
