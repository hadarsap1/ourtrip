"use client";

import { Sheet } from "@/components/Sheet";
import { ClipboardIcon, ShareIcon } from "@/components/icons";
import { shareToWhatsApp } from "@/lib/share";
import { strings } from "@/lib/strings";

/**
 * "Published - tell everyone?" The doorbell half of DESIGN-sharing §5: one
 * prepared line with the link, sent to whichever group the parent picks in
 * the phone's own share sheet.
 */
export function SharePrompt({
  text,
  url,
  title = strings.share.publishedAsk,
  onClose,
  onToast,
}: {
  text: string;
  url: string;
  title?: string;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="space-y-3">
        <p className="whitespace-pre-line rounded-xl bg-paper-deep p-3 text-sm text-ink">{text}</p>
        <button
          type="button"
          onClick={() => void shareToWhatsApp(text).then((sent) => sent && onClose())}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-sea py-3 font-semibold text-on-sea"
        >
          <ShareIcon className="h-4 w-4" /> {strings.share.whatsapp}
        </button>
        <p className="text-center text-xs text-ink-soft">{strings.share.pickGroup}</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(url)
              .then(() => onToast(strings.share.copied))
              .catch(() => {});
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-line py-3 font-semibold text-ink-soft"
        >
          <ClipboardIcon className="h-4 w-4" /> {strings.share.copyLink}
        </button>
      </div>
    </Sheet>
  );
}
