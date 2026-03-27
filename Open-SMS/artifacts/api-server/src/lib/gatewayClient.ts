export interface GatewayHealthData {
  status: string;
  uptime_seconds?: number;
  queue_depth?: number;
  sms_sent_today?: number;
  paused?: boolean;
  version?: string;
}

export async function fetchGatewayHealth(
  gatewayUrl: string,
): Promise<GatewayHealthData> {
  const url = `${gatewayUrl.replace(/\/$/, "")}/health`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Gateway returned ${response.status}`);
  }

  return response.json() as Promise<GatewayHealthData>;
}

export async function sendToGateway(
  gatewayUrl: string,
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<{ message_id: string; status: string; queued_at: string }> {
  const url = `${gatewayUrl.replace(/\/$/, "")}/send`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    const err = Object.assign(new Error(body.error ?? "Gateway error"), {
      httpStatus: response.status,
      code: body.error,
    });
    throw err;
  }

  return response.json() as Promise<{
    message_id: string;
    status: string;
    queued_at: string;
  }>;
}

export async function fetchGatewayMessageStatus(
  gatewayUrl: string,
  apiKey: string,
  messageId: string,
): Promise<{
  message_id: string;
  to: string;
  template?: string;
  status: string;
  sent_at?: string;
  delivered_at?: string;
  error?: string;
}> {
  const url = `${gatewayUrl.replace(/\/$/, "")}/status/${messageId}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Gateway returned ${response.status}`);
  }

  return response.json() as Promise<{
    message_id: string;
    to: string;
    template?: string;
    status: string;
    sent_at?: string;
    delivered_at?: string;
    error?: string;
  }>;
}

export function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  const visible = phone.slice(-4);
  const masked = phone.slice(0, -4).replace(/\d/g, "*");
  return masked + visible;
}

export function extractVars(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

export function renderTemplate(
  body: string,
  vars: Record<string, string>,
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}
