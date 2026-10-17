"use server";

import { revalidatePath } from "next/cache";
import { signedOut, type ActionResult } from "@/lib/action";
import { getAdmin } from "@/lib/auth";
import { parseEventInput, type EventInput } from "@/lib/schemas";
import { updateEvent } from "@/lib/settings";

export async function saveEvent(input: EventInput): Promise<ActionResult> {
  const admin = await getAdmin();
  if (!admin) return signedOut;
  const parsed = parseEventInput(input);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  await updateEvent(parsed.value, admin.id);
  revalidatePath("/admin", "layout");
  return { ok: true };
}
