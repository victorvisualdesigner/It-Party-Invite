// Creates the first admin and the single event row. Safe to run again.
//
//   npm run seed:admin
//   npm run seed:admin -- --email host@example.com --first-name Tolu --phone "0803 111 0001" --event-name "Only Yes"
//
// The password is always typed at a hidden prompt (or passed in ADMIN_PASSWORD), never as a flag.
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { z } from "zod";
import { derivePrefix } from "@/lib/event";
import { localPhone, normalizePhone } from "@/lib/phone";

const { values: flags } = parseArgs({
  options: {
    email: { type: "string" },
    "first-name": { type: "string" },
    phone: { type: "string" },
    "event-name": { type: "string" },
  },
});

function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is missing from .env.local.`);
    process.exit(1);
  }
  return value;
}

async function ask(question: string, fallback?: string): Promise<string> {
  if (fallback) return fallback;
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

/** Reads a line without echoing it. */
function askHidden(question: string): Promise<string> {
  if (process.env.ADMIN_PASSWORD) return Promise.resolve(process.env.ADMIN_PASSWORD);
  if (!stdin.isTTY) {
    console.error("Run this in a terminal so the password can be typed privately, or set ADMIN_PASSWORD.");
    process.exit(1);
  }
  return new Promise((resolve) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (char: string) => {
      if (char === "\r" || char === "\n" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        stdout.write("\n");
        resolve(value);
      } else if (char === "\u0003") {
        stdout.write("\n");
        process.exit(130);
      } else if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function findUserByEmail(admin: SupabaseClient["auth"]["admin"], email: string): Promise<User | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const supabase = createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("Create the host account and the event.\n");
  const email = z.email().safeParse(await ask("Admin email: ", flags.email));
  if (!email.success) throw new Error("That email doesn't look right.");

  const password = await askHidden("Password (12+ characters, hidden): ");
  if (password.length < 12) throw new Error("Use at least 12 characters for the password.");
  const again = process.env.ADMIN_PASSWORD ? password : await askHidden("Password again: ");
  if (again !== password) throw new Error("The two passwords don't match.");

  const firstName = (await ask("Your first name: ", flags["first-name"])).replace(/\s+/g, " ");
  if (!firstName || firstName.length > 40) throw new Error("Add a first name of up to 40 characters.");

  const phone = normalizePhone(await ask("Your phone number: ", flags.phone));
  if (!phone) throw new Error("That number doesn't look right. Try it with the first 0, like 0803 123 4567.");

  const { data: existingEvent, error: eventError } = await supabase.from("event").select("name").eq("id", 1).maybeSingle();
  if (eventError) throw new Error(`Could not read the event table. Did you run npm run db:push? (${eventError.message})`);
  const eventName = existingEvent
    ? existingEvent.name
    : (await ask("Event name (you can change it later): ", flags["event-name"])).replace(/\s+/g, " ");
  if (!eventName || eventName.length > 80) throw new Error("Add an event name of up to 80 characters.");

  // 1. Supabase Auth user, confirmed. An existing user with this email gets the new password.
  let user = await findUserByEmail(supabase.auth.admin, email.data);
  if (user) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (error) throw new Error(`Could not update the existing auth user: ${error.message}`);
    console.log(`Auth user exists for ${email.data}. Password updated.`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({ email: email.data, password, email_confirm: true });
    if (error || !data.user) throw new Error(`Could not create the auth user: ${error?.message}`);
    user = data.user;
    console.log(`Auth user created for ${email.data}.`);
  }

  // 2. The admin row in people. Admins are always Unlimited.
  const { data: byAuth } = await supabase.from("people").select("id").eq("auth_user_id", user.id).maybeSingle();
  const { data: byPhone } = await supabase.from("people").select("id, role, auth_user_id").eq("phone_e164", phone).maybeSingle();
  if (byPhone && byPhone.id !== byAuth?.id) {
    throw new Error(`${localPhone(phone)} already belongs to someone else on the team. Use a different number.`);
  }
  const row = { role: "admin", first_name: firstName, phone_e164: phone, auth_user_id: user.id, slot_limit: null, active: true };
  const { error: peopleError } = byAuth
    ? await supabase.from("people").update(row).eq("id", byAuth.id)
    : await supabase.from("people").insert(row);
  if (peopleError) throw new Error(`Could not save the admin: ${peopleError.message}`);
  console.log(`Admin ${firstName} (${localPhone(phone)}) is ${byAuth ? "updated" : "ready"}.`);

  // 3. The single event row.
  if (existingEvent) {
    console.log(`Event "${existingEvent.name}" already exists. Left as it is.`);
  } else {
    const { error } = await supabase
      .from("event")
      .insert({ id: 1, name: eventName, reference_prefix: derivePrefix(eventName) ?? "OY" });
    if (error) throw new Error(`Could not create the event: ${error.message}`);
    console.log(`Event "${eventName}" created. Fill in the rest under Event settings.`);
  }

  console.log("\nDone. Sign in at /admin/login.");
}

main().catch((error: Error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
