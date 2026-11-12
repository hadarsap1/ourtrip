import { describe, expect, it } from "vitest";
import { clearStoryDraft, loadStoryDraft, saveStoryDraft } from "@/lib/storyDraft";

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    size: () => m.size,
  };
}

const base = { title: "", body: "", mood: null, place: "", photoIds: [], audience: "family" as const, groups: [] };

describe("story draft", () => {
  it("keeps text and photo ids until cleared", () => {
    const s = memStore();
    saveStoryDraft("t", "m", { ...base, body: "יצאנו", photoIds: ["p1", "p2"] }, s);
    const d = loadStoryDraft("t", "m", s);
    expect(d?.body).toBe("יצאנו");
    expect(d?.photoIds).toEqual(["p1", "p2"]);
    clearStoryDraft("t", "m", s);
    expect(loadStoryDraft("t", "m", s)).toBeNull();
  });

  it("keeps photos alone, even with no text", () => {
    const s = memStore();
    saveStoryDraft("t", "m", { ...base, photoIds: ["p1"] }, s);
    expect(loadStoryDraft("t", "m", s)?.photoIds).toEqual(["p1"]);
  });

  it("an empty draft removes what was stored", () => {
    const s = memStore();
    saveStoryDraft("t", "m", { ...base, body: "x" }, s);
    saveStoryDraft("t", "m", { ...base, body: "  " }, s);
    expect(s.size()).toBe(0);
  });

  it("is per trip and per member", () => {
    const s = memStore();
    saveStoryDraft("t", "sivan", { ...base, body: "x" }, s);
    expect(loadStoryDraft("t", "hadar", s)).toBeNull();
    expect(loadStoryDraft("t2", "sivan", s)).toBeNull();
  });

  it("survives broken storage content", () => {
    const s = memStore();
    s.setItem("ourtrip-story-draft:t:m", "{not json");
    expect(loadStoryDraft("t", "m", s)).toBeNull();
  });
});
