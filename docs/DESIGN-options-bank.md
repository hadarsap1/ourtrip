# Proposal: turning the options bank into something you act on

**Status: BUILT, 2026-09-04.** Migrations `00029` and `00030` applied to the
live project, `geocode-places` redeployed (v5). What actually changed:

| | Before | After |
|---|---|---|
| Options | 343 | 325 (18 real duplicates merged) |
| Area spellings | 59 | 39 (167 values canonicalised) |
| Options matching a planned day | 325 of 343 | **325 of 325** |
| Pinned to a country/city centroid | 83 | 0 (75 now awaiting re-location) |
| Ways out of `option` | booking only | booking **or** an itinerary item |

The remaining open questions at the bottom are still open.

The bank works. 343 candidate places went in from 28 Facebook posts in two
weeks. The problem is that nothing has ever come out of it.

## What the live data says

Read from project `xeqfcrxrpfjlqhkijrwd` on 2026-09-04.

| | |
|---|---|
| Options | 343 |
| Status `option` | **343** |
| Status `shortlist` / `booked` / `rejected` | **0 / 0 / 0** |
| Bookings in the whole trip | 0 |
| Countries in the bank | 4 (ויטנאם 249, תאילנד 57, יפן 29, פיליפינים 8) |
| Itinerary days | 227, across 6 countries |
| Options whose country matches a planned day | 325 of 343 |
| Distinct source posts | 28 (about 12 options per paste) |
| Created | all between 2026-08-15 and 2026-08-29, then nothing |

**Not one option has ever changed status.** The lifecycle
`option → shortlist → booked | rejected` has never fired, not once, in a bank
holding 343 rows. That is the whole problem stated as a number.

## Why nothing leaves

### 1. The only exit is a booking

`promoteToBooking` is the sole way out, and it creates a real booking. That is
the right flow for a hotel. It is the wrong flow for an attraction, a
restaurant, a viewpoint or a walk, which is most of the bank - and the trip has
zero bookings, so even hotels are not using it. For 300-odd rows there is
literally no action that means "yes, we are doing this".

### 2. The bank is keyed by country; the trip is keyed by day

`place_options` groups country → area. The itinerary is 227 days. Vietnam is
one bucket holding 249 options and 53 days. "ויטנאם" is not a shelf you can
take something off. `area` should bridge the gap, but 86 options have none and
the rest are split across 59 spellings.

### 3. Input is twelve times cheaper than output

One paste of a Facebook post yields about 12 options. Every exit is one tap per
item. The bank was always going to grow faster than it drains.

### 4. Nothing ever says "enough"

No screen states that Hội An has 3 planned days and 31 candidates. Without that,
340 and 3400 feel the same.

## Two data problems found while measuring, one of which reverses an earlier recommendation

### The `place_id` duplicates are not duplicates

`place_id` has 98 rows sharing an id with another row, which looks like an
obvious auto-merge. It is not. The largest group is 23 rows on
`ChIJXx5qc016FTERvmL-4smwO7A`, `location_name: "Vietnam"`, at
`14.058324, 108.277199` - **the geographic centre of Vietnam**. The 23 rows are
23 entirely different places: a spa in Tam Coc, Mario Kart in Da Lat, a homestay
in Phú Long, a transport booking site. The geocoder failed to resolve them and
fell back to the country.

**Auto-merging by `place_id` would destroy 98 real places.** Do not do it.

Deduplicating on `lower(title)` plus rounded coordinates finds **15** genuinely
identical groups. That is the real duplicate count, and it is a rounding error.

### A quarter of the bank has wrong coordinates

Every option has a lat/lng, which reads as good news and is not. **83 of 343
(24%) sit on one of 8 shared fallback points:**

| Fallback point | Options stuck on it |
|---|---|
| Vietnam (country centroid) | 23 |
| Ninh Hải / Hoa Lư / Ninh Bình | 14 |
| Hua Hin District, Thailand | 11 |
| Hanoi | 11 |
| Hoi An, Da Nang | 8 |
| Bohol, Philippines | 7 |
| Hạ Long Bay | 5 |
| Thailand (country centroid) | 4 |

