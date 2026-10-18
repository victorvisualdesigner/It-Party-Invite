// The logo as standalone SVG strings, for files that live outside a page: the favicon, the home screen
// icon, the link preview and the kit in docs/brand. Pages use components/brand/Logo.tsx instead.
import { BRAND_SPARK, BRAND_SPARK_SMALL, BRAND_Y, BRAND_Y_SMALL, TAGLINE, WORDMARK } from "./brand";
import { SEAL_D } from "./seal";

/** Hex copies of design/tokens.css. A file on its own cannot read CSS variables. */
export const HEX = {
  green950: "#0A1D17",
  green900: "#0F2A22",
  green650: "#1C4537",
  cream100: "#F3ECDF",
  cream50: "#FBF7EF",
  gold300: "#E8D193",
  gold500: "#C8A24A",
  gold700: "#8F7230",
  foilLight: "#F2DFA4",
  seal600: "#8E1B1B",
  seal500: "#A52626",
  waxDark: "#651010",
  waxLight: "#BF3A3A",
  ink900: "#1C1A16",
} as const;

const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';

/** Gradients for one mark. `id` keeps several marks on one sheet apart. */
export function markDefs(id: string): string {
  return (
    `<radialGradient id="${id}a" cx="34%" cy="28%" r="78%"><stop offset="0" stop-color="${HEX.waxLight}"/><stop offset=".55" stop-color="${HEX.seal600}"/><stop offset="1" stop-color="${HEX.waxDark}"/></radialGradient>` +
    `<radialGradient id="${id}b" cx="62%" cy="68%" r="62%"><stop offset="0" stop-color="${HEX.waxDark}"/><stop offset="1" stop-color="${HEX.seal500}"/></radialGradient>` +
    `<linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${HEX.foilLight}"/><stop offset=".5" stop-color="${HEX.gold300}"/><stop offset="1" stop-color="${HEX.gold500}"/></linearGradient>`
  );
}

/** The full colour seal, drawn on a 100 unit square. Needs markDefs(id) in the same document. */
export function markBody(id: string, small = false): string {
  const y = small ? BRAND_Y_SMALL : BRAND_Y;
  const s = small ? BRAND_SPARK_SMALL : BRAND_SPARK;
  const glyph = `<path d="${y}"/><path d="${s}"/>`;
  return (
    `<path d="${SEAL_D}" transform="translate(0 2.5)" fill="#000" fill-opacity=".35"/>` +
    `<path d="${SEAL_D}" fill="url(#${id}a)"/>` +
    `<circle cx="50" cy="50" r="31" fill="url(#${id}b)" opacity=".9"/>` +
    (small ? "" : `<circle cx="50" cy="50" r="31" fill="none" stroke="${HEX.gold300}" stroke-opacity=".45" stroke-width="1.1"/>`) +
    `<g transform="translate(0 1)" fill="#000" fill-opacity=".38">${glyph}</g>` +
    `<g fill="url(#${id}f)">${glyph}</g>` +
    `<ellipse cx="34" cy="27" rx="13" ry="5.5" fill="#fff" fill-opacity=".13" transform="rotate(-32 34 27)"/>`
  );
}

export function markSvg({ size = 512, small = false }: { size?: number; small?: boolean } = {}): string {
  return `<svg ${XMLNS} width="${size}" height="${size}" viewBox="0 0 100 103"><title>Only Yes</title><defs>${markDefs("m")}</defs>${markBody("m", small)}</svg>`;
}

/** Two flat colours: the favicon, stickers, embroidery. */
export function flatMarkSvg({ wax = HEX.seal600, ink = HEX.cream100, size = 64 }: { wax?: string; ink?: string; size?: number } = {}): string {
  return (
    `<svg ${XMLNS} width="${size}" height="${size}" viewBox="0 0 100 100"><title>Only Yes</title>` +
    `<path d="${SEAL_D}" fill="${wax}"/><path d="${BRAND_Y_SMALL}" fill="${ink}"/><path d="${BRAND_SPARK_SMALL}" fill="${ink}"/></svg>`
  );
}

