import type { TemplateSyncItem } from './protocol.js';

export interface Template {
  name: string;
  body: string;
}

const DEFAULT_TEMPLATES: Template[] = [
  { name: 'otp',          body: 'Your OTP is {{otp}}. Valid for {{minutes}} minutes. Do not share.' },
  { name: 'welcome',      body: 'Welcome to {{app_name}}! Your account is ready.' },
  { name: 'order_placed', body: 'Order #{{order_id}} placed. Delivery by {{date}}.' },
  { name: 'payment',      body: 'Payment of ₹{{amount}} received for order #{{order_id}}.' },
  { name: 'alert',        body: '[{{severity}}] {{message}} — {{timestamp}}' },
];

export function extractVars(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map(m => m.slice(2, -2)))];
}

export function render(body: string, vars: Record<string, string> = {}): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in vars)) throw new Error(`Missing template variable: {{${key}}}`);
    return vars[key];
  });
}

export class TemplateStore {
  private templates = new Map<string, Template>();

  constructor() {
    for (const t of DEFAULT_TEMPLATES) {
      this.templates.set(t.name, t);
    }
  }

  syncFromDevice(items: TemplateSyncItem[]): void {
    for (const item of items) {
      this.templates.set(item.name, { name: item.name, body: item.body });
    }
  }

  get(name: string): Template | undefined {
    return this.templates.get(name);
  }

  getAll(): Template[] {
    return [...this.templates.values()];
  }

  render(params: { template: string; vars?: Record<string, string> }): string {
    const tpl = this.templates.get(params.template);
    if (!tpl) throw new Error(`Template not found: "${params.template}". Available: ${[...this.templates.keys()].join(', ')}`);
    return render(tpl.body, params.vars ?? {});
  }

  toSyncItems(): TemplateSyncItem[] {
    return this.getAll().map(t => ({
      name: t.name,
      body: t.body,
      vars: extractVars(t.body),
    }));
  }
}
