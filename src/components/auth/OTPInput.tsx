import React, { useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

export function OTPInput({
  length = 6,
  value,
  onChange,
  disabled = false,
  error = false,
  className,
}: OTPInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Sync refs on mount
  useEffect(() => {
    inputsRef.current = inputsRef.current.slice(0, length);
  }, [length]);

  const handleChange = useCallback(
    (index: number, digit: string) => {
      if (disabled) return;
      // Only accept single digit
      const digitValue = digit.replace(/\D/g, "").slice(-1);
      if (!digitValue) return;

      const newValue = value.split("");
      newValue[index] = digitValue;
      const result = newValue.join("").slice(0, length);
      onChange(result);

      // Move focus to next input
      if (index < length - 1) {
        inputsRef.current[index + 1]?.focus();
      }
    },
    [disabled, length, value, onChange]
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (disabled) return;

      switch (e.key) {
        case "Backspace":
          e.preventDefault();
          if (value[index]) {
            // Clear current digit
            const newValue = value.split("");
            newValue[index] = "";
            onChange(newValue.join("").slice(0, length));
          } else if (index > 0) {
            // Move to previous input
            inputsRef.current[index - 1]?.focus();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (index > 0) {
            inputsRef.current[index - 1]?.focus();
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (index < length - 1) {
            inputsRef.current[index + 1]?.focus();
          }
          break;
        case "Delete":
          e.preventDefault();
          if (value[index]) {
            const newValue = value.split("");
            newValue[index] = "";
            onChange(newValue.join("").slice(0, length));
          }
          break;
      }
    },
    [disabled, length, value, onChange]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      if (disabled) return;

      const pastedData = e.clipboardData.getData("text").replace(/\D/g, "");
      if (!pastedData) return;

      const newValue = pastedData.slice(0, length);
      onChange(newValue);

      // Focus the appropriate input after paste
      const focusIndex = Math.min(newValue.length, length - 1);
      inputsRef.current[focusIndex]?.focus();
    },
    [disabled, length, onChange]
  );

  const handleFocus = useCallback(
    (index: number) => {
      // Select all text on focus for easy replacement
      const input = inputsRef.current[index];
      if (input) {
        input.select();
      }
    },
    []
  );

  return (
    <div className={cn("flex items-center justify-center gap-2 sm:gap-3", className)}>
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] || ""}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={() => handleFocus(index)}
          className={cn(
            "h-12 w-10 sm:h-14 sm:w-12 rounded-xl border-2 text-center text-xl font-bold text-foreground transition-all duration-200",
            "bg-background shadow-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            error
              ? "border-red-500 bg-red-50 animate-shake focus-visible:border-red-500 focus-visible:ring-red-500"
              : "border-input hover:border-ring/50 focus-visible:border-ring",
            disabled && "opacity-50 cursor-not-allowed",
            "select-none"
          )}
          aria-label={`OTP digit ${index + 1}`}
        />
      ))}
    </div>
  );
}
