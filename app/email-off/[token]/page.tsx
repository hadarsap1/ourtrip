import type { Metadata } from "next";
import { EmailOffScreen } from "@/components/guests/EmailOffScreen";
import { strings } from "@/lib/strings";

// The link at the bottom of the guests' daily email (00101, DECISIONS #72).
// Open without signing in; stops only the email that carries this token.
// Never indexed.
export const metadata: Metadata = {
  title: strings.emailOff.title,
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function EmailOffPage({ params }: Props) {
  const { token } = await params;
  return <EmailOffScreen token={decodeURIComponent(token)} />;
}
