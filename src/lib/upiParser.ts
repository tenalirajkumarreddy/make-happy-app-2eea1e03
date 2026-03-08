/**
 * Parse UPI QR code data
 * Format: upi://pay?pa=address@upi&pn=PayeeName&mc=1234&...
 */
export interface UpiData {
  pa: string;       // payee address (UPI ID)
  pn: string;       // payee name
  mc?: string;      // merchant code
  am?: string;      // amount
  cu?: string;      // currency
  tn?: string;      // transaction note
  raw: string;      // full raw string
}

export function parseUpiQr(raw: string): UpiData | null {
  if (!raw) return null;

  // Handle both upi://pay? and upi://pay/ formats
  const upiMatch = raw.match(/^upi:\/\/pay[?/](.+)$/i);
  if (!upiMatch) return null;

  const params = new URLSearchParams(upiMatch[1]);
  const pa = params.get("pa");
  if (!pa) return null;

  return {
    pa,
    pn: params.get("pn") || "",
    mc: params.get("mc") || undefined,
    am: params.get("am") || undefined,
    cu: params.get("cu") || undefined,
    tn: params.get("tn") || undefined,
    raw,
  };
}

export function isMerchantUpi(data: UpiData): boolean {
  return !!data.mc;
}
