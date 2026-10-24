"use client";

import Link from "next/link";
import { ChevronBackIcon } from "@/components/icons";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ThemePicker } from "@/components/settings/ThemePicker";
import { StepsSettings } from "@/components/settings/StepsSettings";
import { BackupCard } from "@/components/settings/BackupCard";
import { AiBudgetCard } from "@/components/settings/AiBudgetCard";
import { MyKidsCard } from "@/components/settings/MyKidsCard";
import { PreviewCard } from "@/components/settings/PreviewCard";
import { useMember } from "@/lib/useMember";
import { strings } from "@/lib/strings";

/**
 * Settings, reached from the gear on More. Each card decides for itself who
 * sees it (steps, AI budget and backup: parents only; my kids: guests only; view as: parents only);
 * access is still RLS.
 */
export function SettingsScreen() {
  const { member } = useMember();
  // guests have no More screen (RoleGate); they come here from their home
  const back = member?.role === "guest" ? "/" : "/more";
  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col gap-4 px-4 pt-6 pb-4 sm:max-w-2xl">
      <header className="flex items-center gap-2">
        <Link href={back} aria-label={member?.role === "guest" ? strings.settings.backHome : strings.settings.back} className="-ms-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-soft active:bg-paper-deep">
          <ChevronBackIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-[22px] font-extrabold text-ink">{strings.settings.title}</h1>
      </header>
      {/* Renders only while the app is not installed yet (Safari tab), and
          disappears for good once it is on the home screen. */}
      <InstallPrompt />
      <MyKidsCard />
      <PreviewCard />
      <ThemePicker />
      <StepsSettings />
      <AiBudgetCard />
      <BackupCard />
    </div>
  );
}
