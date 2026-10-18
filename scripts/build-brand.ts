// Writes the logo files: app/icon.svg (the favicon) and the kit in docs/brand.
//
//   npm run brand
//
// Everything comes from lib/brand.ts, so change the drawing there and run this again.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HEX, appIconSvg, flatMarkSvg, lockupSvg, markSvg, monoMarkSvg, stackedSvg } from "@/lib/brand-svg";

const out = join(process.cwd(), "docs", "brand");
mkdirSync(out, { recursive: true });

const files: Record<string, string> = {
  "only-yes-mark.svg": markSvg({ size: 512 }),
  "only-yes-mark-small.svg": markSvg({ size: 64, small: true }),
  "only-yes-mark-flat.svg": flatMarkSvg({ size: 256 }),
  "only-yes-mark-gold.svg": monoMarkSvg(HEX.gold500),
  "only-yes-mark-green.svg": monoMarkSvg(HEX.green900),
  "only-yes-mark-cream.svg": monoMarkSvg(HEX.cream100),
  "only-yes-logo-on-green.svg": lockupSvg({ tone: "green", height: 160 }),
  "only-yes-logo-on-cream.svg": lockupSvg({ tone: "cream", height: 160 }),
  "only-yes-logo-name-only-on-green.svg": lockupSvg({ tone: "green", tagline: false, height: 120 }),
  "only-yes-logo-name-only-on-cream.svg": lockupSvg({ tone: "cream", tagline: false, height: 120 }),
  "only-yes-logo-stacked-on-green.svg": stackedSvg({ tone: "green" }),
  "only-yes-logo-stacked-on-cream.svg": stackedSvg({ tone: "cream" }),
  "only-yes-app-icon.svg": appIconSvg(512),
};
for (const [name, svg] of Object.entries(files)) writeFileSync(join(out, name), svg + "\n");

// The favicon: two flat colours read best at 16 pixels.
writeFileSync(join(process.cwd(), "app", "icon.svg"), flatMarkSvg({ size: 64 }) + "\n");

/** Places a standalone SVG inside the board. */
function place(svg: string, x: number, y: number, w: number, h: number): string {
  return svg.replace(/^<svg xmlns="[^"]+" width="[^"]+" height="[^"]+"/, `<svg x="${x}" y="${y}" width="${w}" height="${h}"`);
}
const label = (x: number, y: number, text: string, fill: string = HEX.gold700, anchor = "start") =>
  `<text x="${x}" y="${y}" fill="${fill}" font-family="Urbanist, Helvetica Neue, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="2.6" text-anchor="${anchor}">${text}</text>`;
const swatch = (x: number, name: string, hex: string, ink: string) =>
  `<g transform="translate(${x} 852)"><rect width="150" height="104" rx="14" fill="${hex}" stroke="${HEX.ink900}" stroke-opacity=".08"/>` +
  `<text x="16" y="64" fill="${ink}" font-family="Urbanist, Helvetica Neue, Arial, sans-serif" font-size="15" font-weight="700">${name}</text>` +
  `<text x="16" y="86" fill="${ink}" fill-opacity=".75" font-family="ui-monospace, Menlo, monospace" font-size="13">${hex}</text></g>`;

const board =
  `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><title>Only Yes brand board</title>` +
  `<defs><radialGradient id="bgA" cx="50%" cy="0%" r="110%"><stop offset="0" stop-color="${HEX.green650}"/><stop offset=".6" stop-color="${HEX.green900}"/><stop offset="1" stop-color="${HEX.green950}"/></radialGradient>` +
  `<radialGradient id="glowA" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${HEX.gold500}" stop-opacity=".22"/><stop offset="1" stop-color="${HEX.gold500}" stop-opacity="0"/></radialGradient>` +
  `<clipPath id="tile"><rect width="112" height="112" rx="26"/></clipPath></defs>` +
  `<rect width="1600" height="1000" fill="${HEX.cream50}"/>` +
  // Primary: stacked on bottle green
  `<rect width="900" height="640" fill="url(#bgA)"/><ellipse cx="450" cy="300" rx="380" ry="260" fill="url(#glowA)"/>` +
  place(stackedSvg({ tone: "green" }), 450 - 207, 110, 414, 400) +
  label(48, 600, "PRIMARY LOGO", HEX.gold300) +
  // Horizontal on cream
  `<rect x="900" width="700" height="320" fill="${HEX.cream100}"/>` +
  place(lockupSvg({ tone: "cream", height: 110 }), 1250 - 237, 105, 474, 110) +
  label(948, 290, "HORIZONTAL, ON CREAM") +
  // Name only on deep green
  `<rect x="900" y="320" width="700" height="320" fill="${HEX.green950}"/>` +
  place(lockupSvg({ tone: "green", tagline: false, height: 84 }), 1250 - 181, 438, 362, 84) +
  label(948, 610, "NAME ONLY, ON GREEN", HEX.gold300) +
  // The marks
  place(markSvg({ size: 150 }), 48, 668, 150, 154) +
  place(markSvg({ size: 64, small: true }), 236, 720, 64, 66) +
  place(markSvg({ size: 32, small: true }), 322, 737, 32, 33) +
  place(markSvg({ size: 16, small: true }), 374, 745, 16, 17) +
  place(flatMarkSvg({ size: 112 }), 440, 690, 112, 112) +
  place(monoMarkSvg(HEX.gold500, 112), 580, 690, 112, 112) +
  place(monoMarkSvg(HEX.green900, 112), 720, 690, 112, 112) +
  `<g transform="translate(862 690)" clip-path="url(#tile)">${place(appIconSvg(112), 0, 0, 112, 112)}</g>` +
  label(48, 836, "SEAL MARK, SMALL CUT, FLAT, GOLD FOIL, ONE COLOUR, APP ICON") +
  // Type
  `<text x="1030" y="728" fill="${HEX.green900}" font-family="Unbounded, Helvetica Neue, Arial, sans-serif" font-size="40" font-weight="600" letter-spacing="1.6">ONLY YES</text>` +
  `<text x="1030" y="760" fill="${HEX.ink900}" font-family="Urbanist, Helvetica Neue, Arial, sans-serif" font-size="16" font-weight="500">Unbounded 600 for the name. Urbanist for everything you read.</text>` +
  `<text x="1030" y="800" fill="${HEX.gold700}" font-family="Urbanist, Helvetica Neue, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="4.4">BY INVITATION ONLY</text>` +
  // Colour
  swatch(48, "Bottle green", HEX.green900, HEX.cream100) +
  swatch(214, "Antique gold", HEX.gold500, HEX.ink900) +
  swatch(380, "Wax red", HEX.seal600, HEX.cream100) +
  swatch(546, "Cream paper", HEX.cream100, HEX.ink900) +
  swatch(712, "Ink", HEX.ink900, HEX.cream100) +
  `<text x="1030" y="880" fill="${HEX.ink900}" font-family="Urbanist, Helvetica Neue, Arial, sans-serif" font-size="15" font-weight="500"><tspan x="1030">The Y is the only answer, and its open arms are the</tspan><tspan x="1030" dy="22">envelope flap lifting. The spark is the gold that falls</tspan><tspan x="1030" dy="22">when a guest says it.</tspan></text>` +
  `</svg>`;
writeFileSync(join(out, "brand-board.svg"), board + "\n");

console.log(`Wrote ${Object.keys(files).length + 1} files to docs/brand and app/icon.svg.`);
