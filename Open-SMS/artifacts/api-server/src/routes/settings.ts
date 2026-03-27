import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import {
  GetSettingsResponse,
  UpdateSettingsBody,
  UpdateSettingsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const existing = await db.select().from(settingsTable).limit(1);
  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(settingsTable)
    .values({
      autoStart: true,
      notifyOnFailure: true,
      smsRateLimit: 10,
    })
    .returning();
  return created;
}

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(
    GetSettingsResponse.parse({
      ...settings,
      webhookUrl: settings.webhookUrl ?? null,
    }),
  );
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await getOrCreateSettings();

  const [updated] = await db
    .update(settingsTable)
    .set(parsed.data)
    .where(eq(settingsTable.id, existing.id))
    .returning();

  res.json(
    UpdateSettingsResponse.parse({
      ...updated,
      webhookUrl: updated.webhookUrl ?? null,
    }),
  );
});

export default router;
