"use client";

import { useEffect, useState } from "react";
import { getCurrentMember } from "@/lib/data/trip";
import type { Member } from "@/lib/types";

/** Current member row (cached module-side). Role gates are cosmetic —
 *  real access control is RLS. */
export function useMember(): { member: Member | null; memberLoading: boolean } {
  const [member, setMember] = useState<Member | null>(null);
  const [memberLoading, setMemberLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getCurrentMember()
      .then((m) => {
        if (cancelled) return;
        setMember(m);
        setMemberLoading(false);
      })
      .catch(() => {
        if (!cancelled) setMemberLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { member, memberLoading };
}
