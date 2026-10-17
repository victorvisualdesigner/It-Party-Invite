// Applies supabase/migrations/*.sql to the database in SUPABASE_DB_URL.
// Run with: npm run db:push   (add -- --dry-run to preview)
import { spawnSync } from "node:child_process";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is missing from .env.local.");
  process.exit(1);
}

const result = spawnSync("npx", ["supabase", "db", "push", "--db-url", url, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
