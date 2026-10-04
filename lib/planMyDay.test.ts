import { describe, expect, it } from "vitest";
import { nearestNeighbourOrder, planAreas, planDay, schedule, swapStop, toTime, type PlanCandidate } from "./planMyDay";

let n = 0;
const opt = (title: string, category: string, lat: number | null, lng: number | null, extra: Partial<PlanCandidate> = {}): PlanCandidate => ({
  id: String(++n),
  title,
  category,
  area: "הוי אן",
  lat,
  lng,
  status: "option",
  country_code: "VN",
  ...extra,
});

const bank = [
  opt("עיר עתיקה", "attraction", 15.877, 108.326),
  opt("חוף אן באנג", "nature", 15.912, 108.34),
  opt("שיעור בישול", "activity", 15.86, 108.38),
  opt("מסעדה ליד העיר", "restaurant", 15.878, 108.327),
  opt("מסעדה רחוקה", "restaurant", 15.95, 108.4),
  opt("שוק", "shop", 15.876, 108.33),
  opt("מלון", "hotel", 15.877, 108.326),
  opt("מעבורת", "transport", null, null),
  opt("סאפה", "attraction", 22.33, 103.84, { area: "סאפה" }),
  opt("בנגקוק", "attraction", 13.75, 100.5, { country_code: "TH", area: "בנגקוק" }),
  opt("כבר במסלול", "attraction", 15.877, 108.326, { status: "planned" }),
];

describe("plan-my-day (Phase 2.2)", () => {
  it("orders by nearest neighbour from the first item, unplaced last", () => {
    const a = { id: "a", lat: 0, lng: 0 };
    const far = { id: "far", lat: 0, lng: 1 };
    const near = { id: "near", lat: 0, lng: 0.1 };
    const mid = { id: "mid", lat: 0, lng: 0.5 };
    const nowhere = { id: "x", lat: null, lng: null };
    expect(nearestNeighbourOrder([a, far, nowhere, near, mid]).map((i) => i.id)).toEqual(["a", "near", "mid", "far", "x"]);
  });

  it("lists areas for the country, the day's own area first", () => {
    expect(planAreas(bank, "VN", "סאפה").map((a) => a.area)).toEqual(["סאפה", "הוי אן"]);
    expect(planAreas(bank, "VN", null)[0]).toEqual({ area: "הוי אן", count: 6 });
  });

  it("builds sights + lunch + shop, skipping hotels, transport, planned and other areas", () => {
    const plan = planDay({ options: bank, countryCode: "VN", area: "הוי אן" });
    const titles = plan.map((s) => s.option.title);
    expect(titles).toHaveLength(4);
    expect(titles).toContain("מסעדה ליד העיר"); // nearest restaurant to the first sight
    expect(titles[3]).toBe("שוק");
    expect(titles).not.toContain("מלון");
    expect(titles).not.toContain("כבר במסלול");
    expect(plan[0].start).toBe(9 * 60 + 30);
    expect(plan[0].travelFromPrev).toBeNull();
    expect(plan[1].option.category).toBe("restaurant");
    expect(plan.every((s, i) => i === 0 || s.start > plan[i - 1].start)).toBe(true);
  });

  it("drops outdoor stops on a rainy day", () => {
    const plan = planDay({ options: bank, countryCode: "VN", area: "הוי אן", rainy: true });
    expect(plan.some((s) => ["nature", "activity"].includes(s.option.category ?? ""))).toBe(false);
    expect(plan.map((s) => s.option.title)).toContain("עיר עתיקה");
  });

  it("regenerates differently with another seed, deterministically", () => {
    const a = planDay({ options: bank, countryCode: "VN", area: "הוי אן", seed: 0 }).map((s) => s.option.id);
    const b = planDay({ options: bank, countryCode: "VN", area: "הוי אן", seed: 1 }).map((s) => s.option.id);
    expect(a).not.toEqual(b);
    expect(planDay({ options: bank, countryCode: "VN", area: "הוי אן", seed: 1 }).map((s) => s.option.id)).toEqual(b);
  });

  it("swaps one stop for another of the same kind and re-times the day", () => {
    const input = { options: bank, countryCode: "VN", area: "הוי אן" };
    const plan = planDay(input);
    const lunchIdx = plan.findIndex((s) => s.option.category === "restaurant");
    const swapped = swapStop(plan, lunchIdx, input);
    expect(swapped[lunchIdx].option.title).toBe("מסעדה רחוקה");
    expect(swapped.filter((s, i) => i !== lunchIdx).map((s) => s.option.id)).toEqual(plan.filter((s, i) => i !== lunchIdx).map((s) => s.option.id));
  });

  it("returns an empty plan when the area has nothing", () => {
    expect(planDay({ options: bank, countryCode: "VN", area: "דה לאט" })).toEqual([]);
  });

  it("schedules unplaced stops with a default gap and formats times", () => {
    const s = schedule([opt("א", "attraction", null, null), opt("ב", "restaurant", null, null)]);
    expect(s[1]).toMatchObject({ start: 9 * 60 + 30 + 120 + 20, travelFromPrev: null });
    expect(toTime(9 * 60 + 5)).toBe("09:05:00");
  });
});
