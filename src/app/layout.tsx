import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { GeistMono, GeistSans, InstrumentSerif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NOOR SOCIAL OS",
    template: "%s · NOOR SOCIAL OS",
  },
  description:
    "The social media operating system for agencies, businesses, and creators. Powered by Noor Studio Agency.",
  applicationName: "NOOR SOCIAL OS",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${InstrumentSerif.variable} h-full`}
    >
      <body className="min-h-full bg-canvas text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
