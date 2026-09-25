// Synthetic trip data for the populated e2e suite. Shaped like the real trip
// (a multi-country, seven-month round-the-world itinerary) but invented: no
// confirmation codes, addresses or documents from the live project.
//
// Every table the app reads is keyed here by name; the mock PostgREST in
// mockSupabase.ts serves rows from this object.

export const TRIP_ID = "00000000-0000-4000-8000-000000000001";
export const OWNER_ID = "00000000-0000-4000-8000-0000000000a1";
export const OWNER_AUTH_ID = "00000000-0000-4000-8000-0000000000f1";

type Row = Record<string, unknown>;

let seq = 0;
function uid(): string {
  seq += 1;
  return `00000000-0000-4000-9000-${seq.toString(16).padStart(12, "0")}`;
}

const UPDATED = "2026-09-20T10:00:00+00:00";

// Legs of the trip: [location, country, first day, last day].
const LEGS: [string, string, string, string][] = [
  ["וייטנאם - צפון", "VN", "2026-10-31", "2026-11-20"],
  ["תאילנד", "TH", "2026-11-21", "2026-12-28"],
  ["קמבודיה", "KH", "2026-12-29", "2027-01-25"],
  ["וייטנאם - דרום ומרכז", "VN", "2027-01-26", "2027-03-01"],
  ["פיליפינים", "PH", "2027-03-02", "2027-03-22"],
  ["קיוטו", "JP", "2027-03-23", "2027-04-05"],
  ["אוסקה", "JP", "2027-04-06", "2027-04-12"],
  ["קנאזאווה וטאקאיאמה", "JP", "2027-04-13", "2027-04-19"],
  ["טוקיו", "JP", "2027-04-20", "2027-05-12"],
  ["המקטע האחרון - פתוח (גאורגיה כברירת מחדל)", "GE", "2027-05-13", "2027-06-17"],
];

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const itineraryDays: Row[] = [];
for (const [location, cc, first, last] of LEGS) {
  for (let d = first; d <= last; d = addDays(d, 1)) {
    itineraryDays.push({
      id: uid(),
      trip_id: TRIP_ID,
      date: d,
      location_name: location,
      country_code: cc,
      lat: null,
      lng: null,
      notes: d === first ? "יום מעבר" : null,
      updated_at: UPDATED,
    });
  }
}
const dayOn = (date: string) => itineraryDays.find((d) => d.date === date)!;

const bookingFlight = uid();
const bookingHanoi = uid();
const bookingChiangMai = uid();
const bookingKyoto = uid();
const bookingCancelled = uid();

const bookings: Row[] = [
  {
    id: bookingFlight, trip_id: TRIP_ID, type: "flight", title: "תל אביב - האנוי",
    start_date: "2026-10-31", end_date: null, confirmation_code: "TEST01",
    cost: 2834, currency: "USD", status: "booked", file_path: null, link_url: null,
    details: { from: "TLV", to: "HAN", departure_time: "22:40" }, notes: null, updated_at: UPDATED,
  },
  {
    id: bookingHanoi, trip_id: TRIP_ID, type: "hotel", title: "Old Quarter Family Hotel",
    start_date: "2026-10-31", end_date: "2026-11-05", confirmation_code: "1000000001",
    cost: 1950, currency: "ILS", status: "booked", file_path: null, link_url: "https://example.com/booking/1",
    details: { address: "Hoan Kiem, Hanoi, Vietnam", check_in: "14:00", check_out: "12:00" },
    notes: "ביטול חינם עד 27.10", updated_at: UPDATED,
  },
  {
    id: bookingChiangMai, trip_id: TRIP_ID, type: "hotel", title: "Boutique Hotel Chiang Mai With A Rather Long Name",
    start_date: "2026-11-22", end_date: "2026-11-26", confirmation_code: null,
    cost: 20550, currency: "THB", status: "booked", file_path: null, link_url: null,
    details: { address: "Charoen Muang Road, Chiang Mai 50000", check_in: "14:00", check_out: "12:00" },
    notes: "שולמה מקדמה. ביטול בחינם עד 8.11.26", updated_at: UPDATED,
  },
  {
    id: bookingKyoto, trip_id: TRIP_ID, type: "hotel", title: "Kyoto Machiya Stay",
    start_date: "2027-04-02", end_date: "2027-04-10", confirmation_code: "1000000003",
    cost: 3787, currency: "ILS", status: "booked", file_path: null,
    link_url: "https://example.com/booking/" + "x".repeat(300),
    details: { address: "Ukyo Ward, Kyoto, Japan", check_in: "16:00", check_out: "10:00" },
    notes: null, updated_at: UPDATED,
  },
  {
    id: bookingCancelled, trip_id: TRIP_ID, type: "hotel", title: "Gion Apartment (בוטל)",
    start_date: "2027-04-02", end_date: "2027-04-09", confirmation_code: "1000000004",
    cost: 6510, currency: "ILS", status: "cancelled", file_path: null, link_url: null,
    details: {}, notes: null, updated_at: UPDATED,
  },
];

