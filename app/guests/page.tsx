import { OwnerOnly } from "@/components/OwnerOnly";
import { GuestsAdminScreen } from "@/components/guests/GuestsAdminScreen";

export default function GuestsAdminPage() {
  return (
    <OwnerOnly>
      <GuestsAdminScreen />
    </OwnerOnly>
  );
}
