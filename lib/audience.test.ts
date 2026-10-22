import { describe, expect, it } from "vitest";
import {
  audienceForTab,
  audienceText,
  EVERYONE,
  inTab,
  photoAudienceAfterShare,
  tabKey,
  wallTabs,
  withDefaultGroups,
} from "./audience";

const msgs = [
  { id: "1", audience: [] },
  { id: "2", audience: ["כיתה עומר"] },
  { id: "3", audience: ["כיתה עומר", "כיתה אלה"] },
  { id: "4", audience: ["כיתה אלה"] },
];

describe("inTab", () => {
  it("everyone holds only the messages to everyone", () => {
    expect(inTab(msgs, EVERYONE).map((m) => m.id)).toEqual(["1"]);
  });

  it("a group tab holds every message that includes the group", () => {
    expect(inTab(msgs, { kind: "group", label: "כיתה עומר" }).map((m) => m.id)).toEqual(["2", "3"]);
    expect(inTab(msgs, { kind: "group", label: "כיתה אלה" }).map((m) => m.id)).toEqual(["3", "4"]);
  });
});

describe("wallTabs", () => {
  it("no groups and no group messages: no tabs", () => {
    expect(wallTabs([], [{ audience: [] }])).toEqual([]);
  });

  it("everyone first, then the groups sorted", () => {
    expect(wallTabs(["כיתה עומר", "חברים"], []).map(tabKey)).toEqual(["*", "g:חברים", "g:כיתה עומר"]);
  });

  it("adds a group that only appears on a readable message", () => {
    expect(wallTabs([], [{ audience: ["כיתה אלה"] }]).map(tabKey)).toEqual(["*", "g:כיתה אלה"]);
  });
});

describe("audienceForTab / audienceText", () => {
  it("writing in a tab sends to that tab", () => {
    expect(audienceForTab(EVERYONE)).toEqual([]);
    expect(audienceForTab({ kind: "group", label: "כיתה עומר" })).toEqual(["כיתה עומר"]);
  });

  it("names the groups, or nothing for everyone", () => {
    expect(audienceText([])).toBeNull();
    expect(audienceText(["כיתה עומר", "כיתה אלה"])).toBe("כיתה עומר, כיתה אלה");
  });
});

describe("photoAudienceAfterShare", () => {
  const omer = ["כיתה עומר"];
  it("a story to every guest shares an everyone photo with everyone", () => {
    expect(photoAudienceAfterShare({ shared_with_guests: false, audience: [] }, [])).toEqual([]);
  });
  it("a group story shares an everyone photo with that group only", () => {
    expect(photoAudienceAfterShare({ shared_with_guests: false, audience: [] }, omer)).toEqual(omer);
  });
  it("a photo uploaded for a group stays in that group, whatever the story", () => {
    expect(photoAudienceAfterShare({ shared_with_guests: false, audience: ["כיתה אלה"] }, [])).toEqual(["כיתה אלה"]);
    expect(photoAudienceAfterShare({ shared_with_guests: false, audience: ["כיתה אלה"] }, omer)).toEqual(["כיתה אלה"]);
  });
  it("a story to everyone does not widen a photo shared with a group", () => {
    expect(photoAudienceAfterShare({ shared_with_guests: true, audience: omer }, [])).toEqual(omer);
  });
  it("never narrows a photo already shared with everyone", () => {
    expect(photoAudienceAfterShare({ shared_with_guests: true, audience: [] }, omer)).toEqual([]);
  });
  it("adds the story's group to a photo already shared with another group", () => {
    expect(photoAudienceAfterShare({ shared_with_guests: true, audience: ["כיתה אלה"] }, omer)).toEqual([
      "כיתה אלה",
      "כיתה עומר",
    ]);
  });
});

describe("withDefaultGroups", () => {
  const defaults = ["משפחה", "חברים", "כיתה עומר", "כיתה אלה"];
  it("the family always gets the basic groups, plus any other", () => {
    expect(withDefaultGroups(["חברים", "שכנים"], "owner", defaults)).toEqual([...defaults, "שכנים"]);
    expect(withDefaultGroups([], "kid", defaults)).toEqual(defaults);
  });
  it("a guest gets only their own groups", () => {
    expect(withDefaultGroups(["חברים"], "guest", defaults)).toEqual(["חברים"]);
  });
});
