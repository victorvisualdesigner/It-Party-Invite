import type { Metadata, Viewport } from "next";
import { Pinyon_Script, Plus_Jakarta_Sans, Unbounded, Urbanist } from "next/font/google";
import { SealDefs } from "@/components/Seal";
import "@/design/tokens.css";
import "./base.css";

// Only the latin files are preloaded. The latin-ext and vietnamese files (the naira sign, and the
// dots and accents in Yoruba and Igbo names) stay behind a unicode-range, so a browser fetches
// them only on a page that needs them.
const display = Unbounded({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-unbounded-face",
});

const script = Pinyon_Script({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-pinyon-face",
});

const ui = Urbanist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-urbanist-face",
});

// Urbanist has no naira sign. Plus Jakarta Sans sits second in the stack and supplies only that
// glyph: it is never preloaded, and its files download only when a page shows ₦.
const naira = Plus_Jakarta_Sans({
  subsets: ["latin-ext"],
  weight: ["400", "600"],
  display: "swap",
  preload: false,
  variable: "--font-naira-face",
});

export const metadata: Metadata = {
  title: { default: "Private", template: "%s" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0F2A22",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${script.variable} ${ui.variable} ${naira.variable}`}>
      <body>
        <SealDefs />
        {children}
      </body>
    </html>
  );
}
