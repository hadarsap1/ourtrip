import { FriendsScreen } from "@/components/friends/FriendsScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.friends.title };

export default function FriendsPage() {
  return <FriendsScreen />;
}
