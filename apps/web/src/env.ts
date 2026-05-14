import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_DIRECT_URL: z.string().url().optional(),
  REDIS_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_TRUST_HOST: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  APP_PORT: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 3000)),
  NODE_ENV: z
    .enum(["development", "staging", "production"])
    .default("development"),
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().default("us-east-1"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 587)),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_WS_URL: z.string().url().optional(),
  XENDIT_SECRET_KEY: z.string().optional(),
  XENDIT_WEBHOOK_TOKEN: z.string().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  NEXT_PUBLIC_LIVEKIT_WS_URL: z.string().url().optional(),
});

function getServerEnv() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL,
    REDIS_URL: process.env.REDIS_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    APP_PORT: process.env.APP_PORT,
    NODE_ENV: process.env.NODE_ENV,
    STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
    STORAGE_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY,
    STORAGE_SECRET_KEY: process.env.STORAGE_SECRET_KEY,
    STORAGE_BUCKET: process.env.STORAGE_BUCKET,
    STORAGE_REGION: process.env.STORAGE_REGION,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    SMTP_FROM: process.env.SMTP_FROM,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
    LIVEKIT_WS_URL: process.env.LIVEKIT_WS_URL,
    XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
    XENDIT_WEBHOOK_TOKEN: process.env.XENDIT_WEBHOOK_TOKEN,
  };
}

function getClientEnv() {
  return {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_LIVEKIT_WS_URL: process.env.NEXT_PUBLIC_LIVEKIT_WS_URL,
  };
}

// SKIP_ENV_VALIDATION=1 bypasses env checks (Docker image build, Next route-collection,
// CI lint/typecheck runs). Runtime use is always validated when this file is first imported
// by a request path that reads env — the bypass only affects compile-time module evaluation.
const SKIP_VALIDATION = process.env.SKIP_ENV_VALIDATION === "1";
// Server validation only runs on the server. On the client, server-only env vars are
// undefined by design (Next inlines NEXT_PUBLIC_* only), so validating would always fail.
// Any client code that reads a server field is already a bug — it would get undefined.
const IS_SERVER = typeof window === "undefined";

const _server =
  !IS_SERVER || SKIP_VALIDATION
    ? { success: true as const, data: getServerEnv() as never }
    : serverSchema.safeParse(getServerEnv());
if (!_server.success) {
  console.error("❌ Invalid server environment variables:");
  console.error(
    _server.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"),
  );
  throw new Error("Invalid server environment variables. See above.");
}

const _client = SKIP_VALIDATION
  ? { success: true as const, data: getClientEnv() as never }
  : clientSchema.safeParse(getClientEnv());
if (!_client.success) {
  console.error("❌ Invalid client environment variables:");
  console.error(
    _client.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"),
  );
  throw new Error("Invalid client environment variables. See above.");
}

export const env = {
  ..._server.data,
  ..._client.data,
};

// Safe to import in client bundles — contains only NEXT_PUBLIC_* values
export const clientEnv = _client.data;
