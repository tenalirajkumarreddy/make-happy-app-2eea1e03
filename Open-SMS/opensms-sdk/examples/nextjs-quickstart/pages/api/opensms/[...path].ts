/**
 * OpenSMS v3 Next.js Pages Router API route
 * File: pages/api/opensms/[...path].ts
 * ─────────────────────────────────────────────────────────
 * WebSocket connections (/api/opensms/ws) are handled by the
 * custom server below.  This catch-all handles HTTP routes:
 *   GET /api/opensms/qr     → QR code HTML page
 *   GET /api/opensms/status → JSON connection status
 */

import { createNextHandler } from 'opensms/adapters/nextjs';
import { gateway } from '../../../lib/gateway';

const PUBLIC_URL = process.env.PUBLIC_URL ?? 'http://localhost:3000';

export default createNextHandler(gateway, {
  publicUrl: PUBLIC_URL,
  basePath:  '/api/opensms',
});