So the map is currently telling a story it cannot support, and any "what is near
me" feature built today would rank a spa in Tam Coc as being in the middle of
Vietnam. **This has to be fixed before proximity is worth building on.**

### Related: the extractor is over-producing

79 options are category `city`, and the sample includes `A Lưới`, `Anor`,
`Bru-Vân Kiều`, `Ka Tu` - ethnic groups and villages named in passing in a post,
not places the family chose to consider. Roughly a quarter of the bank is proper
nouns the model swept up. Worth tightening the `extract-places` prompt, and
worth a "this is not a place" reject that is one tap.

## What was settled (2026-09-04)

| Question | Answer |
|---|---|
| When the bank is actually opened | **When planning a specific day** |
| What choosing an option should do | **Become an itinerary item.** One tap, no booking |
| The 98 duplicates and 59 areas | Clean automatically with a report - **but see the correction above: the `place_id` half of that instruction is unsafe and is not proposed here** |
| How to proceed | Spec for approval, no code |

## The design

### Reverse the direction: the day pulls from the bank

The bank stops being a place you browse and becomes a supply the day draws on.
In the itinerary day sheet, **"הוספה מבנק האפשרויות"** opens a picker already
filtered to that day: same `country_code`, then that day's area, then nearest
first by distance from `itinerary_days.lat/lng`. One tap creates an
`itinerary_items` row from the option - title, `location_name`, `lat`, `lng`,
`place_id` and `notes` all copy across, and the columns already exist.

That is the missing exit, and it is the screen he actually opens.

### A status that means "we are doing this", short of booking

```sql
alter table place_options
  add column itinerary_item_id uuid references itinerary_items(id) on delete set null;

alter table place_options
  drop constraint place_options_status_check,
  add constraint place_options_status_check
    check (status in ('option', 'shortlist', 'planned', 'booked', 'rejected'));
```

`planned` = it is on a day. `booked` stays what it is, for the hotels that get a
real reservation. `on delete set null` mirrors the existing `booking_id`
decision: deleting the day's item should not erase that you once considered it.

### Make the bank feel finite

Per area, the one line that changes how the bank feels:

> **הוי אן · 3 ימים מתוכננים · 31 אפשרויות · 2 נבחרו**

An area with days and no choices is the thing to work on. An area with no
planned days at all is the thing to ignore. Right now every area looks the same.

### Cleanup, revised

1. **Unpin the 83 fallback-point options.** Detect the 8 shared points, clear
   `lat`/`lng`/`place_id` on their rows, and let the existing
   "איתור המקומות על המפה" flow re-resolve them - this time querying with
   `title + area + country` rather than whatever produced a country centroid.
   Rows that still fail stay unlocated, which is honest, instead of lying on
   the map.
2. **Canonicalise areas.** `Hoi An` / `Hội An` / `הוי אן` are one place in three
   spellings; `Hanoi` / `האנוי` likewise. Map to a canonical name per area, keep
   what was typed as a display alias. This is where the "automatic with a report"
   instruction genuinely applies.
3. **Merge the 15 real duplicates** (same title, same rounded coordinates),
   concatenating notes and keeping every distinct `source_url`.
4. **Do not touch `place_id` groups.** See above.

Every step produces a before/after report, and every step is reversible from
that report.

## Rough size

- `00029_options_planned_status.sql` - one column, one check constraint
- A cleanup migration or script, run once, with its report committed
- `lib/data/placeOptions.ts` - `planFromOption(option, dayId)`
- A picker sheet in the itinerary day
- Area counters on the options screen
- `extract-places` prompt tightening

## Open questions

- Should an option that becomes an itinerary item disappear from the bank's
  default view, or stay visible with a "planned" chip? I lean toward staying
  visible with the chip, so the count of what is left keeps dropping honestly.
- Is `shortlist` still worth keeping now that `planned` exists, or does it just
  add a step nobody used? It has 0 rows.
- Should the 79 `city` entries be bulk-reviewed before anything else, since a
  quarter of the bank may not be candidate places at all?

