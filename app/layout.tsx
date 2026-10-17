import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { SealDefs } from "@/components/Seal";
import "@/design/tokens.css";
import "./base.css";

// Only the latin files are preloaded. The latin-ext files (which hold the naira sign) stay behind a
// unicode-range, so a browser fetches them only on a page that shows ₦.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-fraunces-face",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-inter-face",
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
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <SealDefs />
        {children}
      </body>
    </html>
  );
}