const itineraryItems: Row[] = [
  {
    id: uid(), day_id: dayOn("2026-10-31").id, title: "טיסה תל אביב - האנוי", start_time: "22:40",
    end_time: null, location_name: null, lat: null, lng: null, place_id: null, notes: null,
    is_outdoor: false, status: "planned", shared_with_guests: true, booking_id: bookingFlight,
    sort_order: 0, updated_at: UPDATED,
  },
  {
    id: uid(), day_id: dayOn("2026-11-02").id, title: "שייט במפרץ הלונג", start_time: "08:00",
    end_time: "17:00", location_name: "Ha Long Bay", lat: 20.91, lng: 107.18, place_id: null,
    notes: "להביא כובעים וקרם הגנה", is_outdoor: true, status: "planned",
    shared_with_guests: true, booking_id: null, sort_order: 0, updated_at: UPDATED,
  },
  {
    id: uid(), day_id: dayOn("2026-11-02").id, title: "ארוחת ערב בשוק הלילה", start_time: "19:00",
    end_time: null, location_name: "Hanoi Night Market", lat: 21.03, lng: 105.85, place_id: null,
    notes: null, is_outdoor: true, status: "planned", shared_with_guests: false, booking_id: null,
    sort_order: 1, updated_at: UPDATED,
  },
  {
    id: uid(), day_id: dayOn("2027-04-14").id, title: "פסטיבל טאקאיאמה", start_time: null,
    end_time: null, location_name: "https://maps.app.goo.gl/abcdefghijklmnop", lat: null, lng: null,
    place_id: null, notes: null, is_outdoor: true, status: "planned", shared_with_guests: false,
    booking_id: null, sort_order: 0, updated_at: UPDATED,
  },
];

const cat = (key: string, label: string, planned: number): Row => ({
  id: uid(), trip_id: TRIP_ID, key, label_he: label, planned_amount: planned, updated_at: UPDATED,
});
const budgetCategories = [
  cat("flights", "טיסות", 32620),
  cat("lodging", "לינה", 57200),
  cat("food", "אוכל", 28900),
  cat("transport", "תחבורה", 12400),
  cat("attractions", "אטרקציות", 10250),
  cat("prep", "הכנות לטיול", 14007),
  cat("shopping", "קניות", 0),
  cat("misc", 'בלת"מ', 0),
];
const catId = (key: string) => budgetCategories.find((c) => c.key === key)!.id;

