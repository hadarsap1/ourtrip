"use client";

import Link from "next/link";
import { ChevronBackIcon } from "@/components/icons";
import { ThemePicker } from "@/components/settings/ThemePicker";
import { StepsSettings } from "@/components/settings/StepsSettings";
import { BackupCard } from "@/components/settings/BackupCard";
import { strings } from "@/lib/strings";

/**
 * Settings, reached from the gear on More. Each card decides for itself who
 * sees it (steps and backup: parents only); access is still RLS.
 */
export function SettingsScreen() {
  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col gap-4 px-4 pt-6 pb-4 sm:max-w-2xl">
      <header className="flex items-center gap-2">
        <Link href="/more" aria-label={strings.settings.back} className="-ms-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-soft active:bg-paper-deep">
          <ChevronBackIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-[22px] font-extrabold text-ink">{strings.settings.title}</h1>
      </header>
      <ThemePicker />
      <StepsSettings />
      <BackupCard />
    </div>
  );
}
