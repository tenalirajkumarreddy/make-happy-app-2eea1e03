import { describe, it, expect } from "vitest";
import { parseUpiQr, isMerchantUpi } from "@/lib/upiParser";

describe("parseUpiQr", () => {
  it("parses standard UPI deep link", () => {
    const result = parseUpiQr("upi://pay?pa=merchant@ybl&pn=ShopName&am=500&cu=INR");
    expect(result).not.toBeNull();
    expect(result!.pa).toBe("merchant@ybl");
    expect(result!.pn).toBe("ShopName");
    expect(result!.am).toBe("500");
    expect(result!.cu).toBe("INR");
  });

  it("handles upi://pay/ format (slash instead of ?)", () => {
    const result = parseUpiQr("upi://pay/pa=test@upi&pn=Test");
    expect(result).not.toBeNull();
    expect(result!.pa).toBe("test@upi");
  });

  it("is case-insensitive for the protocol", () => {
    const result = parseUpiQr("UPI://PAY?pa=user@paytm&pn=User");
    expect(result).not.toBeNull();
    expect(result!.pa).toBe("user@paytm");
  });

  it("returns null for empty string", () => {
    expect(parseUpiQr("")).toBeNull();
  });

  it("returns null for non-UPI data", () => {
    expect(parseUpiQr("https://example.com")).toBeNull();
    expect(parseUpiQr("random string 123")).toBeNull();
  });

  it("returns null when pa parameter is missing", () => {
    expect(parseUpiQr("upi://pay?pn=NoAddress")).toBeNull();
  });

  it("preserves raw data", () => {
    const raw = "upi://pay?pa=shop@icici&pn=MyShop";
    const result = parseUpiQr(raw);
    expect(result!.raw).toBe(raw);
  });

  it("handles optional parameters gracefully", () => {
    const result = parseUpiQr("upi://pay?pa=basic@upi");
    expect(result).not.toBeNull();
    expect(result!.pn).toBe("");
    expect(result!.mc).toBeUndefined();
    expect(result!.am).toBeUndefined();
    expect(result!.tn).toBeUndefined();
  });

  it("extracts merchant code", () => {
    const result = parseUpiQr("upi://pay?pa=merchant@axis&pn=Store&mc=5411");
    expect(result!.mc).toBe("5411");
  });

  it("extracts transaction note", () => {
    const result = parseUpiQr("upi://pay?pa=shop@upi&pn=Shop&tn=Order%20123");
    expect(result!.tn).toBe("Order 123");
  });
});

describe("isMerchantUpi", () => {
  it("returns true when merchant code is present", () => {
    const data = parseUpiQr("upi://pay?pa=shop@upi&pn=Shop&mc=5411");
    expect(isMerchantUpi(data!)).toBe(true);
  });

  it("returns false when no merchant code", () => {
    const data = parseUpiQr("upi://pay?pa=person@upi&pn=Person");
    expect(isMerchantUpi(data!)).toBe(false);
  });
});
