-- One-off cleanup of the options bank. Data only, no schema change beyond one
-- column that exists so this migration is reversible.
--
-- Measured on the live bank, 2026-09-04 (343 options). Four separate problems,
-- and the order below matters: coordinates are cleared LAST, after the country
-- and area fixes, so the re-geocode that follows runs on corrected text.
--
--   1. 83 options (24%) sit on one of 8 shared fallback points. The geocoder
--      never fails — Google's Geocoding API answers at whatever granularity it
--      can — so when "Aroma Indian Restaurant, Tam Coc, ויטנאם" could not be
--      resolved it returned the CENTRE OF VIETNAM, and 23 unrelated places
--      ended up stacked on 14.058324, 108.277199. The map has been showing a
--      story it cannot support.
--
--   2. 59 area spellings for roughly 25 real places: Hoi An / Hội An / הוי אן
--      are three buckets holding one town's 42 options; Hanoi / האנוי / הנוי
--      hold another 33.
--
--   3. Options filed under the wrong country: Siargao and General Luna
--      (Philippines) and צאנג מאי (Chiang Mai, Thailand) were all sitting under
--      ויטנאם, so they could never line up with an itinerary day.
--
--   4. 15 genuinely duplicated rows — same title, same coordinates.
--
-- NOT DONE, deliberately: the 98 rows sharing a `place_id` are NOT duplicates.
-- That id is the geocoder's fallback result, so the largest group is 23
-- different places all carrying Vietnam's place_id. Merging on it would destroy
-- 98 real options. See docs/DESIGN-options-bank.md.

-- ---------------------------------------------------------------------------
-- 0. Keep what was typed, so every rename below can be undone by hand.
-- ---------------------------------------------------------------------------
alter table place_options add column if not exists area_original text;

comment on column place_options.area_original is
  'The area exactly as it was typed or extracted, before migration 00030 '
  'canonicalised the spelling. Kept so a rename can be audited or reverted.';

update place_options
   set area_original = area
 where area_original is null
   and area is not null;

-- ---------------------------------------------------------------------------
-- 1. Country fixes, before area canonicalisation (the area map is keyed by
--    the corrected country).
-- ---------------------------------------------------------------------------
update place_options
   set country = 'פיליפינים', country_code = 'PH'
 where country = 'ויטנאם'
   and area in ('Siargao', 'Catagnan, Siargao', 'General Luna, Siargao');

update place_options
   set country = 'תאילנד', country_code = 'TH'
 where country = 'ויטנאם'
   and area = 'צאנג מאי';

-- 18 Vietnamese options never got a country code, so they could not match a day.
update place_options
   set country_code = 'VN'
 where country = 'ויטנאם' and country_code is null;

-- ---------------------------------------------------------------------------
-- 2. Area canonicalisation. One spelling per place, preferring the Hebrew form
--    where the family used one, since the whole UI is Hebrew.
--    Only unambiguous merges are listed. "Lan Bay" is left alone rather than
--    folded into Ha Long: it is probably Lan Ha Bay, which is a different bay,
--    and a wrong merge is harder to notice than a duplicate.
-- ---------------------------------------------------------------------------
with canon(from_area, to_area) as (values
  -- Vietnam
  ('Hoi An', 'הוי אן'), ('Hội An', 'הוי אן'),
  ('Hanoi', 'האנוי'), ('הנוי', 'האנוי'),
  ('Da Nang', 'דה נאנג'), ('דאנאנג', 'דה נאנג'),
  ('Da Lat', 'דה לאט'),
  ('Tam Coc', 'טאם קוק'),
  ('Phong Nha', 'פונג נה'),
  ('Phong Nha - Ke Bang national park', 'פונג נה'),
  ('Phong Nha - Ke Bang National Park', 'פונג נה'),
  ('Sapa', 'סאפה'),
  ('Ha Giang', 'הא ג''יאנג'),
  ('Halong Bay', 'הא לונג ביי'),
  ('Huế', 'הואה'),
  ('Ninh Binh', 'נין בין'),
  ('Cát Bà', 'קאט בא'),
  ('Kon Tum', 'קון טום'),
  -- Philippines
  ('Siargao', 'סיארגאו'),
  ('Catagnan, Siargao', 'סיארגאו'),
  ('General Luna, Siargao', 'סיארגאו'),
  -- Thailand
  ('หัวหิน', 'הואה הין'), ('הואה หין', 'הואה הין'),
  ('Chiang Mai', 'צ''אנג מאי'), ('צאנג מאי', 'צ''אנג מאי'),
  ('Mae Hong Son', 'מאי הונג סון'), ('แม่ฮ่องสอน', 'מאי הונג סון'),
  ('บangkok', 'בנגקוק'),
  ('Doi Inthanon', 'דוי אינתנון'),
  ('Khao yai', 'קאו יאי'),
  -- Japan
  ('Tokyo', 'טוקיו'), ('Kyoto', 'קיוטו'), ('Osaka', 'אוסקה'),
  ('Nagoya', 'נגויה'), ('Takayama', 'טקיאמה'), ('Matsumoto', 'מאטסומוטו')
)
update place_options o
   set area = c.to_area
  from canon c
 where o.area = c.from_area;

