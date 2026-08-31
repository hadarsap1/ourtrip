"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, tabsForRole } from "@/components/navItems";
import { strings } from "@/lib/strings";
import { useIsKidDevice } from "@/lib/useKidDevice";
import { useMember } from "@/lib/useMember";
import { useUnreadWall } from "@/lib/useUnreadWall";

export function BottomNav() {
  const pathname = usePathname();
  const { member } = useMember();
  const isKid = useIsKidDevice();
  const role = member?.role ?? (isKid ? "kid" : "owner");
  const unread = useUnreadWall();

  if (pathname === "/kid-login" || pathname === "/login") return null;

  const tabs = tabsForRole(role);

  return (
    // Opaque, not paper/90 + blur: translucency muddies text over the warm
    // background. Hidden from lg up, where the side rail takes over.
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label={strings.appName}
    >
      <ul className="flex items-start gap-0.5 px-1.5 pt-[9px] pb-3">
        {tabs.map((tab) => {
          const active = isNavItemActive(pathname, tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-[3px] rounded-xl py-0.5 transition-colors ${
                  active ? "text-sea-deep" : "text-ink-faint"
                }`}
              >
                <span className="relative">
                  <tab.Icon className="h-[23px] w-[23px]" strokeWidth={1.7} />
                  {tab.href === "/messages" && unread > 0 && (
                    <span className="absolute -left-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[10.5px] leading-none tracking-[0.01em] ${
                    active ? "font-bold" : "font-medium"
                  }`}
                >
                  {tab.label}
                </span>
                {/* A sun underline instead of a filled blob: the blob read as a
                    selected chip and competed with the real chips on screen. */}
                <span
                  className={`h-[2.5px] w-4 rounded-full bg-sun transition-opacity duration-150 ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
