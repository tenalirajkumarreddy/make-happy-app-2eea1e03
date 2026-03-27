import { Router, type IRouter } from "express";
import { db, gatewayConfigTable } from "@workspace/db";
import {
  UpdateGatewayConfigBody,
  GetGatewayConfigResponse,
  UpdateGatewayConfigResponse,
  GetGatewayHealthResponse,
} from "@workspace/api-zod";
import { fetchGatewayHealth } from "../lib/gatewayClient";

const router: IRouter = Router();

async function getOrCreateDefaultConfig() {
  const existing = await db.select().from(gatewayConfigTable).limit(1);
  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(gatewayConfigTable)
    .values({
      gatewayUrl: "http://192.168.1.42:8080",
      apiKey: "",
      name: "My Phone Gateway",
      isDefault: true,
    })
    .returning();
  return created;
}

router.get("/gateway/config", async (req, res): Promise<void> => {
  const config = await getOrCreateDefaultConfig();
  res.json(GetGatewayConfigResponse.parse(config));
});

router.put("/gateway/config", async (req, res): Promise<void> => {
  const parsed = UpdateGatewayConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db.select().from(gatewayConfigTable).limit(1);

  if (existing.length === 0) {
    const [created] = await db
      .insert(gatewayConfigTable)
      .values({ ...parsed.data, isDefault: true })
      .returning();
    res.json(UpdateGatewayConfigResponse.parse(created));
    return;
  }

  const { eq } = await import("drizzle-orm");
  const [updated] = await db
    .update(gatewayConfigTable)
    .set(parsed.data)
    .where(eq(gatewayConfigTable.id, existing[0].id))
    .returning();

  res.json(UpdateGatewayConfigResponse.parse(updated));
});

router.get("/gateway/health", async (req, res): Promise<void> => {
  const config = await getOrCreateDefaultConfig();

  try {
    const health = await fetchGatewayHealth(config.gatewayUrl);
    res.json(
      GetGatewayHealthResponse.parse({
        status: health.status ?? "ok",
        uptimeSeconds: health.uptime_seconds ?? null,
        queueDepth: health.queue_depth ?? null,
        smsSentToday: health.sms_sent_today ?? null,
        paused: health.paused ?? null,
        version: health.version ?? null,
        gatewayUrl: config.gatewayUrl,
      }),
    );
  } catch {
    res.json(
      GetGatewayHealthResponse.parse({
        status: "unreachable",
        uptimeSeconds: null,
        queueDepth: null,
        smsSentToday: null,
        paused: null,
        version: null,
        gatewayUrl: config.gatewayUrl,
      }),
    );
  }
});

export default router;
