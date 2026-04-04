/**
 * Common validation utilities for form inputs
 */

// Phone validation: Indian mobile format (10 digits, starts with 6-9)
const PHONE_REGEX = /^[6-9]\d{9}$/;

// Email validation: standard RFC 5322 simplified
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GST validation: 15 alphanumeric, specific format
// Format: 2 state digits + 10 PAN + 1 entity + 1 Z + 1 check
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// IFSC validation: 4 letters (bank) + 0 + 6 alphanumeric (branch)
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// PAN validation: 5 letters + 4 digits + 1 letter
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

// Aadhar validation: 12 digits
const AADHAR_REGEX = /^[2-9]\d{11}$/;

// UPI ID validation: username@provider
const UPI_REGEX = /^[\w.-]+@[\w]+$/;

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Validate Indian phone number (10 digits starting with 6-9)
 */
export function validatePhone(phone: string, required = false): ValidationResult {
  const trimmed = phone.trim().replace(/[\s\-()]/g, "");
  
  if (!trimmed) {
    return required 
      ? { valid: false, message: "Phone number is required" }
      : { valid: true };
  }
  
  // Remove +91 or 91 prefix if present
  const normalized = trimmed.replace(/^(\+91|91)/, "");
  
  if (!PHONE_REGEX.test(normalized)) {
    return { 
      valid: false, 
      message: "Enter a valid 10-digit mobile number starting with 6-9" 
    };
  }
  
  return { valid: true };
}

/**
 * Validate email address
 */
export function validateEmail(email: string, required = false): ValidationResult {
  const trimmed = email.trim().toLowerCase();
  
  if (!trimmed) {
    return required 
      ? { valid: false, message: "Email is required" }
      : { valid: true };
  }
  
  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, message: "Enter a valid email address" };
  }
  
  return { valid: true };
}

/**
 * Validate GST number
 */
export function validateGST(gst: string, required = false): ValidationResult {
  const trimmed = gst.trim().toUpperCase();
  
  if (!trimmed) {
    return required 
      ? { valid: false, message: "GSTIN is required" }
      : { valid: true };
  }
  
  if (!GST_REGEX.test(trimmed)) {
    return { 
      valid: false, 
      message: "Enter a valid 15-character GSTIN (e.g., 29ABCDE1234F1Z5)" 
    };
  }
  
  return { valid: true };
}

/**
 * Validate IFSC code
 */
export function validateIFSC(ifsc: string, required = false): ValidationResult {
  const trimmed = ifsc.trim().toUpperCase();
  
  if (!trimmed) {
    return required 
      ? { valid: false, message: "IFSC code is required" }
      : { valid: true };
  }
  
  if (!IFSC_REGEX.test(trimmed)) {
    return { 
      valid: false, 
      message: "Enter a valid 11-character IFSC code (e.g., SBIN0001234)" 
    };
  }
  
  return { valid: true };
}

/**
 * Validate PAN number
 */
export function validatePAN(pan: string, required = false): ValidationResult {
  const trimmed = pan.trim().toUpperCase();
  
  if (!trimmed) {
    return required 
      ? { valid: false, message: "PAN is required" }
      : { valid: true };
  }
  
  if (!PAN_REGEX.test(trimmed)) {
    return { 
      valid: false, 
      message: "Enter a valid 10-character PAN (e.g., ABCDE1234F)" 
    };
  }
  
  return { valid: true };
}

/**
 * Validate Aadhar number
 */
export function validateAadhar(aadhar: string, required = false): ValidationResult {
  const trimmed = aadhar.trim().replace(/[\s\-]/g, "");
  
  if (!trimmed) {
    return required 
      ? { valid: false, message: "Aadhar number is required" }
      : { valid: true };
  }
  
  if (!AADHAR_REGEX.test(trimmed)) {
    return { 
      valid: false, 
      message: "Enter a valid 12-digit Aadhar number" 
    };
  }
  
  return { valid: true };
}

/**
 * Validate UPI ID
 */
export function validateUPI(upi: string, required = false): ValidationResult {
  const trimmed = upi.trim().toLowerCase();
  
  if (!trimmed) {
    return required 
      ? { valid: false, message: "UPI ID is required" }
      : { valid: true };
  }
  
  if (!UPI_REGEX.test(trimmed)) {
    return { 
      valid: false, 
      message: "Enter a valid UPI ID (e.g., name@upi)" 
    };
  }
  
  return { valid: true };
}

/**
 * Validate required text field
 */
export function validateRequired(value: string, fieldName: string): ValidationResult {
  if (!value.trim()) {
    return { valid: false, message: `${fieldName} is required` };
  }
  return { valid: true };
}

/**
 * Validate numeric amount (positive, optional min/max)
 */
export function validateAmount(
  value: number | string, 
  options: { required?: boolean; min?: number; max?: number; fieldName?: string } = {}
): ValidationResult {
  const { required = false, min = 0, max, fieldName = "Amount" } = options;
  const num = typeof value === "string" ? parseFloat(value) : value;
  
  if (isNaN(num) || value === "") {
    return required 
      ? { valid: false, message: `${fieldName} is required` }
      : { valid: true };
  }
  
  if (num < min) {
    return { valid: false, message: `${fieldName} must be at least ${min}` };
  }
  
  if (max !== undefined && num > max) {
    return { valid: false, message: `${fieldName} cannot exceed ${max}` };
  }
  
  return { valid: true };
}

/**
 * Normalize phone number (remove formatting, add/remove country code)
 */
export function normalizePhone(phone: string, includeCountryCode = false): string {
  const trimmed = phone.trim().replace(/[\s\-()]/g, "");
  const normalized = trimmed.replace(/^(\+91|91)/, "");
  
  if (!PHONE_REGEX.test(normalized)) {
    return phone.trim(); // Return as-is if invalid
  }
  
  return includeCountryCode ? `+91${normalized}` : normalized;
}

/**
 * Format phone number for display (XXX XXX XXXX)
 */
export function formatPhoneDisplay(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.length !== 10) return phone;
  return `${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6)}`;
}
