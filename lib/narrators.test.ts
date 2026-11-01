import { describe, expect, it } from "vitest";
import { addNarrator, formatNarrators, narratorChoices } from "./narrators";

describe("narratorChoices", () => {
  it("kids, then parents, without test members", () => {
    expect(
      narratorChoices([
        { display_name: "הדר", role: "owner" },
        { display_name: "עומר", role: "kid" },
        { display_name: "🧪 ילד בדיקה", role: "kid", is_preview: true },
        { display_name: "אלה", role: "kid" },
        { display_name: "סבתא", role: "guest" },
        { display_name: "סיון", role: "owner" },
      ])
    ).toEqual({ kids: ["עומר", "אלה"], parents: ["הדר", "סיון"] });
  });
});

describe("formatNarrators", () => {
  it("joins in Hebrew", () => {
    expect(formatNarrators([])).toBe("");
    expect(formatNarrators(["עומר"])).toBe("עומר");
    expect(formatNarrators(["עומר", "אלה"])).toBe("עומר ואלה");
    expect(formatNarrators(["עומר", "אלה", "סיון"])).toBe("עומר, אלה וסיון");
  });
});

describe("addNarrator", () => {
  it("adds a typed name once", () => {
    expect(addNarrator(["עומר"], "  נגוין ")).toEqual(["עומר", "נגוין"]);
    expect(addNarrator(["עומר"], "עומר")).toEqual(["עומר"]);
    expect(addNarrator(["עומר"], "  ")).toEqual(["עומר"]);
  });
});
