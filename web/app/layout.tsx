import type { Metadata } from "next";
import {
  Fraunces,
  Bricolage_Grotesque,
  Hanken_Grotesk,
  IBM_Plex_Mono,
} from "next/font/google";
import "./globals.css";
import { Atmosphere } from "@/components/Atmosphere";
import { Reveal } from "@/components/Reveal";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-hard",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Veil: borrow USDC, keep your balance hidden",
  description:
    "Borrow USDC on Stellar against crypto you keep on Ethereum. A zero-knowledge proof shows you have enough without revealing how much or which wallet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const fontVars = `${fraunces.variable} ${bricolage.variable} ${hanken.variable} ${plexMono.variable}`;
  return (
    <html lang="en">
      <head>
        {/* pre-paint: confirm JS so .reveal can hide before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js-ready')",
          }}
        />
      </head>
      <body className={fontVars}>
        <Atmosphere />
        <Reveal />
        {children}
      </body>
    </html>
  );
}
