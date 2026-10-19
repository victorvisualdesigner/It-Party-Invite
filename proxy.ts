// Keeps the admin's Supabase session fresh and sends signed out visitors to the login screen.
// This is a convenience, not the security boundary: every admin page and action checks again on the server.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  // The login screen and a new admin's one time setup link work without a session.
  const onLogin = request.nextUrl.pathname === "/admin/login" || request.nextUrl.pathname.startsWith("/admin/setup/");

  // Server actions answer a signed out caller themselves ({ signedOut: true }), so the form can react.
  const isAction = request.headers.has("next-action");

  if (!signedIn && !onLogin && !isAction) {
    const login = request.nextUrl.clone();
    login.pathname = "/admin/login";
    login.search = "";
    const redirect = NextResponse.redirect(login);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/board"],
};