const exp = (
  category: string, amount: number, currency: string, ils: number, description: string,
  spent_on: string, booking_id: string | null = null,
): Row => ({
  id: uid(), trip_id: TRIP_ID, category_id: catId(category), amount, currency, amount_ils: ils,
  description, spent_on, booking_id, created_by: OWNER_ID, created_at: UPDATED, updated_at: UPDATED,
});
const expenses = [
  exp("prep", 624, "ILS", 624, "חיסונים", "2026-08-10"),
  exp("prep", 496, "ILS", 496, "חיסונים 2", "2026-09-01"),
  exp("flights", 2834, "USD", 8597.34, "טיסה תל אביב - האנוי", "2026-10-31", bookingFlight),
  exp("lodging", 1950, "ILS", 1950, "Old Quarter Family Hotel", "2026-10-31", bookingHanoi),
  exp("lodging", 20550, "THB", 1864.42, "Boutique Hotel Chiang Mai With A Rather Long Name", "2026-11-22", bookingChiangMai),
  // entered on the road, on the day: the one row that is real daily pace
  { ...exp("food", 350000, "VND", 49.5, "פו לארבעה", "2026-11-02"), created_at: "2026-11-02T06:30:00+00:00" },
];

const checklistId = uid();
const checklistId2 = uid();
const checklists: Row[] = [
  { id: checklistId, trip_id: TRIP_ID, title: "הזמנות ודדליינים", is_template: false, source_template_id: null, updated_at: UPDATED },
  { id: checklistId2, trip_id: TRIP_ID, title: "ויטנאם צפון", is_template: false, source_template_id: null, updated_at: UPDATED },
];
const checklistItems: Row[] = [
  "דחוף - ויזת תייר תאילנד ל-60 יום. ישראל ברשימת ה-30 יום החדשה",
  "אוקטובר - e-visa וייטנאם ראשונה",
  "דצמבר-ינואר - הרגל ליפן. לסיים את המקטע שלפני בבנגקוק, מנילה או סייגון",
  "ינואר - e-visa קמבודיה",
  "כ-10 במרץ - כרטיסים למוזיאון גיבלי",
].map((label, i) => ({
  id: uid(), checklist_id: checklistId, label, assigned_to: null, checked: i === 0, sort_order: i, updated_at: UPDATED,
})).concat(
  ["האנוי", "NINH BINH", "HA LONG BAY", "SAPA"].map((label, i) => ({
    id: uid(), checklist_id: checklistId2, label, assigned_to: null, checked: false, sort_order: i, updated_at: UPDATED,
  })),
);

const emergencyInfo: Row[] = [
  ["VN", { fire: "114", police: "113", ambulance: "115", embassy_address: "שגרירות ישראל, האנוי" }],
  ["TH", { fire: "199", police: "191", ambulance: "1669", embassy_address: "שגרירות ישראל, בנגקוק" }],
  ["KH", { fire: "118", police: "117", ambulance: "119" }],
  ["PH", { fire: "911", police: "911", ambulance: "911" }],
  ["JP", { fire: "119", police: "110", ambulance: "119", embassy_address: "שגרירות ישראל, טוקיו" }],
  ["GE", { fire: "112", police: "112", ambulance: "112" }],
].map(([country_code, content]) => ({ trip_id: TRIP_ID, country_code, content, updated_at: UPDATED }));

const visa = (
  cc: string, country: string, type: string, title: string, url: string | null,
  max_days: number | null, status: string, sort: number, notes: string,
): Row => ({
  id: uid(), trip_id: TRIP_ID, country_code: cc, country_he: country, requirement_type: type,
  title_he: title, official_url: url, max_days, fee_note: "כ-25 דולר לאדם",
  deadline_note: "להגיש לפחות 5-7 ימי עסקים לפני הטיסה", status, verified_at: "2026-09-15",
  source: "claude", sort_order: sort, notes, created_at: UPDATED, updated_at: UPDATED,
});
const visaRequirements = [
  visa("VN", "וייטנאם", "visa", "E-Visa וייטנאם", "https://evisa.gov.vn", 90, "todo", 10, "שני בלוקים בוייטנאם."),
  visa("TH", "תאילנד", "visa", "ויזת תייר TR - כניסה יחידה, 60 יום", "https://www.thaievisa.go.th", 60, "todo", 20, "הפטור ירד ל-30 יום."),
  visa("TH", "תאילנד", "arrival_card", "TDAC - כרטיס כניסה דיגיטלי", "https://tdac.immigration.go.th", null, "todo", 22, "חובה לכל נכנס."),
  visa("KH", "קמבודיה", "visa", "E-Visa קמבודיה", "https://www.evisa.gov.kh", 30, "done", 30, ""),
  visa("JP", "יפן", "arrival_card", "Visit Japan Web", "https://www.vjw.digital.go.jp", 90, "todo", 50, ""),
  visa("GE", "גאורגיה", "none", "אין דרישת ויזה", null, 365, "not_needed", 60, "עד שנה ללא ויזה."),
];

