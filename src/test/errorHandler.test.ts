import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createAppError,
  getFriendlyErrorMessage,
  handleError,
  withErrorHandling,
} from "@/lib/errorHandler";

// Mock toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

describe("Error Handler", () => {
  describe("createAppError", () => {
    it("creates an AppError with default severity", () => {
      const error = createAppError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.severity).toBe("error");
      expect(error.timestamp).toBeDefined();
    });

    it("creates an AppError with custom options", () => {
      const error = createAppError("Test error", {
        code: "TEST_001",
        severity: "critical",
        context: { component: "TestComponent" },
      });
      expect(error.code).toBe("TEST_001");
      expect(error.severity).toBe("critical");
      expect(error.context?.component).toBe("TestComponent");
    });
  });

  describe("getFriendlyErrorMessage", () => {
    it("handles credit limit exceeded", () => {
      const msg = getFriendlyErrorMessage({ message: "credit_limit_exceeded" });
      expect(msg).toContain("Credit limit exceeded");
    });

    it("handles insufficient stock", () => {
      const msg = getFriendlyErrorMessage({ message: "insufficient_stock" });
      expect(msg).toContain("Insufficient stock");
    });

    it("handles permission denied with code", () => {
      const msg = getFriendlyErrorMessage({ message: "permission denied for relation", code: "42501" });
      expect(msg).toContain("permission");
    });

    it("handles permission denied in message", () => {
      const msg = getFriendlyErrorMessage({ message: "unauthorized access" });
      expect(msg).toContain("permission");
    });

    it("handles duplicate entry with phone", () => {
      const msg = getFriendlyErrorMessage({
        code: "23505",
        message: "unique constraint violation on phone",
      });
      expect(msg).toContain("Phone number is already in use");
    });

    it("handles duplicate entry with email", () => {
      const msg = getFriendlyErrorMessage({
        code: "23505",
        message: "unique constraint violation on email",
      });
      expect(msg).toContain("Email is already in use");
    });

    it("handles foreign key violation with code", () => {
      const msg = getFriendlyErrorMessage({ code: "23503" });
      expect(msg).toContain("not found");
    });

    it("handles check constraint violation", () => {
      const msg = getFriendlyErrorMessage({ code: "23514" });
      expect(msg).toContain("Invalid data");
    });

    it("handles not null violation", () => {
      const msg = getFriendlyErrorMessage({ code: "23502" });
      expect(msg).toContain("Required field");
    });

    it("handles network errors", () => {
      const msg = getFriendlyErrorMessage({ message: "Failed to fetch" });
      expect(msg).toContain("Network error");
    });

    it("handles network timeout", () => {
      const msg = getFriendlyErrorMessage({ message: "timeout occurred" });
      expect(msg).toContain("Network error");
    });

    it("handles JWT errors", () => {
      const msg = getFriendlyErrorMessage({ message: "JWT expired" });
      expect(msg).toContain("session has expired");
    });

    it("handles token errors", () => {
      const msg = getFriendlyErrorMessage({ message: "invalid token" });
      expect(msg).toContain("session has expired");
    });

    it("handles offline errors", () => {
      const msg = getFriendlyErrorMessage({ message: "offline queue sync" });
      expect(msg).toContain("sync when you're back online");
    });

    it("handles validation errors", () => {
      const msg = getFriendlyErrorMessage({ message: "validation failed" });
      expect(msg).toContain("check your inputs");
    });

    it("handles string errors", () => {
      const msg = getFriendlyErrorMessage("Simple error message");
      expect(msg).toBe("Simple error message");
    });

    it("handles null errors", () => {
      const msg = getFriendlyErrorMessage(null);
      expect(msg).toBe("Unknown error occurred");
    });

    it("handles undefined errors", () => {
      const msg = getFriendlyErrorMessage(undefined);
      expect(msg).toBe("Unknown error occurred");
    });

    it("handles unknown error types", () => {
      const msg = getFriendlyErrorMessage({ someProperty: "value" });
      expect(msg).toBe("An unexpected error occurred");
    });
  });
});
