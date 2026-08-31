import { describe, expect, it } from "vitest";
import { currentItemId, nextUp, tripPosition } from "./tripDay";
import type { ItineraryItem } from "@/lib/types";

const item = (
  id: string,
  start_time: string | null,
  status: ItineraryItem["status"] = "planned"
) => ({ id, start_time, status, title: id }) as ItineraryItem;

describe("tripPosition", () => {
  it("counts today as a 1-based day within the range", () => {
    expect(tripPosition("2026-08-19", "2026-11-10", "2026-08-30")).toEqual({
      day: 12,
      total: 84,
    });
  });

  it("counts the first and last day as day 1 and day N", () => {
    expect(tripPosition("2026-08-19", "2026-08-21", "2026-08-19")).toEqual({
      day: 1,
      total: 3,
    });
    expect(tripPosition("2026-08-19", "2026-08-21", "2026-08-21")).toEqual({
      day: 3,
      total: 3,
    });
  });

  it("is null outside the trip rather than counting past the end", () => {
    // "יום 90 מתוך 84" is worse than no counter at all.
    expect(tripPosition("2026-08-19", "2026-08-21", "2026-08-18")).toBeNull();
    expect(tripPosition("2026-08-19", "2026-08-21", "2026-08-22")).toBeNull();
  });

  it("is null when the trip has no dates set", () => {
    expect(tripPosition(null, "2026-08-21", "2026-08-20")).toBeNull();
    expect(tripPosition("2026-08-19", null, "2026-08-20")).toBeNull();
  });

  it("survives a DST boundary", () => {
    // Israel moved off DST on 2026-10-25; a local-time subtraction would give
    // 84.04 days here and round to the wrong day.
    expect(tripPosition("2026-10-20", "2026-10-30", "2026-10-26")).toEqual({
      day: 7,
      total: 11,
    });
  });
});

describe("nextUp", () => {
  const items = [
    item("breakfast", "08:00", "done"),
    item("tram", "11:00"),
    item("lunch", "13:30"),
    item("cancelled-tour", "11:30", "cancelled"),
    item("no-time", null),
  ];

  it("picks the earliest upcoming item and the minutes to it", () => {
    const result = nextUp(items, 10 * 60 + 20);
    expect(result?.item.id).toBe("tram");
    expect(result?.minutesUntil).toBe(40);
  });

  it("skips done and cancelled items", () => {
    expect(nextUp(items, 11 * 60 + 15)?.item.id).toBe("lunch");
  });

  it("skips items with no start time — nothing to count down to", () => {
    expect(nextUp([item("no-time", null)], 600)).toBeNull();
  });

  it("counts an item starting exactly now as next, not past", () => {
    expect(nextUp(items, 11 * 60)?.minutesUntil).toBe(0);
  });

  it("is null once the day is done", () => {
    expect(nextUp(items, 23 * 60)).toBeNull();
  });
});

describe("currentItemId", () => {
  const items = [
    item("breakfast", "08:00"),
    item("tram", "11:00"),
    item("lunch", "13:30"),
  ];

  it("is the most recent item whose time has passed", () => {
    expect(currentItemId(items, 12 * 60)).toBe("tram");
  });

  it("is null before the first item", () => {
    expect(currentItemId(items, 7 * 60)).toBeNull();
  });

  it("ignores finished items", () => {
    const withDone = [item("breakfast", "08:00"), item("tram", "11:00", "done")];
    expect(currentItemId(withDone, 12 * 60)).toBe("breakfast");
  });
});
