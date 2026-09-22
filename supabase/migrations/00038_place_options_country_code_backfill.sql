-- Options that carry a country name but no country code.
--
-- WHY IT MATTERS. Everything that scopes options to a place keys on
-- `country_code`, not on the free-text `country`: areaChoicesForCountry skips
-- a row whose code does not match, and the itinerary's per-leg "ideas waiting"
-- count does the same. 31 rows had a country written on them and no code, so
-- they were invisible to every one of those features while looking perfectly
-- fine on the options screen.
--
-- WHY NOT MATCH ON THE TEXT INSTEAD. The two spellings do not agree and never
-- will: the bank holds "ויטנאם" and "פיליפינים", while Intl.DisplayNames - what
-- the app renders a code as - gives "וייטנאם" and "הפיליפינים". Matching names
-- across that gap would silently drop 493 of the trip's 990 options. The code
-- is the only key both sides can agree on, so the rows missing one get one.
--
-- Deliberately narrow: two exact strings that the data actually contains, only
-- where the code is absent, so it can never overwrite a code already set nor
-- guess at a spelling nobody has typed. Idempotent - a second run changes
-- nothing.

update place_options set country_code = 'VN'
where country_code is null and country = 'ויטנאם';

update place_options set country_code = 'JP'
where country_code is null and country = 'יפן';
