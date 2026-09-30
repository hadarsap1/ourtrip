import { describe, expect, it } from "vitest";
import { distinctLabels, labelKey } from "./labels";
import { areaChoicesForCountry } from "./data/segments";
import { canonicalLabel } from "./data/placeOptions";
import type { PlaceOption } from "@/lib/types";

describe("labelKey", () => {
  it("reads an ASCII apostrophe and a geresh as the same letter", () => {
    expect(labelKey("מאי צ'או")).toBe(labelKey("מאי צ׳או"));
    expect(labelKey("צ’אנג מאי")).toBe(labelKey("צ'אנג מאי"));
  });

  it("ignores case and spacing", () => {
    expect(labelKey(" KYUSHU ")).toBe(labelKey("Kyushu"));
    expect(labelKey("קו  לנטה")).toBe(labelKey("קו לנטה"));
  });

  it("keeps different names different", () => {
    expect(labelKey("צ'אנג מאי")).not.toBe(labelKey("מאי צ'או"));
  });
});

describe("distinctLabels", () => {
  it("offers a town once whichever way its apostrophe was typed", () => {
    expect(
      distinctLabels(["דלתת המקונג", "מאי צ׳או", "מאי צ'או", "Kyushu", "KYUSHU", null, " "])
    ).toEqual(["דלתת המקונג", "מאי צ׳או", "Kyushu"]);
  });
});

describe("the lists built from the bank", () => {
  const option = (area: string) =>
    ({ country_code: "VN", area, status: "option", lat: null, lng: null }) as PlaceOption;

  it("the segment picker counts both spellings as one town", () => {
    const choices = areaChoicesForCountry(
      [option("מאי צ׳או"), option("מאי צ׳או"), option("מאי צ'או")],
      "VN"
    );
    expect(choices).toHaveLength(1);
    expect(choices[0].options).toBe(3);
  });

  it("a typed apostrophe saves under the bank's geresh spelling", () => {
    expect(canonicalLabel("מאי צ'או", ["מאי צ׳או"])).toBe("מאי צ׳או");
  });
});
