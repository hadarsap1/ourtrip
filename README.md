# OurTrip

אפליקציית PWA לניהול הטיול המשפחתי — הדר, סיון והילדים, עם פורטל צפייה למשפחה בארץ. עברית RTL, Next.js + Supabase + Vercel.

## מבנה הפרויקט

```
ourtrip/
├── CLAUDE.md            ← הנחיות קבועות ל-Claude Code (נקרא אוטומטית בכל סשן)
├── docs/
│   ├── HANDOFF.md       ← מסמך המסירה: ארכיטקטורה, משתני סביבה, תפעול בטיול, פתוחים
│   ├── SPEC.md          ← מפרט מוצר מלא: פיצ'רים, הרשאות, אופליין
│   ├── SCHEMA.sql       ← סכמת DB התחלתית + גישת ה-RLS
│   ├── ROADMAP.md       ← 8 ספרינטים עם קריטריוני קבלה
│   ├── DECISIONS.md     ← החלטות סגורות שאסור לפתוח מחדש
│   ├── DEV-PLAN-HE.md   ← תוכנית הפיתוח המקורית בעברית (רקע)
│   └── SECURITY-CHECKS.md ← יומן בדיקות אבטחה (נוצר תוך כדי עבודה)
└── (קוד האפליקציה — Next.js App Router)
```

## סטטוס

כל שמונת הספרינטים הושלמו, ומעבר להם נוספו פיצ'רים (ייבוא מסלול, חיפוש טיסות ומלונות, Google Photos, ספר זיכרונות ועוד). התמונה המלאה — ארכיטקטורה, משתני סביבה, ספר תפעול לזמן הטיול ורשימת פתוחים — נמצאת ב-`docs/HANDOFF.md`.

- **2026-07-16**: קיק-אוף. מסמכי התכנון נסקרו, תוקנו (ראו DECISIONS #14–17 והערות ב-SCHEMA.sql), והפרויקט נפתח. שם האפליקציה: **OurTrip** (לשעבר TripHub בטיוטות).

## עבודה עם Claude Code

- **סשן חדש לכל ספרינט** — הקונטקסט נשאר נקי, CLAUDE.md נטען מחדש
- עובדים ספרינט-ספרינט לפי `docs/ROADMAP.md`; לא בונים פיצ'רים מספרינטים עתידיים
- **בדיקת אבטחה היא לא אופציונלית**: אחרי ספרינטים 4, 6, 7 מריצים את בדיקות הגישה-בין-תפקידים ומתעדים ב-`docs/SECURITY-CHECKS.md`
- **מיילים אמיתיים**: המיילים של הדר וסיון מוזנים רק ב-seed/env, לא בקוד
- commit בסוף כל יחידת עבודה, בסגנון `sprint-N: short description`

### פרומפט המשך (לכל ספרינט הבא)

```
Sprint N is confirmed done (acceptance criteria verified on real devices).
Re-read docs/ROADMAP.md Sprint N+1. Restate its acceptance criteria, list the files
you plan to touch, flag anything ambiguous, then wait for my go.
```

## הרצה מקומית

```
npm install
npm run dev
```

משתני סביבה: העתיקו `.env.local.example` ל-`.env.local` ומלאו ערכים. אין לקמט (commit) קבצי `.env*`.

## חיפוש טיסות ומלונות (RapidAPI)

בעמוד **מסלול** יש טאב **חיפוש** להשוואת טיסות ומלונות בזמן אמת ושמירה ישירה לרשימת ההזמנות. החיפוש רץ דרך Edge Function בשם `travel-search` (מוגן להורים בלבד), שקורא לשני שירותי RapidAPI:

- Google Flights Live API (`google-flights-live-api.p.rapidapi.com`)
- Booking Live API (`booking-live-api.p.rapidapi.com`)

המפתח נשמר כ־**סוד של פונקציית Edge** בלבד (לא כמשתנה `NEXT_PUBLIC`, כדי שלא ידלוף ללקוח):

```
supabase secrets set RAPIDAPI_KEY=xxxxxxxx
```

בלי המפתח, טאב החיפוש מציג הודעה עברית ש"השירות עדיין לא מוגדר"; שאר עמוד המסלול (מסלול והזמנות) עובד כרגיל.
