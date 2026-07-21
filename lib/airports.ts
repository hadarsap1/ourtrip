// Curated list of major airports for the flight/hotel search autocomplete.
// Keyed by IATA code with a Hebrew + English city label. This is a UI shortlist
// (a native <datalist>), not an exhaustive database — the search also accepts
// any IATA code typed directly. Multi-country by design (CLAUDE.md rule #9):
// spread across regions for a round-the-world trip, no single destination.
export type Airport = { code: string; he: string; en: string };

export const AIRPORTS: Airport[] = [
  // Israel
  { code: "TLV", he: "תל אביב", en: "Tel Aviv" },
  // Europe
  { code: "LHR", he: "לונדון הית׳רו", en: "London Heathrow" },
  { code: "LGW", he: "לונדון גטוויק", en: "London Gatwick" },
  { code: "CDG", he: "פריז", en: "Paris" },
  { code: "AMS", he: "אמסטרדם", en: "Amsterdam" },
  { code: "FRA", he: "פרנקפורט", en: "Frankfurt" },
  { code: "MUC", he: "מינכן", en: "Munich" },
  { code: "BER", he: "ברלין", en: "Berlin" },
  { code: "MAD", he: "מדריד", en: "Madrid" },
  { code: "BCN", he: "ברצלונה", en: "Barcelona" },
  { code: "FCO", he: "רומא", en: "Rome" },
  { code: "MXP", he: "מילאנו", en: "Milan" },
  { code: "ATH", he: "אתונה", en: "Athens" },
  { code: "LIS", he: "ליסבון", en: "Lisbon" },
  { code: "VIE", he: "וינה", en: "Vienna" },
  { code: "ZRH", he: "ציריך", en: "Zurich" },
  { code: "PRG", he: "פראג", en: "Prague" },
  { code: "BUD", he: "בודפשט", en: "Budapest" },
  { code: "OTP", he: "בוקרשט", en: "Bucharest" },
  { code: "IST", he: "איסטנבול", en: "Istanbul" },
  { code: "CPH", he: "קופנהגן", en: "Copenhagen" },
  { code: "ARN", he: "שטוקהולם", en: "Stockholm" },
  { code: "DUB", he: "דבלין", en: "Dublin" },
  // Middle East hubs
  { code: "DXB", he: "דובאי", en: "Dubai" },
  { code: "AUH", he: "אבו דאבי", en: "Abu Dhabi" },
  { code: "DOH", he: "דוחא", en: "Doha" },
  // Asia
  { code: "NRT", he: "טוקיו נאריטה", en: "Tokyo Narita" },
  { code: "HND", he: "טוקיו האנדה", en: "Tokyo Haneda" },
  { code: "KIX", he: "אוסקה", en: "Osaka" },
  { code: "ICN", he: "סיאול", en: "Seoul" },
  { code: "PEK", he: "בייג׳ינג", en: "Beijing" },
  { code: "PVG", he: "שנגחאי", en: "Shanghai" },
  { code: "HKG", he: "הונג קונג", en: "Hong Kong" },
  { code: "TPE", he: "טאיפיי", en: "Taipei" },
  { code: "BKK", he: "בנגקוק", en: "Bangkok" },
  { code: "HKT", he: "פוקט", en: "Phuket" },
  { code: "SIN", he: "סינגפור", en: "Singapore" },
  { code: "KUL", he: "קואלה לומפור", en: "Kuala Lumpur" },
  { code: "DPS", he: "באלי", en: "Bali (Denpasar)" },
  { code: "CGK", he: "ג׳קרטה", en: "Jakarta" },
  { code: "HAN", he: "האנוי", en: "Hanoi" },
  { code: "SGN", he: "הו צ׳י מין", en: "Ho Chi Minh City" },
  { code: "DEL", he: "דלהי", en: "Delhi" },
  { code: "BOM", he: "מומבאי", en: "Mumbai" },
  { code: "CMB", he: "קולומבו", en: "Colombo" },
  { code: "KTM", he: "קטמנדו", en: "Kathmandu" },
  // Oceania
  { code: "SYD", he: "סידני", en: "Sydney" },
  { code: "MEL", he: "מלבורן", en: "Melbourne" },
  { code: "AKL", he: "אוקלנד", en: "Auckland" },
  { code: "NAN", he: "פיג׳י", en: "Fiji (Nadi)" },
  // North America
  { code: "JFK", he: "ניו יורק JFK", en: "New York JFK" },
  { code: "EWR", he: "ניו יורק ניוארק", en: "New York Newark" },
  { code: "BOS", he: "בוסטון", en: "Boston" },
  { code: "IAD", he: "וושינגטון", en: "Washington DC" },
  { code: "MIA", he: "מיאמי", en: "Miami" },
  { code: "LAX", he: "לוס אנג׳לס", en: "Los Angeles" },
  { code: "SFO", he: "סן פרנסיסקו", en: "San Francisco" },
  { code: "YYZ", he: "טורונטו", en: "Toronto" },
  { code: "YVR", he: "ונקובר", en: "Vancouver" },
  { code: "CUN", he: "קנקון", en: "Cancún" },
  { code: "MEX", he: "מקסיקו סיטי", en: "Mexico City" },
  // South America
  { code: "GRU", he: "סאו פאולו", en: "São Paulo" },
  { code: "GIG", he: "ריו דה ז׳ניירו", en: "Rio de Janeiro" },
  { code: "EZE", he: "בואנוס איירס", en: "Buenos Aires" },
  { code: "SCL", he: "סנטיאגו", en: "Santiago" },
  { code: "LIM", he: "לימה", en: "Lima" },
  { code: "BOG", he: "בוגוטה", en: "Bogotá" },
  // Africa
  { code: "CAI", he: "קהיר", en: "Cairo" },
  { code: "JNB", he: "יוהנסבורג", en: "Johannesburg" },
  { code: "CPT", he: "קייפטאון", en: "Cape Town" },
  { code: "NBO", he: "ניירובי", en: "Nairobi" },
];
