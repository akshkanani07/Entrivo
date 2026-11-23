import { z } from "zod";

const WEAK_PATTERNS = ["default", "change", "placeholder", "example"];

function containsWeakPattern(val: string): boolean {
  const lower = val.toLowerCase();
  return WEAK_PATTERNS.some((pattern) => lower.includes(pattern));
}

const secretSchema = z
  .string({ required_error: "variable is missing" })
  .min(32, "must be at least 32 characters long")
  .refine((val) => !containsWeakPattern(val), {
    message: "contains weak/placeholder pattern ('default', 'change', 'placeholder', or 'example')",
  });

const appEncryptionKeySchema = z
  .string({ required_error: "variable is missing" })
  .regex(/^[0-9a-fA-F]{64}$/, "must be exactly 64 hexadecimal characters");

export const envSchema = z.object({
  DATABASE_URL: z.string({ required_error: "variable is missing" }).min(1, "cannot be empty"),
  NEXT_PUBLIC_APP_URL: z.string({ required_error: "variable is missing" }).min(1, "cannot be empty"),
  JWT_SECRET: secretSchema,
  QR_SIGNING_SECRET: secretSchema,
  CRON_SECRET: secretSchema,
  STORAGE_SIGNING_SECRET: secretSchema,
  APP_ENCRYPTION_KEY: appEncryptionKeySchema,
});

export type ValidatedEnv = z.infer<typeof envSchema>;

export function validateEnv(): ValidatedEnv | Record<string, string | undefined> {
  const isProduction = process.env.NODE_ENV === "production";
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = result.error.errors.map((err) => {
      const variable = err.path.join(".");
      return `${variable}: ${err.message}`;
    });

    const errorMessage = `Production environment configuration error(s):\n- ${errorDetails.join("\n- ")}`;

    if (isProduction) {
      throw new Error(errorMessage);
    } else {
      console.warn(`[Env Warning] ${errorMessage}`);
    }
    return process.env;
  }

  return result.data;
}
