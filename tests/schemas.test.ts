import { describe, expect, it } from "vitest";
import { t } from "@/lib/copy";
import { parseAccountInput, parseEventInput, parseMemberInput, parseSlotLimit, type EventInput } from "@/lib/schemas";

const base: EventInput = {
  name: "Only Yes",
  date: "2026-12-19",
  time: "20:00",
  venue_name: "The Glasshouse",
  venue_address: "14 Bourdillon Road, Ikoyi, Lagos",
  dress_code: "Black tie, with a touch of gold",
  end_date: "",
  days: [],
  price: "50000",
  refund_text: "",
  capacity: "120",
  hold_window_hours: "72",
  unopened_expiry_days: "7",
  invites_open: true,
  installments: false,
  reveal_date_mode: "card",
  reveal_date_at: "",
  reveal_venue_mode: "at_time",
  reveal_venue_at: "2026-12-17T20:00",
  card: { theme: "emerald", foil: "gold", paper: "cream", note: "", subtitle: "" },
};

describe("event settings", () => {
  it("turns the form into stored values", () => {
    const r = parseEventInput(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.starts_at).toBe("2026-12-19T19:00:00.000Z");
    expect(r.value.price_kobo).toBe(5_000_000);
    expect(r.value.capacity).toBe(120);
    expect(r.value.refund_text).toBe(t("admin.event.refund_default"));
    expect(r.value.reveal_venue_at).toBe("2026-12-17T19:00:00.000Z");
    expect(r.value.reveal_date_at).toBeNull();
  });

  it("treats an empty or zero capacity as no capacity", () => {
    for (const capacity of ["", "0"]) {
      const r = parseEventInput({ ...base, capacity });
      expect(r.ok && r.value.capacity).toBeNull();
    }
  });

  it("reports each bad field with its copy string", () => {
    const r = parseEventInput({
      ...base,
      name: "  ",
      time: "",
      price: "50k",
      capacity: "1.5",
      hold_window_hours: "0",
      unopened_expiry_days: "x",
      reveal_venue_at: "",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual({
      name: t("admin.event.errors.name"),
      date: t("admin.event.errors.date"),
      price: t("admin.event.errors.whole_number"),
      capacity: t("admin.event.errors.whole_number"),
      hold_window_hours: t("admin.event.errors.hold", { max: 8760 }),
      unopened_expiry_days: t("admin.event.errors.whole_number"),
      reveal_venue_at: t("admin.event.errors.reveal_at"),
    });
  });

  it("takes a long hold window like 730 hours, up to a year", () => {
    const r = parseEventInput({ ...base, hold_window_hours: "730" });
    expect(r.ok && r.value.hold_window_hours).toBe(730);
    expect(parseEventInput({ ...base, hold_window_hours: "8761" }).ok).toBe(false);
  });

  it("keeps a last day and each day's own name and dress code", () => {
    const r = parseEventInput({
      ...base,
      end_date: "2026-12-22",
      days: [
        { date: "2026-12-20", name: " Day  two ", dress_code: "All white" },
        { date: "2026-12-21", name: "", dress_code: "" },
        { date: "2027-01-05", name: "Outside the range", dress_code: "" },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.end_date).toBe("2026-12-22");
    expect(r.value.days).toEqual([{ date: "2026-12-20", name: "Day two", dress_code: "All white" }]);
  });

  it("refuses a last day on or before the first", () => {
    const r = parseEventInput({ ...base, end_date: "2026-12-19" });
    expect(!r.ok && r.errors.end_date).toBe(t("admin.event.errors.end_date"));
  });

  it("refuses unknown reveal modes", () => {
    expect(parseEventInput({ ...base, reveal_date_mode: "declined" as never }).ok).toBe(false);
  });
});

describe("payout account", () => {
  it("strips spaces from the account number", () => {
    const r = parseAccountInput({ bank_name: " Providus Bank ", account_number: "0123 456 789", account_name: "Only Yes Hosts" });
    expect(r).toEqual({ ok: true, value: { bank_name: "Providus Bank", account_number: "0123456789", account_name: "Only Yes Hosts" } });
  });
  it("needs 10 digits and both names", () => {
    const r = parseAccountInput({ bank_name: "", account_number: "012345678", account_name: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["account_name", "account_number", "bank_name"]);
  });
});

describe("members", () => {
  it("accepts a member with 3 slots and one with Unlimited", () => {
    expect(parseMemberInput({ first_name: "Tolu", phone: "0803 111 0001", unlimited: false, slots: "3" })).toEqual({
      ok: true,
      value: { first_name: "Tolu", phone_e164: "+2348031110001", slot_limit: 3 },
    });
    expect(parseMemberInput({ first_name: "Dayo", phone: "0805 222 0002", unlimited: true, slots: "" })).toEqual({
      ok: true,
      value: { first_name: "Dayo", phone_e164: "+2348052220002", slot_limit: null },
    });
  });
  it("uses the member copy for bad names and numbers", () => {
    const r = parseMemberInput({ first_name: "", phone: "0803", unlimited: false, slots: "3" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.first_name).toBe(t("member.new_invite.name_error"));
    expect(r.errors.phone).toBe(t("member.new_invite.phone_error"));
  });
  it("reads the slots select", () => {
    expect(parseSlotLimit("u")).toEqual({ ok: true, value: null });
    expect(parseSlotLimit("5")).toEqual({ ok: true, value: 5 });
    expect(parseSlotLimit("-1").ok).toBe(false);
    expect(parseSlotLimit("abc").ok).toBe(false);
  });
});
