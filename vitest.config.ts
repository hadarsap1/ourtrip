import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests for the pure logic the family relies on offline/on the road
// (currency math, file imports, URL/format helpers). Node environment - these
// modules don't touch the DOM.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
