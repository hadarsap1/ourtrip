// The two refusals of the monthly AI budget (migration 00053), shared by every
// screen that runs an AI action. Returns null for any other error code, so a
// screen keeps its own message for those: `aiLimitMessage(code) ?? s.failed`.

import { strings } from "@/lib/strings";

export function aiLimitMessage(code: string | null | undefined): string | null {
  if (code === "ai_budget") return strings.aiLimit.budget;
  if (code === "ai_daily_limit") return strings.aiLimit.daily;
  return null;
}