const OPTION_SEED: [string, string, string, string, string][] = [
  ["VN", "ויטנאם", "האנוי", "רובע העתיק", "attraction"],
  ["VN", "ויטנאם", "האנוי", "מוזיאון האתנולוגיה", "attraction"],
  ["VN", "ויטנאם", "האנוי", "Bun Cha Huong Lien", "restaurant"],
  ["VN", "ויטנאם", "מפרץ הלונג", "שייט לילה במפרץ", "activity"],
  ["VN", "ויטנאם", "סאפה", "טרק בטרסות האורז", "activity"],
  ["VN", "ויטנאם", "דלתת המקונג", "הומסטיי במקונג", "hotel"],
  ["TH", "תאילנד", "צ'יאנג מאי", "מקדש דוי סוטפ", "attraction"],
  ["TH", "תאילנד", "צ'יאנג מאי", "פארק פילים אתי", "activity"],
  ["TH", "תאילנד", "קו לנטה", "חוף קלונג דאו", "beach"],
  ["KH", "קמבודיה", "סיאם ריפ", "אנגקור ואט בזריחה", "attraction"],
  ["JP", "יפן", "קיוטו", "פושימי אינרי", "attraction"],
  ["JP", "יפן", "טוקיו", "מוזיאון גיבלי", "attraction"],
];
const placeOptions: Row[] = OPTION_SEED.map(([cc, country, area, title, category], i) => ({
  id: uid(), trip_id: TRIP_ID, country, country_code: cc, area, title, category,
  note: i % 3 === 0 ? "קריטריון: לחפש משהו אמיתי ולא מלכודת תיירים. [2 שעות]" : null,
  source: "claude", source_url: null, booking_url: null, location_name: `${title}, ${area}`,
  lat: i % 2 ? 21 + i / 10 : null, lng: i % 2 ? 105 + i / 10 : null, place_id: null, maps_url: null,
  status: i === 0 ? "planned" : i % 4 === 0 ? "shortlist" : "option", booking_id: null,
  created_by: null, created_at: UPDATED, updated_at: UPDATED, geocode_attempts: 0,
  itinerary_item_id: null, area_original: null, country_original: country,
}));

const phrasebookEntries: Row[] = [
  ["vi", "ברכות", "שלום", "Xin chào", "סין צ'או"],
  ["vi", "ברכות", "תודה", "Cảm ơn", "קאם און"],
  // an older generation's row: the "transliteration" is the Hebrew again
  ["vi", "ברכות", "בוקר טוב", "Chào buổi sáng", "בוקר טוב"],
  ["vi", "אוכל", "בלי חריף בבקשה", "Không cay", "חונג קאי"],
  ["vi", "חירום", "איפה בית החולים?", "Bệnh viện ở đâu?", "בן וין או דאו?"],
  ["th", "ברכות", "שלום", "สวัสดี", "סוואסדי"],
  ["th", "אוכל", "לא חריף", "ไม่เผ็ด", "מאי פט"],
  ["ja", "ברכות", "תודה", "ありがとう", "אריגאטו"],
  ["ja", "תחבורה", "איפה התחנה?", "駅はどこですか", "אקי וה דוקו דס קה"],
].map(([language, category, phrase_he, phrase_local, phonetic_he]) => ({
  id: uid(), trip_id: TRIP_ID, language, country_code: null, category, phrase_he, phrase_local, phonetic_he,
}));

