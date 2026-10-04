"use client";

import { useEffect } from "react";
import { watchSystemTheme } from "@/lib/theme";

/** Keeps the "system" theme in step with the OS on every screen. Renders nothing. */
export function ThemeSync() {
  useEffect(() => watchSystemTheme(), []);
  return null;
}