-- "Japan" is the country, not an area within it. Same for any area that merely
-- repeats its own country: it carries no information and splits the grouping.
update place_options set area = null where area = 'Japan' and country = 'יפן';

-- ---------------------------------------------------------------------------
-- 3. Merge genuinely duplicated rows: same title, same place, to 4 decimal
--    places (~11 m). The survivor is the oldest row; the others' notes and
--    source links are folded into it so nothing a post said is lost.
-- ---------------------------------------------------------------------------
with grouped as (
  select id, title, note, source_url,
         first_value(id) over w as keep_id
    from place_options
   where lat is not null
  window w as (
    partition by lower(btrim(title)),
                 round(lat::numeric, 4),
                 round(lng::numeric, 4)
    order by created_at, id
  )
),
extra as (
  select keep_id,
         string_agg(distinct nullif(btrim(note), ''), E'\n' ) as notes,
         string_agg(distinct nullif(btrim(source_url), ''), ' ') as urls
    from grouped
   where id <> keep_id
   group by keep_id
)
update place_options o
   set note = btrim(
         concat_ws(E'\n', nullif(btrim(o.note), ''), e.notes,
                   case when e.urls is null then null
                        else 'מקורות נוספים: ' || e.urls end)
       )
  from extra e
 where o.id = e.keep_id;

with grouped as (
  select id, first_value(id) over w as keep_id
    from place_options
   where lat is not null
  window w as (
    partition by lower(btrim(title)),
                 round(lat::numeric, 4),
                 round(lng::numeric, 4)
    order by created_at, id
  )
)
delete from place_options
 where id in (select id from grouped where id <> keep_id);

-- ---------------------------------------------------------------------------
-- 4. Unpin the fallback points, LAST, so the re-geocode benefits from the
--    corrected country and area above.
--
--    The rule is derived from the data rather than hardcoding the 8 coordinate
--    pairs: four or more DIFFERENT places sharing coordinates to full float
--    precision only happens when a geocoder gave up and returned a centroid.
--    Real places never collide that way.
--
--    place_id goes too — it is the centroid's id, not the place's — and these
--    rows then flow back through the existing "איתור המקומות" retry, which
--    migration-mates a stricter geocoder that refuses country-level answers.
--    Anything still unresolved stays unlocated, which is honest, rather than
--    sitting in the middle of a country pretending otherwise.
-- ---------------------------------------------------------------------------
with fallback as (
  select lat, lng
    from place_options
   where lat is not null
   group by lat, lng
  having count(*) >= 4
     and count(distinct lower(btrim(title))) >= 4
)
update place_options o
   set lat = null, lng = null, place_id = null, maps_url = null
  from fallback f
 where o.lat = f.lat and o.lng = f.lng;
