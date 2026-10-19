import { describe, expect, it } from "vitest";
import copy from "@/content/copy.json";
import messages from "@/content/invite-messages.json";
import { canAskInviter, canLetInFree, inviterPayPath, isAskingInviter } from "@/lib/ask-inviter";
import { t } from "@/lib/copy";
import type { GuestView } from "@/lib/guest";
import { guestPageHtml } from "@/lib/guest-html";
import { askInviterMessage } from "@/lib/messages";
import { waLink } from "@/lib/whatsapp";

const LONG = { guest: "Oluwaseyifunmi", inviter: "Chukwuemeka" };
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const asking = { status: "said_yes" as const, covered: false, pay_requested_at: "2026-10-19T10:00:00.000Z" };

describe("asking the inviter to pay", () => {
  it("is allowed only while the guest still owes a transfer", () => {
    expect(canAskInviter({ status: "opened", covered: false })).toBe(true);
    expect(canAskInviter({ status: "said_yes", covered: false })).toBe(true);
    for (const status of ["draft", "sent", "awaiting_confirmation", "paid", "expired", "cancelled"] as const) {
      expect(canAskInviter({ status, covered: false })).toBe(false);
    }
    expect(canAskInviter({ status: "said_yes", covered: true })).toBe(false);
  });

  it("counts as asking only while the request stands and nobody has paid or covered them", () => {
    expect(isAskingInviter(asking)).toBe(true);
    expect(isAskingInviter({ ...asking, pay_requested_at: null })).toBe(false);
    expect(isAskingInviter({ ...asking, covered: true })).toBe(false);
    expect(isAskingInviter({ ...asking, status: "awaiting_confirmation" })).toBe(false);
    expect(isAskingInviter({ ...asking, status: "paid" })).toBe(false);
  });

  it("lets an admin waive the fee only for a host's guest who is asking", () => {
    expect(canLetInFree(asking, "admin")).toBe(true);
    expect(canLetInFree(asking, "superadmin")).toBe(true);
    expect(canLetInFree(asking, "member")).toBe(false);
    expect(canLetInFree(asking, null)).toBe(false);
    expect(canLetInFree({ ...asking, pay_requested_at: null }, "admin")).toBe(false);
    expect(canLetInFree({ ...asking, status: "paid" }, "admin")).toBe(false);
  });

  it("sends members to their own page and hosts to the Guests list", () => {
    expect(inviterPayPath("member")).toBe("/m");
    expect(inviterPayPath("admin")).toBe("/admin/guests");
    expect(inviterPayPath("superadmin")).toBe("/admin/guests");
  });
});

describe("the ask line the guest sends", () => {
  const link = "https://invite.example.com/m";
  const lines = messages.ask_inviter_messages.lines;

  it("fills every line, stays short with long names, and never puts dashes between clauses", () => {
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < lines.length; i++) {
      const text = askInviterMessage(LONG.inviter, LONG.guest, link, i);
      expect(text).not.toMatch(/\{\w+\}/);
      expect(text).toContain(LONG.inviter);
      expect(text).toContain(LONG.guest);
      expect(text.endsWith(link)).toBe(true);
      expect(words(text)).toBeLessThan(30);
      expect(text).not.toMatch(/\s[-–—]\s/);
    }
  });

  it("keeps the same line for the same pick, so polling never changes it", () => {
    expect(askInviterMessage("Tolu", "Ada", link, 1729332000000)).toBe(askInviterMessage("Tolu", "Ada", link, 1729332000000));
    expect(askInviterMessage("Tolu", "Ada", link, -5)).toBe(askInviterMessage("Tolu", "Ada", link, 5));
  });

  it("opens WhatsApp to the inviter with the line filled in", () => {
    const text = askInviterMessage("Tolu", "Ada", link, 0);
    const url = new URL(waLink("+2348031110001", text));
    expect(url.pathname).toBe("/2348031110001");
    expect(url.searchParams.get("text")).toBe(text);
  });
});

describe("ask copy", () => {
  it("has every new string, with no dashes between clauses", () => {
    const strings = [
      copy.guest.transfer.ask_inviter,
      ...Object.entries(copy.guest.asked).filter(([k]) => k !== "_about").map(([, v]) => v),
      copy.member.status.asked,
      copy.admin.guests.asked,
      copy.admin.guests.actions.let_in_free,
      copy.admin.guests.let_in_free_title,
      copy.admin.guests.let_in_free_body,
      copy.admin.guests.let_in_free_done,
      copy.admin.activity.asked_inviter,
      copy.admin.activity.let_in_free,
    ];
    for (const s of strings) {
      expect(s.length).toBeGreaterThan(0);
      expect(s).not.toMatch(/\s[-–—]\s/);
    }
    expect(t("guest.transfer.ask_inviter", { inviter: "Tolu" })).toBe("Tolu is paying for me");
  });
});

describe("guest page markup", () => {
  const assets = { css: "/g/guest.css", js: "/g/guest.js" };

  it("ships the ask button and the asked screen hidden, with nothing about the inviter before unlock", () => {
    const html = guestPageHtml({ screen: "lock", masked: "080•••••567" } as GuestView, assets, "https://invite.example.com");
    expect(html).toMatch(/<button class="btn btn-ghost" type="button" id="btn-ask" hidden><\/button>/);
    expect(html).toMatch(/<section class="screen" id="s-asked" hidden/);
    expect(html).toMatch(/id="asked-title"><\/h1>/);
    expect(html).toContain('href="#"');
    expect(html).not.toContain("wa.me");
  });
});
