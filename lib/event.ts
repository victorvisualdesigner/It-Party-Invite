// Event helpers that are safe on both server and client: reference prefix, Lagos time, reveals.
import { t } from "@/lib/copy";
import type { EventDay, RevealMode } from "@/lib/types";

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** A Lagos calendar date (YYYY-MM-DD) as the card shows it: "12th of Dec, 2026". */
export function formatCardDate(date: string, withYear = true): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${ordinal(d)} of ${MONTHS[m - 1]}${withYear ? `, ${y}` : ""}`;
}

/** "19th of Dec, 2026 at 8pm" in Lagos time. */
export function formatEventDate(iso: string): string {
  return t("guest.card.date_at", { date: formatCardDate(lagosDate(iso)), time: formatTime(iso) });
}

/** The most days one event can span. */
export const MAX_EVENT_DAYS = 31;
const DAY_MS = 24 * HOUR;

/** The Lagos calendar date (YYYY-MM-DD) of a UTC ISO time. */
export function lagosDate(iso: string): string {
  return toLagosParts(iso).date;
}

/** Every calendar date from the first day to the last, inclusive. One date when there is no end date. */
export function eventDates(startsAt: string | null, endDate: string | null): string[] {
  if (!startsAt) return [];
  const first = lagosDate(startsAt);
  if (!endDate || endDate <= first) return [first];
  const out: string[] = [];
  for (let ms = Date.parse(`${first}T12:00:00Z`); out.length < MAX_EVENT_DAYS; ms += DAY_MS) {
    const d = new Date(ms).toISOString().slice(0, 10);
    if (d > endDate) break;
    out.push(d);
  }
  return out;
}

/** A Lagos calendar date in words. Noon UTC keeps the day the same in every time zone. */
function dateWords(date: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
}

/** "Sat, 12th of Apr", for the day by day editor. */
export function formatDayLabel(date: string): string {
  return `${dateWords(date, { weekday: "short" })}, ${formatCardDate(date, false)}`;
}

/**
 * When the event happens. One day: "19th of Dec, 2026 at 8pm".
 * Several days: "12th to 16th of Apr, 2027, from 8pm", across months "30th of Apr to 2nd of May,
 * 2027, from 8pm", and across years "30th of Dec, 2026 to 2nd of Jan, 2027, from 8pm".
 */
export function formatEventWhen(startsAt: string, endDate: string | null): string {
  const dates = eventDates(startsAt, endDate);
  if (dates.length < 2) return formatEventDate(startsAt);
  const first = dates[0];
  const last = dates[dates.length - 1];
  const from =
    first.slice(0, 7) === last.slice(0, 7)
      ? ordinal(Number(first.slice(8, 10)))
      : formatCardDate(first, first.slice(0, 4) !== last.slice(0, 4));
  return t("guest.card.date_range", { from, to: formatCardDate(last), time: formatTime(startsAt) });
}

/** "8pm" or "8:30pm" in Lagos time. */
export function formatTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" })
    .replace(":00", "")
    .replace(/\s/g, "")
    .toLowerCase();
}

export type DayView = { date: string; label: string; number: number; name: string; dress: string };

/**
 * Each day of a multi-day event with its own name and dress code, falling back to the event's.
 * Empty for a one day event.
 */
export function eventDays(e: { starts_at: string | null; end_date: string | null; days: EventDay[]; name: string; dress_code: string }): DayView[] {
  const dates = eventDates(e.starts_at, e.end_date);
  if (dates.length < 2) return [];
  const byDate = new Map((e.days ?? []).map((d) => [d.date, d]));
  return dates.map((date, i) => {
    const own = byDate.get(date);
    return {
      date,
      label: formatDayLabel(date),
      number: i + 1,
      name: own?.name?.trim() || e.name,
      dress: own?.dress_code?.trim() || e.dress_code,
    };
  });
}

/** True when any day has its own name or dress code, so the day by day list is worth showing. */
export function daysDiffer(days: DayView[], e: { name: string; dress_code: string }): boolean {
  return days.some((d) => d.name !== e.name || d.dress !== e.dress_code);
}

/** "17th of Dec, 2026" in Lagos time. */
export function formatDay(iso: string): string {
  return formatCardDate(lagosDate(iso));
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
