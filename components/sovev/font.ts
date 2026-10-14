import { Gveret_Levin } from "next/font/google";

// The brand's handwritten display face: Gveret Levin, the classic Hebrew
// handwriting font, close to the farewell invitation. It keeps standard
// letterforms - Playpen Sans Hebrew was tried first and its א / מ read as
// other letters, which matters for early readers and grandparents alike.
// Loaded once in the root layout since the brand became the whole app's look
// (14/10/2026): every screen title uses it. Self-hosted by next/font.
export const sovevFont = Gveret_Levin({
  subsets: ["hebrew", "latin"],
  weight: "400",
  variable: "--font-sovev",
  display: "swap",
  // next/font has no metric overrides for this family, so there is no
  // size-matched fallback to generate (the build prints a harmless warning)
  adjustFontFallback: false,
});
