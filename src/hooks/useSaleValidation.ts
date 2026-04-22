/**
 * Shared sale validation logic for web and mobile
 * Extracts common validation rules to prevent code duplication
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { handleError } from "@/lib/errorHandler";

export interface SaleValidationOptions {
  isPosUser: boolean;
  role?: string;
}

export interface SaleValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface ValidationRules {
  requireFullPayment: boolean;
  maxSaleDateFuture: number; // days
  maxSaleDatePast: number; // days
  minQuantity: number;
  allowZeroTotal: boolean;
}

// Default validation rules
const DEFAULT_RULES: ValidationRules = {
  requireFullPayment: false,
  maxSaleDateFuture: 1,
  maxSaleDatePast: 30,
  minQuantity: 1,
  allowZeroTotal: false,
};

// POS-specific rules
const POS_RULES: ValidationRules = {
  ...DEFAULT_RULES,
  requireFullPayment: true,
  allowZeroTotal: false,
};

/**
 * Get validation rules based on user role
 */
export function getValidationRules(role?: string): ValidationRules {
  if (role === "pos") {
    return POS_RULES;
  }
  return DEFAULT_RULES;
}

/**
 * Validate sale date
 */
export function validateSaleDate(
  saleDate: string | null | undefined,
  rules: Pick<ValidationRules, "maxSaleDateFuture" | "maxSaleDatePast">
): { valid: boolean; error?: string } {
  if (!saleDate) {
    return { valid: true }; // Null dates are valid (use current time)
  }

  const saleDateObj = new Date(saleDate);
  const now = new Date();
  const maxPast = new Date(now.getTime() - rules.maxSaleDatePast * 24 * 60 * 60 * 1000);
  const maxFuture = new Date(now.getTime() + rules.maxSaleDateFuture * 24 * 60 * 60 * 1000);

  if (saleDateObj > maxFuture) {
    return {
      valid: false,
      error: `Sale date cannot be more than ${rules.maxSaleDateFuture} day(s) in the future`,
    };
  }

  if (saleDateObj < maxPast) {
    return {
      valid: false,
      error: `Sale date cannot be more than ${rules.maxSaleDatePast} days in the past`,
    };
  }

  return { valid: true };
}

/**
 * Validate payment amounts
 */
export function validatePayment(
  totalAmount: number,
  cash: number,
  upi: number,
  requireFullPayment: boolean
): { valid: boolean; error?: string } {
  const totalPayment = cash + upi;

  if (requireFullPayment && totalPayment !== totalAmount) {
    return {
      valid: false,
      error: "Payment must equal total amount",
    };
  }

  if (totalPayment > totalAmount) {
    return {
      valid: false,
      error: "Payment amount exceeds total",
    };
  }

  if (cash < 0 || upi < 0) {
    return {
      valid: false,
      error: "Payment amounts cannot be negative",
    };
  }

  return { valid: true };
}

/**
 * Validate sale items
 */
export function validateSaleItems(
  items: Array<{ product_id?: string; quantity: number }>,
  rules: Pick<ValidationRules, "minQuantity" | "allowZeroTotal">
): { valid: boolean; error?: string; hasProducts: boolean } {
  // Check for empty items
  if (!items || items.length === 0) {
    return { valid: false, error: "At least one item is required", hasProducts: false };
  }

  // Check all items have product_id
  const hasEmptyProducts = items.some((i) => !i.product_id);
  if (hasEmptyProducts) {
    return { valid: false, error: "Please select a product for all items", hasProducts: false };
  }

  // Check quantities
  const hasInvalidQuantity = items.some((i) => i.quantity < rules.minQuantity);
  if (hasInvalidQuantity) {
    return {
      valid: false,
      error: `All item quantities must be at least ${rules.minQuantity}`,
      hasProducts: true,
    };
  }

  // Check total amount
  const totalAmount = items.reduce((sum, i) => sum + i.quantity, 0);
  if (!rules.allowZeroTotal && totalAmount === 0) {
    return { valid: false, error: "Sale total cannot be zero", hasProducts: true };
  }

  return { valid: true, hasProducts: true };
}

/**
 * Validate store selection
 */
export function validateStore(
  storeId: string | null,
  storeData?: { is_active?: boolean; customer_id?: string | null }
): { valid: boolean; error?: string } {
  if (!storeId) {
    return { valid: false, error: "Please select a store" };
  }

  if (storeData) {
    if (storeData.is_active === false) {
      return { valid: false, error: "Selected store is inactive" };
    }

    if (!storeData.customer_id) {
      return { valid: false, error: "Store has no linked customer" };
    }
  }

  return { valid: true };
}