## One label per country (2026-09-14)

The country filter was listing five countries as seven: `ויטנאם` and `וייטנאם`
were separate headings holding the same towns, and the Philippines appeared with
and without its definite article. 393 Vietnam options were split 339/54, and 101
Philippines options 75/26 - so filtering to either heading could only ever show
you part of the bank, and the area list underneath split with it (`הוי אן` was
50 options under one spelling and 8 under the other).

The cause is that country and area are free-text inputs with a `datalist`. A
datalist suggests; it does not constrain. Typing past it silently opens a new
bucket, and nothing in the UI shows that the new bucket is the same place.

**The merge did not need to guess at Hebrew.** `country_code` was already
correct on every row - VN on both Vietnam spellings, PH on both Philippines
spellings - and every row in the table had both a country and a code. So
migration `00034` groups by the ISO code and keeps the most-used label, with the
previous text preserved in `country_original` exactly as `00030` did for areas.
Both winners came out matching what `00030` had written by hand, which is the
cross-check that the rule is right.

`00034` also caught one area `00030` meant to fix and missed: its map contained
`'הואה หין'` but the stored row was `'הואה หین'` - the last two characters are
Arabic codepoints where the map used Thai ones. Visually identical, so the
equality never fired. That fix is scoped to Thailand, because `הואה` alone is 17
options in **Vietnam** (Huế), a different place entirely.

**Keeping it merged** is `canonicalLabel` in `lib/data/placeOptions.ts`, called
by both writers (the manual form and the extraction sheet) for country and area
alike. It compares names with a leading ה, a doubled yod and a doubled vav
ignored, and returns a label **only if that label is already in the bank** - so
it can rename a typo onto a real heading but can never invent one, and a country
the family genuinely adds for the first time is stored exactly as typed.

## A leg shows its own region (2026-09-15)

`areaChoicesForCountry` narrowed the bank by country and nothing else. That is
fine for a country visited once, and wrong for this trip: it crosses Vietnam
twice - "וייטנאם - צפון" (21 days) and "וייטנאם - דרום ומרכז" (35 days) - and
both legs offered all 25 Vietnamese towns. The northern leg listed הוי אן,
סייגון, דה לאט and פונג נה, none of which are northern.

Nothing in the schema says which town is northern. `itinerary_days` carries a
country code and a free-text label, and 225 of the 227 days have no coordinates
at all. The only thing that knows is the label, so the label gets read.

**Two rules, neither naming a destination:**

- The label names towns that exist in the bank (`קיוטו`, `קנאזאווה וטאקאיאמה`):
  those go first, then everything else sorted by distance from them. Nothing is
  hidden - a town label is a *base*, and Nara is half an hour from Kyoto.
- The label names a direction (`צפון`, `דרום ומרכז`): that is a claim about a
  region, so it filters. The country's own geocoded span is cut into three equal
  bands along the axis the direction implies, and only the named bands are
  offered. The rest sit behind "הצגת כל הערים במדינה".

Neither matched - `תאילנד`, `קמבודיה`, `פיליפינים` - and the whole country is
offered exactly as before. A filter that would keep everything, or nothing,
falls back too: a toggle that reveals an empty list helps nobody.

**Two deliberate refusals to guess.** An area with no coordinates is offered
under every leg, because a band is evidence about where a place is and there is
none for an ungeocoded town. And the filter never removes anything permanently -
the region comes from a label, and a label can be wrong.

### The geocodes this exposed

Sorting towns into bands made two bad positions matter. `דלתת המקונג` had four
of its five located options stacked on one point in **Thailand**, and `A Lưới`'s
single located option sat 300km north-west of A Lưới - so both areas read as
northern. Migration `00035` clears exactly those five rows, back through the
existing re-geocode.

It does **not** apply 00030's "several places on one point" rule, which was
measured against the whole bank first: it also matches the centre of Hanoi, Hoi
An, Chiang Mai, Tam Coc, Pai and Tohoku, where the geocoder resolved a town to
its centre - imprecise but right. Running it would have destroyed about thirty
correct positions to fix five wrong ones.
