"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { strings } from "@/lib/strings";

// A photo's text is a post, not a label (no length limit): the card shows
// the first lines and folds the rest, like StoryCard does with a body.
const FOLD_AT = 120;

export function PhotoCaption({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const folds = text.length > FOLD_AT || text.split("\n").length > 3;
  return (
    <div>
      <p
        dir="auto"
        className={`whitespace-pre-wrap break-words text-[13px] leading-[1.6] text-ink ${
          folds && !open ? "line-clamp-3" : ""
        }`}
      >
        {text}
      </p>
      {folds && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-0.5 text-xs font-bold text-sea underline-offset-4 hover:underline"
        >
          {open ? strings.photos.readLess : strings.photos.readMore}
        </button>
      )}
    </div>
  );
}

/** Write the text for a new photo (with its preview) or edit an existing one. */
export function CaptionSheet({
  open,
  title,
  previewUrl,
  initial,
  submitLabel,
  busy,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  previewUrl?: string | null;
  initial: string;
  submitLabel: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {/* mounted per opening, so the draft always starts from `initial` */}
      {open && (
        <CaptionForm
          previewUrl={previewUrl}
          initial={initial}
          submitLabel={submitLabel}
          busy={busy}
          onClose={onClose}
          onSubmit={onSubmit}
        >
          {children}
        </CaptionForm>
      )}
    </Sheet>
  );
}

function CaptionForm({
  previewUrl,
  initial,
  submitLabel,
  busy,
  onClose,
  onSubmit,
  children,
}: {
  previewUrl?: string | null;
  initial: string;
  submitLabel: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
  children?: React.ReactNode;
}) {
  const [text, setText] = useState(initial);
  return (
    <div className="space-y-3">
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL
        <img src={previewUrl} alt="" className="max-h-56 w-full rounded-xl object-cover" />
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={strings.photos.captionPlaceholder}
        aria-label={strings.photos.textTitle}
        dir="auto"
        rows={6}
        className="block min-h-[9rem] w-full resize-y rounded-xl border border-line bg-surface p-3 text-[16px] leading-[1.6] text-ink"
      />
      {children}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSubmit(text)}
          disabled={busy}
          className="flex-1 rounded-xl bg-sea py-3 font-bold text-on-sea disabled:opacity-60"
        >
          {busy ? strings.photos.uploading : submitLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-xl border border-line px-4 py-3 font-semibold text-ink-soft"
        >
          {strings.common.cancel}
        </button>
      </div>
    </div>
  );
}
