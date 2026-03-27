import QRCode from 'qrcode';

export interface QRPayload {
  wsUrl: string;
  apiKey: string;
  deviceName?: string;
}

export async function generateQRDataURL(payload: QRPayload): Promise<string> {
  const json = JSON.stringify(payload);
  return QRCode.toDataURL(json, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300,
    color: { dark: '#00F0A0', light: '#080B14' },
  });
}

export async function generateQRPage(params: {
  wsUrl: string;
  apiKey: string;
  baseUrl: string;
  isConnected: boolean;
}): Promise<string> {
  const { wsUrl, apiKey, baseUrl, isConnected } = params;
  const payload: QRPayload = { wsUrl, apiKey, deviceName: 'OpenSMS Gateway' };
  const qrDataUrl = await generateQRDataURL(payload);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OpenSMS — Connect Your Phone</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #080B14; color: #E8EBF5; font-family: system-ui, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #0F1320; border: 1px solid #1E2640; border-radius: 16px; padding: 40px; max-width: 480px; width: 100%; text-align: center; }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .sub { color: #5A6080; margin-bottom: 32px; font-size: 15px; }
    .qr-wrap { background: #080B14; border: 2px solid #1E2640; border-radius: 12px; padding: 16px; display: inline-block; margin-bottom: 28px; }
    .qr-wrap img { display: block; border-radius: 6px; }
    .status { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 28px; }
    .status.connected { background: #1F00F0A0; color: #00F0A0; }
    .status.waiting   { background: #1FF59E0B; color: #F59E0B; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: pulse 1.4s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .info { background: #161C2E; border: 1px solid #1E2640; border-radius: 10px; padding: 16px; text-align: left; margin-bottom: 24px; }
    .info-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
    .info-row:last-child { margin-bottom: 0; }
    .info-label { color: #5A6080; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    .info-value { color: #00F0A0; font-family: monospace; font-size: 13px; word-break: break-all; }
    .steps { text-align: left; }
    .step { display: flex; gap: 12px; margin-bottom: 12px; color: #5A6080; font-size: 14px; }
    .step-num { color: #00F0A0; font-weight: 700; flex-shrink: 0; }
    .footer { margin-top: 28px; color: #3A4060; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>OpenSMS Gateway</h1>
    <p class="sub">Scan this QR with the OpenSMS Android app to connect your phone</p>

    <div class="qr-wrap">
      <img src="${qrDataUrl}" alt="QR Code" width="280" height="280" />
    </div>

    <div class="status ${isConnected ? 'connected' : 'waiting'}">
      <span class="dot"></span>
      ${isConnected ? 'APK Connected' : 'Waiting for APK…'}
    </div>

    <div class="info">
      <div class="info-row">
        <span class="info-label">WebSocket URL</span>
        <span class="info-value">${wsUrl}</span>
      </div>
      <div class="info-row">
        <span class="info-label">API Key</span>
        <span class="info-value">${apiKey.slice(0, 8)}…${apiKey.slice(-4)}</span>
      </div>
    </div>

    <div class="steps">
      <div class="step"><span class="step-num">1</span> Download the OpenSMS APK and install it on your Android phone</div>
      <div class="step"><span class="step-num">2</span> Open the app and tap <strong style="color:#E8EBF5">"Scan QR Code"</strong></div>
      <div class="step"><span class="step-num">3</span> Point the camera at this QR code</div>
      <div class="step"><span class="step-num">4</span> The phone connects and this page shows <strong style="color:#00F0A0">APK Connected</strong></div>
    </div>

    <div class="footer">
      <a href="${baseUrl}/opensms/status" style="color:#3A4060">Check status →</a>
    </div>
  </div>
  <script>setTimeout(() => location.reload(), 5000)</script>
</body>
</html>`;
}
