import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Platemate — Weekly Meal Planning",
  description:
    "Plan dinners, track nutrition, and generate grocery lists. Health-aware meal planning for couples.",
  openGraph: {
    title: "Platemate — Weekly Meal Planning",
    description:
      "Plan dinners, track nutrition, and generate grocery lists. Health-aware meal planning for couples.",
    type: "website",
    siteName: "Platemate",
  },
  twitter: {
    card: "summary",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${fraunces.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