const destinationFacts: Row[] = [
  ["VN", "🏔️", "במפרץ הלונג יש כמעט 2,000 איים של אבן גיר. השם פירושו 'ירידת הדרקון'."],
  ["VN", "🍜", "פו היא ארוחת בוקר בוייטנאם - אוכלים מרק כבר בשבע בבוקר."],
  ["TH", "🐘", "הפיל הוא החיה הלאומית של תאילנד."],
].map(([country_code, emoji, fact], i) => ({
  id: uid(), trip_id: TRIP_ID, country_code, location_name: null, fact, emoji, sort_order: i,
  source: "ai", created_by: null, created_at: UPDATED,
}));

const documents: Row[] = [
  {
    id: uid(), trip_id: TRIP_ID, title: "ביטוח נסיעות - פוליסה", tag: "insurance", file_path: "x/policy.pdf",
    notes: "מספר חירום בפוליסה", created_at: UPDATED, updated_at: UPDATED, shared_with_kids: false,
    pin_protected: false, enc_mime: null, expires_at: "2027-07-01",
  },
  {
    id: uid(), trip_id: TRIP_ID, title: "דרכון - הורה 1", tag: "passport", file_path: "x/pass.jpg",
    notes: null, created_at: UPDATED, updated_at: UPDATED, shared_with_kids: false,
    pin_protected: true, enc_mime: "image/jpeg", expires_at: "2027-03-01",
  },
];

const members: Row[] = [
  { id: OWNER_ID, trip_id: TRIP_ID, auth_user_id: OWNER_AUTH_ID, email: "owner@example.com", display_name: "הורה", role: "owner", created_at: UPDATED },
  { id: uid(), trip_id: TRIP_ID, auth_user_id: null, email: "owner2@example.com", display_name: "הורה 2", role: "owner", created_at: UPDATED },
  { id: uid(), trip_id: TRIP_ID, auth_user_id: null, email: null, display_name: "ילדה", role: "kid", created_at: UPDATED },
  { id: uid(), trip_id: TRIP_ID, auth_user_id: null, email: null, display_name: "ילד", role: "kid", created_at: UPDATED },
];

export const FIXTURES: Record<string, Row[]> = {
  trips: [{
    id: TRIP_ID, name: "הטיול הגדול", start_date: "2026-10-31", end_date: "2027-06-17",
    base_currency: "ILS", is_active: true, created_at: UPDATED, total_budget: 180000,
  }],
  members,
  itinerary_days: itineraryDays,
  itinerary_items: itineraryItems,
  bookings,
  booking_files: [],
  budget_categories: budgetCategories,
  expenses,
  checklists,
  checklist_items: checklistItems,
  emergency_info: emergencyInfo,
  visa_requirements: visaRequirements,
  place_options: placeOptions,
  phrasebook_entries: phrasebookEntries,
  destination_facts: destinationFacts,
  documents,
  fx_rates: [
    { currency: "USD", day: "2026-09-20", rate_to_ils: 3.03 },
    { currency: "THB", day: "2026-09-20", rate_to_ils: 0.0907 },
    { currency: "VND", day: "2026-09-20", rate_to_ils: 0.000141 },
    { currency: "JPY", day: "2026-09-20", rate_to_ils: 0.0211 },
  ],
  messages: [],
  message_reads: [],
  photos: [],
  google_photos: [],
  journal_entries: [],
  map_pins: [],
  routes: [],
  guests_allowlist: [],
  kid_devices: [],
  pocket_money: [],
  pocket_expenses: [],
  push_subscriptions: [],
  document_pin: [],
  document_passkeys: [],
};
