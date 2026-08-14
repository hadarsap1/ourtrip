import { OwnerOnly } from "@/components/OwnerOnly";
import { KidsAdminScreen } from "@/components/kids/KidsAdminScreen";

export default function KidsAdminPage() {
  return (
    <OwnerOnly>
      <KidsAdminScreen />
    </OwnerOnly>
  );
}
