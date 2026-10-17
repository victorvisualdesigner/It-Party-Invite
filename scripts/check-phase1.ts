// Read-only report of what the Phase 1 screens wrote to the database, used to prove the checks.
// Run with: npm run check:phase1
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local.");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: event, error: eventError } = await db.from("event").select("*").eq("id", 1).single();
  if (eventError) throw eventError;
  console.log("EVENT (stored values: UTC times, kobo)");
  console.table(event);

  const { data: accounts } = await db
    .from("payout_accounts")
    .select("bank_name, account_number, account_name, active, created_at")
    .order("created_at");
  console.log("\nPAYOUT ACCOUNTS");
  console.table(accounts);
  const active = (accounts ?? []).filter((a) => a.active).length;
  console.log(`${active === 1 ? "PASS" : "FAIL"}  exactly one active account (found ${active})`);

  const { data: people } = await db
    .from("people")
    .select("role, first_name, phone_e164, slot_limit, key_hash, active, auth_user_id")
    .order("created_at");
  console.log("\nPEOPLE (key_hash shown as its algorithm and length only)");
  console.table(
    (people ?? []).map((p) => ({
      role: p.role,
      first_name: p.first_name,
      phone_e164: p.phone_e164,
      slot_limit: p.slot_limit === null ? "null (Unlimited)" : p.slot_limit,
      key_hash: p.key_hash ? `${p.key_hash.split("$")[0]}$… (${p.key_hash.length} chars)` : null,
      active: p.active,
      admin_login: !!p.auth_user_id,
    })),
  );
  const plain = (people ?? []).filter((p) => p.key_hash && !p.key_hash.startsWith("scrypt$"));
  console.log(`${plain.length === 0 ? "PASS" : "FAIL"}  every stored key is a scrypt hash`);
  const leaked = (people ?? []).filter((p) => p.key_hash && /^[A-Z]+ ?[2-9]{4}$/.test(p.key_hash));
  console.log(`${leaked.length === 0 ? "PASS" : "FAIL"}  no plain key in people.key_hash`);

  const { data: log } = await db
    .from("audit_log")
    .select("created_at, actor_type, action, details")
    .order("created_at", { ascending: false })
    .limit(15);
  console.log("\nAUDIT LOG (latest 15)");
  console.table((log ?? []).map((l) => ({ ...l, details: JSON.stringify(l.details) })));
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
