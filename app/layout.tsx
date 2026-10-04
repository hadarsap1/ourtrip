import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { AuthGate } from "@/components/AuthGate";
import { BottomNav } from "@/components/BottomNav";
import { ConfirmHost } from "@/components/ConfirmSheet";
import { SideRail } from "@/components/SideRail";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SimDateBanner } from "@/components/SimDateBanner";
import { OfflineSync } from "@/components/OfflineSync";
import { RegisterSW } from "@/components/RegisterSW";
import { ThemeSync } from "@/components/ThemeSync";
import { strings } from "@/lib/strings";
import { THEME_BOOT_SCRIPT, THEME_COLORS } from "@/lib/theme";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
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
    // data-theme is set by the head script before hydration, hence
    // suppressHydrationWarning on <html> only.
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Runs before first paint: picks light/dark from the saved choice or the
            OS, so a dark-mode phone never flashes cream on open (F7). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      {/* The body never scrolls: it is exactly one screen tall and <main> is
          the only scroller. With the document scrolling and the bottom bar
          position:fixed, iOS WebKit could leave the visual viewport offset
          after its toolbars or keyboard moved, so the bar floated up and a
          screen of blank paper opened below it. */}
      <body className="flex h-dvh flex-col overflow-hidden bg-paper pt-[env(safe-area-inset-top)] text-ink">
        <SimDateBanner />
        <OfflineBanner />
        {/* ps at lg leaves room for the fixed rail, which sits at the
            inline-start (right) edge. */}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:ps-[216px]">
          <AuthGate>{children}</AuthGate>
        </main>
        <BottomNav />
        <SideRail />
        <ConfirmHost />
        <OfflineSync />
        <RegisterSW />
        <ThemeSync />
      </body>
    </html>
  );
}
