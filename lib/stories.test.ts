import { describe, expect, it } from "vitest";
import {
  audienceOptions,
  fromLocalInput,
  isScheduled,
  needsFold,
  splitStories,
  titleFromJournal,
  toLocalInput,
} from "./stories";
import type { Post } from "./types";

function post(over: Partial<Post>): Post {
  return {
    id: "p",
    trip_id: "t",
    author_id: "a",
    title: "x",
    body: "",
    day_id: null,
    place_label: null,
    country_code: null,
    entry_date: "2026-11-01",
    mood: null,
    status: "draft",
    visibility: "family",
    audience: [],
    publish_after: null,
    public_slug: null,
    approved_by: null,
    published_at: null,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    ...over,
  };
}

describe("splitStories", () => {
  it("sorts published newest first and keeps only my own drafts", () => {
    const sections = splitStories(
      [
        post({ id: "old", status: "approved", published_at: "2026-11-01T00:00:00Z" }),
        post({ id: "new", status: "approved", published_at: "2026-11-05T00:00:00Z" }),
        // written later about an earlier day: the day decides
        post({ id: "back", status: "approved", entry_date: "2026-10-30", published_at: "2026-11-06T00:00:00Z" }),
        post({ id: "mine", status: "draft", author_id: "me" }),
        post({ id: "theirs", status: "draft", author_id: "someone" }),
        post({ id: "wait", status: "pending" }),
      ],
      "me"
    );
    expect(sections.published.map((p) => p.id)).toEqual(["new", "old", "back"]);
    expect(sections.drafts.map((p) => p.id)).toEqual(["mine"]);
    expect(sections.pending.map((p) => p.id)).toEqual(["wait"]);
  });
});

describe("titleFromJournal", () => {
  it("takes the first line", () => {
    expect(titleFromJournal("  השוק הצף  \nואז אכלנו")).toBe("השוק הצף");
  });
  it("cuts a long line at a word", () => {
    const title = titleFromJournal("מילה ".repeat(30), 20);
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(21);
  });
});

describe("isScheduled", () => {
  it("is true only for a future publish_after", () => {
    const now = new Date("2026-11-02T00:00:00Z");
    expect(isScheduled({ publish_after: "2026-11-03T00:00:00Z" }, now)).toBe(true);
    expect(isScheduled({ publish_after: "2026-11-01T00:00:00Z" }, now)).toBe(false);
    expect(isScheduled({ publish_after: null }, now)).toBe(false);
  });
});

describe("audienceOptions", () => {
  it("never offers public for a kid's story", () => {
    expect(audienceOptions("kid")).toEqual(["family", "guests"]);
    expect(audienceOptions("owner")).toContain("public");
  });
});

describe("needsFold", () => {
  it("folds long or many-line bodies", () => {
    expect(needsFold("קצר")).toBe(false);
    expect(needsFold("א".repeat(500))).toBe(true);
    expect(needsFold("1\n2\n3\n4\n5\n6\n7\n8")).toBe(true);
  });
});

describe("local datetime input", () => {
  it("round-trips through the datetime-local format", () => {
    const iso = fromLocalInput("2026-11-20T18:30");
    expect(iso).not.toBeNull();
    expect(toLocalInput(iso)).toBe("2026-11-20T18:30");
    expect(fromLocalInput("")).toBeNull();
    expect(toLocalInput(null)).toBe("");
  });
});
