// Admin sessions: Supabase Auth email and password, with the session in httpOnly cookies.
// The anon key stays on the server: sign in happens in a server action.
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/**
 * The signed in host. `eventId` is the event every page and action works on: an event admin's own
 * event, or the one the superadmin opened last (the first event until they pick one).
 * Null only for a superadmin before any event exists.
 */
export type Admin = {
  id: string;
  first_name: string;
  phone_e164: string;
  role: "superadmin" | "admin";
  event_id: number | null;
  eventId: number | null;
};

/** The event the superadmin is looking at. Only an id; every read checks it exists. */
export const EVENT_COOKIE = "oy_ev";

/** A Supabase client bound to this request's auth cookies. */
export async function authClient() {
  const store = await cookies();
  return createServerClient(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components cannot set cookies. proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/** The admin behind this request, checked against the Auth server and the people table. */
export const getAdmin = cache(async (): Promise<Admin | null> => {
  const supabase = await authClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return adminForAuthUser(data.user.id);
});

export async function adminForAuthUser(authUserId: string): Promise<Admin | null> {
  const { data } = await db()
    .from("people")
    .select("id, first_name, phone_e164, role, event_id")
    .eq("auth_user_id", authUserId)
    .in("role", ["superadmin", "admin"])
    .eq("active", true)
    .maybeSingle();
  if (!data) return null;
  const admin = data as Omit<Admin, "eventId">;
  if (admin.role === "admin") return { ...admin, eventId: admin.event_id };
  // The superadmin: the event they opened, if it still exists, or the first one.
  const store = await cookies();
  const wanted = Number(store.get(EVENT_COOKIE)?.value);
  const { data: events } = await db().from("event").select("id").order("id", { ascending: true });
  const ids = (events ?? []).map((e) => e.id as number);
  return { ...admin, eventId: ids.includes(wanted) ? wanted : ids[0] ?? null };
}

/** For pages and layouts: the admin, or a redirect to the login screen. */
export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export type EventAdmin = Admin & { eventId: number };

/** For pages about one event. A superadmin with no event yet is sent to create one. */
export async function requireEventAdmin(): Promise<EventAdmin> {
  const admin = await requireAdmin();
  if (admin.eventId == null) redirect("/admin/events");
  return admin as EventAdmin;
}

/** For server actions: the admin with an event in scope, or null. */
export async function getEventAdmin(): Promise<EventAdmin | null> {
  const admin = await getAdmin();
  return admin && admin.eventId != null ? (admin as EventAdmin) : null;
}

/** Only the superadmin adds and removes admins. Others are sent back to the overview. */
export async function requireSuperadmin(): Promise<Admin> {
  const admin = await requireAdmin();
  if (admin.role !== "superadmin") redirect("/admin");
  return admin;
}
