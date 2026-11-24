import { describe, expect, it } from "vitest";
import { feedbackPayloadFor, feedbackUrl, type FeedbackItem } from "./feedbackPush";

const names = new Map([
  ["grandma", "סבתא"],
  ["sivan", "סיון"],
  ["hadar", "הדר"],
]);

const comment = (id: string, authorId: string, at: string, extra: Partial<FeedbackItem> = {}): FeedbackItem => ({
  id,
  kind: "comment",
  authorId,
  createdAt: at,
  body: "איזה יופי!",
  postId: "p1",
  ...extra,
});
const like = (id: string, authorId: string, at: string, extra: Partial<FeedbackItem> = {}): FeedbackItem => ({
  id,
  kind: "reaction",
  authorId,
  createdAt: at,
  reaction: "heart",
  photoId: "ph1",
  ...extra,
});

describe("feedbackPayloadFor", () => {
  it("one comment: names the writer, quiet, counted, opens the update", () => {
    const p = feedbackPayloadFor("hadar", [comment("c1", "grandma", "2026-11-23T10:00:00Z")], names);
    expect(p).toMatchObject({
      title: "תגובה חדשה 💬",
      body: "סבתא: איזה יופי!",
      url: "/stories#story-p1",
      tag: "feedback",
      count: 1,
      silent: true,
      badge: true,
    });
  });

  it("nobody hears about their own comment or like", () => {
    expect(feedbackPayloadFor("hadar", [comment("c1", "hadar", "2026-11-23T10:00:00Z")], names)).toBeNull();
    const p = feedbackPayloadFor(
      "sivan",
      [comment("c1", "hadar", "2026-11-23T10:00:00Z"), like("r1", "sivan", "2026-11-23T10:01:00Z")],
      names
    );
    expect(p?.count).toBe(1);
  });

  it("one like: emoji and what it is on", () => {
    const p = feedbackPayloadFor("hadar", [like("r1", "grandma", "2026-11-23T10:00:00Z", { reaction: "star" })], names);
    expect(p).toMatchObject({ title: "לייק חדש ❤️", body: "סבתא ⭐ על התמונה", url: "/photos?photo=ph1" });
  });

  it("several: counted, the latest previewed, opens home", () => {
    const p = feedbackPayloadFor(
      "hadar",
      [
        like("r1", "grandma", "2026-11-23T10:05:00Z"),
        comment("c1", "sivan", "2026-11-23T10:00:00Z"),
        comment("c2", "grandma", "2026-11-23T10:09:00Z", { body: "מתגעגעים" }),
      ],
      names
    );
    expect(p).toMatchObject({ title: "3 תגובות ולייקים חדשים 💬", body: "סבתא: מתגעגעים", url: "/", count: 3 });
    expect(feedbackPayloadFor("hadar", [like("r1", "grandma", "a"), like("r2", "sivan", "b")], names)?.title).toBe(
      "2 לייקים חדשים ❤️"
    );
    expect(feedbackPayloadFor("hadar", [comment("c1", "grandma", "a"), comment("c2", "sivan", "b")], names)?.title).toBe(
      "2 תגובות חדשות 💬"
    );
  });

  it("a long comment is cut", () => {
    const p = feedbackPayloadFor("hadar", [comment("c1", "grandma", "a", { body: "א".repeat(120) })], names);
    expect(p?.body.endsWith("…")).toBe(true);
    expect(p!.body.length).toBeLessThan(95);
  });
});

describe("feedbackUrl", () => {
  it("opens the target of each kind", () => {
    expect(feedbackUrl(like("r", "x", "a", { photoId: null, episodeId: "e1" }))).toBe("/podcast#episode-e1");
    expect(feedbackUrl(like("r", "x", "a", { photoId: null, messageId: "m1" }))).toBe("/messages");
  });

  it("a like on a comment opens what the comment is on, else home", () => {
    const parent = comment("c1", "grandma", "a", { postId: null, episodeId: "e1" });
    const onComment = like("r", "x", "a", { photoId: null, commentId: "c1" });
    expect(feedbackUrl(onComment, new Map([["c1", parent]]))).toBe("/podcast#episode-e1");
    expect(feedbackUrl(onComment)).toBe("/");
  });
});
