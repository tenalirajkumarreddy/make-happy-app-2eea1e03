/**
 * Custom Next.js server to handle WebSocket upgrade for /api/opensms/ws
 * Run:  node server.mjs
 */
import { createServer } from 'http';
import next from 'next';
import { gateway } from './lib/gateway.js';

const dev  = process.env.NODE_ENV !== 'production';
const app  = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => handle(req, res));

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/api/opensms/ws') {
    gateway.handler().handleUpgrade(req, socket, head, '/api/opensms/ws');
  }
});

server.listen(3000, () => {
  console.log('> OpenSMS Next.js server ready on http://localhost:3000');
  console.log('> QR page: http://localhost:3000/api/opensms/qr');
});
