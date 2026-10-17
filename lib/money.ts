// Money is stored in kobo. Guests see whole naira with the sign and separators.
const naira = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

/** 5000000 kobo becomes ₦50,000. */
export function formatNaira(kobo: number): string {
  return "₦" + naira.format(Math.round(kobo / 100));
}

/** Digits only, for the Copy button: bank apps reject symbols. 5000000 kobo becomes 50000. */
export function nairaDigits(kobo: number): string {
  return String(Math.round(kobo / 100));
}

/** Whole naira typed by the admin, to kobo. Returns null for anything that is not a whole number. */
export function nairaToKobo(input: string): number | null {
  const cleaned = String(input ?? "").replace(/[₦,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned) * 100;
  return Number.isSafeInteger(value) && value <= 2_000_000_000 ? value : null;
}
