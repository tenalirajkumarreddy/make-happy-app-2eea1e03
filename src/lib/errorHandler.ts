/**
 * Comprehensive error handling utilities
 * Provides standardized error handling patterns throughout the application
 */

import { toast } from "sonner";
import { logError } from "./logger";

export type ErrorSeverity = "info" | "warning" | "error" | "critical";

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  storeId?: string;
  [key: string]: unknown;
}

export interface AppError {
  message: string;
  code?: string;
  severity: ErrorSeverity;
  context?: ErrorContext;
  originalError?: unknown;
  timestamp: string;
}

/**
 * Create a standardized application error
 */
export function createAppError(
  message: string,
  options: {
    code?: string;
    severity?: ErrorSeverity;
    context?: ErrorContext;
    originalError?: unknown;
  } = {}
): AppError {
  return {
    message,
    code: options.code,
    severity: options.severity || "error",
    context: options.context,
    originalError: options.originalError,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Map various error types to friendly messages
 */
export function getFriendlyErrorMessage(error: unknown): string {
  if (!error) return "Unknown error occurred";

  // Handle AppError
  if (isAppError(error)) {
    return error.message;
  }

  // Handle Error objects
  if (error instanceof Error) {
    return mapErrorMessage(error.message, (error as any).code);
  }

  // Handle string errors
  if (typeof error === "string") {
    return mapErrorMessage(error);
  }

  // Handle object with message property
  const errorObj = error as any;
  if (errorObj.message) {
    return mapErrorMessage(errorObj.message, errorObj.code);
  }

  // Handle object with only code property
  if (errorObj.code) {
    return mapErrorMessage("", errorObj.code);
  }

  // Fallback
  return "An unexpected error occurred";
}

/**
 * Map error messages and codes to friendly messages
 */
function mapErrorMessage(msg: string, code?: string): string {
  // RPC business logic errors
  if (msg.includes("credit_limit_exceeded")) {
    return "Credit limit exceeded. Amount exceeds allowed limit for this store/customer.";
  }

  if (msg.includes("insufficient_stock")) {
    return "Insufficient stock for one or more products. Please check inventory.";
  }

  if (msg.includes("permission") || msg.includes("unauthorized")) {
    return "You do not have permission to perform this action.";
  }

  // RLS / Permission errors
  if (code === "42501" || msg.includes("permission denied")) {
    return "You do not have permission to perform this action.";
  }

  // Duplicate entry
  if (code === "23505" || msg.includes("unique constraint")) {
    if (msg.includes("phone")) return "Phone number is already in use.";
    if (msg.includes("email")) return "Email is already in use.";
    if (msg.includes("display_id")) return "This ID is already in use.";
    return "This record already exists.";
  }

  // Foreign key (invalid reference)
  if (code === "23503") {
    return "Operation failed: Referenced record not found.";
  }

  // Check constraints
  if (code === "23514") {
    return "Invalid data provided. Please check your inputs.";
  }

  // Not null violations
  if (code === "23502") {
    return "Required field is missing.";
  }

  // Network errors
  if (
    msg.includes("Failed to fetch") ||
    msg.includes("Network request failed") ||
    msg.includes("connection") ||
    msg.includes("timeout")
  ) {
    return "Network error. Please check your internet connection and try again.";
  }

  // Supabase specific
  if (msg.includes("JWT") || msg.includes("token")) {
    return "Your session has expired. Please sign in again.";
  }

  // Offline queue errors
  if (msg.includes("offline") || msg.includes("queued")) {
    return "This action has been saved and will sync when you're back online.";
  }

  // Validation errors
  if (msg.includes("validation") || msg.includes("invalid")) {
    return "Please check your inputs and try again.";
  }

  return msg;
}

/**
 * Check if error is an AppError
 */
function isAppError(error: unknown): error is AppError {
  return (
    typeof error === "object" &&
    error !== null &&
    "severity" in error &&
    "timestamp" in error
  );
}

/**
 * Standardized error handler that logs and shows toast
 */
export function handleError(
  error: unknown,
  options: {
    context?: ErrorContext;
    showToast?: boolean;
    logToServer?: boolean;
    fallbackMessage?: string;
  } = {}
): AppError {
  const { context, showToast = true, logToServer = true, fallbackMessage } = options;

  // Convert to AppError
  const appError = createAppError(getFriendlyErrorMessage(error) || fallbackMessage || "An error occurred", {
    originalError: error,
    context,
    severity: determineSeverity(error),
  });

  // Log to console in development
  if (import.meta.env.DEV) {
    console.error("[AppError]", appError);
  }

  // Log to server
  if (logToServer) {
    logError(error, {
      component: context?.component,
      action: context?.action,
      ...context,
    });
  }

  // Show toast notification
  if (showToast) {
    const toastMessage = appError.message;
    switch (appError.severity) {
      case "critical":
        toast.error(toastMessage, { duration: 10000 });
        break;
      case "error":
        toast.error(toastMessage);
        break;
      case "warning":
        toast.warning(toastMessage);
        break;
      case "info":
        toast.info(toastMessage);
        break;
    }
  }

  return appError;
}

/**
 * Determine error severity from error type
 */
function determineSeverity(error: unknown): ErrorSeverity {
  if (!error) return "error";

  const msg = String(error);

  if (
    msg.includes("critical") ||
    msg.includes("database connection") ||
    msg.includes("auth") && msg.includes("fail")
  ) {
    return "critical";
  }

  if (
    msg.includes("permission") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden")
  ) {
    return "warning";
  }

  if (
    msg.includes("offline") ||
    msg.includes("queued") ||
    msg.includes("sync")
  ) {
    return "info";
  }

  return "error";
}

/**
 * Async wrapper that handles errors for async functions
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  options: {
    context?: ErrorContext;
    showToast?: boolean;
    fallbackMessage?: string;
    onError?: (error: AppError) => void;
  } = {}
): Promise<{ data: T | null; error: AppError | null }> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (error) {
    const appError = handleError(error, {
      context: options.context,
      showToast: options.showToast,
      fallbackMessage: options.fallbackMessage,
    });

    if (options.onError) {
      options.onError(appError);
    }

    return { data: null, error: appError };
  }
}

/**
 * Show success toast with consistent formatting
 */
export function showSuccess(message: string, description?: string) {
  toast.success(message, description ? { description } : undefined);
}

/**
 * Show warning toast with consistent formatting
 */
export function showWarning(message: string, description?: string) {
  toast.warning(message, description ? { description } : undefined);
}

/**
 * Show info toast with consistent formatting
 */
export function showInfo(message: string, description?: string) {
  toast.info(message, description ? { description } : undefined);
}

// Re-export from errorUtils for backward compatibility
export { getFriendlyErrorMessage as getErrorMessage, showErrorToast };
