import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabase: () => null }));
vi.mock("@/lib/offline/caches", () => ({}));

const { pickEmergencyCountry } = await import("./emergency");

describe("pickEmergencyCountry (F5)", () => {
  const pages = ["GE", "JP", "KH", "PH", "TH", "VN"];

  it("pre-trip opens on the first destination, not the alphabetically first page", () => {
    expect(pickEmergencyCountry(pages, null, "VN")).toBe("VN");
  });

  it("in trip opens on today's country", () => {
    expect(pickEmergencyCountry(pages, "TH", "TH")).toBe("TH");
  });

  it("travel day with no page for today falls to the next country that has one", () => {
    expect(pickEmergencyCountry(pages, "LA", "KH")).toBe("KH");
  });

  it("a country with no page still wins, so the screen can offer to create it", () => {
    expect(pickEmergencyCountry(["GE"], null, "VN")).toBe("VN");
  });

  it("falls back to the first page only with no itinerary signal", () => {
    expect(pickEmergencyCountry(pages, null, null)).toBe("GE");
    expect(pickEmergencyCountry([], null, null)).toBeNull();
  });
});
