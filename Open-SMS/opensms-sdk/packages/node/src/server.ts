import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import {
  type AuthMessage,
  type TemplatesSyncMessage,
  type StatusMessage,
  type SendParams,
  type SmsStatus,
  generateId,
} from './protocol.js';
import { TemplateStore } from './template.js';
import { generateQRPage } from './qr.js';

export interface OpenSMSServerConfig {
  apiKey: string;
  deviceName?: string;
}

export class OpenSMSServer extends EventEmitter {
  private readonly apiKey: string;
  private readonly deviceName: string;
  private readonly wss: WebSocketServer;
  private readonly templateStore = new TemplateStore();
  private readonly pendingJobs = new Map<string, {
    resolve: (s: SmsStatus) => void;
    reject:  (e: Error) => void;
    timer:   ReturnType<typeof setTimeout>;
  }>();

  private connectedSocket: WebSocket | null = null;
  private connectedDeviceId: string | null = null;
  private connectedAt: number | null = null;

  constructor(config: OpenSMSServerConfig) {
    super();
    this.apiKey     = config.apiKey;
    this.deviceName = config.deviceName ?? 'My SMS Gateway';
    this.wss        = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
  }

  get isConnected(): boolean {
    return this.connectedSocket?.readyState === WebSocket.OPEN;
  }

  get templates() {
    return this.templateStore;
  }

  async send(params: SendParams): Promise<SmsStatus> {
    if (!this.isConnected) {
      throw new Error('No APK connected. Visit /opensms/qr to connect a phone first.');
    }

    const messageId = generateId();
    let body: string;

    if (params.body) {
      body = params.body;
    } else if (params.template) {
      body = this.templateStore.render({ template: params.template, vars: params.vars });
    } else {
      throw new Error('Provide either body or template.');
    }

    this.connectedSocket!.send(JSON.stringify({
      type: 'job',
      messageId,
      to:   params.to,
      body,
      template: params.template,
    }));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingJobs.delete(messageId);
        reject(new Error(`SMS timeout: no status received in 30s for ${messageId}`));
      }, 30_000);

      this.pendingJobs.set(messageId, { resolve, reject, timer });
    });
  }

  handler(): {
    handleUpgrade: (req: IncomingMessage, socket: any, head: Buffer, wsPath: string) => boolean;
    handleHttp: (req: IncomingMessage, res: any, basePath: string, publicUrl: string) => Promise<boolean>;
    attach: (server: Server, basePath?: string, publicUrl?: string) => void;
  } {
    const self = this;

    return {
      handleUpgrade(req, socket, head, wsPath) {
        if (req.url !== wsPath) return false;
        self.wss.handleUpgrade(req, socket, head, (ws) => {
          self.wss.emit('connection', ws, req);
        });
        return true;
      },

      async handleHttp(req, res, basePath, publicUrl) {
        const url = req.url?.split('?')[0] ?? '';

        if (url === `${basePath}/qr` || url === `${basePath}/qr/`) {
          const wsUrl = `${publicUrl.replace(/^http/, 'ws')}${basePath}/ws`;
          const html  = await generateQRPage({
            wsUrl,
            apiKey: self.apiKey,
            baseUrl: publicUrl,
            isConnected: self.isConnected,
          });
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
          return true;
        }

        if (url === `${basePath}/status`) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            connected:   self.isConnected,
            deviceId:    self.connectedDeviceId,
            connectedAt: self.connectedAt,
          }));
          return true;
        }

        return false;
      },

      attach(server, basePath = '/opensms', publicUrl = '') {
        server.on('upgrade', (req, socket, head) => {
          if (req.url === `${basePath}/ws`) {
            self.wss.handleUpgrade(req, socket, head, (ws) => {
              self.wss.emit('connection', ws, req);
            });
          }
        });

        const origListener = server.listeners('request')[0] as any;
        server.removeAllListeners('request');
        server.on('request', async (req, res) => {
          const handled = await self.handler().handleHttp(req, res, basePath, publicUrl || `http://localhost`);
          if (!handled && origListener) origListener(req, res);
        });
      },
    };
  }

  private handleConnection(ws: WebSocket) {
    let authed = false;

    const authTimeout = setTimeout(() => {
      if (!authed) ws.terminate();
    }, 10_000);

    ws.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (!authed) {
        if (msg.type === 'auth') {
          const authMsg = msg as AuthMessage;
          if (authMsg.apiKey !== this.apiKey) {
            ws.send(JSON.stringify({ type: 'auth_fail', reason: 'Invalid API key' }));
            ws.terminate();
            return;
          }
          clearTimeout(authTimeout);
          authed = true;
          this.connectedSocket   = ws;
          this.connectedDeviceId = authMsg.deviceId;
          this.connectedAt       = Date.now();
          ws.send(JSON.stringify({ type: 'auth_ok' }));
          this.emit('connected', { deviceId: authMsg.deviceId });
        }
        return;
      }

      if (msg.type === 'templates_sync') {
        const syncMsg = msg as TemplatesSyncMessage;
        this.templateStore.syncFromDevice(syncMsg.templates);
        this.emit('templates_sync', syncMsg.templates);
        return;
      }

      if (msg.type === 'status') {
        const statusMsg = msg as StatusMessage;
        const pending = this.pendingJobs.get(statusMsg.messageId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingJobs.delete(statusMsg.messageId);
          const result: SmsStatus = {
            messageId: statusMsg.messageId,
            status:    statusMsg.status,
            error:     statusMsg.error,
            timestamp: statusMsg.timestamp,
          };
          if (statusMsg.status === 'failed') {
            pending.reject(Object.assign(new Error(statusMsg.error ?? 'SMS failed'), result));
          } else {
            pending.resolve(result);
          }
        }
        this.emit('status', statusMsg);
        return;
      }

      if (msg.type === 'pong') return;
    });

    ws.on('close', () => {
      if (this.connectedSocket === ws) {
        this.connectedSocket   = null;
        this.connectedDeviceId = null;
        this.connectedAt       = null;
        this.emit('disconnected');
        for (const [id, pending] of this.pendingJobs) {
          clearTimeout(pending.timer);
          pending.reject(new Error('APK disconnected while waiting for delivery'));
          this.pendingJobs.delete(id);
        }
      }
    });
  }
}
