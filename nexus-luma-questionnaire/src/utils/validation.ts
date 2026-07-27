export interface FieldValidationResult {
  valid: boolean;
  message?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Accepts formats like: 5551234567, 555-123-4567, (555) 123-4567, +1 555 123 4567
const PHONE_PATTERN = /^[+]?[\d\s().-]{7,20}$/;

export function validateFirstName(value: string, required: boolean): FieldValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return required
      ? { valid: false, message: "Enter your first name." }
      : { valid: true };
  }
  if (!/[a-zA-Z]/.test(trimmed)) {
    return { valid: false, message: "Enter a valid first name." };
  }
  return { valid: true };
}

export function validateEmail(value: string, required: boolean): FieldValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return required
      ? { valid: false, message: "Enter your email address." }
      : { valid: true };
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return { valid: false, message: "Enter a valid email address." };
  }
  return { valid: true };
}

export function validatePhone(value: string, required: boolean): FieldValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return required
      ? { valid: false, message: "Enter your phone number." }
      : { valid: true };
  }
  if (!PHONE_PATTERN.test(trimmed)) {
    return { valid: false, message: "Enter a valid phone number." };
  }
  return { valid: true };
}

export function validateBusinessName(value: string, required: boolean): FieldValidationResult {
  const trimmed = value.trim();
  if (!trimmed && required) {
    return { valid: false, message: "Enter your business name." };
  }
  return { valid: true };
}

export function validateWebsiteUrl(value: string, required: boolean): FieldValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return required
      ? { valid: false, message: "Enter your website URL." }
      : { valid: true };
  }
  const normalized = normalizeUrl(trimmed);
  try {
    // eslint-disable-next-line no-new
    new URL(normalized);
    return { valid: true };
  } catch {
    return { valid: false, message: "Enter a valid website URL." };
  }
}

/** Prefixes bare domains with https:// so they form a valid URL. */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Very light sanitization: strips angle brackets to reduce injection risk before submission. */
export function sanitizeText(value: string): string {
  return value.replace(/[<>]/g, "").trim();
}
