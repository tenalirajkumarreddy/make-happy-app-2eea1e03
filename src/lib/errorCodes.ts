export const ErrorCodes = {
  CREDIT_LIMIT_EXCEEDED: "credit_limit_exceeded",
  INSUFFICIENT_STOCK: "insufficient_stock",
  DUPLICATE_ENTRY: "duplicate",
  VIOLATES_FOREIGN_KEY: "violates_foreign_key",
  MANUAL_LINKING_REQUIRED: "manual_linking",
  CONCURRENT_MODIFICATION: "concurrent_modification",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const msg = (error as { message?: string }).message;
  if (!msg) return null;

  if (msg.includes("credit_limit_exceeded")) return ErrorCodes.CREDIT_LIMIT_EXCEEDED;
  if (msg.includes("insufficient_stock")) return ErrorCodes.INSUFFICIENT_STOCK;
  if (msg.includes("duplicate")) return ErrorCodes.DUPLICATE_ENTRY;
  if (msg.includes("violates foreign key")) return ErrorCodes.VIOLATES_FOREIGN_KEY;
  if (msg.includes("Manual linking")) return ErrorCodes.MANUAL_LINKING_REQUIRED;
  if (msg.includes("concurrent_modification")) return ErrorCodes.CONCURRENT_MODIFICATION;

  return null;
}

export const ErrorMessages: Record<string, string> = {
  [ErrorCodes.CREDIT_LIMIT_EXCEEDED]: "Credit limit exceeded for this store. Cannot complete the sale.",
  [ErrorCodes.INSUFFICIENT_STOCK]: "Insufficient stock available. Please check inventory.",
  [ErrorCodes.DUPLICATE_ENTRY]: "This QR / record is already linked to another entry.",
  [ErrorCodes.VIOLATES_FOREIGN_KEY]: "Cannot delete — this record is linked to other data.",
  [ErrorCodes.MANUAL_LINKING_REQUIRED]: "This account was created manually. Please use your email/password to sign in.",
  [ErrorCodes.CONCURRENT_MODIFICATION]: "This store was modified by another user. Please refresh and try again.",
};