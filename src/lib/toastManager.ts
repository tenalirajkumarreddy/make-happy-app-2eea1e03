import { toast } from "sonner";

/**
 * Centralized toast notifications with consistent messaging
 */

// Success toasts
export const showSuccess = (action: string, count?: number) => {
  const message = count !== undefined 
    ? `${action} (${count} ${count === 1 ? 'item' : 'items'})`
    : action;
  toast.success(message, { duration: 3000 });
};

export const showCreated = (entityName: string) => {
  toast.success(`${entityName} created successfully`, { duration: 3000 });
};

export const showUpdated = (entityName: string) => {
  toast.success(`${entityName} updated successfully`, { duration: 3000 });
};

export const showDeleted = (entityName: string) => {
  toast.success(`${entityName} deleted`, { duration: 3000 });
};

export const showExported = (entityName: string, count: number) => {
  toast.success(`Exported ${count} ${entityName}${count !== 1 ? 's' : ''}`, { duration: 3000 });
};

export const showSaved = () => {
  toast.success("Changes saved", { duration: 2000 });
};

// Error toasts
export const showError = (message: string, details?: string) => {
  const content = details 
    ? `${message}: ${details}`
    : message;
  toast.error(content, { duration: 5000 });
};

export const showValidationError = (field: string) => {
  toast.error(`${field} is required`, { duration: 4000 });
};

export const showApiError = (error: any) => {
  const message = error?.message || "An unexpected error occurred";
  toast.error(message, { duration: 5000 });
};

// Warning toasts
export const showWarning = (message: string) => {
  toast.warning(message, { duration: 4000 });
};

export const showOfflineWarning = () => {
  toast.warning("You are offline. Changes will sync when connected.", { duration: 4000 });
};

// Info toasts
export const showInfo = (message: string) => {
  toast.info(message, { duration: 3000 });
};

export const showLoading = (message: string = "Loading...") => {
  return toast.loading(message);
};

export const dismissToast = (toastId: string | number) => {
  toast.dismiss(toastId);
};

// Confirm action toast
export const showConfirm = (
  message: string, 
  onConfirm: () => void,
  onCancel?: () => void
) => {
  toast(message, {
    duration: Infinity,
    action: {
      label: "Confirm",
      onClick: onConfirm,
    },
    cancel: onCancel ? {
      label: "Cancel",
      onClick: onCancel,
    } : undefined,
  });
};

// Promise-based toast (for async operations)
export const showPromise = <T,>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: any) => string);
  }
) => {
  return toast.promise(promise, messages);
};

// Default export for simple import
export const notifications = {
  success: showSuccess,
  created: showCreated,
  updated: showUpdated,
  deleted: showDeleted,
  exported: showExported,
  saved: showSaved,
  error: showError,
  validationError: showValidationError,
  apiError: showApiError,
  warning: showWarning,
  offlineWarning: showOfflineWarning,
  info: showInfo,
  loading: showLoading,
  dismiss: dismissToast,
  confirm: showConfirm,
  promise: showPromise,
};
