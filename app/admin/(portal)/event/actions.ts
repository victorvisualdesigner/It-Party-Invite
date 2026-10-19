"use server";

import { revalidatePath } from "next/cache";
import { signedOut, type ActionResult } from "@/lib/action";
import { getEventAdmin } from "@/lib/auth";
import { parseEventInput, type EventInput } from "@/lib/schemas";
import { MIGRATION_HINT, updateEvent } from "@/lib/settings";

export async function saveEvent(input: EventInput): Promise<ActionResult> {
  const admin = await getEventAdmin();
  if (!admin) return signedOut;
  const parsed = parseEventInput(input);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  try {
    await updateEvent(admin.eventId, parsed.value, admin.id);
  } catch (error) {
    // The one failure worth spelling out: the database still needs its latest update.
    if (error instanceof Error && error.message === MIGRATION_HINT) return { ok: false, errors: { form: MIGRATION_HINT } };
    throw error;
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}
