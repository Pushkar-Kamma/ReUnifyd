import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { AdBlockerBanner } from "@/components/ad-blocker-banner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ReUnifyd — One dashboard for every channel",
  description:
    "Unify your YouTube, Instagram, and TikTok analytics. Compare the same content across platforms — side by side.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <AdBlockerBanner />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
