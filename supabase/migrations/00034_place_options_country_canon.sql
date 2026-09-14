-- One Hebrew label per country in the options bank. Data only.
--
-- Migration 00030 canonicalised AREA spellings and fixed options filed under
-- the wrong country, but it never unified the country labels themselves. So the
-- bank drifted into two buckets per country, and the filter on the options
-- screen listed each one twice:
--
--   ויטנאם   339 options      פיליפינים    75 options
--   וייטנאם   54 options      הפיליפינים   26 options
--
-- Two spellings of Vietnam, and the Philippines with and without the definite
-- article. Same places, two headings, and a filter that could only ever show
-- you half of them.
--
-- WHAT MAKES THIS SAFE: `country_code` was already right on every one of those
-- rows - VN on both Vietnam spellings, PH on both Philippines spellings - and
-- every row in the table has both a country and a code (checked live before
-- writing this). Only the display text drifted. So the rule needs no judgement
-- about Hebrew spelling at all: one label per ISO code, and the label that wins
-- is the one the family already used most. Both winners come out matching what
-- 00030 wrote by hand, which is the cross-check that the rule is the right one.
--
-- Deriving it from the data rather than hardcoding two renames also means this
-- migration fixes any other code that has drifted since it was written.

-- ---------------------------------------------------------------------------
-- 0. Keep what was typed, so every rename below can be undone by hand.
--    Mirrors `area_original` from 00030.
-- ---------------------------------------------------------------------------
alter table place_options add column if not exists country_original text;

comment on column place_options.country_original is
  'The country exactly as it was typed or extracted, before migration 00034 '
  'canonicalised one label per country_code. Kept so a rename can be audited '
  'or reverted.';

update place_options
   set country_original = country
 where country_original is null
   and country is not null;

-- ---------------------------------------------------------------------------
-- 1. One label per country_code: the most-used spelling wins, with the label
--    itself as the tiebreak so the result is deterministic rather than
--    dependent on scan order.
--
--    Rows with no country_code are left alone: there is nothing to group them
--    by, and guessing at Hebrew spelling is exactly what this avoids. There are
--    none today.
-- ---------------------------------------------------------------------------
with counted as (
  select country_code, country, count(*) as n
    from place_options
   where country_code is not null
     and country is not null
   group by country_code, country
),
canon as (
  select country_code,
         (array_agg(country order by n desc, country))[1] as label
    from counted
   group by country_code
)
update place_options o
   set country = c.label
  from canon c
 where o.country_code = c.country_code
   and o.country is distinct from c.label;

-- ---------------------------------------------------------------------------
-- 2. One area that 00030 meant to catch and missed.
--
--    Its map contained ('הואה หין', 'הואה הין'), but the row in the bank is
--    spelled 'הואה หین' - the last two characters are U+06CC / U+0646 (Arabic
--    letters) where the map used U+0E34 / U+0E19 (Thai). Visually identical,
--    different codepoints, so the equality never fired and Hua Hin kept a
--    second bucket of one.
--
--    Scoped to Thailand on purpose: 'הואה' on its own is 17 options in VIETNAM
--    (Huế), a completely different place, and folding those into Hua Hin would
--    be a far worse bug than the duplicate being fixed.
-- ---------------------------------------------------------------------------
update place_options
   set area = 'הואה הין'
 where country_code = 'TH'
   and area is not null
   and area <> 'הואה הין'
   and area like 'הואה %';
