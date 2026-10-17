// Proves the database lockdown: RLS on every public table, no policies, and nothing readable
// with the anon key. Run with: npm run check:rls
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const TABLES = [
  "event",
  "people",
  "invites",
  "invite_devices",
  "member_devices",
  "payout_accounts",
  "payments",
  "audit_log",
  "attempts",
];

let failed = false;
function report(ok: boolean, line: string) {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${line}`);
}

async function catalogChecks(url: string) {
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const tables = await sql<{ tablename: string; rowsecurity: boolean }[]>`
      select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`;
    for (const name of TABLES) {
      const row = tables.find((r) => r.tablename === name);
      report(!!row?.rowsecurity, `RLS on public.${name}`);
    }
    const extra = tables.filter((r) => !TABLES.includes(r.tablename));
    for (const row of extra) report(row.rowsecurity, `RLS on public.${row.tablename} (not in the spec)`);

    const [{ n: policies }] = await sql<{ n: number }[]>`
      select count(*)::int as n from pg_policies where schemaname = 'public'`;
    report(policies === 0, `No RLS policies in public (found ${policies})`);

    const [{ n: grants }] = await sql<{ n: number }[]>`
      select count(*)::int as n from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')`;
    report(grants === 0, `No table grants to anon or authenticated (found ${grants})`);
  } finally {
    await sql.end();
  }
}

async function anonProbes(url: string, anonKey: string) {
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const name of TABLES) {
    const { data, error } = await anon.from(name).select("*").limit(1);
    const blocked = !!error || (Array.isArray(data) && data.length === 0);
    report(blocked, `Anon cannot read public.${name}${error ? ` (${error.code ?? error.message})` : ""}`);
    const write = await anon.from(name).insert({});
    report(!!write.error, `Anon cannot write public.${name}${write.error ? ` (${write.error.code ?? write.error.message})` : ""}`);
  }
  const rpc = await anon.rpc("set_active_account", { p_account_id: "00000000-0000-0000-0000-000000000000" });
  report(!!rpc.error, `Anon cannot call set_active_account${rpc.error ? ` (${rpc.error.code ?? rpc.error.message})` : ""}`);
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be in .env.local.");
  if (process.env.SUPABASE_DB_URL) await catalogChecks(process.env.SUPABASE_DB_URL);
  else console.log("SKIP  Catalog checks (no SUPABASE_DB_URL)");
  await anonProbes(url, anonKey);
  console.log(failed ? "\nSome checks failed." : "\nAll checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
