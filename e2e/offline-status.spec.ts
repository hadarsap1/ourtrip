import { test, expect } from "@playwright/test";

// F10: going offline shows the Hebrew banner with the v2 wording; coming back
// online hides it again (no pending writes in the no-backend shell).
test("offline banner appears and clears with connectivity", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("אין חיבור - הנתונים נשמרו במכשיר")).toHaveCount(0);

  await context.setOffline(true);
  await expect(page.getByRole("status").filter({ hasText: "אין חיבור - הנתונים נשמרו במכשיר" })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("אין חיבור - הנתונים נשמרו במכשיר")).toHaveCount(0);
});
