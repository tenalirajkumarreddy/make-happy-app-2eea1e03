/**
 * OpenSMS v3 Express Quickstart
 * ───────────────────────────────────────────────────────
 * Run: node server.mjs
 * Then open http://localhost:3000/opensms/qr on your dev machine
 * and scan the QR with your Android phone running the OpenSMS APK.
 */

import express from 'express';
import { createServer } from 'http';
import crypto from 'crypto';
import { OpenSMSServer } from 'opensms';

const app    = express();
const server = createServer(app);

const PUBLIC_URL = process.env.PUBLIC_URL ?? 'http://localhost:3000';
const API_KEY    = process.env.OPENSMS_API_KEY ?? crypto.randomBytes(16).toString('hex');

// ── 1. Create the OpenSMS server ────────────────────────────────────────────
const gateway = new OpenSMSServer({ apiKey: API_KEY });

// ── 2. Upgrade WebSocket requests on /opensms/ws ────────────────────────────
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/opensms/ws') {
    gateway.handler().handleUpgrade(req, socket, head, '/opensms/ws');
  }
});

// ── 3. Mount QR + status routes on /opensms ─────────────────────────────────
app.use('/opensms', (req, res, next) => {
  const handled = gateway.handler().handleHttp(
    req, res, '/opensms', PUBLIC_URL,
  );
  if (!handled) next();
});

// ── 4. Monitor connection events ─────────────────────────────────────────────
gateway.on('connected',    ({ deviceId }) => console.log('✅  APK connected:', deviceId));
gateway.on('disconnected', ()             => console.log('⚠️  APK disconnected'));
gateway.on('status',       (msg)          => console.log('📱  SMS status:', msg));

// ── 5. Your application endpoints ────────────────────────────────────────────
app.use(express.json());

app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const result = await gateway.send({
      to:       phone,
      template: 'otp',
      vars:     { otp, minutes: '10' },
    });
    res.json({ success: true, messageId: result.messageId, status: result.status });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

server.listen(3000, () => {
  console.log(`\n🚀  OpenSMS Express server running`);
  console.log(`   QR page  → ${PUBLIC_URL}/opensms/qr`);
  console.log(`   Status   → ${PUBLIC_URL}/opensms/status`);
  console.log(`   API key  → ${API_KEY}\n`);
});
