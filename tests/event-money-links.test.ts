import { describe, expect, it } from "vitest";
import copy from "@/content/copy.json";
import { fill, t } from "@/lib/copy";
import { derivePrefix, eventDates, eventDays, formatEventDate, formatEventWhen, fromLagos, groupAccountNumber, isRevealed, revealHint, toLagosParts } from "@/lib/event";
import { formatNaira, nairaDigits, nairaToKobo } from "@/lib/money";
import { smsLink, waLink } from "@/lib/whatsapp";

describe("reference prefix", () => {
  it.each([
    ["Only Yes", "OY"],
    ["December Club", "DC"],
    ["Gala", "GA"],
    ["the  après party", "TA"],
    ["2026", null],
    ["A", null],
  ])("%s gives %s", (name, prefix) => {
    expect(derivePrefix(name)).toBe(prefix);
  });
});

describe("Lagos time", () => {
  it("round trips the wall clock through UTC", () => {
    const iso = fromLagos("2026-12-19", "20:00");
    expect(iso).toBe("2026-12-19T19:00:00.000Z");
    expect(toLagosParts(iso)).toEqual({ date: "2026-12-19", time: "20:00" });
  });
  it("rejects half filled values", () => {
    expect(fromLagos("2026-12-19", "")).toBeNull();
    expect(fromLagos("", "20:00")).toBeNull();
  });
  it("formats the event date like the card", () => {
    expect(formatEventDate("2026-12-19T19:00:00.000Z")).toBe("Saturday, 19 December, 8pm");
    expect(formatEventWhen("2026-12-19T19:00:00.000Z", null)).toBe("Saturday, 19 December, 8pm");
  });

  it("writes a date range for events over several days", () => {
    expect(formatEventWhen("2027-04-12T19:00:00.000Z", "2027-04-16")).toBe("Monday 12 to Friday 16 April, from 8pm");
    expect(formatEventWhen("2027-04-30T19:00:00.000Z", "2027-05-02")).toBe("Friday 30 April to Sunday 2 May, from 8pm");
    expect(eventDates("2027-04-12T19:00:00.000Z", "2027-04-14")).toEqual(["2027-04-12", "2027-04-13", "2027-04-14"]);
    // 11pm UTC is already the next day in Lagos.
    expect(eventDates("2027-04-11T23:30:00.000Z", null)).toEqual(["2027-04-12"]);
  });

  it("gives each day its own name and dress code, or the event's", () => {
    const days = eventDays({
      starts_at: "2027-04-12T19:00:00.000Z",
      end_date: "2027-04-13",
      days: [{ date: "2027-04-13", name: "White party", dress_code: "All white" }],
      name: "The Special One",
      dress_code: "Black tie",
    });
    expect(days.map((d) => [d.label, d.name, d.dress])).toEqual([
      ["Mon 12 Apr", "The Special One", "Black tie"],
      ["Tue 13 Apr", "White party", "All white"],
    ]);
  });
});

describe("reveals", () => {
  const at = "2026-12-17T19:00:00.000Z";
  it("follows each mode", () => {
    expect(isRevealed("card", null, false)).toBe(true);
    expect(isRevealed("after_payment", null, false)).toBe(false);
    expect(isRevealed("after_payment", null, true)).toBe(true);
    expect(isRevealed("at_time", at, false, Date.parse(at) - 1)).toBe(false);
    expect(isRevealed("at_time", at, false, Date.parse(at))).toBe(true);
    expect(isRevealed("at_time", null, true)).toBe(false);
    expect(isRevealed("hidden", null, true)).toBe(false);
  });
  it("words the hint", () => {
    expect(revealHint("at_time", at, "2026-12-19T19:00:00.000Z")).toBe("48 hours before");
    expect(revealHint("at_time", "2026-12-01T09:00:00.000Z", "2026-12-19T19:00:00.000Z")).toBe("on 1 December");
    expect(revealHint("after_payment", null, null)).toBe("once you're in");
    expect(revealHint("hidden", null, null)).toBe("soon");
  });
});

describe("money", () => {
  it("shows naira with the sign and separators, copies digits only", () => {
    expect(formatNaira(5_000_000)).toBe("₦50,000");
    expect(nairaDigits(5_000_000)).toBe("50000");
  });
  it("reads whole naira typed by the admin", () => {
    expect(nairaToKobo("50,000")).toBe(5_000_000);
    expect(nairaToKobo("₦ 50000")).toBe(5_000_000);
    expect(nairaToKobo("50000.50")).toBeNull();
    expect(nairaToKobo("-1")).toBeNull();
  });
  it("groups account numbers", () => {
    expect(groupAccountNumber("0123456789")).toBe("0123 456 789");
  });
});

describe("deep links", () => {
  const text = t("admin.members.key_message", {
    member: "Tolu",
    event: "Only Yes",
    link: "http://localhost:3000/m",
    key: "LANTERN 5372",
  });
  it("opens WhatsApp to the number without the plus, with the whole message", () => {
    const href = waLink("+2348031110001", text);
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe("https://wa.me/2348031110001");
    expect(url.searchParams.get("text")).toBe(text);
    expect(text).toContain("LANTERN 5372");
  });
  it("builds the SMS fallback", () => {
    expect(smsLink("+2348031110001", "a b")).toBe("sms:+2348031110001?body=a%20b");
  });
});

describe("copy", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(fill("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });
  it("has every Phase 1 string with no dashes between clauses", () => {
    const strings = [
      copy.admin.common.saving,
      copy.admin.common.error_network,
      copy.admin.login.error,
      copy.admin.login.submitting,
      ...Object.values(copy.admin.account.errors),
      copy.admin.account.added,
      ...Object.values(copy.admin.event.errors),
      copy.admin.nav.label,
    ];
    for (const s of strings) expect(s).not.toMatch(/\s[-–—]\s/);
  });
});
