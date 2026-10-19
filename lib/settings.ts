// The single event row and the payout accounts.
import "server-only";
import { audit } from "@/lib/audit";
import { t } from "@/lib/copy";
import { db, isUniqueViolation } from "@/lib/db";
import { derivePrefix } from "@/lib/event";
import type { EventPatch, AccountInput } from "@/lib/schemas";
import type { EventRow, PayoutAccount } from "@/lib/types";

export const MIGRATION_HINT =
  "The database needs the latest update. Run supabase/migrations/20261019000000_days_admins_accounts.sql in the Supabase SQL editor.";

/** Fills fields added by later migrations, so the app keeps working while one is still to be run. */
function withDefaults(row: Record<string, unknown>): EventRow {
  return { ...row, end_date: (row.end_date as string | null) ?? null, days: Array.isArray(row.days) ? row.days : [] } as EventRow;
}

export async function getEvent(): Promise<EventRow> {
  const { data, error } = await db().from("event").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("The event row is missing. Run npm run seed:admin.");
  return withDefaults(data);
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
  if (error || !data) {
    if (/end_date|days|hold_window/.test(error?.message ?? "")) throw new Error(MIGRATION_HINT);
    throw new Error(`Could not save the event: ${error?.message}`);
  }
  // Postgres returns times as "+00:00" strings, so compare instants, not text.
  const same = (a: unknown, b: unknown) =>
    a === b || (typeof a === "string" && typeof b === "string" && Date.parse(a) === Date.parse(b));
  const changed = (Object.keys(patch) as (keyof EventPatch)[]).filter(
    (k) => !same(patch[k], current[k]) && JSON.stringify(patch[k]) !== JSON.stringify(current[k]),
  );
  await audit("admin", adminId, "event_updated", { changed });
  return withDefaults(data);
}

/** Accounts the admin can see and use. Archived ones stay in the database for old payments only. */
export async function listAccounts(): Promise<PayoutAccount[]> {
  const { data, error } = await db()
    .from("payout_accounts")
    .select("*")
    .order("active", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load accounts: ${error.message}`);
  return ((data ?? []) as PayoutAccount[]).filter((a) => !a.archived_at);
}

export type DeleteAccountResult = { ok: true; archived: boolean; nowActive: string | null } | { ok: false; message: string };

/**
 * Removes a payout account. One that payments already point to is archived instead, so those records
 * keep their details. Removing the active account hands the job to the newest remaining account.
 */
export async function deleteAccount(accountId: string, adminId: string): Promise<DeleteAccountResult> {
  const { data: account } = await db().from("payout_accounts").select("*").eq("id", accountId).maybeSingle();
  const a = account as PayoutAccount | null;
  if (!a || a.archived_at) return { ok: false, message: t("admin.account.errors.gone") };
  const { count } = await db().from("payments").select("id", { count: "exact", head: true }).eq("account_id", accountId);
  const used = (count ?? 0) > 0;
  const { error } = used
    ? await db().from("payout_accounts").update({ active: false, archived_at: new Date().toISOString() }).eq("id", accountId)
    : await db().from("payout_accounts").delete().eq("id", accountId);
  if (error) {
    if (/archived_at/.test(error.message)) return { ok: false, message: MIGRATION_HINT };
    throw new Error(`Could not remove the account: ${error.message}`);
  }
  let nowActive: string | null = null;
  if (a.active) {
    const rest = await listAccounts();
    const next = rest.sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
    if (next) {
      await db().rpc("set_active_account", { p_account_id: next.id });
      nowActive = next.bank_name;
    }
  }
  await audit("admin", adminId, used ? "account_archived" : "account_deleted", { account_id: accountId, bank: a.bank_name, now_active: nowActive });
  return { ok: true, archived: used, nowActive };
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
