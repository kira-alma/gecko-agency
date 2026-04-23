import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GeckoCheck - Page Optimizer",
  description:
    "Transform retailer product pages with AI-powered insights from GeckoCheck",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans bg-gray-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
