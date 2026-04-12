import { formatCurrency, CurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface CurrencyDisplayProps {
  amount: number;
  currency?: CurrencyCode;
  className?: string;
  showSymbol?: boolean;
  decimals?: number;
}

/**
 * CurrencyDisplay - Formatted currency display component
 * Uses multi-currency formatting from currency.ts
 */
export function CurrencyDisplay({
  amount,
  currency = "INR",
  className,
  showSymbol = true,
  decimals = 2,
}: CurrencyDisplayProps) {
  const formatted = formatCurrency(amount, currency, undefined);
  
  return (
    <span className={cn("tabular-nums", className)}>
      {formatted}
    </span>
  );
}

/**
 * CurrencyBadge - Currency amount with currency badge
 */
export function CurrencyBadge({
  amount,
  currency = "INR",
  className,
}: CurrencyDisplayProps) {
  const formatted = formatCurrency(amount, currency, undefined);
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-sm font-medium",
      "bg-primary/10 text-primary",
      className
    )}>
      <span className="text-xs opacity-70">{currency}</span>
      <span className="tabular-nums">{formatted.replace(/[^0-9.,]/g, "")}</span>
    </span>
  );
}

/**
 * AmountInput - Input for currency amounts with formatting
 */
interface AmountInputProps {
  value: number;
  onChange: (value: number) => void;
  currency?: CurrencyCode;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
}

export function AmountInput({
  value,
  onChange,
  currency = "INR",
  className,
  min = 0,
  max,
  step = 0.01,
  placeholder,
  disabled,
}: AmountInputProps) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
        {currency === "INR" ? "₹" : 
         currency === "USD" ? "$" : 
         currency === "EUR" ? "€" : 
         currency === "GBP" ? "£" : currency}
      </span>
      <input
        type="number"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pl-8",
          "text-sm ring-offset-background file:border-0 file:bg-transparent",
          "file:text-sm file:font-medium placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      />
    </div>
  );
}

/**
 * CurrencyComparison - Shows amount comparison between currencies
 */
interface CurrencyComparisonProps {
  amount: number;
  baseCurrency: CurrencyCode;
  targetCurrency: CurrencyCode;
  exchangeRate: number;
  className?: string;
}

export function CurrencyComparison({
  amount,
  baseCurrency,
  targetCurrency,
  exchangeRate,
  className,
}: CurrencyComparisonProps) {
  const converted = amount * exchangeRate;
  
  return (
    <div className={cn("text-sm space-y-1", className)}>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{baseCurrency}</span>
        <CurrencyDisplay amount={amount} currency={baseCurrency} />
      </div>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs">≈</span>
        <span className="text-xs opacity-60">1 {baseCurrency} = {exchangeRate.toFixed(4)} {targetCurrency}</span>
      </div>
      <div className="flex items-center justify-between font-medium">
        <span className="text-muted-foreground">{targetCurrency}</span>
        <CurrencyDisplay amount={converted} currency={targetCurrency} />
      </div>
    </div>
  );
}

export default CurrencyDisplay;
