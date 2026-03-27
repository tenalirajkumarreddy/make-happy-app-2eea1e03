import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gatewayConfigTable = pgTable("gateway_config", {
  id: serial("id").primaryKey(),
  gatewayUrl: text("gateway_url").notNull(),
  apiKey: text("api_key").notNull(),
  name: text("name").notNull().default("My Phone Gateway"),
  isDefault: boolean("is_default").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGatewayConfigSchema = createInsertSchema(gatewayConfigTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGatewayConfig = z.infer<typeof insertGatewayConfigSchema>;
export type GatewayConfig = typeof gatewayConfigTable.$inferSelect;
