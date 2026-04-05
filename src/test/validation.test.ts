import { describe, it, expect } from "vitest";
import {
  validatePhone,
  validateEmail,
  validateGST,
  validateIFSC,
  validatePAN,
  validateAadhar,
  validateUPI,
  validateRequired,
  validateAmount,
  normalizePhone,
  formatPhoneDisplay,
} from "@/lib/validation";

// ─── Phone Validation ──────────────────────────────────────────────────────────
describe("validatePhone", () => {
  it("accepts valid Indian mobile numbers", () => {
    expect(validatePhone("9876543210").valid).toBe(true);
    expect(validatePhone("6123456789").valid).toBe(true);
    expect(validatePhone("7000000000").valid).toBe(true);
    expect(validatePhone("8999999999").valid).toBe(true);
  });

  it("strips +91 prefix and validates", () => {
    expect(validatePhone("+919876543210").valid).toBe(true);
    expect(validatePhone("919876543210").valid).toBe(true);
  });

  it("strips formatting characters", () => {
    expect(validatePhone("987-654-3210").valid).toBe(true);
    expect(validatePhone("(987) 654 3210").valid).toBe(true);
  });

  it("rejects numbers starting with 0-5", () => {
    expect(validatePhone("0123456789").valid).toBe(false);
    expect(validatePhone("1234567890").valid).toBe(false);
    expect(validatePhone("5000000000").valid).toBe(false);
  });

  it("rejects wrong-length numbers", () => {
    expect(validatePhone("98765").valid).toBe(false);
    expect(validatePhone("98765432101").valid).toBe(false);
  });

  it("allows empty when not required", () => {
    expect(validatePhone("").valid).toBe(true);
    expect(validatePhone("  ").valid).toBe(true);
  });

  it("rejects empty when required", () => {
    expect(validatePhone("", true).valid).toBe(false);
    expect(validatePhone("", true).message).toContain("required");
  });
});

// ─── Email Validation ──────────────────────────────────────────────────────────
describe("validateEmail", () => {
  it("accepts valid emails", () => {
    expect(validateEmail("user@example.com").valid).toBe(true);
    expect(validateEmail("test.user@domain.co.in").valid).toBe(true);
  });

  it("rejects malformed emails", () => {
    expect(validateEmail("not-an-email").valid).toBe(false);
    expect(validateEmail("@domain.com").valid).toBe(false);
    expect(validateEmail("user@").valid).toBe(false);
  });

  it("allows empty when not required", () => {
    expect(validateEmail("").valid).toBe(true);
  });

  it("rejects empty when required", () => {
    expect(validateEmail("", true).valid).toBe(false);
  });
});

// ─── GST Validation ────────────────────────────────────────────────────────────
describe("validateGST", () => {
  it("accepts valid GSTIN", () => {
    expect(validateGST("29ABCDE1234F1Z5").valid).toBe(true);
  });

  it("handles lowercase input (auto-uppercase)", () => {
    expect(validateGST("29abcde1234f1z5").valid).toBe(true);
  });

  it("rejects invalid GSTIN", () => {
    expect(validateGST("INVALID").valid).toBe(false);
    expect(validateGST("12345678901234X").valid).toBe(false);
  });
});

// ─── IFSC Validation ───────────────────────────────────────────────────────────
describe("validateIFSC", () => {
  it("accepts valid IFSC codes", () => {
    expect(validateIFSC("SBIN0001234").valid).toBe(true);
    expect(validateIFSC("HDFC0000001").valid).toBe(true);
  });

  it("rejects invalid IFSC codes", () => {
    expect(validateIFSC("SBIN1001234").valid).toBe(false); // 5th char must be 0
    expect(validateIFSC("SBI0001234").valid).toBe(false);   // too short
  });
});

