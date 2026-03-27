import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  gatewayConfigTable,
  templatesTable,
  messageLogsTable,
} from "@workspace/db";
import {
  SendMessageBody,
  GetMessageStatusParams,
  GetMessageStatusResponse,
} from "@workspace/api-zod";
import {
  sendToGateway,
  fetchGatewayMessageStatus,
  maskPhone,
  extractVars,
  renderTemplate,
} from "../lib/gatewayClient";

const router: IRouter = Router();

router.post("/messages/send", async (req, res): Promise<void> => {
  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { to, template: templateName, vars, body, callbackUrl } = parsed.data;

  const [config] = await db.select().from(gatewayConfigTable).limit(1);
  if (!config) {
    res.status(503).json({ error: "Gateway not configured" });
    return;
  }

  let renderedBody = body ?? "";
  let resolvedTemplateName = templateName ?? null;

  if (templateName) {
    const [tmpl] = await db
      .select()
      .from(templatesTable)
      .where(eq(templatesTable.name, templateName));

    if (!tmpl) {
      res.status(400).json({ error: "template_not_found", code: "template_not_found" });
      return;
    }

    const templateVars = extractVars(tmpl.body);
    const supplied = vars ?? {};
    const missing = templateVars.filter((v) => !(v in supplied));
    if (missing.length > 0) {
      res.status(400).json({
        error: `missing_variable: ${missing.join(", ")}`,
        code: "missing_variable",
      });
      return;
    }

    renderedBody = renderTemplate(tmpl.body, supplied as Record<string, string>);
  }

  if (!renderedBody) {
    res.status(400).json({ error: "Either template or body is required" });
    return;
  }

  if (renderedBody.length > 640) {
    res.status(400).json({ error: "body_too_long", code: "body_too_long" });
    return;
  }

  const gatewayPayload: Record<string, unknown> = { to, body: renderedBody };
  if (callbackUrl) gatewayPayload.callback_url = callbackUrl;

  try {
    const result = await sendToGateway(config.gatewayUrl, config.apiKey, gatewayPayload);

    await db.insert(messageLogsTable).values({
      messageId: result.message_id,
      to,
      toMasked: maskPhone(to),
      template: resolvedTemplateName,
      body: renderedBody,
      status: "queued",
    });

    res.status(202).json({
      messageId: result.message_id,
      status: result.status,
      queuedAt: result.queued_at,
    });
  } catch (err: unknown) {
    const e = err as { httpStatus?: number; code?: string; message?: string };
    if (e.httpStatus === 429) {
      res.status(429).json({ error: "rate_limited", code: "rate_limited" });
      return;
    }
    if (e.httpStatus === 503) {
      res.status(503).json({ error: "queue_full", code: "queue_full" });
      return;
    }
    res.status(503).json({
      error: e.message ?? "Gateway unreachable",
      code: "gateway_error",
    });
  }
});

router.get("/messages/:messageId/status", async (req, res): Promise<void> => {
  const params = GetMessageStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { messageId } = params.data;

  const [logEntry] = await db
    .select()
    .from(messageLogsTable)
    .where(eq(messageLogsTable.messageId, messageId));

  if (!logEntry) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  const [config] = await db.select().from(gatewayConfigTable).limit(1);
  if (config) {
    try {
      const status = await fetchGatewayMessageStatus(
        config.gatewayUrl,
        config.apiKey,
        messageId,
      );

      await db
        .update(messageLogsTable)
        .set({
          status: status.status,
          sentAt: status.sent_at ? new Date(status.sent_at) : undefined,
          deliveredAt: status.delivered_at
            ? new Date(status.delivered_at)
            : undefined,
          error: status.error ?? undefined,
        })
        .where(eq(messageLogsTable.messageId, messageId));

      res.json(
        GetMessageStatusResponse.parse({
          messageId: status.message_id,
          to: maskPhone(status.to),
          template: status.template ?? null,
          status: status.status,
          sentAt: status.sent_at ?? null,
          deliveredAt: status.delivered_at ?? null,
          error: status.error ?? null,
        }),
      );
      return;
    } catch {
      // fallback to DB data
    }
  }

  res.json(
    GetMessageStatusResponse.parse({
      messageId: logEntry.messageId,
      to: logEntry.toMasked,
      template: logEntry.template ?? null,
      status: logEntry.status,
      sentAt: logEntry.sentAt?.toISOString() ?? null,
      deliveredAt: logEntry.deliveredAt?.toISOString() ?? null,
      error: logEntry.error ?? null,
    }),
  );
});

export default router;
