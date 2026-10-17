"use client";

/**
 * Calls a server action from a client component. A dropped connection comes back as
 * { ok: false, network: true } instead of an error screen, so nothing typed is lost.
 * A signed out admin is sent to the login screen.
 */
export async function callAction<R extends { ok: boolean }>(run: () => Promise<R>): Promise<R | { ok: false; network: true }> {
  try {
    const result = await run();
    if (!result.ok && "signedOut" in result && result.signedOut) window.location.assign("/admin/login");
    return result;
  } catch {
    return { ok: false, network: true };
  }
}
