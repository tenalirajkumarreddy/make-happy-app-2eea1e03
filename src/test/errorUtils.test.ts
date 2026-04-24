import { describe, it, expect, vi } from "vitest";
import { getErrorMessage } from "@/lib/errorHandler";

describe("getFriendlyErrorMessage", () => {
  // ─── Credit limit ──────────────────────────────────────────────────────────
  it("maps credit_limit_exceeded to friendly message", () => {
    const msg = getFriendlyErrorMessage({ message: "credit_limit_exceeded for store X" });
    expect(msg).toContain("Credit limit exceeded");
  });

  // ─── RLS / Permission ──────────────────────────────────────────────────────
  it("maps RLS 42501 to permission denied", () => {
    const msg = getFriendlyErrorMessage({ code: "42501", message: "permission denied for table sales" });
    expect(msg).toBe("You do not have permission to perform this action.");
  });

  it("maps generic permission denied text", () => {
    const msg = getFriendlyErrorMessage({ message: "permission denied for relation stores" });
    expect(msg).toBe("You do not have permission to perform this action.");
  });

  // ─── Duplicate (unique constraint) ────────────────────────────────────────
  it("maps unique constraint on phone", () => {
    const msg = getFriendlyErrorMessage({ code: "23505", message: "unique constraint on phone" });
    expect(msg).toBe("Phone number is already in use.");
  });

  it("maps unique constraint on email", () => {
    const msg = getFriendlyErrorMessage({ code: "23505", message: "unique constraint on email" });
    expect(msg).toBe("Email is already in use.");
  });

  it("maps generic unique constraint", () => {
    const msg = getFriendlyErrorMessage({ code: "23505", message: "unique constraint on name" });
    expect(msg).toBe("This record already exists.");
  });

  // ─── Foreign key ──────────────────────────────────────────────────────────
  it("maps FK violation 23503", () => {
    const msg = getFriendlyErrorMessage({ code: "23503", message: "foreign key violation" });
    expect(msg).toContain("Referenced record");
  });

  // ─── Check constraint ────────────────────────────────────────────────────
  it("maps check constraint 23514", () => {
    const msg = getFriendlyErrorMessage({ code: "23514", message: "check constraint" });
    expect(msg).toContain("Invalid data");
  });

  // ─── Network ──────────────────────────────────────────────────────────────
  it("maps network errors", () => {
    expect(getFriendlyErrorMessage({ message: "Failed to fetch" })).toContain("Network error");
    expect(getFriendlyErrorMessage({ message: "Network request failed" })).toContain("Network error");
  });

  // ─── JWT expiry ───────────────────────────────────────────────────────────
  it("maps JWT errors to session expired", () => {
    const msg = getFriendlyErrorMessage({ message: "JWT expired" });
    expect(msg).toContain("session has expired");
  });

  // ─── Fallbacks ────────────────────────────────────────────────────────────
  it("returns message string for plain string errors", () => {
    const msg = getFriendlyErrorMessage("Something broke");
    expect(msg).toBe("Something broke");
  });

  it("returns 'Unknown error' for null/undefined", () => {
    expect(getFriendlyErrorMessage(null)).toBe("Unknown error occurred");
    expect(getFriendlyErrorMessage(undefined)).toBe("Unknown error occurred");
  });

  it("returns raw message when no pattern matches", () => {
    const msg = getFriendlyErrorMessage({ message: "unrecognized column foo" });
    expect(msg).toBe("unrecognized column foo");
  });
});
