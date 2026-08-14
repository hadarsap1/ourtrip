"use client";

import { useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";

/**
 * Cosmetic gate for owner-only screens (audit P-3). Real access control is
 * RLS — a kid or guest reaching /budget already gets zero rows — but an empty
 * budget dashboard is indistinguishable from a real one showing zero spend,
 * and a Documents-style upload button that always fails reads as a bug rather
 * than a boundary. This says the boundary out loud.
 *
 * Fails OPEN on an unresolved member: offline, `getCurrentMember()` can't
 * reach the server, and locking an owner out of their own trip because the
 * network is down would be worse than showing a screen RLS keeps empty anyway.
 */
export function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { member, memberLoading } = useMember();

  if (memberLoading) return null;
  if (member && member.role !== "owner") {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center text-ink-soft">
        {strings.common.ownersOnly}
      </div>
    );
  }
  return <>{children}</>;
}
