import localFont from "next/font/local";

export { GeistSans } from "geist/font/sans";
export { GeistMono } from "geist/font/mono";

// Instrument Serif (SIL OFL 1.1, see src/fonts/InstrumentSerif-OFL.txt) is the
// display face for page titles and the marketing site. UI text and every
// number use Geist Sans.
export const InstrumentSerif = localFont({
  src: [
    { path: "../fonts/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument-serif",
  display: "swap",
});
