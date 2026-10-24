// "The app is the home, WhatsApp is the doorbell" (DESIGN-sharing §5).
// After something is published a parent sends ONE short line with a link to
// whichever group they choose - family, a class, friends. No WhatsApp API, no
// stored groups: the phone's own share sheet, or wa.me where there is none.

import { strings } from "@/lib/strings";

export type ShareKind = "story" | "episode";

/**
 * Where a link should land. A public story has its own page anyone can open;
 * everything else opens inside the portal, which asks a guest to sign in and
 * then scrolls to the item.
 */
export function shareUrl(
  origin: string,
  item:
    | { kind: "story"; id: string; publicSlug: string | null; isPublic: boolean }
    | { kind: "episode"; id: string }
): string {
  const base = origin.replace(/\/+$/, "");
  if (item.kind === "story") {
    if (item.isPublic && item.publicSlug) return `${base}/s/${item.publicSlug}`;
    return `${base}/stories#story-${item.id}`;
  }
  return `${base}/podcast#episode-${item.id}`;
}

export function shareText(kind: ShareKind, title: string, url: string): string {
  const template = kind === "story" ? strings.share.storyText : strings.share.episodeText;
  return template.replace("{title}", title.trim()).replace("{url}", url);
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Opens the share sheet (WhatsApp is one tap from there on a phone), or
 * WhatsApp directly on a device without one. Resolves false only when the
 * person closed the sheet.
 */
export async function shareToWhatsApp(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return true;
    } catch (e) {
      // AbortError = closed the sheet on purpose; anything else falls through
      if (e instanceof DOMException && e.name === "AbortError") return false;
    }
  }
  window.open(whatsappUrl(text), "_blank", "noopener,noreferrer");
  return true;
}
