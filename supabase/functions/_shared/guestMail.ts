// The guest emails besides the daily one (DECISIONS #73): the welcome sent
// the moment a parent approves a guest, and a sign-in link (from the guest
// card, or asked for on the login screen). Hebrew, right to left, text + HTML.
//
// No imports on purpose: Deno and Next both compile this file as is.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const WRAP = 'style="max-width:520px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;color:#2f2a24;text-align:right"';
const BUTTON = 'style="display:inline-block;background:#4f6b45;color:#ffffff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:bold"';

function page(inner: string): string {
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f7ecd8"><div dir="rtl" ${WRAP}>${inner}</div></body></html>`;
}

/** After approval: the app's address to keep, how to get in, and the first
 *  sign-in link (one use). The daily email is mentioned, never turned on. */
export function welcomeEmail(
  name: string,
  email: string,
  appUrl: string,
  signInLink: string
): { subject: string; text: string; html: string } {
  const app = `${appUrl.replace(/\/+$/, "")}/`;
  const subject = "אישרנו אותך ל-סו-בב עולם! 🌍";
  const hello = `היי ${name}!`;
  const approved = "אישרנו אותך לעקוב אחרי הטיול שלנו: העדכונים, התמונות והפודקאסט מהדרך.";
  const first = "לכניסה הראשונה, עכשיו (הכפתור עובד פעם אחת):";
  const keep = "זו הכתובת שאיתה נכנסים מעכשיו, כדאי לשמור את המייל:";
  const again = `אם צריך להתחבר שוב: נכנסים לכתובת, ובוחרים Google או מקלידים את המייל (${email}) ומקבלים קישור כניסה.`;
  const digest = "רוצים סיכום יומי במייל עם מה שחדש? מפעילים בהגדרות באפליקציה.";

  const text = [hello, "", approved, "", first, signInLink, "", keep, app, "", again, "", digest].join("\n");
  const html = page(
    `<p style="font-size:18px;font-weight:bold;margin:0 0 8px">${esc(hello)}</p>` +
      `<p style="font-size:16px;margin:0 0 16px">${esc(approved)}</p>` +
      `<p style="font-size:15px;margin:0 0 10px">${esc(first)}</p>` +
      `<p style="margin:0 0 20px"><a href="${esc(signInLink)}" ${BUTTON}>כניסה</a></p>` +
      `<p style="font-size:15px;margin:0 0 4px">${esc(keep)}</p>` +
      `<p style="font-size:16px;margin:0 0 16px"><a href="${esc(app)}" style="color:#4f6b45;font-weight:bold" dir="ltr">${esc(app)}</a></p>` +
      `<p style="font-size:14px;color:#6b6157;margin:0 0 16px">${esc(again)}</p>` +
      `<p style="font-size:14px;color:#6b6157;margin:0">${esc(digest)}</p>`
  );
  return { subject, text, html };
}

/** A sign-in link: one use, short-lived. `name` is null when the guest asked
 *  from the login screen (nobody typed a name there). */
export function signInEmail(name: string | null, signInLink: string): { subject: string; text: string; html: string } {
  const subject = "קישור כניסה ל-סו-בב עולם! 🌍";
  const hello = name ? `היי ${name}!` : "שלום!";
  const body = "הנה קישור כניסה ל\"סו-בב עולם!\". לוחצים, ואתם בפנים.";
  const note = "הקישור אישי ועובד פעם אחת. לא ביקשתם? אפשר להתעלם מהמייל.";
  const text = [hello, "", body, signInLink, "", note].join("\n");
  const html = page(
    `<p style="font-size:18px;font-weight:bold;margin:0 0 8px">${esc(hello)}</p>` +
      `<p style="font-size:16px;margin:0 0 16px">${esc(body)}</p>` +
      `<p style="margin:0 0 20px"><a href="${esc(signInLink)}" ${BUTTON}>כניסה</a></p>` +
      `<p style="font-size:13px;color:#6b6157;margin:0">${esc(note)}</p>`
  );
  return { subject, text, html };
}
