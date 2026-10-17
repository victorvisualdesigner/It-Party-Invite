// Ticket codes and their QR codes. A code is random, unguessable, and checked in once.
import { randomInt } from "node:crypto";
import QRCode from "qrcode";

// No 0, 1, I, L or O, so a code read aloud or typed at the door cannot be misread.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** TS-7F3K-92QD style: the event prefix, then 8 random characters. */
export function newTicketCode(prefix: string): string {
  let body = "";
  for (let i = 0; i < 8; i++) body += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/** Uppercase, letters and digits only. Accepts a scanned value or anything typed at the door. */
export function normalizeTicketCode(value: string): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** QR code as an SVG path that draws in the current text colour, so CSS decides the ink. */
export async function ticketQrSvg(code: string): Promise<string> {
  const svg = await QRCode.toString(code, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  return svg
    .replace(/<path[^>]*fill="#ffffff"[^>]*\/>/i, "")
    .replace(/stroke="#000000"/g, 'stroke="currentColor"')
    .replace(/fill="#000000"/g, 'fill="currentColor"')
    .replace("<svg ", '<svg aria-hidden="true" ');
}
