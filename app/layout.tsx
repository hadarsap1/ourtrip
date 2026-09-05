import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { AuthGate } from "@/components/AuthGate";
import { BottomNav } from "@/components/BottomNav";
import { ConfirmHost } from "@/components/ConfirmSheet";
import { SideRail } from "@/components/SideRail";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OfflineSync } from "@/components/OfflineSync";
import { RegisterSW } from "@/components/RegisterSW";
import { strings } from "@/lib/strings";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  // Each route sets its own title (strings.pageTitles); this appends the app
  // name to it. `default` is what an unnamed route falls back to.
  title: {
    default: strings.appName,
    template: `%s · ${strings.appName}`,
  },
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
        {/* ps at lg leaves room for the fixed rail, which sits at the
            inline-start (right) edge. pb-20 clears the bottom bar below lg. */}
        <main className="flex-1 pb-20 pt-[env(safe-area-inset-top)] lg:pb-0 lg:ps-[216px]">
          <AuthGate>{children}</AuthGate>
        </main>
        <BottomNav />
        <SideRail />
        <ConfirmHost />
        <OfflineSync />
        <RegisterSW />
      </body>
    </html>
  );
}
