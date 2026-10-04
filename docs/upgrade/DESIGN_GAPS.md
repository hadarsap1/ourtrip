# Design gaps

Tokens or components the code needed that `docs/design/` does not define. Each was derived from the same scale; fold them into the design tokens on the next design pass.

| Gap | Derived value | Where | Why |
|---|---|---|---|
| `--text-faint` | light `#66706b`, dark `#8e9c97` | `app/globals.css` | The app already had a third text level (inactive nav, placeholders). Old `#8d968f` was about 3:1; new value is about 4.8:1 on paper |
| `--sun`, `--sun-deep` | light `#d9931e` / `#9c6a0e`, dark `#e2b65e` / `#e2b65e` | `app/globals.css` | The existing warm accent ("sun") has no place in the v2 palette. Kept for fills; text uses `sun-deep` |
| `--postcard-from/to` | light brand → brand-pressed, dark `#0f5f53` → `#0a3d36` | `app/globals.css` | The postcard band keeps white text in dark mode, so it needs a deep teal, not the light dark-mode brand |
| `--shadow-card-value` | light: existing card shadow; dark: black-based | `app/globals.css` | The app's card shadow is softer and longer than `e1`; kept so cards don't change weight |
| `on-sea`, `on-alert` utility names | map to `--brand-contrast`, `--danger-contrast` | `app/globals.css` | Text on brand and alert fills must flip in dark mode |
| Light `theme-color` | `#0e7c6b` (manifest teal) | `lib/theme.ts` | The handoff did not specify the status bar color; kept the shipped one |
| Country flag graphics | Regional-indicator emoji in the picker and chips | `lib/countries.ts` | The design draws SVG flags for 8 countries only; the picker needs all ~250. Emoji flags don't render on desktop Windows (shows the 2 letters) |
| Countdown chip "today" / "tomorrow" wording | "היום" / "מחר" | `lib/strings.ts` | Handoff only covers "בעוד N ימים" |
