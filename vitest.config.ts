import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests for the pure logic the family relies on offline/on the road
// (currency math, file imports, URL/format helpers). Node environment - these
// modules don't touch the DOM.
//
// supabase/functions is included too: the Edge Functions hold pure helpers of
// their own (the transliteration guard), and a rule that decides what gets
// stored in the phrasebook deserves tests wherever it lives.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "supabase/functions/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
