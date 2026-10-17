import "server-only";
import { db } from "@/lib/db";
import type { ActorType } from "@/lib/types";

/**
 * Writes one audit_log row. A failed audit write is logged, never shown to the person acting,
 * because the action itself has already happened.
 */
export async function audit(
  actorType: ActorType,
  actorId: string | null,
  action: string,
  details: Record<string, unknown> = {},
  inviteId: string | null = null,
): Promise<void> {
  const { error } = await db()
    .from("audit_log")
    .insert({ actor_type: actorType, actor_id: actorId, invite_id: inviteId, action, details });
  if (error) console.error("audit_log insert failed", action, error.message);
}
