// Event helpers that are safe on both server and client: reference prefix, Lagos time, reveals.
import { t } from "@/lib/copy";
import type { RevealMode } from "@/lib/types";

export const TIME_ZONE = "Africa/Lagos";
// Lagos is UTC+1 all year, with no daylight saving.
const LAGOS_OFFSET_MS = 3600e3;
const HOUR = 3600e3;

/**
 * Two letters for payment references: the first letters of the first two words, or the first two
 * letters of a single word. "Only Yes" gives OY, "December Club" gives DC. Null if there are too few letters.
 */
export function derivePrefix(name: string): string | null {
  const words = String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length >= 2) return words[0][0] + words[1][0];
  if (words.length === 1 && words[0].length >= 2) return words[0].slice(0, 2);
  return null;
}

/** UTC ISO time to the Lagos wall clock parts used by date and time inputs. */
export function toLagosParts(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return { date: "", time: "" };
  const shifted = new Date(ms + LAGOS_OFFSET_MS).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

/** Lagos wall clock date (YYYY-MM-DD) and time (HH:MM) to a UTC ISO string. */
export function fromLagos(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const ms = Date.parse(`${date}T${time}:00+01:00`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function isRevealed(mode: RevealMode, at: string | null, paid: boolean, now = Date.now()): boolean {
  if (mode === "card") return true;
  if (mode === "after_payment") return paid;
  if (mode === "at_time") return !!at && now >= Date.parse(at);
  return false;
}

/** "Saturday, 19 December, 8pm" in Lagos time. */
export function formatEventDate(iso: string): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString("en-GB", { timeZone: TIME_ZONE, weekday: "long" });
  const day = d.toLocaleDateString("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "long" });
  const time = d
    .toLocaleTimeString("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" })
    .replace(":00", "")
    .replace(/\s/g, "")
    .toLowerCase();
  return `${weekday}, ${day}, ${time}`;
}

/** "19 December" in Lagos time. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "long" });
}

/** The words after "Revealed" on the card: "once you're in", "48 hours before", "on 17 December", or "soon". */
export function revealHint(mode: RevealMode, at: string | null, startsAt: string | null): string {
  if (mode === "after_payment") return t("guest.card.reveal_after_payment");
  if (mode === "at_time" && at) {
    const hours = startsAt ? Math.round((Date.parse(startsAt) - Date.parse(at)) / HOUR) : 0;
    return hours > 0 && hours <= 96
      ? t("guest.card.reveal_hours_before", { n: hours })
      : t("guest.card.reveal_on_date", { date: formatDay(at) });
  }
  return t("guest.card.revealed_soon_short");
}

/** 0123456789 shown as 0123 456 789. */
export function groupAccountNumber(n: string): string {
  return n.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3");
}
