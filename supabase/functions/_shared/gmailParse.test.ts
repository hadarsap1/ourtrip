import { describe, expect, it } from "vitest";
import {
  bodyText,
  decodeBody,
  headerOf,
  stripHtml,
  toCandidates,
  type MailMessage,
  type RawCandidate,
} from "./gmailParse";

/** Gmail's encoding: base64url with the padding stripped. */
const enc = (text: string) =>
  Buffer.from(text, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

describe("decodeBody", () => {
  it("decodes base64url with the padding stripped", () => {
    expect(decodeBody(enc("Check-in: 31 October 2026"))).toBe(
      "Check-in: 31 October 2026"
    );
  });

  it("keeps Hebrew intact", () => {
    // An Israeli provider's confirmation is the whole reason this must be UTF-8.
    expect(decodeBody(enc("אישור הזמנה · תל אביב"))).toBe("אישור הזמנה · תל אביב");
  });

  it("keeps Japanese intact", () => {
    expect(decodeBody(enc("一遊-Louis Stage Iriya"))).toBe("一遊-Louis Stage Iriya");
  });

  it("returns empty rather than throwing on rubbish", () => {
    expect(decodeBody("!!!not base64!!!")).toBe("");
  });
});

describe("stripHtml", () => {
  it("keeps a table's label attached to its value", () => {
    // Without the cell and row handling this collapses to one line and
    // "check-in" stops pointing at a date.
    const text = stripHtml(
      "<table><tr><td>Check-in</td><td>31 Oct 2026</td></tr>" +
        "<tr><td>Check-out</td><td>5 Nov 2026</td></tr></table>"
    );
    expect(text).toContain("Check-in | 31 Oct 2026");
    expect(text).toContain("Check-out | 5 Nov 2026");
  });

  it("drops script and style content entirely", () => {
    const text = stripHtml(
      "<style>.a{color:red}</style><script>var x=1;</script><p>Booking confirmed</p>"
    );
    expect(text).toBe("Booking confirmed");
    expect(text).not.toContain("color");
    expect(text).not.toContain("var x");
  });

  it("unescapes the entities a confirmation actually uses", () => {
    expect(stripHtml("<p>Smith &amp; Sons &quot;Deluxe&quot; &#39;room&#39;</p>")).toBe(
      "Smith & Sons \"Deluxe\" 'room'"
    );
  });

  it("turns line breaks into newlines", () => {
    expect(stripHtml("A<br>B<br/>C")).toBe("A\nB\nC");
  });
});

describe("bodyText", () => {
  it("prefers the plain part over the html one", () => {
    const text = bodyText({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: enc("PLAIN: code 9QZVZ4") } },
        { mimeType: "text/html", body: { data: enc("<p>HTML version</p>") } },
      ],
    });
    expect(text).toBe("PLAIN: code 9QZVZ4");
  });

  it("falls back to the html part when there is no plain one", () => {
    const text = bodyText({
      mimeType: "multipart/alternative",
      parts: [{ mimeType: "text/html", body: { data: enc("<p>Confirmed</p>") } }],
    });
    expect(text).toBe("Confirmed");
  });

  it("reaches a part nested several levels down", () => {
    // multipart/mixed > multipart/related > multipart/alternative is ordinary
    // for a confirmation carrying a logo and a PDF.
    const text = bodyText({
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/related",
          parts: [
            {
              mimeType: "multipart/alternative",
              parts: [
                { mimeType: "text/plain", body: { data: enc("Deep body") } },
              ],
            },
          ],
        },
        { mimeType: "application/pdf", body: { size: 10240 } },
      ],
    });
    expect(text).toBe("Deep body");
  });

  it("is empty for a message with no readable part", () => {
    expect(bodyText({ mimeType: "application/pdf", body: { size: 999 } })).toBe("");
    expect(bodyText(undefined)).toBe("");
  });
});

describe("headerOf", () => {
  const message: MailMessage = {
    payload: {
      headers: [
        { name: "Subject", value: "Your booking is confirmed" },
        { name: "From", value: "Booking.com <noreply@booking.com>" },
      ],
    },
  };

  it("finds a header regardless of case", () => {
    expect(headerOf(message, "subject")).toBe("Your booking is confirmed");
  });

  it("is empty for a header that is not there", () => {
    expect(headerOf(message, "Reply-To")).toBe("");
  });
});

describe("toCandidates", () => {
  const sources = new Map([
    ["m1", { subject: "Your booking is confirmed", from: "noreply@booking.com" }],
  ]);
  const raw = (over: Partial<RawCandidate>): RawCandidate => ({
    message_id: "m1",
    is_booking: true,
    type: "hotel",
    title: "Minerva Prestige Hotel",
    start_date: "2026-10-31",
    end_date: "2026-11-05",
    confirmation_code: "5264047770",
    cost: 1950,
    currency: "ils",
    provider: "Booking.com",
    notes: null,
    ...over,
  });

  it("passes a clean entry through, upcasing the currency", () => {
    const [c] = toCandidates([raw({})], sources);
    expect(c.title).toBe("Minerva Prestige Hotel");
    expect(c.currency).toBe("ILS");
    expect(c.cost).toBe(1950);
    expect(c.subject).toBe("Your booking is confirmed");
  });

  it("drops an entry naming a message that was never supplied", () => {
    // The guard that stops a hostile email attaching its fields to another
    // message's headers.
    expect(toCandidates([raw({ message_id: "not-sent" })], sources)).toEqual([]);
  });

  it("drops an entry that is not a booking", () => {
    expect(toCandidates([raw({ is_booking: false })], sources)).toEqual([]);
  });

  it("falls back to other for a type outside the enum", () => {
    // The database enum would reject anything else.
    const [c] = toCandidates([raw({ type: "spaceship" })], sources);
    expect(c.type).toBe("other");
  });

  it("drops a malformed date", () => {
    const [c] = toCandidates([raw({ start_date: "31/10/2026" })], sources);
    expect(c.start_date).toBeNull();
  });

  it("drops an end date that precedes the start", () => {
    const [c] = toCandidates([raw({ end_date: "2026-09-10" })], sources);
    expect(c.start_date).toBe("2026-10-31");
    expect(c.end_date).toBeNull();
  });

  it("drops an end date with no start to anchor it", () => {
    const [c] = toCandidates([raw({ start_date: null })], sources);
    expect(c.end_date).toBeNull();
  });

  it("drops a currency when the amount did not survive", () => {
    const [c] = toCandidates([raw({ cost: 0 })], sources);
    expect(c.cost).toBeNull();
    expect(c.currency).toBeNull();
  });

  it("drops a non-finite cost", () => {
    const [c] = toCandidates([raw({ cost: Number.NaN })], sources);
    expect(c.cost).toBeNull();
  });

  it("names a titleless booking after its subject rather than leaving it blank", () => {
    const [c] = toCandidates([raw({ title: "   " })], sources);
    expect(c.title).toBe("Your booking is confirmed");
  });

  it("caps free text so one email cannot write a wall into the trip", () => {
    const [c] = toCandidates(
      [raw({ title: "x".repeat(500), notes: "y".repeat(900) })],
      sources
    );
    expect(c.title).toHaveLength(120);
    expect(c.notes).toHaveLength(300);
  });
});
