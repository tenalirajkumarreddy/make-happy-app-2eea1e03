import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenSMSServer } from '../server.js';
import { generateQRPage } from '../qr.js';

export function createNextHandler(gateway: OpenSMSServer, opts: {
  publicUrl: string;
  basePath?: string;
}) {
  const { publicUrl, basePath = '/api/opensms' } = opts;

  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    const path = (req.query['path'] as string[]) ?? [];
    const route = path.join('/');

    if (route === 'qr' || route === 'qr/') {
      const wsUrl = `${publicUrl.replace(/^http/, 'ws')}${basePath}/ws`;
      const html  = await generateQRPage({
        wsUrl,
        apiKey: (gateway as any).apiKey,
        baseUrl: publicUrl,
        isConnected: gateway.isConnected,
      });
      res.setHeader('Content-Type', 'text/html');
      res.status(200).send(html);
      return;
    }

    if (route === 'status') {
      res.status(200).json({
        connected:   gateway.isConnected,
      });
      return;
    }

    res.status(404).json({ error: 'Not found' });
  };
}
