import { describe, expect, it } from "vitest";
import keyWords from "@/content/key-words.json";
import { generateKey, hashKey, normalizeKey, verifyKey } from "@/lib/keys";

describe("access keys", () => {
  it("generates WORD DDDD from the word list with digits 2 to 9", () => {
    for (let i = 0; i < 500; i++) {
      const key = generateKey();
      const [word, digits] = key.split(" ");
      expect(keyWords.words).toContain(word);
      expect(digits).toMatch(/^[2-9]{4}$/);
    }
  });

  it("normalizes case, spaces, dashes and dots", () => {
    expect(normalizeKey("velvet 4827")).toBe("VELVET4827");
    expect(normalizeKey("Velvet-48.27")).toBe("VELVET4827");
  });

  it("stores only a salted scrypt hash, and verifies any spelling of the key", async () => {
    const hash = await hashKey("VELVET 4827");
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(hash).not.toContain("VELVET");
    expect(await verifyKey("velvet4827", hash)).toBe(true);
    expect(await verifyKey("VELVET 4828", hash)).toBe(false);
    expect(await verifyKey("", hash)).toBe(false);
    expect(await verifyKey("VELVET 4827", null)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashKey("AMBER 2345")).not.toBe(await hashKey("AMBER 2345"));
  });
});
