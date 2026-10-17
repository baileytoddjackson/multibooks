import "server-only";
import { z } from "zod";
import { DEFAULT_MODEL } from "@/lib/llm/models";

/** Server-side environment, parsed once. Import only from server code. */
const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_PROVIDER: z.enum(["anthropic", "mock"]).default("mock"),
  MODEL_RUNTIME: z.string().default(DEFAULT_MODEL),
  MODEL_OFFLINE: z.string().default(DEFAULT_MODEL),
  DATABASE_URL: z.string().default("file:./data/local.db"),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  DAILY_BUDGET_USD: z.coerce.number().nonnegative().default(5),
  PER_SESSION_MAX_GENERATIONS: z.coerce.number().int().nonnegative().default(40),
  CYO_SOFT_TURN_CAP: z.coerce.number().int().positive().default(20),
  CYO_HARD_TURN_CAP: z.coerce.number().int().positive().default(25),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  ADMIN_PASSWORD: z.string().optional(),
  APP_SECRET: z.string().default("dev-only-secret"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  cached ??= EnvSchema.parse({
    ...process.env,
    // Treat empty strings from .env files as unset.
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
    DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN || undefined,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || undefined,
  });
  return cached;
}
