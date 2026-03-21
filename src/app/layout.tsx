import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
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
      <body className={`${geistSans.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
