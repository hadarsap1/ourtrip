-- Every option gets its country code when it is saved, and the English town
-- names the extractor brought back merge onto their Hebrew headings.
--
-- 1. THE CODE. Nothing in the app ever wrote `country_code` on insert - not
--    the form, not the Facebook import, not the recommender. 00030 and 00038
--    each backfilled it once, and each time new rows arrived without one:
--    81 rows on 2026-09-30, all created that afternoon, all invisible to the
--    leg picker and the per-leg counts, which key on the code.
--    A trigger fixes it where every save path meets. It never guesses from
--    spelling: it takes the code this trip ALREADY uses for the same country
--    label (the most-used one), compared the way lib/labels.ts compares.
--    A country the trip has never coded stays null, as before.
--
-- 2. THE AREAS. The extractor passed a post's own spelling through, so the
--    same import added "Hanoi" next to האנוי, "Hoi An" next to הוי אן - the
--    split 00030 merged by hand, back again. Only names with a Hebrew heading
--    already in the bank are mapped; English names with no Hebrew counterpart
--    are left as they are. `area_original` (00030) keeps what was stored.
--    The extractor is changed alongside this to answer in Hebrew.

-- ---------------------------------------------------------------------------
-- 0. The comparison, in SQL. Mirrors labelKey in lib/labels.ts.
-- ---------------------------------------------------------------------------
create or replace function public.label_key(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(regexp_replace(regexp_replace(trim(value),
           '[''׳’‘`´]', '''', 'g'),
           '["״“”]', '"', 'g'),
           '\s+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- 1. Fill the code on save.
--    SECURITY INVOKER: it only reads rows of the same trip, which the saving
--    owner can already read under place_options_owner_all. No new access.
-- ---------------------------------------------------------------------------
create or replace function public.place_options_fill_country_code()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- On update, only a country change that left the code alone is re-derived:
  -- the code belonged to the old country. A code set explicitly is kept.
  if tg_op = 'UPDATE' then
    if new.country is not distinct from old.country
       or new.country_code is distinct from old.country_code then
      return new;
    end if;
    new.country_code := null;
  end if;

  if new.country_code is null and nullif(trim(new.country), '') is not null then
    select p.country_code
      into new.country_code
      from public.place_options p
     where p.trip_id = new.trip_id
       and p.country_code is not null
       and public.label_key(p.country) = public.label_key(new.country)
     group by p.country_code
     order by count(*) desc, p.country_code
     limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists place_options_fill_country_code on public.place_options;
create trigger place_options_fill_country_code
  before insert or update of country, country_code on public.place_options
  for each row execute function public.place_options_fill_country_code();

-- ---------------------------------------------------------------------------
-- 2. Backfill the rows already missing one, by the same rule.
-- ---------------------------------------------------------------------------
with coded as (
  select trip_id, public.label_key(country) as k, country_code, count(*) as n
    from public.place_options
   where country_code is not null and country is not null
   group by 1, 2, 3
),
best as (
  select distinct on (trip_id, k) trip_id, k, country_code
    from coded
   order by trip_id, k, n desc, country_code
)
update public.place_options p
   set country_code = b.country_code
  from best b
 where p.country_code is null
   and p.trip_id = b.trip_id
   and public.label_key(p.country) = b.k;

-- ---------------------------------------------------------------------------
-- 3. English area names onto the Hebrew heading the bank already has.
--    Scoped by code so a name can only move within its own country.
-- ---------------------------------------------------------------------------
update public.place_options
   set area_original = area
 where area_original is null
   and area is not null;

with map(country_code, english, hebrew) as (
  values
    ('VN', 'Cat Ba',           'קאט בא'),
    ('VN', 'Da Nang',          'דה נאנג'),
    ('VN', 'Hà Giang',         'הא ג''יאנג'),
    ('VN', 'Ha Giang',         'הא ג''יאנג'),
    ('VN', 'Ha Long',          'הא לונג ביי'),
    ('VN', 'Ha Long Bay',      'הא לונג ביי'),
    ('VN', 'Hanoi',            'האנוי'),
    ('VN', 'Ho Chi Minh City', 'סייגון'),
    ('VN', 'Saigon',           'סייגון'),
    ('VN', 'Hoi An',           'הוי אן'),
    ('VN', 'Hội An',           'הוי אן'),
    ('VN', 'Ninh Binh',        'נין בין'),
    ('VN', 'Sapa',             'סאפה'),
    ('VN', 'Tam Coc',          'טאם קוק'),
    ('JP', 'Kyoto',            'קיוטו'),
    ('JP', 'Osaka',            'אוסקה')
)
update public.place_options p
   set area = m.hebrew
  from map m
 where p.country_code = m.country_code
   and public.label_key(p.area) = public.label_key(m.english);
