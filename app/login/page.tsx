import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.login };

export default function LoginPage() {
  // LoginScreen reads ?email= (the welcome email's button) with
  // useSearchParams, which this statically-rendered page has to suspend on.
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
