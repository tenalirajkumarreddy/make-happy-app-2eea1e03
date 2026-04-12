// Currency utilities for multi-currency support
// Phase 4: Scale & Polish - Issue #11

export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP";

interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: "INR", symbol: "₹", name: "Indian Rupee", locale: "en-IN", decimals: 2 },
  { code: "USD", symbol: "$", name: "US Dollar", locale: "en-US", decimals: 2 },
  { code: "EUR", symbol: "€", name: "Euro", locale: "de-DE", decimals: 2 },
  { code: "GBP", symbol: "£", name: "British Pound", locale: "en-GB", decimals: 2 },
];

export const DEFAULT_CURRENCY: CurrencyCode = "INR";

/**
 * Format amount with currency symbol and locale
 */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode = DEFAULT_CURRENCY,
  locale?: string
): string {
  const currencyInfo = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
  if (!currencyInfo) {
    return `${amount.toFixed(2)}`;
  }

  const useLocale = locale || currencyInfo.locale;
  
  try {
    return new Intl.NumberFormat(useLocale, {
      style: "currency",
      currency: currency,
      minimumFractionDigits: currencyInfo.decimals,
      maximumFractionDigits: currencyInfo.decimals,
    }).format(amount);
  } catch (error) {
    // Fallback for environments without Intl support
    return `${currencyInfo.symbol}${amount.toFixed(currencyInfo.decimals)}`;
  }
}

/**
 * Format amount without currency symbol (just number)
 */
export function formatAmount(
  amount: number,
  currency: CurrencyCode = DEFAULT_CURRENCY
): string {
  const currencyInfo = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
  const decimals = currencyInfo?.decimals || 2;
  return amount.toFixed(decimals);
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: CurrencyCode): string {
  const currencyInfo = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
  return currencyInfo?.symbol || currency;
}

/**
 * Get currency name
 */
export function getCurrencyName(currency: CurrencyCode): string {
  const currencyInfo = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
  return currencyInfo?.name || currency;
}

/**
 * Validate currency code
 */
export function isValidCurrency(code: string): code is CurrencyCode {
  return SUPPORTED_CURRENCIES.some((c) => c.code === code);
}

/**
 * Get user's preferred currency from localStorage
 */
export function getUserCurrencyPreference(): CurrencyCode {
  if (typeof window === "undefined") return DEFAULT_CURRENCY;
  
  const stored = localStorage.getItem("preferred_currency");
  if (stored && isValidCurrency(stored)) {
    return stored;
  }
  return DEFAULT_CURRENCY;
}

/**
 * Save user's currency preference
 */
export function setUserCurrencyPreference(currency: CurrencyCode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("preferred_currency", currency);
}

/**
 * Convert currency using exchange rates (server-side via Supabase RPC)
 */
export async function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode
): Promise<{ amount: number; rate: number }> {
  if (from === to) {
    return { amount, rate: 1 };
  }

  // This would typically call a Supabase RPC function
  // For now, return a placeholder that will be implemented
  // with actual exchange rate lookup
  const { supabase } = await import("@/integrations/supabase/client");
  
  const { data, error } = await supabase.rpc("convert_currency", {
    p_amount: amount,
    p_from_currency: from,
    p_to_currency: to,
    p_date: new Date().toISOString().split("T")[0],
  });

  if (error) {
    console.error("Currency conversion error:", error);
    // Fallback: return original amount
    return { amount, rate: 1 };
  }

  return { amount: data || amount, rate: (data || amount) / amount };
}

/**
 * Parse currency amount from string
 */
export function parseCurrencyAmount(value: string): number {
  // Remove currency symbols and whitespace
  const cleaned = value.replace(/[₹$€£,\s]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Get all supported currencies for dropdown
 */
export function getCurrencyOptions(): { value: CurrencyCode; label: string }[] {
  return SUPPORTED_CURRENCIES.map((c) => ({
    value: c.code,
    label: `${c.symbol} ${c.name} (${c.code})`,
  }));
}
