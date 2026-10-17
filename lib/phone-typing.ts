// Formats a phone number while it is typed: 0803 123 4567, or +234 803 123 4567.
// Kept free of libphonenumber so client bundles stay small.
export function formatPhoneTyping(value: string): string {
  const raw = String(value);
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) {
    const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9), digits.slice(9, 13)];
    return "+" + parts.filter(Boolean).join(" ");
  }
  const local = digits.slice(0, 11);
  return [local.slice(0, 4), local.slice(4, 7), local.slice(7)].filter(Boolean).join(" ");
}
