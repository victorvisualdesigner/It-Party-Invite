// Attempt counting in Postgres, by bucket (e.g. unlock:ip:1.2.3.4) over a rolling window.
import "server-only";
import { db } from "@/lib/db";

/** Records one hit and says whether the bucket is still under its limit. */
export async function underLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await db().rpc("hit_attempt", { p_bucket: bucket, p_window_seconds: windowSeconds });
  if (error) {
    // Fail closed only on sign in style buckets would lock everyone out if the function is missing,
    // so log loudly and let the per invite lockout keep guarding.
    console.error("hit_attempt failed", error.message);
    return true;
  }
  return (data as number) <= limit;
}

/** The caller's IP from the proxy headers Vercel and most hosts set. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
