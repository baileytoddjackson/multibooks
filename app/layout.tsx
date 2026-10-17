import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Fraunces, Literata } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: "variable",
  axes: ["SOFT"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
  // Next has no metrics for this face; use a plain system fallback instead.
  adjustFontFallback: false,
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: "MultiBooks", template: "%s · MultiBooks" },
  description: "Read the classics your way, or write an adventure of your own.",
};

export const viewport: Viewport = {
  themeColor: "#fbf6ec",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${literata.variable} ${atkinson.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-ink px-4 py-3 text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
