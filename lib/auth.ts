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

export type Admin = { id: string; first_name: string; phone_e164: string };

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
    .select("id, first_name, phone_e164")
    .eq("auth_user_id", authUserId)
    .eq("role", "admin")
    .eq("active", true)
    .maybeSingle();
  return (data as Admin | null) ?? null;
}

/** For pages and layouts: the admin, or a redirect to the login screen. */
export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
