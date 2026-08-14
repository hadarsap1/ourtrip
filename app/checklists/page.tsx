import { OwnerOnly } from "@/components/OwnerOnly";
import { ChecklistsScreen } from "@/components/checklists/ChecklistsScreen";

export default function ChecklistsPage() {
  return (
    <OwnerOnly>
      <ChecklistsScreen />
    </OwnerOnly>
  );
}
