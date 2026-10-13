import { describe, expect, it } from "vitest";
import { normalizeLabel, parseGuestList } from "./guestBulk";

describe("parseGuestList", () => {
  it("reads name and email in either order and with common separators", () => {
    const { guests, invalid } = parseGuestList(
      [
        "דנה כהן, dana@example.com",
        "yoni@example.co.il - יוני לוי",
        "Noa <noa@example.com>",
        "רון\tron@example.org",
      ].join("\n")
    );
    expect(invalid).toEqual([]);
    expect(guests).toEqual([
      { name: "דנה כהן", email: "dana@example.com" },
      { name: "יוני לוי", email: "yoni@example.co.il" },
      { name: "Noa", email: "noa@example.com" },
      { name: "רון", email: "ron@example.org" },
    ]);
  });

  it("falls back to the address before the @ when there is no name", () => {
    expect(parseGuestList("savta@example.com").guests).toEqual([
      { name: "savta", email: "savta@example.com" },
    ]);
  });

  it("lowercases, de-duplicates and counts duplicates", () => {
    const result = parseGuestList("A@Example.com\na@example.com\nb@example.com");
    expect(result.guests.map((g) => g.email)).toEqual(["a@example.com", "b@example.com"]);
    expect(result.duplicates).toBe(1);
  });

  it("reports lines with no address and skips blank lines", () => {
    const result = parseGuestList("\n  \nרק שם בלי מייל\nx@y.io\n");
    expect(result.invalid).toEqual(["רק שם בלי מייל"]);
    expect(result.guests).toHaveLength(1);
  });

  it("drops a trailing full stop after the address", () => {
    expect(parseGuestList("Tal tal@example.com.").guests[0].email).toBe("tal@example.com");
  });
});

describe("normalizeLabel", () => {
  it("trims, caps at 40 and turns empty into null", () => {
    expect(normalizeLabel("  כיתה ב׳ ")).toBe("כיתה ב׳");
    expect(normalizeLabel("   ")).toBeNull();
    expect(normalizeLabel(undefined)).toBeNull();
    expect(normalizeLabel("x".repeat(50))).toHaveLength(40);
  });
});
