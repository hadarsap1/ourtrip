// Airport + city suggestions for the flight/hotel search autocomplete.
//
// These power native <datalist> hints — they do NOT restrict input:
//   • Flights need an airport, so the field submits an IATA code; any valid
//     code can be typed directly even if it's not in this list.
//   • Hotels take a free-text city, so ANY city works (e.g. "Beer Sheva")
//     whether or not it appears here — the list is only a convenience.
//
// Multi-country by design (CLAUDE.md rule #9): spread across every region for a
// round-the-world trip, no single destination assumed.
export type Airport = { code: string; he: string; en: string };

export const AIRPORTS: Airport[] = [
  // ---- Israel ----
  { code: "TLV", he: "תל אביב", en: "Tel Aviv" },
  { code: "ETM", he: "רמון (אילת)", en: "Ramon (Eilat)" },
  { code: "HFA", he: "חיפה", en: "Haifa" },
  // ---- Western Europe ----
  { code: "LHR", he: "לונדון הית׳רו", en: "London Heathrow" },
  { code: "LGW", he: "לונדון גטוויק", en: "London Gatwick" },
  { code: "STN", he: "לונדון סטנסטד", en: "London Stansted" },
  { code: "LTN", he: "לונדון לוטון", en: "London Luton" },
  { code: "MAN", he: "מנצ׳סטר", en: "Manchester" },
  { code: "EDI", he: "אדינבורו", en: "Edinburgh" },
  { code: "DUB", he: "דבלין", en: "Dublin" },
  { code: "CDG", he: "פריז שארל דה גול", en: "Paris CDG" },
  { code: "ORY", he: "פריז אורלי", en: "Paris Orly" },
  { code: "NCE", he: "ניס", en: "Nice" },
  { code: "AMS", he: "אמסטרדם", en: "Amsterdam" },
  { code: "BRU", he: "בריסל", en: "Brussels" },
  { code: "FRA", he: "פרנקפורט", en: "Frankfurt" },
  { code: "MUC", he: "מינכן", en: "Munich" },
  { code: "BER", he: "ברלין", en: "Berlin" },
  { code: "DUS", he: "דיסלדורף", en: "Düsseldorf" },
  { code: "HAM", he: "המבורג", en: "Hamburg" },
  { code: "ZRH", he: "ציריך", en: "Zurich" },
  { code: "GVA", he: "ז׳נבה", en: "Geneva" },
  { code: "VIE", he: "וינה", en: "Vienna" },
  { code: "LUX", he: "לוקסמבורג", en: "Luxembourg" },
  // ---- Southern Europe ----
  { code: "MAD", he: "מדריד", en: "Madrid" },
  { code: "BCN", he: "ברצלונה", en: "Barcelona" },
  { code: "AGP", he: "מלאגה", en: "Málaga" },
  { code: "PMI", he: "מיורקה", en: "Mallorca" },
  { code: "LIS", he: "ליסבון", en: "Lisbon" },
  { code: "OPO", he: "פורטו", en: "Porto" },
  { code: "FCO", he: "רומא", en: "Rome" },
  { code: "MXP", he: "מילאנו", en: "Milan Malpensa" },
  { code: "VCE", he: "ונציה", en: "Venice" },
  { code: "NAP", he: "נאפולי", en: "Naples" },
  { code: "ATH", he: "אתונה", en: "Athens" },
  { code: "JTR", he: "סנטוריני", en: "Santorini" },
  { code: "HER", he: "כרתים (הרקליון)", en: "Heraklion (Crete)" },
  { code: "SKG", he: "סלוניקי", en: "Thessaloniki" },
  { code: "MLA", he: "מלטה", en: "Malta" },
  { code: "SPU", he: "ספליט", en: "Split" },
  { code: "DBV", he: "דוברובניק", en: "Dubrovnik" },
  // ---- Central & Eastern Europe ----
  { code: "PRG", he: "פראג", en: "Prague" },
  { code: "BUD", he: "בודפשט", en: "Budapest" },
  { code: "WAW", he: "ורשה", en: "Warsaw" },
  { code: "KRK", he: "קרקוב", en: "Kraków" },
  { code: "OTP", he: "בוקרשט", en: "Bucharest" },
  { code: "SOF", he: "סופיה", en: "Sofia" },
  { code: "BEG", he: "בלגרד", en: "Belgrade" },
  { code: "IST", he: "איסטנבול", en: "Istanbul" },
  { code: "AYT", he: "אנטליה", en: "Antalya" },
  { code: "TBS", he: "טביליסי", en: "Tbilisi" },
  { code: "EVN", he: "ירוואן", en: "Yerevan" },
  { code: "BAK", he: "באקו", en: "Baku" },
  // ---- Nordics ----
  { code: "CPH", he: "קופנהגן", en: "Copenhagen" },
  { code: "ARN", he: "שטוקהולם", en: "Stockholm" },
  { code: "OSL", he: "אוסלו", en: "Oslo" },
  { code: "HEL", he: "הלסינקי", en: "Helsinki" },
  { code: "KEF", he: "רייקיאוויק", en: "Reykjavík" },
  // ---- Middle East ----
  { code: "DXB", he: "דובאי", en: "Dubai" },
  { code: "AUH", he: "אבו דאבי", en: "Abu Dhabi" },
  { code: "DOH", he: "דוחא", en: "Doha" },
  { code: "AMM", he: "עמאן", en: "Amman" },
  { code: "RUH", he: "ריאד", en: "Riyadh" },
  { code: "JED", he: "ג׳דה", en: "Jeddah" },
  { code: "MCT", he: "מוסקט", en: "Muscat" },
  // ---- East Asia ----
  { code: "NRT", he: "טוקיו נאריטה", en: "Tokyo Narita" },
  { code: "HND", he: "טוקיו האנדה", en: "Tokyo Haneda" },
  { code: "KIX", he: "אוסקה", en: "Osaka" },
  { code: "CTS", he: "סאפורו", en: "Sapporo" },
  { code: "FUK", he: "פוקואוקה", en: "Fukuoka" },
  { code: "OKA", he: "אוקינאווה", en: "Okinawa" },
  { code: "ICN", he: "סיאול", en: "Seoul" },
  { code: "PEK", he: "בייג׳ינג", en: "Beijing" },
  { code: "PVG", he: "שנגחאי", en: "Shanghai" },
  { code: "CAN", he: "גואנגז׳ו", en: "Guangzhou" },
  { code: "CTU", he: "צ׳נגדו", en: "Chengdu" },
  { code: "HKG", he: "הונג קונג", en: "Hong Kong" },
  { code: "TPE", he: "טאיפיי", en: "Taipei" },
  // ---- Southeast Asia ----
  { code: "BKK", he: "בנגקוק", en: "Bangkok" },
  { code: "HKT", he: "פוקט", en: "Phuket" },
  { code: "CNX", he: "צ׳אנג מאי", en: "Chiang Mai" },
  { code: "USM", he: "קו סמוי", en: "Koh Samui" },
  { code: "SIN", he: "סינגפור", en: "Singapore" },
  { code: "KUL", he: "קואלה לומפור", en: "Kuala Lumpur" },
  { code: "DPS", he: "באלי", en: "Bali (Denpasar)" },
  { code: "CGK", he: "ג׳קרטה", en: "Jakarta" },
  { code: "HAN", he: "האנוי", en: "Hanoi" },
  { code: "SGN", he: "הו צ׳י מין", en: "Ho Chi Minh City" },
  { code: "DAD", he: "דה נאנג", en: "Da Nang" },
  { code: "REP", he: "סיאם ריפ", en: "Siem Reap" },
  { code: "MNL", he: "מנילה", en: "Manila" },
  { code: "CEB", he: "סבו", en: "Cebu" },
  // ---- South Asia ----
  { code: "DEL", he: "דלהי", en: "Delhi" },
  { code: "BOM", he: "מומבאי", en: "Mumbai" },
  { code: "GOI", he: "גואה", en: "Goa" },
  { code: "BLR", he: "בנגלור", en: "Bangalore" },
  { code: "MAA", he: "צ׳נאי", en: "Chennai" },
  { code: "CMB", he: "קולומבו", en: "Colombo" },
  { code: "MLE", he: "האיים המלדיביים", en: "Maldives (Malé)" },
  { code: "KTM", he: "קטמנדו", en: "Kathmandu" },
  // ---- Oceania ----
  { code: "SYD", he: "סידני", en: "Sydney" },
  { code: "MEL", he: "מלבורן", en: "Melbourne" },
  { code: "BNE", he: "בריסביין", en: "Brisbane" },
  { code: "PER", he: "פרת׳", en: "Perth" },
  { code: "AKL", he: "אוקלנד", en: "Auckland" },
  { code: "CHC", he: "קרייסטצ׳רץ׳", en: "Christchurch" },
  { code: "NAN", he: "פיג׳י", en: "Fiji (Nadi)" },
  { code: "PPT", he: "טהיטי", en: "Tahiti (Papeete)" },
  // ---- North America ----
  { code: "JFK", he: "ניו יורק JFK", en: "New York JFK" },
  { code: "EWR", he: "ניו יורק ניוארק", en: "New York Newark" },
  { code: "BOS", he: "בוסטון", en: "Boston" },
  { code: "IAD", he: "וושינגטון", en: "Washington DC" },
  { code: "ORD", he: "שיקגו", en: "Chicago" },
  { code: "ATL", he: "אטלנטה", en: "Atlanta" },
  { code: "MIA", he: "מיאמי", en: "Miami" },
  { code: "MCO", he: "אורלנדו", en: "Orlando" },
  { code: "LAX", he: "לוס אנג׳לס", en: "Los Angeles" },
  { code: "SFO", he: "סן פרנסיסקו", en: "San Francisco" },
  { code: "LAS", he: "לאס וגאס", en: "Las Vegas" },
  { code: "SEA", he: "סיאטל", en: "Seattle" },
  { code: "YYZ", he: "טורונטו", en: "Toronto" },
  { code: "YUL", he: "מונטריאול", en: "Montreal" },
  { code: "YVR", he: "ונקובר", en: "Vancouver" },
  { code: "CUN", he: "קנקון", en: "Cancún" },
  { code: "MEX", he: "מקסיקו סיטי", en: "Mexico City" },
  // ---- South America ----
  { code: "GRU", he: "סאו פאולו", en: "São Paulo" },
  { code: "GIG", he: "ריו דה ז׳ניירו", en: "Rio de Janeiro" },
  { code: "EZE", he: "בואנוס איירס", en: "Buenos Aires" },
  { code: "SCL", he: "סנטיאגו", en: "Santiago" },
  { code: "LIM", he: "לימה", en: "Lima" },
  { code: "CUZ", he: "קוסקו", en: "Cusco" },
  { code: "BOG", he: "בוגוטה", en: "Bogotá" },
  { code: "UIO", he: "קיטו", en: "Quito" },
  // ---- Africa ----
  { code: "CAI", he: "קהיר", en: "Cairo" },
  { code: "SSH", he: "שארם א-שייח׳", en: "Sharm El Sheikh" },
  { code: "RAK", he: "מרקש", en: "Marrakech" },
  { code: "CMN", he: "קזבלנקה", en: "Casablanca" },
  { code: "JNB", he: "יוהנסבורג", en: "Johannesburg" },
  { code: "CPT", he: "קייפטאון", en: "Cape Town" },
  { code: "NBO", he: "ניירובי", en: "Nairobi" },
  { code: "JRO", he: "קילימנג׳רו", en: "Kilimanjaro" },
  { code: "MRU", he: "מאוריציוס", en: "Mauritius" },
  { code: "SEZ", he: "איי סיישל", en: "Seychelles" },
];

