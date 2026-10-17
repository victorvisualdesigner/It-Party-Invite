import "server-only";
import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_ANON_KEY: z.string().min(20),
  APP_URL: z.url(),
  SESSION_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated server environment. Read lazily so a build without secrets still compiles. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid environment variables: ${names}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

export function appUrl(path = ""): string {
  return env().APP_URL.replace(/\/+$/, "") + path;
}
