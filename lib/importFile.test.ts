import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseSheet, toLabels, toRoutePoints } from "./importFile";

function xlsxFile(aoa: unknown[][], name = "test.xlsx"): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "S");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([buf], name);
}

describe("toLabels", () => {
  it("drops a header row and blanks, keeps first-column values", () => {
    const rows = [["פריט"], ["דרכונים"], [""], ["מטען יד"]];
    expect(toLabels(rows)).toEqual(["דרכונים", "מטען יד"]);
  });

  it("keeps the first row when it is not a header", () => {
    expect(toLabels([["חלב"], ["לחם"]])).toEqual(["חלב", "לחם"]);
  });
});

describe("toRoutePoints", () => {
  it("maps lat/lng header columns in any order and skips invalid rows", () => {
    const rows = [
      ["name", "lng", "lat"],
      ["a", "34.78", "32.08"],
      ["bad", "x", "y"],
      ["b", "2.3522", "48.8566"],
    ];
    expect(toRoutePoints(rows)).toEqual([
      { lat: 32.08, lng: 34.78 },
      { lat: 48.8566, lng: 2.3522 },
    ]);
  });

  it("falls back to the two right-most numbers without a header", () => {
    expect(toRoutePoints([["Start", "32.1", "34.8"]])).toEqual([
      { lat: 32.1, lng: 34.8 },
    ]);
  });

  it("rejects out-of-range coordinates", () => {
    expect(toRoutePoints([["lat", "lng"], ["200", "500"]])).toEqual([]);
  });
});

describe("parseSheet", () => {
  it("reads an xlsx into trimmed rows, dropping blank rows", async () => {
    const file = xlsxFile([["a", "b"], ["", ""], ["c"]]);
    expect(await parseSheet(file)).toEqual([["a", "b"], ["c"]]);
  });

  it("reads a .txt file as one label per line", async () => {
    const file = new File(["חלב\n\nלחם\n"], "list.txt");
    expect(await parseSheet(file)).toEqual([["חלב"], ["לחם"]]);
  });
});
