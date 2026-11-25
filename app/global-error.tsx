"use client";

import "./globals.css";
import { ScreenError } from "@/components/errors/ScreenError";

// The app shell itself crashed (the root layout, AuthGate or RoleGate), so
// this replaces the whole document: it brings its own <html>, RTL and styles.
// Logged on the device like a screen crash.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-dvh bg-paper pt-[env(safe-area-inset-top)] text-ink antialiased">
        <ScreenError error={error} reset={reset} boundary="root" />
      </body>
    </html>
  );
}