/** One colour with the glyph cut out: foil stamping, a rubber stamp, a single colour print. */
export function monoMarkSvg(color: string, size = 256): string {
  return (
    `<svg ${XMLNS} width="${size}" height="${size}" viewBox="0 0 100 100"><title>Only Yes</title>` +
    `<path fill="${color}" fill-rule="evenodd" d="${SEAL_D} ${BRAND_Y} ${BRAND_SPARK}"/></svg>`
  );
}

/** The home screen icon: the seal on a bottle green tile. */
export function appIconSvg(size = 180): string {
  return (
    `<svg ${XMLNS} width="${size}" height="${size}" viewBox="0 0 100 100"><defs>${markDefs("i")}` +
    `<radialGradient id="ibg" cx="50%" cy="0%" r="110%"><stop offset="0" stop-color="${HEX.green650}"/><stop offset=".6" stop-color="${HEX.green900}"/><stop offset="1" stop-color="${HEX.green950}"/></radialGradient></defs>` +
    `<rect width="100" height="100" fill="url(#ibg)"/><g transform="translate(14 13) scale(.72)">${markBody("i", true)}</g></svg>`
  );
}

// Lockup geometry, in the mark's 100 units. The wordmark's cap height is 0.375 of the mark,
// the line under it 0.1225, which is what the CSS in app/base.css does with --logo-s.
const WORD_K = 39.5 / 790;
const TAG_K = 12.8 / 1460;
const WORD_W = WORDMARK.width * WORD_K;
const TAG_W = TAGLINE.width * TAG_K;

export type Tone = "green" | "cream";
const toneInk = (tone: Tone) => (tone === "green" ? { word: HEX.cream100, tag: HEX.gold300 } : { word: HEX.green900, tag: HEX.gold700 });

function word(x: number, top: number, fill: string): string {
  return `<path transform="translate(${r(x)} ${r(top + 770 * WORD_K)}) scale(${WORD_K})" fill="${fill}" d="${WORDMARK.d}"/>`;
}
function tag(x: number, top: number, fill: string): string {
  return `<path transform="translate(${r(x)} ${r(top + 1430 * TAG_K)}) scale(${r(TAG_K, 6)})" fill="${fill}" d="${TAGLINE.d}"/>`;
}
const r = (n: number, places = 2) => Number(n.toFixed(places));

/** Mark on the left, name on the right. Transparent background. */
export function lockupSvg({ tone = "green", tagline = true, height = 120, background }: { tone?: Tone; tagline?: boolean; height?: number; background?: string } = {}): string {
  const ink = toneInk(tone);
  const x = 124;
  const block = tagline ? 39.5 + 12 + 12.8 : 39.5;
  const top = (100 - block) / 2;
  const w = Math.ceil(x + WORD_W);
  const pad = background ? 28 : 0;
  const vw = w + pad * 2;
  const vh = 103 + pad * 2;
  return (
    `<svg ${XMLNS} width="${Math.round((height * vw) / vh)}" height="${height}" viewBox="${-pad} ${-pad} ${vw} ${vh}"><title>Only Yes</title><defs>${markDefs("l")}</defs>` +
    (background ? `<rect x="${-pad}" y="${-pad}" width="${vw}" height="${vh}" fill="${background}"/>` : "") +
    markBody("l") +
    word(x, top, ink.word) +
    (tagline ? tag(x, top + 39.5 + 12, ink.tag) : "") +
    `</svg>`
  );
}

/** Mark above, name below, centred. Transparent background. */
export function stackedSvg({ tone = "green", height = 320, background }: { tone?: Tone; height?: number; background?: string } = {}): string {
  const ink = toneInk(tone);
  const w = Math.ceil(WORD_W);
  const pad = background ? 36 : 0;
  const vw = w + pad * 2;
  const vh = 186 + pad * 2;
  return (
    `<svg ${XMLNS} width="${Math.round((height * vw) / vh)}" height="${height}" viewBox="${-pad} ${-pad} ${vw} ${vh}"><title>Only Yes</title><defs>${markDefs("k")}</defs>` +
    (background ? `<rect x="${-pad}" y="${-pad}" width="${vw}" height="${vh}" fill="${background}"/>` : "") +
    `<g transform="translate(${r((WORD_W - 100) / 2)} 0)">${markBody("k")}</g>` +
    word(0, 120, ink.word) +
    tag((WORD_W - TAG_W) / 2, 171.5, ink.tag) +
    `</svg>`
  );
}
