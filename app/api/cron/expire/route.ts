// The expiry sweep. Correctness never depends on it (every read expires lazily); it keeps the
// admin's numbers tidy and clears old drafts. Protected by CRON_SECRET. Vercel Cron sends
// Authorization: Bearer <CRON_SECRET> on GET.
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { sweep } from "@/lib/invites";

export const dynamic = "force-dynamic";

function authorised(request: NextRequest): boolean {
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function run(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await sweep()) }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = run;
export const POST = run;
