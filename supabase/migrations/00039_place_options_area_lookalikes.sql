-- One spelling per area where two spellings read the same. Data only.
--
-- The area pickers listed מאי צ'או twice. Checked live before writing this:
--
--   מאי צ׳או   15 options   (Hebrew geresh U+05F3)
--   מאי צ'או    1 option    (ASCII apostrophe, typed on a phone keyboard)
--   Kyushu / KYUSHU        (letter case)
--
-- The app now compares labels through lib/labels.ts (labelKey), so the lists
-- no longer split on these and a new typed apostrophe saves onto the existing
-- spelling. This merges the rows already split, so what is stored matches what
-- is shown.
--
-- Same rule as 00034: group by the invisible-difference key, the most-used
-- spelling wins, the label itself breaks ties. `area_original` (00030) already
-- keeps what was typed, so every rename can be audited or undone.

update place_options
   set area_original = area
 where area_original is null
   and area is not null;

with keyed as (
  select id,
         area,
         lower(regexp_replace(regexp_replace(regexp_replace(trim(area),
           '[''׳’‘`´]', '''', 'g'),
           '["״“”]', '"', 'g'),
           '\s+', ' ', 'g')) as k
    from place_options
   where area is not null
     and trim(area) <> ''
),
counted as (
  select k, area, count(*) as n from keyed group by k, area
),
canon as (
  select k, (array_agg(area order by n desc, area))[1] as label
    from counted
   group by k
  having count(*) > 1
)
update place_options p
   set area = c.label
  from keyed
  join canon c using (k)
 where p.id = keyed.id
   and p.area is distinct from c.label;
