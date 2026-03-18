import { toast } from "sonner";

export function getFriendlyErrorMessage(error: any): string {
  if (!error) return "Unknown error occurred";
  
  // Handle object with 'message' property
  const msg = typeof error === "string" ? error : (error.message || error.error_description || JSON.stringify(error));

  // Custom RPC business logic errors
  if (msg.includes("credit_limit_exceeded")) {
    return "Credit limit exceeded. Amount exceeds allowed limit for this store/customer.";
  }
  
  // RLS / Permission errors
  if (error.code === "42501" || msg.includes("permission denied")) {
    return "You do not have permission to perform this action.";
  }

  // Duplicate entry
  if (error.code === "23505" || msg.includes("unique constraint")) {
    if (msg.includes("phone")) return "Phone number is already in use.";
    if (msg.includes("email")) return "Email is already in use.";
    return "This record already exists.";
  }

  // Foreign key (invalid reference)
  if (error.code === "23503") {
    return "Operation failed: Referenced record (store, customer, or product) not found.";
  }

  // Check constraints
  if (error.code === "23514") {
    return "Invalid data provided (check constraint violation).";
  }

  // Network errors
  if (msg.includes("Failed to fetch") || msg.includes("Network request failed") || msg.includes("connection")) {
    return "Network error. Please check your internet connection and try again.";
  }

  // Supabase specific
  if (msg.includes("JWT")) {
    return "Your session has expired. Please sign in again.";
  }

  return msg;
}

export function showErrorToast(error: any) {
  const msg = getFriendlyErrorMessage(error);
  toast.error(msg);
}

