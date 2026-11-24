import Link from "next/link";
import { strings } from "@/lib/strings";

/**
 * In place of a screen that cannot tell who is signed in. A single line here
 * was a dead end for a guest whose session had lapsed (UX review 24/11/2026):
 * no title, no way on. A lookup that failed (or a member without a trip) gets
 * a retry, not a sign-out (lib/useMember.ts); no member at all gets a way to
 * sign in again. Colours come from the surrounding screen (`tone`).
 */
export function NoMemberNotice({
  title,
  failed,
  tone = "app",
}: {
  title: string;
  /** the lookup itself failed, or the member is known but the trip is not */
  failed: boolean;
  tone?: "app" | "sovev";
}) {
  const soft = tone === "sovev" ? "text-sv-ink-soft" : "text-ink-soft";
  const action = tone === "sovev" ? "text-sv-sage" : "text-sea";
  const actionClass = `inline-flex min-h-[44px] items-center font-semibold underline ${action}`;
  return (
    <div className="mx-auto max-w-lg px-4 pt-8 text-center">
      <h1 className="ot-title mb-3">{title}</h1>
      <p className={`mb-3 ${soft}`}>{failed ? strings.common.memberFailed : strings.common.noMember}</p>
      {failed ? (
        <button type="button" onClick={() => window.location.reload()} className={actionClass}>
          {strings.common.retry}
        </button>
      ) : (
        <Link href="/login" className={actionClass}>
          {strings.common.signInAgain}
        </Link>
      )}
    </div>
  );
}
