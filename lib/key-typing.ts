// Formats an access key while it is typed: VELVET4827 shows as VELVET 4827. Safe on the client.

/** The space appears as soon as the first digit does. Letters first, then up to four digits. */
export function formatKeyTyping(value: string): string {
  const raw = String(value).toUpperCase();
  const [, word = "", digits = ""] = raw.replace(/[^A-Z0-9]/g, "").match(/^([A-Z]*)([0-9]*)/) ?? [];
  const w = word.slice(0, 12);
  const d = digits.slice(0, 4);
  if (d) return w ? `${w} ${d}` : d;
  return w && /\s$/.test(raw) ? `${w} ` : w;
}