// Extra cities worth suggesting for HOTELS that have no major airport of their
// own (hotels take free text, so these are pure convenience). Combined with the
// airport cities to build the hotel destination suggestions.
const EXTRA_HOTEL_CITIES: { he: string; en: string }[] = [
  { he: "באר שבע", en: "Beer Sheva" },
  { he: "ירושלים", en: "Jerusalem" },
  { he: "אילת", en: "Eilat" },
  { he: "נצרת", en: "Nazareth" },
  { he: "טבריה", en: "Tiberias" },
  { he: "קיוטו", en: "Kyoto" },
  { he: "פירנצה", en: "Florence" },
  { he: "סביליה", en: "Seville" },
  { he: "פורטו", en: "Porto" },
  { he: "לוצרן", en: "Lucerne" },
  { he: "אינטרלאקן", en: "Interlaken" },
  { he: "הלשטאט", en: "Hallstatt" },
  { he: "צרמט", en: "Zermatt" },
  { he: "אובוד (באלי)", en: "Ubud" },
  { he: "הוי אן", en: "Hoi An" },
  { he: "לואנג פראבנג", en: "Luang Prabang" },
  { he: "אגרה", en: "Agra" },
  { he: "ג׳איפור", en: "Jaipur" },
  { he: "קווינסטאון", en: "Queenstown" },
  { he: "בניף", en: "Banff" },
];

/** City suggestions for the hotel destination field (airport cities + extras),
 *  de-duplicated by English name and sorted for a stable list. */
export const HOTEL_CITIES: { he: string; en: string }[] = (() => {
  const seen = new Set<string>();
  const out: { he: string; en: string }[] = [];
  for (const a of AIRPORTS) {
    const en = a.en.replace(/\s*\([^)]*\)/, "").trim();
    if (seen.has(en)) continue;
    seen.add(en);
    out.push({ he: a.he.replace(/\s*\([^)]*\)/, "").trim(), en });
  }
  for (const c of EXTRA_HOTEL_CITIES) {
    if (seen.has(c.en)) continue;
    seen.add(c.en);
    out.push(c);
  }
  return out.sort((x, y) => x.en.localeCompare(y.en));
})();
