import { BudgetScreen } from "@/components/budget/BudgetScreen";
import type { Metadata } from "next";
import { strings } from "@/lib/strings";

export const metadata: Metadata = { title: strings.pageTitles.budget };

export default function BudgetPage() {
  return <BudgetScreen />;
}
