import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabase: () => null }));
vi.mock("@/lib/offline/caches", () => ({}));
const { documentDetailsText } = await import("./documents");

describe("documentDetailsText", () => {
  it("joins the useful fields line by line and skips empty ones", () => {
    expect(
      documentDetailsText({ title: "ביטוח נסיעות", tag: "insurance", expires_at: "2027-06-30", notes: null }, "ביטוח", (d) => `בתוקף עד ${d}`)
    ).toBe("ביטוח נסיעות\nביטוח\nבתוקף עד 2027-06-30");
  });
});
