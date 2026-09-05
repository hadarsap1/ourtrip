# Two shipped features that do nothing until you change a setting

Both are configuration, not code. Neither needs a deploy. Measured on the live
project 2026-09-05: `kid_devices` = 0 and `push_subscriptions` = 0, and in both
cases the reason is a setting that was never turned on.

Do them in this order — the first one is the one you were hitting last night.

---

## 1. The kid tablet cannot log in at all

**What happens now.** You generate a connection code, you type it into the
tablet, the device binds. Then the tablet asks for the PIN and the unlock fails.
`kid-auth` mints the session with `signInWithPassword`, and the project answers
**"Email logins are disabled"**. So the whole kid flow stops one step from the
end, and the code you generated is not the problem.

This is recorded as PENDING in `SECURITY-CHECKS.md` (Sprint 6) and has been
blocking ever since.

**The fix.** In the Supabase dashboard for project `xeqfcrxrpfjlqhkijrwd`:

1. **Authentication → Sign In / Providers → Email**
2. Turn **Enable email provider** ON.
3. Leave **Enable email signups** OFF. The kids' users are created by
   `kid-auth` through the admin API, which bypasses signups entirely, so
   nothing can self-register.
4. Leave **Confirm email** as it is. `kid-auth` creates each kid user with
   `email_confirm: true`, so no mail is ever sent.
5. Save.

**Why this is safe.** The kid accounts are `kid-<uuid>@kids.ourtrip.app` — a
domain that receives no mail and that nobody can sign up on with signups off.
Their password is random, server-only, and rotated on **every** unlock, so
there is no standing credential even if someone reads the device token off the
tablet. That is the H1 fix from the 2026-08 review and it does not depend on
this setting.

**How to check it worked.** Generate a code on `/kids`, redeem it on the
tablet, set the PIN, and unlock. If it opens, tell me and I will verify against
the database that the device bound and the session minted. The row to watch is
`kid_devices`, which is currently empty.

---

## 2. Notifications are built and send nothing

**What happens now.** `push-send` looks for three secrets and returns 500
harmlessly when they are missing, so no notification has ever been delivered.
`/notifications` will show the toggle and the subscription will never work.

**The fix, part A — generate the key pair.** On your machine:

```
npx web-push generate-vapid-keys
```

That prints a **Public Key** and a **Private Key**. They are a matched pair;
using a public key from one pair with a private key from another fails
silently, so copy both from the same output.

**Part B — three secrets on the Edge Functions.** Supabase dashboard →
**Edge Functions → Secrets** (or `supabase secrets set`):

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | the public key from above |
| `VAPID_PRIVATE_KEY` | the private key from above |
| `VAPID_SUBJECT` | `mailto:hadarsap@gmail.com` |

`VAPID_SUBJECT` must be a `mailto:` or `https:` URL — push services reject a
bare address.

**Part C — the public key on Vercel.** Vercel → the `ourtrip` project →
**Settings → Environment Variables**:

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the **same public key** | Production, Preview, Development |

Then **redeploy** — `NEXT_PUBLIC_*` values are baked in at build time, so an
existing deployment will not pick this up on its own.

**How to check it worked.** Open `/notifications` on the Android tablet and
enable them. A row should appear in `push_subscriptions`. On iPhone this only
works after the app is installed to the home screen; the screen already says so.

---

## While you are in there: one more that is only half armed

`CRON_SECRET` is unset, so the scheduled functions (`fx-daily`, `backup-weekly`,
the weather and check-in reminders) accept an unauthenticated call. They are not
destructive and the risk is low, but the enforcement was built and is inert.
`SECURITY-CHECKS.md` line 726 has the detail. Worth doing, not urgent.

---

## What I cannot do from here

I have database and Edge Function access through the MCP tools, but not the
dashboard's auth and secret settings, and this environment's network policy
blocks direct HTTPS to `supabase.co` and `vercel.app`. So these three are yours
to click. Once you have, say so and I will verify each one against the live
database rather than taking it on trust.
