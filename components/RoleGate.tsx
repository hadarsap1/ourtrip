"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";

// Screens that are the parents' only. RLS already returns a kid or a guest
// nothing there; this only replaces an empty parent screen with a clear line
// when one is reached by URL (UX pass 14/10). Not a security boundary.
const OWNER_ONLY = [
  "/budget", "/documents", "/checklists", "/kids", "/guests", "/notifications",
  "/ready", "/visas", "/options", "/recommend", "/memory-book", "/pocket",
];
// what a guest can open at all (the guest home's tiles and tabs)
const GUEST_ALLOWED = ["/", "/stories", "/podcast", "/photos", "/messages", "/map", "/journal", "/settings"];

function blocked(path: string, role: string): boolean {
  const under = (p: string) => path === p || path.startsWith(p + "/");
  if (role === "guest") return !GUEST_ALLOWED.some((p) => (p === "/" ? path === "/" : under(p)));
  if (role === "kid") return OWNER_ONLY.some(under);
  return false;
}

export function RoleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { member } = useMember();
  if (!member || !blocked(pathname, member.role)) return <>{children}</>;
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-16 text-center">
      <h1 className="text-2xl font-bold">{strings.roleGate.title}</h1>
      <p className="text-ink-soft">{member.role === "kid" ? strings.roleGate.kidBody : strings.roleGate.guestBody}</p>
      <Link href="/" className="inline-flex min-h-11 items-center rounded-full bg-sea px-5 font-bold text-on-sea">
        {strings.roleGate.home}
      </Link>
    </div>
  );
}
