import { Playpen_Sans_Hebrew } from "next/font/google";

// The brand's handwritten display face. Imported only by the "סו-בב עולם!"
// screens, so the rest of the app never downloads it. Self-hosted by
// next/font at build time - no request to Google from the visitor's phone.
export const sovevFont = Playpen_Sans_Hebrew({
  subsets: ["hebrew", "latin"],
  weight: ["500", "700", "800"],
  variable: "--font-sovev",
  display: "swap",
});
