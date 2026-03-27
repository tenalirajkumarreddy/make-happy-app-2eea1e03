import type { Request, Response, NextFunction, Router } from 'express';
import type { Server } from 'http';
import { OpenSMSServer } from '../server.js';

export function createExpressRouter(gateway: OpenSMSServer, opts: {
  publicUrl: string;
  basePath?: string;
}): Router {
  const { publicUrl, basePath = '/opensms' } = opts;
  const h = gateway.handler();

  const router = (require('express') as typeof import('express')).Router();

  router.get('/qr', async (_req: Request, res: Response) => {
    await h.handleHttp(_req as any, res as any, basePath, publicUrl);
  });

  router.get('/status', (_req: Request, res: Response) => {
    h.handleHttp(_req as any, res as any, basePath, publicUrl);
  });

  return router;
}

export function attachToServer(server: Server, gateway: OpenSMSServer, opts: {
  basePath?: string;
  publicUrl?: string;
}): void {
  gateway.handler().attach(server, opts.basePath, opts.publicUrl);
}
