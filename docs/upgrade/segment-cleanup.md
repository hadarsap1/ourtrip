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

## Applied 04/10/2026 (approved by Hadar: "push it first, checking later")

All three renames above ran in one statement, scoped to the active trip `834d870a-…`. Rows changed: Chiang Mai 3, Tokyo 7, Kyoto 7. Kyoto now reads as one stay, 30/03-09/04/2027 (11 days). Nothing else was touched.

Rollback (restores the exact previous labels by row id):

```sql
update itinerary_days set location_name = 'Amphoe Mueang Chiang Mai' where id in (
  'c5890734-bbe8-43c1-9153-8f73528499f5','bd706f17-817b-482c-ba7f-3a11598556c4','738c3a17-40e4-49b2-812b-ec69172b5734');
update itinerary_days set location_name = 'Tokyo' where id in (
  'a8cf5386-f64b-4d2a-9130-c449d06c3404','f6eb086e-05a3-40d4-ae67-2b134cafaa0e','64032e3a-8fc7-4a93-8311-015d121124db',
  '5f9233ba-b48f-45f6-8391-fe7c26e41de3','1cbd1359-6a45-4eac-ae7f-865a7a585290','a95cb012-8fb4-429a-8480-3fc7d19a45e4',
  '7a4df6a4-81b8-44dc-89f7-3ae8ecea37c8');
update itinerary_days set location_name = 'Kyoto' where id in (
  '7fc08070-3c62-4705-9b18-fa3d037c0ef4','1b7ac2b0-f088-424a-9e59-3471b9f29929','6b9db42a-8d58-48d6-b906-26a7ab6c0403',
  'adb36fd3-8f38-4d7a-b907-c3eccc92aa32','9900d8e4-6d0d-4bb9-91d3-7ca4abfd34f3','37e57c1f-994f-4e17-b351-a641eaf836c9',
  'eecc073a-cd0d-4215-aaa9-b717ea82c483');
```
