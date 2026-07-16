// All user-facing UI strings live here (CLAUDE.md hard rule #4).
// No hardcoded Hebrew inside components.

export const strings = {
  appName: "OurTrip",
  appDescription: "מרכז הפיקוד של הטיול המשפחתי",

  nav: {
    today: "היום",
    itinerary: "מסלול",
    budget: "תקציב",
    documents: "מסמכים",
    more: "עוד",
  },

  today: {
    emptyTitle: "עוד אין מה להציג",
    emptyBody: "כשנתחיל להזין את המסלול, כאן יופיע כל מה שקורה היום.",
  },

  placeholders: {
    comingSoon: "בקרוב…",
    itinerary: "המסלול ייבנה בספרינט 2",
    budget: "התקציב ייבנה בספרינט 3",
    documents: "כספת המסמכים תיבנה בספרינט 4",
    more: "הגדרות, דף חירום ועוד — בהמשך",
  },

  auth: {
    signIn: "כניסה עם Google",
    signOut: "יציאה",
    notAllowedTitle: "אין הרשאה",
    notAllowedBody: "החשבון הזה לא מורשה להיכנס לאפליקציה. נסו עם חשבון אחר.",
    missingEnv: "חסרים משתני סביבה של Supabase — ראו .env.local.example",
  },

  offline: {
    banner: "אין חיבור לאינטרנט — חלק מהמסכים לא זמינים",
  },
} as const;
