import { OwnerOnly } from "@/components/OwnerOnly";
import { NotificationsScreen } from "@/components/settings/NotificationsScreen";

export default function NotificationsPage() {
  return (
    <OwnerOnly>
      <NotificationsScreen />
    </OwnerOnly>
  );
}
