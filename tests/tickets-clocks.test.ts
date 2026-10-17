import { describe, expect, it } from "vitest";
import { pausedClock, resumedClock } from "@/lib/invites";
import { newTicketCode, normalizeTicketCode, ticketQrSvg } from "@/lib/tickets";
import type { Invite } from "@/lib/types";

describe("ticket codes", () => {
  it("are the event prefix and 8 unambiguous characters", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const code = newTicketCode("TS");
      expect(code).toMatch(/^TS-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
      seen.add(code);
    }
    expect(seen.size).toBe(2000);
  });
  it("normalize whatever the door types or scans", () => {
    expect(normalizeTicketCode(" ts-7f3k 92qd ")).toBe("TS7F3K92QD");
  });
  it("render a QR SVG that inherits the text colour", async () => {
    const svg = await ticketQrSvg("TS-7F3K-92QD");
    expect(svg).toMatch(/^<svg aria-hidden="true" /);
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).not.toContain("#ffffff");
  });
});

describe("hold clock", () => {
  const inv = (patch: Partial<Invite>) => ({ expires_at: null, hold_remaining_ms: null, ...patch }) as Invite;
  it("pauses with the time that was left", () => {
    const left = 5 * 3600e3;
    const p = pausedClock(inv({ expires_at: new Date(Date.now() + left).toISOString() }));
    expect(p.expires_at).toBeNull();
    expect(Math.abs((p.hold_remaining_ms ?? 0) - left)).toBeLessThan(2000);
  });
  it("resumes with at least 6 hours after Not found", () => {
    const short = resumedClock(inv({ hold_remaining_ms: 60e3 }));
    expect(Date.parse(short.expires_at) - Date.now()).toBeGreaterThan(6 * 3600e3 - 2000);
    const long = resumedClock(inv({ hold_remaining_ms: 40 * 3600e3 }));
    expect(Date.parse(long.expires_at) - Date.now()).toBeGreaterThan(40 * 3600e3 - 2000);
    expect(long.hold_remaining_ms).toBeNull();
  });
});
