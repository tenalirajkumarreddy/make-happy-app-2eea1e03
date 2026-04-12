import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyCode, getCurrencyOptions, getUserCurrencyPreference, setUserCurrencyPreference, SUPPORTED_CURRENCIES } from "@/lib/currency";
import { Globe, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface CurrencySelectorProps {
  value?: CurrencyCode;
  onChange?: (currency: CurrencyCode) => void;
  showLabel?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
  disabled?: boolean;
  allowPreference?: boolean;
}

/**
 * CurrencySelector - Dropdown for selecting currency
 * Supports persisting preference to localStorage
 */
export function CurrencySelector({
  value,
  onChange,
  showLabel = true,
  size = "default",
  className,
  disabled,
  allowPreference = true,
}: CurrencySelectorProps) {
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>(
    value || getUserCurrencyPreference()
  );
  const [isPreferenceDialogOpen, setIsPreferenceDialogOpen] = useState(false);

  // Sync with external value
  useEffect(() => {
    if (value && value !== selectedCurrency) {
      setSelectedCurrency(value);
    }
  }, [value]);

  const handleChange = (currency: CurrencyCode) => {
    setSelectedCurrency(currency);
    onChange?.(currency);
    
    if (allowPreference) {
      setUserCurrencyPreference(currency);
    }
  };

  const sizeClasses = {
    sm: "h-8 text-xs",
    default: "h-10",
    lg: "h-12 text-base",
  };

  return (
    <div className={className}>
      {showLabel && (
        <label className="text-sm font-medium mb-1.5 block">
          Currency
        </label>
      )}
      <div className="flex gap-2">
        <Select
          value={selectedCurrency}
          onValueChange={(v) => handleChange(v as CurrencyCode)}
          disabled={disabled}
        >
          <SelectTrigger className={`${sizeClasses[size]} flex-1`}>
            <SelectValue placeholder="Select currency">
              <span className="flex items-center gap-2">
                <span className="text-lg">{SUPPORTED_CURRENCIES.find(c => c.code === selectedCurrency)?.symbol}</span>
                <span>{selectedCurrency}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {getCurrencyOptions().map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="flex items-center gap-2">
                  <span className="text-lg">
                    {SUPPORTED_CURRENCIES.find(c => c.code === option.value)?.symbol}
                  </span>
                  <span>{option.label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {allowPreference && (
          <Dialog open={isPreferenceDialogOpen} onOpenChange={setIsPreferenceDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`${sizeClasses[size]} px-2`}
                title="Set as default"
              >
                <Globe className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Currency Preference</DialogTitle>
                <DialogDescription>
                  Set your preferred currency for all transactions and displays.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Current Selection</p>
                    <p className="text-sm text-muted-foreground">
                      {SUPPORTED_CURRENCIES.find(c => c.code === selectedCurrency)?.name}
                    </p>
                  </div>
                  <div className="text-2xl">
                    {SUPPORTED_CURRENCIES.find(c => c.code === selectedCurrency)?.symbol}
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    setUserCurrencyPreference(selectedCurrency);
                    toast.success(`${selectedCurrency} set as default currency`);
                    setIsPreferenceDialogOpen(false);
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Save as Default
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

/**
 * CurrencySelectorCompact - Compact inline currency selector
 */
export function CurrencySelectorCompact({
  value,
  onChange,
  className,
}: Omit<CurrencySelectorProps, "size" | "showLabel">) {
  return (
    <Select
      value={value || getUserCurrencyPreference()}
      onValueChange={(v) => onChange?.(v as CurrencyCode)}
    >
      <SelectTrigger className={`w-20 h-8 ${className}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_CURRENCIES.map((currency) => (
          <SelectItem key={currency.code} value={currency.code}>
            <span className="flex items-center gap-2">
              <span>{currency.symbol}</span>
              <span>{currency.code}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default CurrencySelector;
