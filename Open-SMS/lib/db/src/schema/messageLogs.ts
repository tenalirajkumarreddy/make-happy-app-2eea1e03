import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const messageLogsTable = pgTable("message_logs", {
  id: serial("id").primaryKey(),
  messageId: text("message_id").notNull().unique(),
  to: text("to").notNull(),
  toMasked: text("to_masked").notNull(),
  template: text("template"),
  body: text("body").notNull(),
  status: text("status").notNull().default("queued"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMessageLogSchema = createInsertSchema(messageLogsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMessageLog = z.infer<typeof insertMessageLogSchema>;
export type MessageLog = typeof messageLogsTable.$inferSelect;
