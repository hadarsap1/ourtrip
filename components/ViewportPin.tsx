"use client";

import { useEffect } from "react";

/**
 * Keeps the page pinned to the top of the screen on iOS.
 *
 * The body is one screen tall and never scrolls (app/layout.tsx), but when a
 * text field takes focus iOS WebKit still scrolls the *window* to lift the
 * field above the keyboard - overflow:hidden does not stop it. When the
 * keyboard closes it does not always scroll back, so the whole app stays
 * shifted up by the keyboard's height: the bottom bar floats mid-screen with
 * blank space under it. Once the keyboard is gone (visual viewport back to
 * full height, or focus left the field) we put the window back at 0,0.
 * While the keyboard is open we leave iOS alone so the field stays visible.
 * Renders nothing.
 */
export function ViewportPin() {
  useEffect(() => {
    const vv = window.visualViewport;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const isTyping = () => {
      const el = document.activeElement;
      if (!el) return false;
      if (el instanceof HTMLTextAreaElement) return true;
      if (el instanceof HTMLInputElement) return !["checkbox", "radio", "button", "submit", "range", "file", "color"].includes(el.type);
      return (el as HTMLElement).isContentEditable === true;
    };

    const keyboardClosed = () => !vv || vv.height >= window.innerHeight - 1;

    const reset = () => {
      if (window.scrollX === 0 && window.scrollY === 0) return;
      if (isTyping() && !keyboardClosed()) return;
      window.scrollTo(0, 0);
    };

    // focusout fires before the keyboard animation ends; check again after it.
    const onFocusOut = () => {
      clearTimeout(timer);
      timer = setTimeout(reset, 300);
    };

    vv?.addEventListener("resize", reset);
    window.addEventListener("focusout", onFocusOut);
    window.addEventListener("orientationchange", onFocusOut);
    document.addEventListener("visibilitychange", reset);
    return () => {
      clearTimeout(timer);
      vv?.removeEventListener("resize", reset);
      window.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("orientationchange", onFocusOut);
      document.removeEventListener("visibilitychange", reset);
    };
  }, []);

  return null;
}
