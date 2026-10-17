// The single event row and the payout accounts.
import "server-only";
import { audit } from "@/lib/audit";
import { db, isUniqueViolation } from "@/lib/db";
import { derivePrefix } from "@/lib/event";
import type { EventPatch, AccountInput } from "@/lib/schemas";
import type { EventRow, PayoutAccount } from "@/lib/types";

export async function getEvent(): Promise<EventRow> {
  const { data, error } = await db().from("event").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("The event row is missing. Run npm run seed:admin.");
  return data as EventRow;
}

export async function updateEvent(patch: EventPatch, adminId: string): Promise<EventRow> {
  const current = await getEvent();
  const prefix = derivePrefix(patch.name) ?? current.reference_prefix;
  const { data, error } = await db()
    .from("event")
    .update({ ...patch, reference_prefix: prefix })
    .eq("id", 1)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Could not save the event: ${error?.message}`);
  // Postgres returns times as "+00:00" strings, so compare instants, not text.
  const same = (a: unknown, b: unknown) =>
    a === b || (typeof a === "string" && typeof b === "string" && Date.parse(a) === Date.parse(b));
  const changed = (Object.keys(patch) as (keyof EventPatch)[]).filter((k) => !same(patch[k], current[k]));
  await audit("admin", adminId, "event_updated", { changed });
  return data as EventRow;
}

export async function listAccounts(): Promise<PayoutAccount[]> {
  const { data, error } = await db()
    .from("payout_accounts")
    .select("*")
    .order("active", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load accounts: ${error.message}`);
  return (data ?? []) as PayoutAccount[];
}

/** Adds an account. The first account becomes active on its own. */
export async function addAccount(input: AccountInput, adminId: string): Promise<PayoutAccount> {
  const { data: active } = await db().from("payout_accounts").select("id").eq("active", true).maybeSingle();
  let result = await db()
    .from("payout_accounts")
    .insert({ ...input, active: !active })
    .select("*")
    .single();
  // Another account became active in the meantime: add this one as inactive instead.
  if (isUniqueViolation(result.error)) {
    result = await db().from("payout_accounts").insert({ ...input, active: false }).select("*").single();
  }
  if (result.error || !result.data) throw new Error(`Could not add the account: ${result.error?.message}`);
  const account = result.data as PayoutAccount;
  await audit("admin", adminId, "account_added", { account_id: account.id, bank: account.bank_name, active: account.active });
  return account;
}

export async function setActiveAccount(accountId: string, adminId: string): Promise<void> {
  const { error } = await db().rpc("set_active_account", { p_account_id: accountId });
  if (error) throw new Error(`Could not switch accounts: ${error.message}`);
  await audit("admin", adminId, "account_switched", { account_id: accountId });
}
