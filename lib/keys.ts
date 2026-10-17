// Access keys: one word from content/key-words.json and four digits from 2 to 9, e.g. VELVET 4827.
// Only a scrypt hash with a per row salt is ever stored.
import "server-only";
import { randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import keyWords from "@/content/key-words.json";

const DIGITS = keyWords.digits_allowed;
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;

function scryptAsync(secret: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, length, { ...options, maxmem: 64 * 1024 * 1024 }, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });
}

export function generateKey(): string {
  const word = keyWords.words[randomInt(keyWords.words.length)];
  let digits = "";
  for (let i = 0; i < 4; i++) digits += DIGITS[randomInt(DIGITS.length)];
  return `${word} ${digits}`;
}

/** Uppercase, keep only A to Z and 2 to 9. "velvet-4827" and "VELVET 4827" both become VELVET4827. */
export function normalizeKey(value: string): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z2-9]/g, "");
}

/** Hashes the normalized key. Format: scrypt$N$r$p$salt$hash (base64url). */
export async function hashKey(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(normalizeKey(plain), salt, KEY_LENGTH, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyKey(plain: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltText, hashText] = parts;
  const expected = Buffer.from(hashText, "base64url");
  const normalized = normalizeKey(plain);
  if (!normalized || expected.length !== KEY_LENGTH) return false;
  const actual = await scryptAsync(normalized, Buffer.from(saltText, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}
