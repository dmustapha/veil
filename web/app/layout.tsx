import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Atmosphere } from "@/components/Atmosphere";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Veil: borrow private, proven not revealed",
  description:
    "Borrow on Stellar against collateral you keep on Ethereum, proven by a zero-knowledge proof that hides your amount and your identity.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const fontVars = `${fraunces.variable} ${hanken.variable} ${jetbrains.variable}`;
  return (
    <html lang="en">
      <body className={`${fontVars} loaded`}>
        <Atmosphere />
        {children}
      </body>
    </html>
  );
}
