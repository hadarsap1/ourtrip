# Segment cleanup - dry run (F6)

Generated 2026-10-04. Read-only: nothing was changed. Nothing is merged automatically.

| # | Dates | Nights | CC | Current label | Proposed label | Flags |
|---|---|---|---|---|---|---|
| 1 | 2026-10-31 → 2026-11-20 | 21 | VN | וייטנאם - צפון | (no change) | - |
| 2 | 2026-11-21 → 2026-11-22 | 2 | TH | תאילנד | (no change) | **repeat-visit**: Same place again in segment 4 - likely a separate visit, keep both |
| 3 | 2026-11-23 → 2026-11-25 | 3 | TH | Amphoe Mueang Chiang Mai | צ'יאנג מאי | **latin-label**: Shown in Latin script<br>**admin-prefix**: Administrative district name, not the town<br>**stop-inside-country**: Splits "תאילנד" into two segments |
| 4 | 2026-11-26 → 2026-12-28 | 33 | TH | תאילנד | (no change) | **repeat-visit**: Same place again in segment 2 - likely a separate visit, keep both |
| 5 | 2026-12-29 → 2027-01-25 | 28 | KH | קמבודיה | (no change) | - |
| 6 | 2027-01-26 → 2027-03-01 | 35 | VN | וייטנאם - דרום ומרכז | (no change) | - |
| 7 | 2027-03-02 → 2027-03-22 | 21 | PH | פיליפינים | (no change) | - |
| 8 | 2027-03-23 → 2027-03-29 | 7 | JP | Tokyo | טוקיו | **latin-label**: Shown in Latin script<br>**repeat-visit**: Same place again in segment 14 - likely a separate visit, keep both |
| 9 | 2027-03-30 → 2027-04-02 | 4 | JP | קיוטו | (no change) | **adjacent-same-place**: Same place as segment 10 ("Kyoto") right next to it - possibly one stay split by spelling |
| 10 | 2027-04-03 → 2027-04-09 | 7 | JP | Kyoto | קיוטו | **latin-label**: Shown in Latin script<br>**adjacent-same-place**: Same place as segment 9 ("קיוטו") right next to it - possibly one stay split by spelling |
| 11 | 2027-04-10 → 2027-04-12 | 3 | JP | אוסקה | (no change) | - |
| 12 | 2027-04-13 → 2027-04-19 | 7 | JP | קנאזאווה וטאקאיאמה | (no change) | - |
| 13 | 2027-04-20 → 2027-04-23 | 4 | JP | האקונה | (no change) | - |
| 14 | 2027-04-24 → 2027-05-04 | 11 | JP | טוקיו | (no change) | **repeat-visit**: Same place again in segment 8 - likely a separate visit, keep both |
| 15 | 2027-05-05 → 2027-05-07 | 3 | JP | סאפורו ואוטארו | (no change) | - |
| 16 | 2027-05-08 → 2027-05-10 | 3 | JP | ביי ופוראנו | (no change) | - |
| 17 | 2027-05-11 → 2027-05-12 | 2 | JP | אגם טויה ונובוריבצו | (no change) | - |
| 18 | 2027-05-13 → 2027-06-17 | 36 | GE | המקטע האחרון - פתוח (גאורגיה כברירת מחדל) | (no change) | - |

## Proposed renames (not applied)

Approve each line before running it. Each statement only touches that segment's date range.

```sql
-- segment 3: "Amphoe Mueang Chiang Mai" → "צ'יאנג מאי"
update itinerary_days set location_name = 'צ''יאנג מאי'
  where date between '2026-11-23' and '2026-11-25' and location_name = 'Amphoe Mueang Chiang Mai';
-- segment 8: "Tokyo" → "טוקיו"
update itinerary_days set location_name = 'טוקיו'
  where date between '2027-03-23' and '2027-03-29' and location_name = 'Tokyo';
-- segment 10: "Kyoto" → "קיוטו"  -- JOINS it with the segment next to it, see below
update itinerary_days set location_name = 'קיוטו'
  where date between '2027-04-03' and '2027-04-09' and location_name = 'Kyoto';
```

## Needs a decision

Adjacent segments that look like the same place. Renaming them to the same label joins them into one segment in the app. Only do that if it really is one stay.
