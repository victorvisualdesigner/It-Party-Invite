"use server";

import type { ActionResult } from "@/lib/action";
import { completeSetup } from "@/lib/admins";
import { authClient } from "@/lib/auth";
import { t } from "@/lib/copy";
import { parseNewPassword } from "@/lib/schemas";

/** Saves the new admin's password, spends the link and signs them straight in. */
export async function setPasswordAction(token: string, password: string, again: string): Promise<ActionResult> {
  const parsed = parseNewPassword(password, again);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const email = await completeSetup(String(token), parsed.value);
  if (!email) return { ok: false, message: t("admin.setup.expired_body") };
  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.value });
  // Signed in: the form opens the portal. If sign in hiccups, the login screen works with the new password.
  return error ? { ok: false, signedOut: true } : { ok: true };
}
