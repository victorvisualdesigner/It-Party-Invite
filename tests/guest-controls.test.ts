import { describe, expect, it } from "vitest";
import copy from "@/content/copy.json";
import { askAllowed } from "@/lib/ask-inviter";
import type { GuestView } from "@/lib/guest";
import { guestPageHtml } from "@/lib/guest-html";
import { priceEditable, seatPrice } from "@/lib/price";

const assets = { css: "/g/a.css", js: "/g/a.js" };

describe("a guest's own price", () => {
  it("uses the guest's price when a host set one, zero included, else the event's", () => {
    const event = { price_kobo: 5_000_000 };
    expect(seatPrice({ price_kobo: null }, event)).toBe(5_000_000);
    expect(seatPrice({}, event)).toBe(5_000_000);
    expect(seatPrice({ price_kobo: 3_000_000 }, event)).toBe(3_000_000);
    expect(seatPrice({ price_kobo: 0 }, event)).toBe(0);
  });

  it("can change only before they pay and while no transfer is being checked", () => {
    for (const status of ["sent", "opened", "said_yes"] as const) expect(priceEditable({ status })).toBe(true);
    for (const status of ["draft", "awaiting_confirmation", "paid", "expired", "cancelled"] as const) expect(priceEditable({ status })).toBe(false);
  });
});

describe("asking the inviter, as a host allows it", () => {
  it("is on by default, and off when a host turns it off or turned a request down", () => {
    expect(askAllowed({})).toBe(true);
    expect(askAllowed({ ask_inviter_off: false, pay_request_rejected_at: null })).toBe(true);
    expect(askAllowed({ ask_inviter_off: true })).toBe(false);
    expect(askAllowed({ pay_request_rejected_at: "2026-10-20T10:00:00.000Z" })).toBe(false);
  });
});

describe("the VIP card", () => {
  it("never marks the lock screen, so nobody learns who is VIP before unlock", () => {
    const html = guestPageHtml({ screen: "lock", masked: "080•••••567" } as GuestView, assets, "https://invite.example.com");
    expect(html).not.toMatch(/data-vip/);
    // The crest ships inside the card, hidden by CSS until the page is marked VIP.
    expect(html).toMatch(/class="vip-only vip-crest"/);
  });

  it("marks the page once a VIP guest is in", () => {
    const card = { theme: "emerald", foil: "gold", paper: "cream", note: "", subtitle: "" };
    const html = guestPageHtml({ screen: "card", vip: true, event: { card } } as unknown as GuestView, assets, "https://invite.example.com");
    expect(html).toMatch(/<html lang="en" data-card-theme="emerald" data-card-foil="gold" data-card-paper="cream" data-vip="">/);
    const plain = guestPageHtml({ screen: "card", vip: false, event: { card } } as unknown as GuestView, assets, "https://invite.example.com");
    expect(plain).not.toMatch(/data-vip/);
  });
});

describe("guest control copy", () => {
  it("has no dashes between clauses", () => {
    const m = copy.admin.guests.manage;
    const strings = [...Object.values(m), copy.guest.held.rejected, copy.guest.asked.pending, copy.guest.vip.tag, copy.guest.card.parts_hint,
      copy.guest.transfer.plan_label, copy.guest.transfer.plan_full, copy.guest.transfer.plan_parts, copy.guest.transfer.plan_parts_sub,
      copy.guest.transfer.part_after, copy.guest.transfer.part_clears, copy.guest.transfer.part_quick, copy.guest.transfer.progress];
    for (const s of strings) expect(s).not.toMatch(/\s[-–—]\s/);
  });
});
