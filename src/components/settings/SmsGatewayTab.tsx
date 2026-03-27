import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, Smartphone, CheckCircle, RefreshCw, SmartphoneIcon } from "lucide-react";
import { env } from "@/lib/env";
import { toast } from "sonner";

export const SmsGatewayTab = () => {
  const [showQR, setShowQR] = useState(false);

  // Generate the payload expected by the OpenSMS Android app
  const qrData = {
    supabaseUrl: env.VITE_SUPABASE_URL,
    supabaseKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    deviceName: "Aqua Prime SMS Gateway"
  };

  // The app expects Base64 encoded JSON (v5+ protocol)
  const base64Payload = btoa(JSON.stringify(qrData));

  const copyToClipboard = () => {
    navigator.clipboard.writeText(base64Payload);
    toast.success("Connection string copied to clipboard");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <CardTitle>OpenSMS Gateway</CardTitle>
          </div>
          <CardDescription>
            Connect an Android device to Supabase to send automated SMS (OTP, notifications).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <h4 className="text-sm font-medium">1. Install Android App</h4>
              <p className="text-sm text-muted-foreground">
                Download and install the OpenSMS APK on an Android device with a SIM card.
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href="https://github.com/tenalirajkumarreddy/Open-SMS" target="_blank" rel="noreferrer">
                  Get OpenSMS APK
                </a>
              </Button>

              <h4 className="text-sm font-medium">2. Connect to Supabase</h4>
              <p className="text-sm text-muted-foreground">
                Open the app, go to "Connect", and scan the QR code to sync credentials.
              </p>
              {!showQR ? (
                <Button onClick={() => setShowQR(true)}>Show Connection QR</Button>
              ) : (
                <div className="space-y-4 p-4 rounded-xl border bg-white flex flex-col items-center">
                  <QRCodeSVG 
                    value={base64Payload} 
                    size={200}
                    level="H"
                    includeMargin={true}
                  />
                  <p className="text-[10px] text-muted-foreground font-mono break-all text-center">
                    {base64Payload.substring(0, 30)}...
                  </p>
                  <div className="flex gap-2">
                     <Button variant="ghost" size="sm" onClick={copyToClipboard}>Copy Payload</Button>
                     <Button variant="link" size="sm" onClick={() => setShowQR(false)}>Hide</Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-medium">System Status</h4>
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Backend</span>
                  <div className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                    <CheckCircle className="h-4 w-4" /> Supabase Realtime
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Environment</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-muted">
                    {env.VITE_SUPABASE_URL.split("//")[1]}
                  </span>
                </div>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Developer Tip</AlertTitle>
                <AlertDescription className="text-xs">
                  The Android app listens to the <code className="bg-muted px-1 rounded">sms_jobs</code> table. Ensure Realtime is enabled for this table in your Supabase Dashboard.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="border-dashed">
        <CardHeader className="py-4">
           <CardTitle className="text-sm">Troubleshooting</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
           <p>• Ensure the Android device has active internet and SMS balance.</p>
           <p>• The app must be running in the background (check battery optimization settings).</p>
           <p>• If connection fails, check if the project "anon" key permissions allow INSERT/UPDATE on sms_jobs.</p>
        </CardContent>
      </Card>
    </div>
  );
};
