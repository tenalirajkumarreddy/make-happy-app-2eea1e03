import { z } from "zod";

// UUID validation
export const uuidSchema = z.string().uuid("Invalid ID format");

// Numeric validation
export const positiveNumber = z
  .number({ invalid_type_error: "Must be a valid number" })
  .min(0, "Cannot be negative");

// Safe text (sanitized, no HTML/scripts)
export const safeText = z.string().trim().max(1000, "Text too long");

// Money/Amount validation
export const amountSchema = z.number().min(0).max(99999999, "Amount exceeds maximum");

// Sale validation schemas
export const saleItemSchema = z.object({
  product_id: uuidSchema,
  quantity: positiveNumber,
  unit_price: positiveNumber,
});

export const createSaleSchema = z.object({
  store_id: uuidSchema,
  customer_id: uuidSchema.optional().nullable(),
  items: z.array(saleItemSchema).min(1, "At least one item required"),
  cash_amount: amountSchema.default(0),
  upi_amount: amountSchema.default(0),
  payment_mode: z.enum(["cash", "upi", "credit", "mixed"]),
  notes: safeText.optional().nullable(),
  recorded_for: uuidSchema.optional().nullable(),
  sale_date: z.string().datetime(),
});

// Extended validation with business rules
export const validateSaleData = (data: {
  store_id: string;
  items: Array<{product_id: string; quantity: number; unit_price: number}>;
  cash_amount: number;
  upi_amount: number;
  total_amount: number;
  isPosUser: boolean;
  sale_date?: string | null;
}) => {
  // Type validation with Zod
  const schemaResult = createSaleSchema.safeParse({
    store_id: data.store_id,
    items: data.items,
    cash_amount: data.cash_amount,
    upi_amount: data.upi_amount,
    payment_mode: "mixed", // Will be determined by amounts
    sale_date: data.sale_date || new Date().toISOString(),
  });

  if (!schemaResult.success) {
    return {
      valid: false,
      errors: schemaResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
    };
  }

  // Business logic validation
  const errors: string[] = [];

  if (!data.store_id) {
    errors.push("Please fill all required fields");
  }

  const totalQuantity = data.items.reduce((sum, i) => sum + (i.quantity || 0), 0);

  if (totalQuantity <= 0) {
    errors.push("Total quantity of all products must be greater than zero");
  }

  if (data.total_amount === 0) {
    errors.push("Sale total cannot be zero");
  }

  // POS users: payment must equal total (no outstanding allowed)
  if (data.isPosUser && (data.cash_amount + data.upi_amount) !== data.total_amount) {
    errors.push("POS sales require full payment. Cash + UPI must equal Total.");
  }

  // Date validation
  if (data.sale_date) {
    const saleDateObj = new Date(data.sale_date);
    const now = new Date();
    const maxPast = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const maxFuture = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    if (saleDateObj > maxFuture) {
      errors.push("Sale date cannot be more than 1 day in the future");
    }
    if (saleDateObj < maxPast) {
      errors.push("Sale date cannot be more than 30 days in the past");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

// Export types
type CreateSaleInput = z.infer<typeof createSaleSchema>;
type SaleItemInput = z.infer<typeof saleItemSchema>;

export type { CreateSaleInput, SaleItemInput };
