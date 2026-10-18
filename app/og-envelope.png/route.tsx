// The 1200x630 link preview: a sealed cream envelope with a red wax seal on deep green.
// Same for every guest, built once at build time. No event details, ever.
import { ImageResponse } from "next/og";
import { BRAND_SPARK, BRAND_Y } from "@/lib/brand";
import { SEAL_D } from "@/lib/seal";

export const dynamic = "force-static";

// Colours mirror design/tokens.css (green-650, green-900, green-950, paper, wax, seal, foil).
// The seal carries the brand impression from lib/brand.ts.
const W = 520;
const H = 325;
const scene = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
  <radialGradient id="bg" cx="50%" cy="-10%" r="120%"><stop offset="0" stop-color="#1C4537"/><stop offset=".55" stop-color="#0F2A22"/><stop offset="1" stop-color="#0A1D17"/></radialGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#C8A24A" stop-opacity=".35"/><stop offset="1" stop-color="#C8A24A" stop-opacity="0"/></radialGradient>
  <linearGradient id="back" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D7CAB0"/><stop offset="1" stop-color="#CDBEA2"/></linearGradient>
  <linearGradient id="flap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3EBDC"/><stop offset="1" stop-color="#E3D5BC"/></linearGradient>
  <radialGradient id="wa" cx="34%" cy="28%" r="78%"><stop offset="0" stop-color="#BF3A3A"/><stop offset=".55" stop-color="#8E1B1B"/><stop offset="1" stop-color="#651010"/></radialGradient>
  <radialGradient id="wb" cx="62%" cy="68%" r="62%"><stop offset="0" stop-color="#651010"/><stop offset="1" stop-color="#A52626"/></radialGradient>
  <linearGradient id="foil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2DFA4"/><stop offset=".5" stop-color="#E8D193"/><stop offset="1" stop-color="#C8A24A"/></linearGradient>
</defs>
<rect width="1200" height="630" fill="url(#bg)"/>
<ellipse cx="600" cy="315" rx="380" ry="260" fill="url(#glow)"/>
<g transform="translate(${(1200 - W) / 2} ${(630 - H) / 2})">
  <rect x="0" y="14" width="${W}" height="${H}" rx="12" fill="#000" opacity=".35"/>
  <rect width="${W}" height="${H}" rx="12" fill="url(#back)"/>
  <polygon points="0,0 ${W * 0.52},${H * 0.54} 0,${H}" fill="#EBE1CE"/>
  <polygon points="${W},0 ${W * 0.48},${H * 0.54} ${W},${H}" fill="#E7DCC7"/>
  <polygon points="0,${H} ${W / 2},${H * 0.46} ${W},${H}" fill="#F2EADB"/>
  <polygon points="0,0 ${W},0 ${W / 2},${H * 0.57 + 4}" fill="#3C2C14" opacity=".14"/>
  <polygon points="0,0 ${W},0 ${W / 2},${H * 0.57}" fill="url(#flap)"/>
  <g transform="translate(${W / 2 - 56} ${H * 0.57 - 66}) scale(1.12)">
    <path d="${SEAL_D}" transform="translate(0 2.5)" fill="#000" opacity=".35"/>
    <path d="${SEAL_D}" fill="url(#wa)"/>
    <circle cx="50" cy="50" r="31" fill="url(#wb)" opacity=".9"/>
    <circle cx="50" cy="50" r="31" fill="none" stroke="#E8D193" stroke-opacity=".45" stroke-width="1.1"/>
    <g transform="translate(0 1)" fill="#000" fill-opacity=".38"><path d="${BRAND_Y}"/><path d="${BRAND_SPARK}"/></g>
    <g fill="url(#foil)"><path d="${BRAND_Y}"/><path d="${BRAND_SPARK}"/></g>
    <ellipse cx="34" cy="27" rx="13" ry="5.5" fill="#fff" opacity=".13" transform="rotate(-32 34 27)"/>
  </g>
</g>
</svg>`;

export function GET() {
  const src = `data:image/svg+xml;base64,${Buffer.from(scene).toString("base64")}`;
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <img src={src} width={1200} height={630} alt="" />
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
