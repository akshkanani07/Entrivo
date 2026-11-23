import { z } from "zod";

/**
 * Validates a required string field.
 * Safely coerces null/undefined to "" so that Zod outputs the friendly custom message
 * instead of the unhelpful "Expected string, received null".
 * Automatically trims whitespace and produces a TypeScript `string` type.
 */
export function requiredString(message: string, minLength = 1) {
  return z.preprocess(
    (val) => (val === null || val === undefined ? "" : String(val).trim()),
    z.string().min(minLength, message)
  );
}

/**
 * Validates an optional string field.
 * Safely maps null, undefined, or empty string to undefined.
 * Trims non-empty strings and produces TypeScript `string | undefined`.
 */
export function optionalString() {
  return z.preprocess(
    (val) => {
      if (val === null || val === undefined) return undefined;
      const trimmed = String(val).trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().optional()
  );
}

/**
 * Validates an optional string field that preserves null.
 * Empty strings become null. Produces `string | null | undefined`.
 */
export function optionalNullableString() {
  return z.preprocess(
    (val) => {
      if (val === null || val === undefined) return null;
      const trimmed = String(val).trim();
      return trimmed.length > 0 ? trimmed : null;
    },
    z.string().nullable().optional()
  );
}

/**
 * Validates a required email field.
 * Safely coerces null/undefined to "" so that validation fails with the custom error message.
 */
export function requiredEmail(message = "A valid email address is required") {
  return z.preprocess(
    (val) => (val === null || val === undefined ? "" : String(val).trim().toLowerCase()),
    z.string().email(message)
  );
}

/**
 * Validates an optional email field.
 * Null or empty string becomes undefined; valid email string is trimmed and lowercased.
 */
export function optionalEmail(message = "A valid email address is required") {
  return z.preprocess(
    (val) => {
      if (val === null || val === undefined) return undefined;
      const trimmed = String(val).trim().toLowerCase();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().email(message).optional()
  );
}

