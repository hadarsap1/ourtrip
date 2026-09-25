import { describe, expect, it } from "vitest";
import {
  candidateToInsert,
  reviewCandidates,
  type BookingCandidate,
} from "./gmailBookings";
import type { Booking } from "@/lib/types";

const candidate = (over: Partial<BookingCandidate>): BookingCandidate => ({
  message_id: "m1",
  type: "hotel",
  title: "Minerva Prestige Hotel",
  start_date: "2026-10-31",
  end_date: "2026-11-05",
  confirmation_code: "5264047770",
  cost: 1950,
  currency: "ILS",
  provider: "Booking.com",
  notes: null,
  subject: "Your booking is confirmed",
  from: "noreply@booking.com",
  ...over,
});

const booking = (over: Partial<Booking>): Booking =>
  ({
    id: over.id ?? "b",
    trip_id: "t",
    type: "hotel",
    title: "Minerva Prestige Hotel",
    start_date: "2026-10-31",
    end_date: "2026-11-05",
    confirmation_code: "5264047770",
    cost: 1950,
    currency: "ILS",
    status: "booked",
    file_path: null,
    link_url: null,
    details: {},
    notes: null,
    updated_at: "",
    ...over,
  }) as Booking;

describe("reviewCandidates", () => {
  it("matches on the confirmation code even when everything else differs", () => {
    const [reviewed] = reviewCandidates(
      [candidate({ title: "Minerva Hotel Thessaloniki", start_date: "2026-11-01" })],
      [booking({ id: "existing" })]
    );
    expect(reviewed.duplicateOf?.id).toBe("existing");
  });

  it("ignores case and punctuation in the code", () => {
    const [reviewed] = reviewCandidates(
      [candidate({ confirmation_code: "9qz-vz4" })],
      [booking({ id: "existing", confirmation_code: "9QZVZ4" })]
    );
    expect(reviewed.duplicateOf?.id).toBe("existing");
  });

  it("matches a code-less candidate on type, title and start date", () => {
    // The same confirmation often arrives twice - an original, then a "your
    // reservation is confirmed" follow-up that omits the code.
    const [reviewed] = reviewCandidates(
      [candidate({ confirmation_code: null })],
      [booking({ id: "existing", confirmation_code: null })]
    );
    expect(reviewed.duplicateOf?.id).toBe("existing");
  });

  it("does not match the same hotel booked for different dates", () => {
    const [reviewed] = reviewCandidates(
      [candidate({ confirmation_code: null, start_date: "2027-03-22" })],
      [booking({ id: "existing", confirmation_code: null })]
    );
    expect(reviewed.duplicateOf).toBeNull();
  });

  it("does not match a flight against a hotel of the same name and date", () => {
    const [reviewed] = reviewCandidates(
      [candidate({ type: "flight", confirmation_code: null })],
      [booking({ id: "existing", confirmation_code: null })]
    );
    expect(reviewed.duplicateOf).toBeNull();
  });

  it("reports nothing as duplicate against an empty trip", () => {
    const reviewed = reviewCandidates([candidate({})], []);
    expect(reviewed[0].duplicateOf).toBeNull();
  });
});

describe("candidateToInsert", () => {
  it("carries the provider into the Hebrew notes", () => {
    const row = candidateToInsert(candidate({ notes: "חדר זוגי" }), "trip-1");
    expect(row.notes).toBe("חדר זוגי · הוזמן דרך Booking.com");
    expect(row.status).toBe("booked");
    expect(row.trip_id).toBe("trip-1");
  });

  it("leaves notes empty when there is nothing to say", () => {
    const row = candidateToInsert(candidate({ notes: null, provider: null }), "t");
    expect(row.notes).toBeNull();
  });

  it("drops a currency with no amount attached to it", () => {
    // A currency on a null cost would render as "₪ -" on the booking card.
    const row = candidateToInsert(candidate({ cost: null }), "t");
    expect(row.cost).toBeNull();
    expect(row.currency).toBeNull();
  });

  it("drops an end date that comes before the start", () => {
    const row = candidateToInsert(
      candidate({ start_date: "2027-04-02", end_date: "2026-09-10" }),
      "t"
    );
    expect(row.start_date).toBe("2027-04-02");
    expect(row.end_date).toBeNull();
  });

  it("keeps an end date on or after the start", () => {
    const row = candidateToInsert(
      candidate({ start_date: "2027-04-02", end_date: "2027-04-10" }),
      "t"
    );
    expect(row.end_date).toBe("2027-04-10");
  });
});
