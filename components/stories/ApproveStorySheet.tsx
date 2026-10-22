"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { AudienceRow } from "@/components/AudienceSheet";
import { approveStory, returnStoryToDraft, type Story } from "@/lib/data/stories";
import { strings } from "@/lib/strings";
import type { PostVisibility } from "@/lib/types";

/**
 * A parent approves a kid's story: who sees it (family or guests - never
 * public, 00043), and whether its photos are shared with guests too. Or sends
 * it back to the kid to keep writing.
 */
export function ApproveStorySheet({
  story,
  ownerId,
  onClose,
  onDone,
  onToast,
}: {
  story: Story;
  ownerId: string;
  onClose: () => void;
  onDone: (message: string, published: boolean) => void;
  onToast: (message: string) => void;
}) {
  const [audience, setAudience] = useState<Exclude<PostVisibility, "public">>("guests");
  const [groups, setGroups] = useState<string[]>([]);
  const [sharePhotos, setSharePhotos] = useState(true);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, message: string, published: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      onDone(message, published);
    } catch {
      onToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={strings.stories.approveTitle}>
      <div className="space-y-4">
        <p className="font-semibold text-ink">{story.title}</p>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-soft">{strings.stories.audienceLabel}</legend>
          <div role="radiogroup" className="grid grid-cols-2 gap-2">
            {(["family", "guests"] as const).map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={audience === o}
                onClick={() => setAudience(o)}
                className={`rounded-xl border py-2.5 text-sm font-semibold ${
                  audience === o ? "border-sea bg-sea-tint text-sea-deep" : "border-line bg-surface text-ink-soft"
                }`}
              >
                {o === "family" ? strings.stories.audienceFamily : strings.stories.audienceGuests}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-soft">{strings.stories.publicKidBlocked}</p>
          {audience === "guests" && (
            <div className="mt-2">
              <AudienceRow tripId={story.trip_id} value={groups} onChange={setGroups} />
            </div>
          )}
        </fieldset>
        {audience === "guests" && story.photos.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={sharePhotos}
              onChange={(e) => setSharePhotos(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-sea)]"
            />
            {strings.stories.sharePhotos}
          </label>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(() => approveStory(story, audience, sharePhotos, ownerId, groups), strings.stories.published, true)
          }
          className="w-full rounded-xl bg-sea py-3 font-semibold text-on-sea disabled:opacity-60"
        >
          {strings.stories.approve}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => returnStoryToDraft(story.id), strings.stories.returned, false)}
          className="w-full rounded-xl border border-line py-3 font-semibold text-ink-soft disabled:opacity-60"
        >
          {strings.stories.returnToDraft}
        </button>
      </div>
    </Sheet>
  );
}
