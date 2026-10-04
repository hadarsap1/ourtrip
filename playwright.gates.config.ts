import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Quality gates against an already-running production build (faster and
// closer to what ships than `next dev`):  npm run build && npx next start -p 3100
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: /quality-gates\.spec\.ts/,
  workers: 4,
  use: { ...base.use, baseURL: process.env.GATES_BASE_URL ?? "http://localhost:3100" },
  webServer: undefined,
});