/**
 * Complete sale validation for use in components
 */
export function useSaleValidation(options: SaleValidationOptions) {
  const { isPosUser, role } = options;
  const rules = getValidationRules(role);

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const validate = useCallback(
    (params: {
      storeId: string | null;
      storeData?: { is_active?: boolean; customer_id?: string | null };
      items: Array<{ product_id?: string; quantity: number }>;
      totalAmount: number;
      cash: number;
      upi: number;
      saleDate?: string | null;
    }): SaleValidationResult => {
      const errors: string[] = [];

      // Validate store
      const storeValidation = validateStore(params.storeId, params.storeData);
      if (!storeValidation.valid) {
        errors.push(storeValidation.error!);
      }

      // Validate items
      const itemsValidation = validateSaleItems(params.items, rules);
      if (!itemsValidation.valid) {
        errors.push(itemsValidation.error!);
      }

      // Validate payment
      const paymentValidation = validatePayment(
        params.totalAmount,
        params.cash,
        params.upi,
        rules.requireFullPayment || isPosUser
      );
      if (!paymentValidation.valid) {
        errors.push(paymentValidation.error!);
      }

      // Validate date
      const dateValidation = validateSaleDate(params.saleDate, rules);
      if (!dateValidation.valid) {
        errors.push(dateValidation.error!);
      }

      setValidationErrors(errors);
      return { isValid: errors.length === 0, errors };
    },
    [rules, isPosUser]
  );

  const showValidationErrors = useCallback(() => {
    if (validationErrors.length > 0) {
      validationErrors.forEach((error) => toast.error(error));
    }
  }, [validationErrors]);

  const clearValidationErrors = useCallback(() => {
    setValidationErrors([]);
  }, []);

  return {
    validate,
    validationErrors,
    showValidationErrors,
    clearValidationErrors,
    rules,
  };
}

/**
 * Async validation with stock check
 */
export async function validateWithStockCheck(
  items: Array<{ product_id: string; quantity: number }>,
  userId: string,
  checkStockFn: (params: { p_user_id: string; p_items: typeof items }) => Promise<{
    data?: Array<{ product_name: string; available: boolean; available_qty: number }> | null;
    error?: { message: string } | null;
  }>
): Promise<{ valid: boolean; error?: string; insufficientProducts?: string[] }> {
  try {
    const { data: stockCheck, error: stockError } = await checkStockFn({
      p_user_id: userId,
      p_items: items,
    });

    if (stockError) {
      return {
        valid: false,
        error: `Stock check failed: ${stockError.message}. Please try again.`,
      };
    }

    const stockRows = Array.isArray(stockCheck) ? stockCheck : [];
    const insufficient = stockRows.filter((s) => !s.available);

    if (insufficient.length > 0) {
      const productNames = insufficient.map((i) => i.product_name);
      const availableInfo = insufficient.map(
        (i) => `${i.product_name} (${i.available_qty} available)`
      );

      return {
        valid: false,
        error: `Insufficient stock for: ${productNames.join(", ")}. Available: ${availableInfo.join(", ")}`,
        insufficientProducts: productNames,
      };
    }

    return { valid: true };
  } catch (error) {
    handleError(error, {
      context: { component: "useSaleValidation", action: "stockCheck" },
      showToast: false,
    });
    return {
      valid: false,
      error: "Unable to verify stock availability. Please try again.",
    };
  }
}

/**
 * Credit limit validation
 */
export function validateCreditLimit(
  currentOutstanding: number,
  newOutstanding: number,
  creditLimit: number
): { valid: boolean; warning?: string; exceeded: boolean } {
  if (creditLimit <= 0) {
    return { valid: true, exceeded: false };
  }

  const exceeded = newOutstanding > creditLimit;
  const usagePercent = (newOutstanding / creditLimit) * 100;
  const nearLimit = usagePercent >= 80 && !exceeded;

  if (exceeded) {
    return {
      valid: true, // Still valid but warn
      exceeded: true,
      warning: `Credit limit exceeded! Limit: ₹${creditLimit.toLocaleString()}, Outstanding will be: ₹${newOutstanding.toLocaleString()}`,
    };
  }

  if (nearLimit) {
    return {
      valid: true,
      exceeded: false,
      warning: `Near credit limit: ${Math.round(usagePercent)}% of limit used`,
    };
  }

  return { valid: true, exceeded: false };
}

export default useSaleValidation;
