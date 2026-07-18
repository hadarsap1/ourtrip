// Canonical recommendation category vocabulary (SPEC 2.8). This is the single
// source of truth on the client for the categories the `recommend` Edge
// Function returns. Keep the `RECOMMEND_CATEGORIES` list in sync with the
// enum in supabase/functions/recommend/index.ts — they must match, and this
// is the one place the client maps a category to an icon.

export const RECOMMEND_CATEGORIES = [
  "מסעדה",
  "אטרקציה",
  "פארק",
  "מוזיאון",
  "חנות",
  "טיפ",
] as const;

export type RecommendCategory = (typeof RECOMMEND_CATEGORIES)[number];

const CATEGORY_ICON: Record<RecommendCategory, string> = {
  מסעדה: "🍽️",
  אטרקציה: "🎡",
  פארק: "🌳",
  מוזיאון: "🏛️",
  חנות: "🛍️",
  טיפ: "💡",
};

/** Icon for a category, with a neutral pin fallback for anything unexpected. */
export function categoryIcon(category: string | null): string {
  return (category && CATEGORY_ICON[category as RecommendCategory]) || "📍";
}
