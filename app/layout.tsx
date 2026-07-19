import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { AuthGate } from "@/components/AuthGate";
import { BottomNav } from "@/components/BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OfflineSync } from "@/components/OfflineSync";
import { RegisterSW } from "@/components/RegisterSW";
import { strings } from "@/lib/strings";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: strings.appName,
  description: strings.appDescription,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: strings.appName,
  },
};

export const viewport: Viewport = {
  themeColor: "#0e7c6b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <OfflineBanner />
        <main className="flex-1 pb-20">
          <AuthGate>{children}</AuthGate>
        </main>
        <BottomNav />
        <OfflineSync />
        <RegisterSW />
      </body>
    </html>
  );
}
