# Rollback

Use this if a deploy breaks the app on the road. Fastest first.

## 1. Turn a feature off (about 1 minute, needs a deploy)

Every new feature has a flag in `lib/flags.ts`. Set it to `false`, commit, push to `main`; Vercel redeploys.
To test on one device without a deploy, in the browser console:

```js
localStorage.setItem("ourtrip-flags", JSON.stringify({ itineraryV2: false }))
```

The global CSS floors (44px targets, 12px text, 16px fields) and the dark-mode color wiring are **not** flagged. If they break a screen, use option 2.

## 2. Instant rollback to the last good deployment (no build)

Vercel dashboard → project `ourtrip` → Deployments → pick the last good production deployment → ⋯ → **Promote to Production** (or "Instant Rollback").

CLI equivalent (needs `vercel` logged in to the right team):

```bash
vercel ls ourtrip --prod            # find the last good deployment URL
vercel rollback <deployment-url>    # instant, re-points production
```

❌ Exact project and team names on Vercel are not verified from this repo. Check them once before departure and write them here.

## 3. Revert the code

```bash
git revert -m 1 <merge-commit-of-the-PR>
git push origin main
```

No database migrations were applied in Phase 0, so there is nothing to roll back in Supabase. The client-side IndexedDB went from version 3 to 4 (new `query_cache` store); older code ignores the extra store, so a code revert is safe on devices that already upgraded.

## 4. Service worker

If a bad build was cached, bump `SHELL_CACHE` in `public/sw.js` (e.g. `ourtrip-shell-v15`) in the fix; clients drop the old shell on activate.

## Phase 1 additions

- Any Phase 1 feature: switch its flag off in `lib/flags.ts` and deploy, or per device via the `ourtrip-flags` localStorage override.
- New push notifications (1.11): set `NOTIFY_V2=off` on the `push-send` function (no deploy needed), or run `docs/upgrade/migrations/00043_push_v2_schedules.down.sql` to remove the two cron jobs.
- Write queue v2 is not behind a runtime switch (the `writeQueueV2` flag exists but nothing reads it - the queue format changed with IndexedDB v5). Rollback is a Vercel redeploy of the previous build; items already queued stay in IndexedDB and replay once v2 is back.
