/**
 * Font pairs for the DemoSites style presets. next/font self-hosts these at
 * build time (no external requests on the demo page) and gives us stable
 * font-family strings we inject as CSS variables in the preview renderer.
 */
import { Fraunces, Inter, Lora, Playfair_Display, Space_Grotesk } from "next/font/google";
import type { DemoSiteStyleId } from "@/lib/demosites-design";

const inter = Inter({ subsets: ["latin"], display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap" });
const lora = Lora({ subsets: ["latin"], display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap" });

export type DemoFontPair = {
  heading: string;
  body: string;
  /** classNames that make next/font actually load the fonts */
  classNames: string;
};

const FONT_PAIRS: Record<DemoSiteStyleId, DemoFontPair> = {
  modern: {
    heading: inter.style.fontFamily,
    body: inter.style.fontFamily,
    classNames: inter.className,
  },
  elegant: {
    heading: playfair.style.fontFamily,
    body: lora.style.fontFamily,
    classNames: `${playfair.className} ${lora.className}`,
  },
  warm: {
    heading: fraunces.style.fontFamily,
    body: inter.style.fontFamily,
    classNames: `${fraunces.className} ${inter.className}`,
  },
  tech: {
    heading: spaceGrotesk.style.fontFamily,
    body: inter.style.fontFamily,
    classNames: `${spaceGrotesk.className} ${inter.className}`,
  },
};

export function getDemoFontPair(style: DemoSiteStyleId): DemoFontPair {
  return FONT_PAIRS[style] || FONT_PAIRS.modern;
}
