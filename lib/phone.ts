// Normalize, validate, mask and format phone numbers. Default region is Nigeria.
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * Accepts 0803 123 4567, 803 123 4567, +234 803 123 4567, 2348031234567, 00234...,
 * and foreign numbers written with a + and country code. Returns E.164, or null when invalid.
 */
export function normalizePhone(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let candidate: string;
  if (raw.startsWith("+")) candidate = "+" + digits;
  else if (digits.startsWith("00")) candidate = "+" + digits.slice(2);
  else if (digits.startsWith("234") && digits.length >= 13) candidate = "+" + digits;
  else candidate = digits;

  // People often keep the trunk 0 after the country code: +234 0803 ...
  if (candidate.startsWith("+2340")) {
    digits = candidate.slice(5);
    candidate = "+234" + digits;
  }

  const parsed = parsePhoneNumberFromString(candidate, "NG");
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/** 0803 123 4567 for Nigerian numbers, international format for the rest. */
export function localPhone(e164: string): string {
  if (e164.startsWith("+234")) {
    const local = "0" + e164.slice(4);
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

/** 080•••••567: first 3 and last 3 digits of the local form. Foreign: +44 •••••123. */
export function maskPhone(e164: string): string {
  if (e164.startsWith("+234")) {
    const local = "0" + e164.slice(4);
    return `${local.slice(0, 3)}•••••${local.slice(-3)}`;
  }
  const code = parsePhoneNumberFromString(e164)?.countryCallingCode ?? "";
  return `+${code} •••••${e164.slice(-3)}`;
}
