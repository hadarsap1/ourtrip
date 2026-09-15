-- Five options pinned outside the country they belong to. Data only.
--
-- WHY IT MATTERS NOW: the segments sheet decides which towns belong to a leg
-- like "וייטנאם - צפון" by comparing each area's mean position against the
-- country's own span. An area whose mean is wrong lands in the wrong band, so a
-- bad geocode stopped being cosmetic and started hiding a real town from the
-- leg it belongs to.
--
-- WHAT IS ACTUALLY WRONG, read live before writing this:
--
--   דלתת המקונג - 4 of its 5 located options sit on the SAME point,
--   (15.9336, 103.4493). That is in Thailand, several hundred km from the
--   Mekong Delta, and four different places sharing one point to full float
--   precision is migration 00030's signature for "the geocoder gave up and
--   returned something else". The 5th, "בן טרה במקום מיי טו" at
--   (10.238, 106.329), is Ben Tre and is CORRECT - it is deliberately left
--   alone, which is why this is not a blanket update by area.
--
--   A Lưới - its one located option, "Pa Cô", sits at (20.7107, 104.9040) in
--   the far north-west. A Lưới is in Thừa Thiên Huế, around 16.2N 107.2E. That
--   single row is the whole area's position, so the area reads as northern when
--   it is central.
--
-- WHY NOT A GENERAL RULE: the obvious one - "several places sharing one exact
-- point" - was measured against the whole bank first, and it matches the
-- centre of Hanoi (4 options), Hoi An (3), Chiang Mai (3), Tam Coc (12), Pai
-- (5) and Tohoku (6). Those are towns the geocoder resolved to their centre,
-- which is imprecise but RIGHT. Running that rule would have destroyed thirty
-- correct positions to fix five wrong ones, so this migration names what is
-- broken instead.
--
-- HOW IT HEALS: clearing lat/lng/place_id/maps_url puts these rows back into
-- the existing "איתור המקומות" retry, the same path 00030 used. Anything the
-- stricter geocoder still cannot place stays unlocated, which is honest - and
-- `areaChoicesForStretch` deliberately offers an area with no coordinates under
-- every leg rather than guessing at it.

-- The Mekong Delta's Thailand cluster. Pinned to the exact point so the one
-- correct Ben Tre row keeps its position.
update place_options
   set lat = null, lng = null, place_id = null, maps_url = null
 where country_code = 'VN'
   and area = 'דלתת המקונג'
   and lat is not null
   and round(lat::numeric, 3) = 15.934
   and round(lng::numeric, 3) = 103.449;

-- A Lưới's single misplaced point.
update place_options
   set lat = null, lng = null, place_id = null, maps_url = null
 where country_code = 'VN'
   and area = 'A Lưới'
   and lat is not null
   and round(lat::numeric, 3) = 20.711
   and round(lng::numeric, 3) = 104.904;
