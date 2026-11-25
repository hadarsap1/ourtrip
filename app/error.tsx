"use client";

import { ScreenError } from "@/components/errors/ScreenError";

// A screen crashed while drawing: the bottom bar and banners stay, and this
// takes the screen's place (instead of a blank page), logged on the device.
export default function ScreenErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ScreenError error={error} reset={reset} boundary="screen" />;
}
