export const CANCEL_REASONS = [
  { value: "By Mistake", label: "By Mistake" },
  { value: "Stock Available", label: "Stock Available" },
  { value: "Other Brands", label: "Other Brands" },
  { value: "Other", label: "Other" },
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number]["value"];
