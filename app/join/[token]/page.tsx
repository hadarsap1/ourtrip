import type { Metadata } from "next";
import { JoinScreen } from "@/components/guests/JoinScreen";
import { strings } from "@/lib/strings";

// The guests' join link (migration 00054). Open to anyone holding the link,
// before there is any account; asking to join grants nothing until a parent
// approves. Never indexed, like the open blog.
export const metadata: Metadata = {
  title: strings.pageTitles.join,
  description: strings.join.body,
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function JoinPage({ params }: Props) {
  const { token } = await params;
  return <JoinScreen token={decodeURIComponent(token)} />;
}
