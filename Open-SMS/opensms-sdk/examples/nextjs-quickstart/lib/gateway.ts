/**
 * Singleton OpenSMS gateway for the Next.js app.
 * Import { gateway } wherever you need to send SMS.
 */
import { OpenSMSServer } from 'opensms';

function createGateway() {
  const gw = new OpenSMSServer({
    apiKey: process.env.OPENSMS_API_KEY ?? 'change-me-in-env',
  });
  gw.on('connected',    ({ deviceId }: { deviceId: string }) => console.log('APK connected:', deviceId));
  gw.on('disconnected', () => console.log('APK disconnected'));
  return gw;
}

declare global { var _openSMSGateway: OpenSMSServer | undefined; }
export const gateway = global._openSMSGateway ??= createGateway();
