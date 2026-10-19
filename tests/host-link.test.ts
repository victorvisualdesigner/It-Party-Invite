import { describe, expect, it } from "vitest";
import copy from "@/content/copy.json";
import { t } from "@/lib/copy";
import { eventFromHostCode, hostCode } from "@/lib/host-link";

const SECRET = "a".repeat(48);
const OTHER = "b".repeat(48);

describe("event admin sign in links", () => {
  it("opens the event it was made for", () => {
    for (const id of [1, 3, 42, 32000]) expect(eventFromHostCode(hostCode(id, SECRET), SECRET)).toBe(id);
  });

  it("gives every event its own code, unguessable from the id", () => {
    const one = hostCode(1, SECRET);
    const three = hostCode(3, SECRET);
    expect(one).not.toBe(three);
    expect(one).toMatch(/^1-[A-Za-z0-9_-]{12}$/);
    // Swapping the id onto another event's signature does not open that event.
    expect(eventFromHostCode(`3-${one.split("-").slice(1).join("-")}`, SECRET)).toBeNull();
  });

  it("refuses codes this app did not make", () => {
    const good = hostCode(3, SECRET);
    expect(eventFromHostCode(good, OTHER)).toBeNull();
    expect(eventFromHostCode(good.slice(0, -1) + (good.endsWith("A") ? "B" : "A"), SECRET)).toBeNull();
    for (const junk of ["", "3", "3-", "0-abcdefghijkl", "-1-abcdefghijkl", "3-short", "3-abcdefghijklm", "x-abcdefghijkl", "3-abcdefghij/l"]) {
      expect(eventFromHostCode(junk, SECRET)).toBeNull();
    }
  });
});

describe("event admin sign in copy", () => {
  it("names the event, and the setup message carries the sign in link", () => {
    expect(t("admin.host_login.title", { event: "Amapiano" })).toBe("Sign in to run Amapiano");
    const message = t("admin.admins.link_message", { admin: "Tolu", event: "Amapiano", link: "https://x/admin/setup/abc", login: "https://x/host/3-abc" });
    expect(message).toContain("https://x/admin/setup/abc");
    expect(message).toContain("https://x/host/3-abc");
    expect(message).not.toMatch(/\{\w+\}/);
    const strings = [...Object.entries(copy.admin.host_login).filter(([k]) => k !== "_about").map(([, v]) => v), copy.admin.events.host_link_label, copy.admin.events.host_link_help, copy.admin.events.host_link_open, copy.admin.admins.link_message];
    for (const s of strings) expect(s).not.toMatch(/\s[-–—]\s/);
  });
});
