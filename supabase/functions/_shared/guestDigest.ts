// The guests' daily email (00101, DECISIONS #72): what was shared with this
// guest since the last one. The caller passes only items this guest may see
// (guestUpdateRecipients). Hebrew, right to left, one link per item into the
// app, and the unsubscribe link at the bottom.
//
// No imports on purpose: Deno and Next both compile this file as is.

export type DigestItem = { kind: "story" | "episode"; id: string; title: string | null };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function itemUrl(appUrl: string, item: DigestItem): string {
  const base = appUrl.replace(/\/+$/, "");
  return item.kind === "story" ? `${base}/stories#story-${item.id}` : `${base}/podcast#episode-${item.id}`;
}

function itemLine(item: DigestItem): string {
  if (item.kind === "story") return item.title ? `עדכון: ${item.title}` : "עדכון חדש מהדרך";
  return item.title ? `פרק בפודקאסט: ${item.title}` : "פרק חדש בפודקאסט";
}

export function digestSubject(items: DigestItem[]): string {
  const stories = items.filter((i) => i.kind === "story").length;
  const episodes = items.length - stories;
  const parts = [
    stories === 1 ? "עדכון חדש" : stories > 1 ? `${stories} עדכונים חדשים` : null,
    episodes === 1 ? "פרק חדש בפודקאסט" : episodes > 1 ? `${episodes} פרקים חדשים בפודקאסט` : null,
  ].filter(Boolean);
  return `סו-בב עולם!: ${parts.join(" ו")}`;
}

export function buildDigest(
  name: string,
  items: DigestItem[],
  appUrl: string,
  unsubscribeUrl: string
): { subject: string; text: string; html: string } {
  const subject = digestSubject(items);
  const hello = `היי ${name},`;
  const intro = "מה חדש אצלנו מאז המייל הקודם:";
  const off = "לא רוצים יותר את המייל הזה? אפשר להפסיק בלחיצה:";

  const text = [
    hello,
    "",
    intro,
    ...items.map((i) => `- ${itemLine(i)}\n  ${itemUrl(appUrl, i)}`),
    "",
    off,
    unsubscribeUrl,
  ].join("\n");

  const lis = items
    .map(
      (i) =>
        `<li style="margin:0 0 10px"><a href="${esc(itemUrl(appUrl, i))}" style="color:#4f6b45;font-weight:bold">${esc(itemLine(i))}</a></li>`
    )
    .join("");
  const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f7ecd8">
<div dir="rtl" style="max-width:520px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;color:#2f2a24;text-align:right">
<p style="font-size:18px;font-weight:bold;margin:0 0 8px">${esc(hello)}</p>
<p style="font-size:16px;margin:0 0 16px">${esc(intro)}</p>
<ul style="font-size:16px;padding:0 20px 0 0;margin:0 0 24px">${lis}</ul>
<p style="font-size:13px;color:#6b6157;margin:0">${esc(off)} <a href="${esc(unsubscribeUrl)}" style="color:#6b6157">הפסקת המייל</a></p>
</div></body></html>`;

  return { subject, text, html };
}
