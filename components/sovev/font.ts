import { Gveret_Levin } from "next/font/google";

// The brand's handwritten display face: Gveret Levin, the classic Hebrew
// handwriting font, close to the farewell invitation. It keeps standard
// letterforms - Playpen Sans Hebrew was tried first and its א / מ read as
// other letters, which matters for early readers and grandparents alike.
// Loaded once in the root layout since the brand became the whole app's look
// (14/10/2026): every screen title uses it. Self-hosted by next/font.
export const sovevFont = Gveret_Levin({
  // Hebrew only (perf review 24/11/2026): every title is Hebrew, and a Latin
  // letter in one falls to the body face (the next family in .sovev-display, Rubik), so the
  // Latin file was a preload on every cold open for nothing.
  subsets: ["hebrew"],
  weight: "400",
  variable: "--font-sovev",
  display: "swap",
  // next/font has no metric overrides for this family, so there is no
  // size-matched fallback to generate (the build prints a harmless warning)
  adjustFontFallback: false,
});
