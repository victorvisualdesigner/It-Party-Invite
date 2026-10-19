// Pay small small: when an event allows it, a guest sends the ticket price in parts. These rules
// need no database, so the guest page, the payment code and the tests share them.

/** The smallest part a guest can send, in kobo: ₦1,000. A last part smaller than this is fine. */
export const MIN_PART_KOBO = 100_000;

/** What is left to pay once the confirmed parts are taken off the price. Never below zero. */
export function balanceKobo(priceKobo: number, paidKobo: number): number {
  return Math.max(0, priceKobo - paidKobo);
}

/** The smallest and largest part a guest may send now, in kobo. */
export function partBounds(balance: number): { min: number; max: number } {
  return { min: Math.min(MIN_PART_KOBO, balance), max: balance };
}

/**
 * A part amount typed in naira ("20000", "20,000" or "₦20,000") to kobo, or null when it is not a
 * whole number of naira inside the bounds for this balance.
 */
export function parsePartAmount(raw: unknown, balance: number): number | null {
  const text = String(raw ?? "").replace(/[₦,\s]/g, "");
  if (!/^\d{1,9}$/.test(text)) return null;
  const kobo = Number(text) * 100;
  const { min, max } = partBounds(balance);
  return kobo >= min && kobo <= max && kobo > 0 ? kobo : null;
}

export function isFullyPaid(priceKobo: number, paidKobo: number): boolean {
  return paidKobo >= priceKobo;
}
