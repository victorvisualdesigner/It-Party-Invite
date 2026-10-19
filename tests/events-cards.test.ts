import { describe, expect, it } from "vitest";
import { t } from "@/lib/copy";
import { parseCreateEvent, parseEventInput } from "@/lib/schemas";
import { cardDesign, DEFAULT_CARD } from "@/lib/types";

describe("card design", () => {
  it("fills anything missing or unknown with the house look", () => {
    expect(cardDesign(null)).toEqual(DEFAULT_CARD);
    expect(cardDesign({ theme: "neon", foil: "silver", paper: 3, note: "Champagne on arrival" })).toEqual({
      theme: "emerald",
      foil: "silver",
      paper: "cream",
      note: "Champagne on arrival",
    });
  });
});

describe("creating an event", () => {
  const admin = { first_name: "", email: "", phone: "" };

  it("needs only a name", () => {
    const r = parseCreateEvent({ name: "  Lagos   Gala ", admin });
    expect(r.ok && r.value).toEqual({ name: "Lagos Gala", admin: null });
  });

  it("checks the admin once any of their fields is filled", () => {
    const r = parseCreateEvent({ name: "Lagos Gala", admin: { ...admin, first_name: "Tolu" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors["admin.email"]).toBe(t("admin.admins.errors.email"));
    expect(r.errors["admin.phone"]).toBe(t("member.new_invite.phone_error"));
  });

  it("keeps a complete admin", () => {
    const r = parseCreateEvent({ name: "Lagos Gala", admin: { first_name: "Tolu", email: "Tolu@Example.com", phone: "0803 111 0001" } });
    expect(r.ok && r.value.admin).toEqual({ first_name: "Tolu", email: "tolu@example.com", phone_e164: "+2348031110001" });
  });

  it("refuses an empty name", () => {
    const r = parseCreateEvent({ name: " ", admin });
    expect(!r.ok && r.errors.name).toBe(t("admin.events.errors.name"));
  });
});

describe("event settings keep the card design", () => {
  it("trims the note and refuses one that is too long", () => {
    const base = {
      name: "Only Yes", date: "2026-12-19", time: "20:00", end_date: "", days: [], venue_name: "", venue_address: "", dress_code: "",
      price: "0", refund_text: "", capacity: "", hold_window_hours: "72", unopened_expiry_days: "7", invites_open: true,
      reveal_date_mode: "card" as const, reveal_date_at: "", reveal_venue_mode: "card" as const, reveal_venue_at: "",
    };
    const ok = parseEventInput({ ...base, card: { theme: "wine", foil: "rose", paper: "blush", note: "  Champagne   on arrival " } });
    expect(ok.ok && ok.value.card).toEqual({ theme: "wine", foil: "rose", paper: "blush", note: "Champagne on arrival" });
    const long = parseEventInput({ ...base, card: { theme: "wine", foil: "rose", paper: "blush", note: "x".repeat(81) } });
    expect(!long.ok && long.errors.card_note).toBe(t("admin.event.errors.card_note", { n: 80 }));
  });
});
