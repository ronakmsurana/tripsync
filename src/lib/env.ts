// ============================================
// Environment configuration (validated lazily)
// ============================================
// All secrets and connection strings come from environment variables.
// Validation is lazy so `next build` does not need a live database, but a
// misconfigured server fails with a clear message (variable NAMES only —
// values are never echoed).
// ============================================

import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().min(1).default("tripsync"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  EMBEDDING_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  EMBEDDING_MODEL: z.string().default("Xenova/all-MiniLM-L6-v2"),
  EMBEDDING_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function env(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new ConfigError(`Invalid environment configuration — ${problems}`);
  }
  cached = parsed.data;
  return cached;
}
