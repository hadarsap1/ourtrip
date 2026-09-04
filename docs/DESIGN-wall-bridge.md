# Proposal: letting the kids talk to friends, without opening a channel to a child

**Status: PROPOSAL. Nothing here is built, and `DECISIONS.md` is untouched until
Hadar and Sivan approve.** Raised 2026-09-04.

## The ask

The kids want to be in touch with friends from their class while the family is
away. Today they cannot: migration `00027` split the wall into two feeds and
kept kids out of the guest feed entirely.

## Why this is a decision, not a bug

`DECISIONS.md` #18 says, in as many words:

> kids are kept out of the guest feed entirely, since **a feed a child can read
> is a feed a child can be addressed in**.

That came from finding M5 of the 2026-08 security review, and `00027` enforces
it in RLS. Changing it is a deliberate product decision by the two of you, not
a defect being repaired. This proposal is written so that the sentence above
stays literally true afterwards.

## What was settled (2026-09-04)

| Question | Answer |
|---|---|
| Who holds the friend's device | **The friend's parent.** An adult is accountable on the other side |
| What needs a parent's approval | **Both directions.** Kid to friends, and friends to kid |
| What a classmate sees | **The same as any guest** - approved+shared photos, journal, map |
| When to build | Decide first. No code until this document is approved |

The first and third answers together mean something important: **a classmate is
an ordinary `guest`.** No new role, no new guest sub-type, no third channel, and
no change to the existing invite flow. The threat model is the one the guest
role was already designed for: an adult in Israel holding a magic link.

So the only thing actually missing is the bridge.

## The design: a parent-operated bridge, one message at a time

Nothing crosses between the two feeds on its own. A parent moves a single
message across, deliberately, the same way they already approve a photo.

```
        family feed                              guests feed
      (owners + kids)                        (owners + guests)

   kid writes  ─────────►  [ parent taps          ─────────►  friend's parent
                            "שתפו עם האורחים" ]                 reads it

   kid reads   ◄─────────  [ parent taps          ◄─────────  friend's parent
                            "הראו לילדים" ]                     writes a reply
```

The parent is not a moderator queue to be cleared; they are the only path. A
message that is never bridged simply stays in the feed it was written in.

### Why a copy, and not a visibility flag

The obvious alternative is to add `visible_to_kids` to guest messages and widen
`messages_kid_select` to match. Copying is better here for one reason that
outweighs the rest:

**Copying needs no RLS change at all.** Kids still read exactly
`channel = 'family'`; guests still read exactly `channel = 'guests'`. A bridged
message is a real new row in a feed the reader was already entitled to. The
policies from `00027` stay byte-for-byte as they are, so there is no new way to
get the boolean wrong and no policy to re-audit. It also matches DECISIONS #5:
opt-in per item, never a mode.

The cost is one duplicated row per bridged message. For a family wall that is
nothing.

### Schema (proposed migration `00029`)

```sql
alter table messages
  -- on the COPY: which message it was bridged from, and which parent did it
  add column origin_message_id uuid references messages(id) on delete set null,
  add column bridged_by uuid references members(id),
  -- on the ORIGINAL: stamped when a parent bridges it, so the author can see
  -- that it was shared without being able to read the other feed
  add column bridged_at timestamptz;

-- a message can be bridged once, not once per tap
create unique index idx_messages_origin_once
  on messages(origin_message_id) where origin_message_id is not null;
```

### RLS: no changes

Verified against the live policies on `messages`:

- `messages_owner_all` is `for all using (is_owner_of(trip_id)) with check
  (is_owner_of(trip_id))` - **no `sender_id` constraint on owners**. So a parent
  may insert the copy carrying the *original author's* `sender_id`, and may
  stamp `bridged_at` on the original. Both halves of the bridge are already
  permitted.
- `members_kid_guest_select` already lets guests and kids read the trip's
  member rows, so the copy renders the real author's name with no denormalised
  copy of it and no new read path.
- Kids and guests still have **no UPDATE policy** on `messages`, so neither can
  stamp `bridged_at`, un-bridge anything, or move a message between feeds.

That is the whole security argument: the bridge is two ordinary owner writes.

### What the two feeds show

- Guest feed, bridged row: `עומר` as the author, with `· שיתפה: הדר` beneath it,
  so a guest is never misled about who wrote the words or who chose to send them.
- Family feed, bridged-in row: the guest's name, with `· הראתה: סיון`.
- Family feed, the kid's own message once shared: a quiet `שותף עם האורחים ✓`.
  The kid learns their message went out without gaining any read access to the
  other feed.

### What this deliberately does not build

- No direct kid-to-friend thread, and no private messages between any two people.
- No per-friend scoping ("this friend can talk to Omer only").
- No notification to a guest that their message was shown to the kids. Guests
  cannot read the family feed and are not told what happens in it.

DECISIONS #18's sentence survives intact: there is still no feed a child can
read that a friend can write into.

## Two consequences worth a second look before approving

Both follow from "a classmate sees the same as any guest", and neither is
introduced by the bridge itself.

1. **`shared_with_guests` starts meaning "the whole class".** Today the guest
   list is a handful of relatives. A class is 20+ families, and every active
   guest reads every `approved + shared_with_guests` photo, the shared journal
   and the map. The per-photo toggle does not change, but what one tap on it
   means changes a lot. If you want photos to reach grandma but not 20 classmate
   families, that needs per-guest scoping, which is materially more work than
   this bridge and should be decided separately.

2. **The guest wall becomes a class group chat.** Every guest reads the whole
   `guests` channel, so a classmate's parent sees what other classmates' parents
   wrote, and can read every member row of the trip (`members_kid_guest_select`,
   from `00008` - already true today, just at a bigger scale). Revocation exists
   (`guests_allowlist.revoked_at`) and works per guest.

If either of those is unwanted, say so now: it changes the answer to "what a
classmate sees", not the bridge design.

## Rough size

Small, because the security work is already done.

- `supabase/migrations/00029_wall_bridge.sql` - three columns, one index, no policies
- `lib/data/messages.ts` - `bridgeMessage(id, toChannel)`, one insert + one update
- `components/wall/MessagesScreen.tsx` - an owner-only action per message, and
  the attribution line
- `lib/strings.ts` - the Hebrew above
- `docs/SECURITY-CHECKS.md` - a cross-role check per direction
- `docs/DECISIONS.md` - #19, extending #18 rather than reversing it

## Open questions

- Should a bridged message be un-bridgeable (delete the copy, clear
  `bridged_at`)? Cheap to add, and a parent will eventually want it.
- Should bridging into the family feed raise a push notification to the kids'
  tablet, or stay silent until they open the wall?
