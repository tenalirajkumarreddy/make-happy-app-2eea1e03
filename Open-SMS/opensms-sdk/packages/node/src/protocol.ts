// ── WebSocket message types (APK ↔ Backend) ───────────────────────────────

export interface AuthMessage {
  type: 'auth';
  apiKey: string;
  deviceId: string;
}

export interface AuthOkMessage {
  type: 'auth_ok';
}

export interface AuthFailMessage {
  type: 'auth_fail';
  reason: string;
}

export interface TemplateSyncItem {
  name: string;
  body: string;
  vars: string[];
}

export interface TemplatesSyncMessage {
  type: 'templates_sync';
  templates: TemplateSyncItem[];
}

export interface JobMessage {
  type: 'job';
  messageId: string;
  to: string;
  body: string;
  template?: string;
}

export interface StatusMessage {
  type: 'status';
  messageId: string;
  status: 'sent' | 'delivered' | 'failed';
  error?: string;
  timestamp: string;
}

export interface PingMessage { type: 'ping' }
export interface PongMessage { type: 'pong' }

export type InboundMessage =
  | AuthMessage
  | TemplatesSyncMessage
  | StatusMessage
  | PongMessage;

export type OutboundMessage =
  | AuthOkMessage
  | AuthFailMessage
  | JobMessage
  | PingMessage;

export type SmsStatus = {
  messageId: string;
  status: 'sent' | 'delivered' | 'failed';
  error?: string;
  timestamp: string;
};

export type SendParams = {
  to: string;
  template?: string;
  vars?: Record<string, string>;
  body?: string;
};

export function generateId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${ts}${rnd}`;
}
