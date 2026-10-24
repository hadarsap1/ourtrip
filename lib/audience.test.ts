import { describe, expect, it } from "vitest";
import { audienceText, photoAudienceAfterShare, withDefaultGroups } from "./audience";

describe("audienceText", () => {
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
