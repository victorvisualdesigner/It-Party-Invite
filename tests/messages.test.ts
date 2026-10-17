import { describe, expect, it } from "vitest";
import messages from "@/content/invite-messages.json";
import { assembleMessage, messageParts, randomCombo, PART_SIZES } from "@/lib/messages";

const LONG = { guest: "Oluwaseyifunmi", inviter: "Chukwuemeka" };
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function longest(part: string[], vars = LONG): number {
  return Math.max(...part.map((line) => words(line.replace(/\{guest\}/g, vars.guest).replace(/\{inviter\}/g, vars.inviter))));
}

describe("invite messages", () => {
  it("keeps every combination under 60 words, and under 72 with the covered line", () => {
    // The four parts are independent, so the longest message is the sum of the longest lines.
    const base = longest(messages.opening) + longest(messages.pull) + longest(messages.mystery) + longest(messages.close);
    const covered = base + longest(messages.covered_lines);
    expect(base).toBeLessThan(60);
    expect(covered).toBeLessThan(72);
  });

  it("checks the claim on every one of the 160,000 combinations", () => {
    let max = 0;
    const len = (arr: string[]) => arr.map((l) => words(l.replace(/\{guest\}/g, LONG.guest).replace(/\{inviter\}/g, LONG.inviter)));
    const [o, p, m, c] = [len(messages.opening), len(messages.pull), len(messages.mystery), len(messages.close)];
    for (const a of o) for (const b of p) for (const x of m) for (const d of c) max = Math.max(max, a + b + x + d);
    expect(PART_SIZES).toEqual([20, 20, 20, 20]);
    expect(max).toBeLessThan(60);
  });

  it("puts the link on its own line and the key line last, with no event details", () => {
    const full = assembleMessage({ ...LONG, link: "https://invite.example.com/i/abc", key: "VELVET 4827", combo: [3, 11, 0, 17], keyLine: 1 });
    const parts = messageParts(full);
    expect(parts.link).toBe("https://invite.example.com/i/abc");
    expect(parts.keyLine).toContain("VELVET 4827");
    expect(parts.body).toContain("Oluwaseyifunmi");
    expect(parts.body).toContain("Chukwuemeka");
    expect(full).not.toMatch(/\{\w+\}/);
    expect(full.split("\n\n")).toHaveLength(3);
  });

  it("adds the covered line only when asked", () => {
    const base = { ...LONG, link: "L", key: "K 2345", combo: [0, 0, 0, 0], keyLine: 0 };
    expect(assembleMessage(base)).not.toContain(messages.covered_lines[0].slice(0, 20));
    expect(assembleMessage({ ...base, coveredLine: 4 })).toContain("It's on Chukwuemeka. Just come.");
  });

  it("draws combinations inside the library", () => {
    for (let i = 0; i < 1000; i++) {
      const c = randomCombo();
      c.forEach((n, j) => expect(n).toBeLessThan(PART_SIZES[j]));
    }
  });
});
