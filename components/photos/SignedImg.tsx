"use client";

import { useRef, useState, type ImgHTMLAttributes, type Ref } from "react";
import { forgetSignedUrl } from "@/lib/data/signedUrls";
import { photoMedia } from "@/lib/data/media";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";

/**
 * A photo from the private `photos` bucket that signs itself again once when
 * its link fails (Hadar 28/11/2026: a guest swiped to the fourth photo of an
 * update and got a broken image). Links live 15 minutes for a guest and an
 * hour for the family, and lazy pictures load only when scrolled to, so a
 * feed or gallery read slowly asked for links that had already run out.
 *
 * The new link comes from the same role-aware signing the screen used: RLS
 * for the family, the guest-media function (approved AND shared, rule 3) for
 * a guest. If that one fails too, a quiet "did not load" frame replaces the
 * browser's broken-image icon.
 */
export function SignedImg({
  photoId,
  src,
  thumb = false,
  imgRef,
  alt = "",
  className,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  photoId: string;
  src: string;
  /** src is the grid thumbnail: sign that again, not the full picture */
  thumb?: boolean;
  imgRef?: Ref<HTMLImageElement>;
}) {
  const { member } = useMember();
  // what a failed load led to, for the src it happened on: a new link from
  // the screen (a refresh) starts over without an effect
  const [fix, setFix] = useState<{ for: string; url: string | null; failed: boolean }>({
    for: src,
    url: null,
    failed: false,
  });
  const retriedFor = useRef<string | null>(null);
  const live = fix.for === src ? fix : { for: src, url: null, failed: false };
  const failed = live.failed;
  const current = live.url ?? src;

  const onError = () => {
    const fail = () => setFix({ for: src, url: null, failed: true });
    if (retriedFor.current === src) {
      fail();
      return;
    }
    retriedFor.current = src;
    forgetSignedUrl(current);
    photoMedia(member?.role, [photoId])
      .then((media) => {
        const m = media.get(photoId);
        const url = (thumb ? m?.thumbUrl : null) ?? m?.url ?? null;
        if (url && url !== current) setFix({ for: src, url, failed: false });
        else fail();
      })
      .catch(fail);
  };

  if (failed) {
    return (
      <span className={`grid place-items-center bg-paper-deep text-center text-xs text-muted ${className ?? ""}`}>
        {strings.stories.photoFailed}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- signed URL
  return <img {...rest} ref={imgRef} src={current} alt={alt} onError={onError} className={className} />;
}
