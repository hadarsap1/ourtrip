// Canonical recommendation category vocabulary (SPEC 2.8). This is the single
// source of truth on the client for the categories the `recommend` Edge
// Function returns. Keep the `RECOMMEND_CATEGORIES` list in sync with the
// enum in supabase/functions/recommend/index.ts — they must match.
//
// The category -> glyph mapping lives in components/icons.tsx, not here: it is
// presentation, and keeping it out means this module stays free of React so the
// node-environment unit tests can import it.

export const RECOMMEND_CATEGORIES = [
  "מסעדה",
  "אטרקציה",
  "פארק",
  "מוזיאון",
  "חנות",
  "טיפ",
] as const;

export type RecommendCategory = (typeof RECOMMEND_CATEGORIES)[number];
