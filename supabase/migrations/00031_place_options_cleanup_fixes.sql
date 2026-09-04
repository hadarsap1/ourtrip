-- Two corrections to 00030, both found by looking at the map it produced.
--
-- 1. I MOVED FIVE VIETNAMESE PLACES TO THAILAND. 00030 reassigned every option
--    tagged `area = 'צאנג מאי'` to Thailand, reading it as Chiang Mai. Three
--    rows tagged `Chiang Mai` really are in Chiang Mai (lat ~18.8) and are
--    fine. The five tagged in Hebrew are not: Ban Gioc, Nguom Ngao, God's Eye
--    Mountain, קאו בנג לופ and הא ג'יאנג לופ all come from ONE Facebook post
--    about northern Vietnam, and the four that have coordinates sit at
--    lat ~22.8, lng ~106.5 — Cao Bằng province, 1,500 km from Chiang Mai. The
--    extractor had mis-tagged the area and I compounded it.
--
--    `area_original` is what makes this recoverable, which is why 00030 kept
--    it: the Hebrew-tagged rows are exactly the wrong ones.
--
-- 2. THE FALLBACK-POINT RULE WAS TOO NARROW. 00030 unpinned coordinate groups
--    holding 4+ different places. Six groups of 3+ survived, 29 rows, and they
--    are the same defect: 12 unrelated places stacked on Tam Coc's town centre
--    (an Indian restaurant, a spa, a cafe), three Japanese convenience-store
--    chains on a point in Nagano, three Thai places on a spot near Pattaya
--    that is nowhere near Khao Sok.
--
--    All of them are unpinned, including the handful that legitimately belong
--    at a town centre — "Tam Coc" the town, "האנוי", "Da Nang". Those cost
--    nothing to redo: a `city` option asking the geocoder for a city gets the
--    city back, and the precision guard in geocode-places explicitly allows a
--    locality-level answer for a city-like category. The businesses either
--    resolve properly this time or stay unlocated, which is the honest result.

-- ---------------------------------------------------------------------------
-- 1. Back to Vietnam.
-- ---------------------------------------------------------------------------
update place_options
   set country = 'ויטנאם',
       country_code = 'VN',
       area = case
                when title like '%הא ג%יאנג%' then 'הא ג''יאנג'
                else 'קאו בנג'
              end
 where area_original = 'צאנג מאי'
   and country_code = 'TH';

-- ---------------------------------------------------------------------------
-- 2. Unpin the remaining stacked coordinates and let them be tried again.
--    geocode_attempts goes back to 0 so these rows are not skipped by the cap
--    on the next run.
-- ---------------------------------------------------------------------------
with fallback as (
  select lat, lng
    from place_options
   where lat is not null
   group by lat, lng
  having count(distinct lower(btrim(title))) >= 3
)
update place_options o
   set lat = null, lng = null, place_id = null, maps_url = null,
       geocode_attempts = 0
  from fallback f
 where o.lat = f.lat and o.lng = f.lng;