// ─── PAN Validation ────────────────────────────────────────────────────────────
describe("validatePAN", () => {
  it("accepts valid PAN", () => {
    expect(validatePAN("ABCDE1234F").valid).toBe(true);
  });

  it("rejects invalid PAN", () => {
    expect(validatePAN("12345ABCDE").valid).toBe(false);
    expect(validatePAN("ABCDE12345").valid).toBe(false);
  });
});

// ─── Aadhar Validation ─────────────────────────────────────────────────────────
describe("validateAadhar", () => {
  it("accepts valid 12-digit Aadhar", () => {
    expect(validateAadhar("234567890123").valid).toBe(true);
  });

  it("strips spaces and dashes", () => {
    expect(validateAadhar("2345 6789 0123").valid).toBe(true);
    expect(validateAadhar("2345-6789-0123").valid).toBe(true);
  });

  it("rejects Aadhar starting with 0 or 1", () => {
    expect(validateAadhar("012345678901").valid).toBe(false);
    expect(validateAadhar("123456789012").valid).toBe(false);
  });

  it("rejects wrong-length Aadhar", () => {
    expect(validateAadhar("23456789").valid).toBe(false);
  });
});

// ─── UPI Validation ────────────────────────────────────────────────────────────
describe("validateUPI", () => {
  it("accepts valid UPI IDs", () => {
    expect(validateUPI("user@upi").valid).toBe(true);
    expect(validateUPI("shop.owner@paytm").valid).toBe(true);
  });

  it("rejects invalid UPI IDs", () => {
    expect(validateUPI("no-at-sign").valid).toBe(false);
    expect(validateUPI("@provider").valid).toBe(false);
  });
});

// ─── Required ──────────────────────────────────────────────────────────────────
describe("validateRequired", () => {
  it("accepts non-empty strings", () => {
    expect(validateRequired("hello", "Name").valid).toBe(true);
  });

  it("rejects empty/whitespace", () => {
    expect(validateRequired("", "Name").valid).toBe(false);
    expect(validateRequired("   ", "Name").valid).toBe(false);
    expect(validateRequired("   ", "Name").message).toContain("Name");
  });
});

// ─── Amount ────────────────────────────────────────────────────────────────────
describe("validateAmount", () => {
  it("accepts valid amounts", () => {
    expect(validateAmount(100).valid).toBe(true);
    expect(validateAmount("50.5").valid).toBe(true);
  });

  it("rejects negative amounts by default", () => {
    expect(validateAmount(-1).valid).toBe(false);
  });

  it("enforces max", () => {
    expect(validateAmount(1000, { max: 500 }).valid).toBe(false);
    expect(validateAmount(500, { max: 500 }).valid).toBe(true);
  });

  it("allows empty when not required", () => {
    expect(validateAmount("").valid).toBe(true);
  });

  it("rejects empty when required", () => {
    expect(validateAmount("", { required: true }).valid).toBe(false);
  });
});

// ─── Phone Normalization ───────────────────────────────────────────────────────
describe("normalizePhone", () => {
  it("strips country code", () => {
    expect(normalizePhone("+919876543210")).toBe("9876543210");
    expect(normalizePhone("919876543210")).toBe("9876543210");
  });

  it("strips formatting", () => {
    expect(normalizePhone("987-654-3210")).toBe("9876543210");
  });

  it("adds country code when requested", () => {
    expect(normalizePhone("9876543210", true)).toBe("+919876543210");
  });

  it("returns as-is for invalid numbers", () => {
    expect(normalizePhone("12345")).toBe("12345");
  });
});

// ─── Phone Display Formatting ──────────────────────────────────────────────────
describe("formatPhoneDisplay", () => {
  it("formats as XXX XXX XXXX", () => {
    expect(formatPhoneDisplay("9876543210")).toBe("987 654 3210");
  });

  it("handles prefixed numbers", () => {
    expect(formatPhoneDisplay("+919876543210")).toBe("987 654 3210");
  });

  it("returns as-is for non-10-digit", () => {
    expect(formatPhoneDisplay("12345")).toBe("12345");
  });
});
