import { describe, expect, it } from "vitest";
import copy from "@/content/copy.json";
import { partsView, type GuestView } from "@/lib/guest";
import { guestPageHtml } from "@/lib/guest-html";
import { balanceKobo, isFullyPaid, MIN_PART_KOBO, parsePartAmount, partBounds } from "@/lib/installments";
import { confirmsEventName } from "@/lib/settings";

const PRICE = 5_000_000; // ₦50,000

describe("pay small small", () => {
  it("takes confirmed parts off the price and never goes below zero", () => {
    expect(balanceKobo(PRICE, 0)).toBe(PRICE);
    expect(balanceKobo(PRICE, 2_000_000)).toBe(3_000_000);
    expect(balanceKobo(PRICE, 6_000_000)).toBe(0);
    expect(isFullyPaid(PRICE, 4_999_900)).toBe(false);
    expect(isFullyPaid(PRICE, PRICE)).toBe(true);
  });

  it("asks for at least ₦1,000, or the last bit when less is left", () => {
    expect(partBounds(3_000_000)).toEqual({ min: MIN_PART_KOBO, max: 3_000_000 });
    expect(partBounds(50_000)).toEqual({ min: 50_000, max: 50_000 });
  });

  it("reads the amount a guest types, in naira, inside the bounds only", () => {
    expect(parsePartAmount("20000", 3_000_000)).toBe(2_000_000);
    expect(parsePartAmount("₦20,000", 3_000_000)).toBe(2_000_000);
    expect(parsePartAmount(" 30,000 ", 3_000_000)).toBe(3_000_000);
    expect(parsePartAmount("30001", 3_000_000)).toBeNull();
    expect(parsePartAmount("999", 3_000_000)).toBeNull();
    expect(parsePartAmount("500", 50_000)).toBe(50_000);
    for (const bad of ["", "0", "-500", "20000.50", "abc", null, undefined, "1e5"]) expect(parsePartAmount(bad, 3_000_000)).toBeNull();
  });

  it("shows the guest what is in and what is left", () => {
    expect(partsView(PRICE, 0)).toEqual({
      paid: null,
      paid_digits: "0",
      price: "₦50,000",
      price_digits: "50000",
      balance: "₦50,000",
      balance_digits: "50000",
      min: "₦1,000",
      min_digits: "1000",
    });
    expect(partsView(PRICE, 2_000_000)).toMatchObject({ paid: "₦20,000", balance: "₦30,000", balance_digits: "30000" });
  });

  it("ships the amount field hidden, and nothing about money before unlock", () => {
    const html = guestPageHtml({ screen: "lock", masked: "080•••••567" } as GuestView, { css: "/g/a.css", js: "/g/a.js" }, "https://invite.example.com");
    expect(html).toMatch(/<div class="plan" id="plan" hidden>/);
    expect(html).toMatch(/id="plan-full" checked/);
    expect(html).toMatch(/<span class="card-shine" aria-hidden="true"><\/span>/);
    expect(html).not.toMatch(/₦\d/);
  });

  it("has every new string with no dashes between clauses", () => {
    const t = copy.guest.transfer;
    const strings = [t.part_toggle, t.part_full, t.part_label, t.part_help, t.part_error, t.paid_so_far_label, t.balance_label, copy.guest.held.part_title, copy.guest.held.part_body,
      copy.admin.event.installments_label, copy.admin.event.installments_help, copy.admin.payments.part_note, copy.admin.payments.part_first, copy.admin.payments.part_confirmed_toast,
      copy.admin.guests.part_paid, copy.admin.activity.part_paid, copy.admin.events.clear, copy.admin.events.clear_title, copy.admin.events.clear_body, copy.admin.events.clear_type_label,
      copy.admin.events.clear_ok, copy.admin.events.clear_done];
    for (const s of strings) expect(s).not.toMatch(/\s[-–—]\s/);
  });
});

describe("clearing an event", () => {
  it("needs the event's name typed out, ignoring case and spaces", () => {
    expect(confirmsEventName("amapiano   edition ", "Amapiano Edition")).toBe(true);
    expect(confirmsEventName("Amapiano", "Amapiano Edition")).toBe(false);
    expect(confirmsEventName("   ", "Amapiano Edition")).toBe(false);
    expect(confirmsEventName("", "")).toBe(false);
  });
});
