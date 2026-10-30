"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { AudienceRow } from "@/components/AudienceSheet";
import { CameraIcon, CloseIcon, PhotosIcon } from "@/components/icons";
import { strings } from "@/lib/strings";

// "העלאה חדשה": the sheet opens first, from the tap, and the picker opens from
// inside it. On an iPhone nothing opened when a sheet was meant to appear
// after the picker returned (30/10), so nothing here waits on the picker.
export function UploadSheet({
  onClose,
  onUpload,
}: {
  onClose: () => void;
  /** throws on failure; the sheet stays open with the photo and text */
  onUpload: (file: File, caption: string, audience: string[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [text, setText] = useState("");
  // who sees it - everyone by default (00064)
  const [audience, setAudience] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // the preview's object URL is freed when it is replaced or the sheet closes
  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked.url);
  }, [picked]);

  function pick(input: HTMLInputElement) {
    const file = input.files?.[0];
    // cleared so picking the same photo again still counts as a change
    input.value = "";
    if (file) setPicked({ file, url: URL.createObjectURL(file) });
  }

  async function upload() {
    if (!picked || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onUpload(picked.file, text, audience);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  // A real tap on a label opens the picker - more reliable on an iPhone than
  // a script clicking a hidden input. The gallery input has no `capture` (the
  // phone offers its library); the camera one asks for the camera.
  const source = (camera: boolean) => (
    <label
      className={`flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border font-bold ${
        picked ? "border-line text-ink-soft" : "border-sea bg-sea text-on-sea"
      } ${busy ? "pointer-events-none opacity-60" : ""}`}
    >
      {camera ? <CameraIcon className="h-4 w-4" /> : <PhotosIcon className="h-4 w-4" />}
      {camera ? strings.photos.takePhoto : strings.photos.fromGallery}
      <input
        type="file"
        accept="image/*"
        {...(camera ? { capture: "environment" as const } : {})}
        className="sr-only"
        onChange={(e) => pick(e.currentTarget)}
      />
    </label>
  );

  return (
    <Sheet open onClose={() => !busy && onClose()} title={strings.photos.newUpload}>
      <div className="space-y-3">
        {picked ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            <img src={picked.url} alt="" className="max-h-64 w-full rounded-xl object-cover" />
            <button
              type="button"
              onClick={() => setPicked(null)}
              disabled={busy}
              aria-label={strings.photos.removePicked}
              className="absolute end-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">{strings.photos.pickFrom}</p>
        )}
        <div className="flex gap-2">
          {source(false)}
          {source(true)}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={strings.photos.captionPlaceholder}
          aria-label={strings.photos.textTitle}
          dir="auto"
          rows={4}
          className="block w-full resize-y rounded-xl border border-line bg-paper p-3 text-[16px] leading-[1.6] text-ink focus:border-sea focus:outline-none"
        />

        <AudienceRow label={strings.audience.who} value={audience} onChange={setAudience} />

        {failed && (
          <p className="text-sm text-alert" role="alert">
            {strings.common.error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void upload()}
            disabled={!picked || busy}
            className="flex-1 rounded-xl bg-sea py-3 font-bold text-on-sea shadow disabled:opacity-50"
          >
            {busy ? strings.photos.uploading : strings.photos.send}
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
    </Sheet>
  );
}
