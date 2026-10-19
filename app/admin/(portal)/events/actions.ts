"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signedOut, type ActionResult } from "@/lib/action";
import { addAdmin, newSetupLink, removeAdmin, type SetupDelivery } from "@/lib/admins";
import { EVENT_COOKIE, getAdmin, type Admin } from "@/lib/auth";
import { t } from "@/lib/copy";
import { parseAdminInput, parseCreateEvent, type AdminInput, type CreateEventInput } from "@/lib/schemas";
import { clearEventData, confirmsEventName, createEvent, getEvent, MIGRATION_HINT } from "@/lib/settings";

const personId = z.uuid();
const eventId = z.number().int().positive();
const notOwner = { ok: false as const, message: t("admin.admins.only_owner") };

/** The signed in superadmin, or the answer to send back instead. */
async function superadmin(): Promise<Admin | typeof signedOut | typeof notOwner> {
  const admin = await getAdmin();
  if (!admin) return signedOut;
  if (admin.role !== "superadmin") return notOwner;
  return admin;
}

async function openEvent(id: number) {
  const store = await cookies();
  store.set(EVENT_COOKIE, String(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 400 * 24 * 3600,
  });
}

export async function createEventAction(input: CreateEventInput): Promise<
  ActionResult<{
    event: string;
    eventId: number;
    delivery: SetupDelivery | null;
  }>
> {
  const admin = await superadmin();
  if ("ok" in admin) return admin;
  const parsed = parseCreateEvent(input);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  try {
    const event = await createEvent(parsed.value.name, admin.id);
    let delivery: SetupDelivery | null = null;
    if (parsed.value.admin) {
      const added = await addAdmin(event.id, parsed.value.admin, admin.id);
      if (!added.ok)
        return {
          ok: false,
          errors: Object.fromEntries(Object.entries(added.errors).map(([k, v]) => [`admin.${k}`, v])),
        };
      delivery = added.delivery;
    }
    revalidatePath("/admin", "layout");
    return {
      ok: true,
      data: { event: event.name, eventId: event.id, delivery },
    };
  } catch (error) {
    if (error instanceof Error && error.message === MIGRATION_HINT) return { ok: false, message: MIGRATION_HINT };
    throw error;
  }
}

/** The superadmin steps into an event: every page then shows that event. */
export async function openEventAction(id: number): Promise<ActionResult> {
  const admin = await superadmin();
  if ("ok" in admin) return admin;
  const eid = eventId.safeParse(id);
  if (!eid.success) return { ok: false };
  await getEvent(eid.data);
  await openEvent(eid.data);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function addEventAdminAction(id: number, input: AdminInput): Promise<ActionResult<SetupDelivery>> {
  const admin = await superadmin();
  if ("ok" in admin) return admin;
  const eid = eventId.safeParse(id);
  if (!eid.success) return { ok: false };
  const parsed = parseAdminInput(input);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const result = await addAdmin(eid.data, parsed.value, admin.id);
  if (!result.ok) return { ok: false, errors: result.errors };
  revalidatePath("/admin/events");
  return { ok: true, data: result.delivery };
}

export async function newLinkAction(id: string): Promise<ActionResult<SetupDelivery>> {
  const admin = await superadmin();
  if ("ok" in admin) return admin;
  const pid = personId.safeParse(id);
  if (!pid.success) return { ok: false };
  const delivery = await newSetupLink(pid.data, admin.id);
  revalidatePath("/admin/events");
  return delivery ? { ok: true, data: delivery } : { ok: false };
}

export async function removeAdminAction(id: string): Promise<ActionResult<{ firstName: string }>> {
  const admin = await superadmin();
  if ("ok" in admin) return admin;
  const pid = personId.safeParse(id);
  if (!pid.success || pid.data === admin.id) return { ok: false };
  const name = await removeAdmin(pid.data, admin.id);
  revalidatePath("/admin/events");
  return name ? { ok: true, data: { firstName: name } } : { ok: false };
}

/** Deletes an event's invites, payments and activity. Only when the super admin types its name. */
export async function clearEventAction(id: number, typedName: string): Promise<ActionResult<{ event: string; invites: number; payments: number }>> {
  const admin = await superadmin();
  if ("ok" in admin) return admin;
  const eid = eventId.safeParse(id);
  if (!eid.success) return { ok: false };
  const event = await getEvent(eid.data);
  if (!confirmsEventName(String(typedName ?? ""), event.name)) return { ok: false };
  const result = await clearEventData(event.id, admin.id);
  revalidatePath("/admin", "layout");
  return { ok: true, data: { event: event.name, ...result } };
}
