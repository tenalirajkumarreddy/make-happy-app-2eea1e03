import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, templatesTable } from "@workspace/db";
import {
  CreateTemplateBody,
  GetTemplateParams,
  UpdateTemplateParams,
  UpdateTemplateBody,
  DeleteTemplateParams,
  ListTemplatesResponse,
  GetTemplateResponse,
  UpdateTemplateResponse,
} from "@workspace/api-zod";
import { extractVars } from "../lib/gatewayClient";

const router: IRouter = Router();

const DEFAULT_TEMPLATES = [
  {
    name: "otp",
    body: "Your OTP is {{otp}}. Valid for {{minutes}} minutes. Do not share.",
  },
  { name: "welcome", body: "Welcome to {{app_name}}! Your account is ready." },
  {
    name: "order_placed",
    body: "Order #{{order_id}} placed. Delivery by {{date}}.",
  },
  {
    name: "payment",
    body: "Payment of ₹{{amount}} received for order #{{order_id}}.",
  },
  {
    name: "alert",
    body: "[{{severity}}] {{message}} — {{timestamp}}",
  },
];

async function seedDefaultTemplates() {
  const existing = await db.select().from(templatesTable);
  if (existing.length === 0) {
    for (const t of DEFAULT_TEMPLATES) {
      await db.insert(templatesTable).values(t).onConflictDoNothing();
    }
  }
}

router.get("/templates", async (_req, res): Promise<void> => {
  await seedDefaultTemplates();
  const templates = await db.select().from(templatesTable);
  res.json(
    ListTemplatesResponse.parse({
      templates: templates.map((t) => ({
        ...t,
        vars: extractVars(t.body),
      })),
    }),
  );
});

router.post("/templates", async (req, res): Promise<void> => {
  const parsed = CreateTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(templatesTable)
    .where(eq(templatesTable.name, parsed.data.name));

  if (existing.length > 0) {
    res.status(409).json({ error: "Template name already exists" });
    return;
  }

  const [template] = await db
    .insert(templatesTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(
    GetTemplateResponse.parse({
      ...template,
      vars: extractVars(template.body),
    }),
  );
});

router.get("/templates/:name", async (req, res): Promise<void> => {
  const params = GetTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [template] = await db
    .select()
    .from(templatesTable)
    .where(eq(templatesTable.name, params.data.name));

  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  res.json(
    GetTemplateResponse.parse({
      ...template,
      vars: extractVars(template.body),
    }),
  );
});

router.put("/templates/:name", async (req, res): Promise<void> => {
  const params = UpdateTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [template] = await db
    .update(templatesTable)
    .set({ body: parsed.data.body })
    .where(eq(templatesTable.name, params.data.name))
    .returning();

  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  res.json(
    UpdateTemplateResponse.parse({
      ...template,
      vars: extractVars(template.body),
    }),
  );
});

router.delete("/templates/:name", async (req, res): Promise<void> => {
  const params = DeleteTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [template] = await db
    .delete(templatesTable)
    .where(eq(templatesTable.name, params.data.name))
    .returning();

  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
