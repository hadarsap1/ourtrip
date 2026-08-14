import { OwnerOnly } from "@/components/OwnerOnly";
import { BudgetScreen } from "@/components/budget/BudgetScreen";

export default function BudgetPage() {
  return (
    <OwnerOnly>
      <BudgetScreen />
    </OwnerOnly>
  );
}
