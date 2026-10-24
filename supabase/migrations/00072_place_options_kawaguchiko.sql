-- Lake Kawaguchi under one heading. Data only.
--
-- "קוואגוצ'יקו" (5 options) is Kawaguchiko, and "-ko" is Japanese for lake,
-- so "אגם קוואגוצ'י" (1 option) is the same place in a Hebrew word order.
-- The more-used spelling wins. `area_original` (00030) keeps what was stored.

update public.place_options
   set area_original = area
 where area_original is null
   and area is not null;

update public.place_options
   set area = 'קוואגוצ''יקו'
 where country_code = 'JP'
   and public.label_key(area) = public.label_key('אגם קוואגוצ''י');
