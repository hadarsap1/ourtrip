import type { Metadata } from "next";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.login };

export default function LoginPage() {
  return <LoginScreen />;
}
