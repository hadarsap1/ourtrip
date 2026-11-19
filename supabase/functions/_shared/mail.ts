// A minimal SMTP sender for guest-digest (00101, DECISIONS #72): the family's
// Gmail over SMTPS (port 465 - Supabase blocks 25 and 587). Written here
// rather than pulled in as a library (CLAUDE.md rule 7): one connection, AUTH
// PLAIN, a handful of messages, QUIT. The protocol runs over any line
// transport, so it is tested without a network (mail.test.ts); guest-digest
// gives it a Deno.connectTls socket.
//
// No imports on purpose: Deno and Next both compile this file as is.

export type Mail = { to: string; subject: string; text: string; html: string };

/** UTF-8 -> base64, the same in Deno and Node. */
export function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function wrap76(s: string): string {
  return (s.match(/.{1,76}/g) ?? [""]).join("\r\n");
}

/** RFC 2047: a Hebrew subject or name is sent as =?UTF-8?B?...?= words. */
export function encodeWord(s: string): string {
  // stay well under the 75-character word limit: ~30 Hebrew letters per word
  const words: string[] = [];
  let chunk = "";
  for (const ch of s) {
    if (new TextEncoder().encode(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${b64(w)}?=`).join("\r\n ");
}

/** A whole message, CRLF line ends: multipart text + HTML, both base64. */
export function buildMessage(
  from: { name: string; address: string },
  mail: Mail,
  opts: { boundary: string; date: Date; messageId: string; unsubscribeUrl?: string }
): string {
  const headers = [
    `From: ${encodeWord(from.name)} <${from.address}>`,
    `To: <${mail.to}>`,
    `Subject: ${encodeWord(mail.subject)}`,
    `Date: ${opts.date.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${opts.messageId}>`,
    "MIME-Version: 1.0",
    ...(opts.unsubscribeUrl ? [`List-Unsubscribe: <${opts.unsubscribeUrl}>`] : []),
    `Content-Type: multipart/alternative; boundary="${opts.boundary}"`,
  ];
  const part = (type: string, body: string) =>
    [
      `--${opts.boundary}`,
      `Content-Type: ${type}; charset=UTF-8`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(b64(body)),
    ].join("\r\n");
  return [
    headers.join("\r\n"),
    "",
    part("text/plain", mail.text),
    part("text/html", mail.html),
    `--${opts.boundary}--`,
    "",
  ].join("\r\n");
}

/** One SMTP reply: the code and its (last) line. */
export type Reply = { code: number; text: string };

/** What the protocol needs from a connection. */
export interface LineConn {
  write(data: string): Promise<void>;
  /** the next complete reply (multi-line "250-..." replies joined) */
  reply(): Promise<Reply>;
}

/** Splits a byte stream into SMTP replies. */
export class ReplyReader {
  private buf = "";
  private lines: string[] = [];
  constructor(private readonly read: () => Promise<string | null>) {}

  private async line(): Promise<string> {
    while (this.lines.length === 0) {
      const i = this.buf.indexOf("\r\n");
      if (i >= 0) {
        this.lines.push(this.buf.slice(0, i));
        this.buf = this.buf.slice(i + 2);
        continue;
      }
      const more = await this.read();
      if (more === null) throw new Error("smtp: connection closed");
      this.buf += more;
    }
    return this.lines.shift()!;
  }

  async reply(): Promise<Reply> {
    for (;;) {
      const l = await this.line();
      const code = Number(l.slice(0, 3));
      if (!Number.isFinite(code)) throw new Error(`smtp: bad reply "${l}"`);
      if (l[3] !== "-") return { code, text: l.slice(4) };
    }
  }
}

async function expect(conn: LineConn, ok: number[], what: string): Promise<void> {
  const r = await conn.reply();
  if (!ok.includes(r.code)) throw new Error(`smtp ${what}: ${r.code} ${r.text}`);
}

async function cmd(conn: LineConn, line: string, ok: number[], what: string): Promise<void> {
  await conn.write(`${line}\r\n`);
  await expect(conn, ok, what);
}

/**
 * Greets, logs in, sends each message, quits. A message the server refuses
 * (a bad address) is reported and the rest still go; a failed login throws.
 * Returns how many were accepted and the refusals.
 */
export async function smtpSend(
  conn: LineConn,
  auth: { user: string; pass: string },
  messages: { to: string; data: string }[],
  heloName = "ourtrip"
): Promise<{ sent: number; failed: { to: string; error: string }[] }> {
  await expect(conn, [220], "greeting");
  await cmd(conn, `EHLO ${heloName}`, [250], "EHLO");
  await cmd(conn, `AUTH PLAIN ${b64(`\u0000${auth.user}\u0000${auth.pass}`)}`, [235], "AUTH");

  let sent = 0;
  const failed: { to: string; error: string }[] = [];
  for (const m of messages) {
    try {
      await cmd(conn, `MAIL FROM:<${auth.user}>`, [250], "MAIL FROM");
      await cmd(conn, `RCPT TO:<${m.to}>`, [250, 251], "RCPT TO");
      await cmd(conn, "DATA", [354], "DATA");
      // base64 bodies and our headers never start a line with "."; stuff anyway
      const body = m.data.replace(/\r\n\./g, "\r\n..");
      await conn.write(`${body.endsWith("\r\n") ? body : body + "\r\n"}.\r\n`);
      await expect(conn, [250], "message");
      sent += 1;
    } catch (err) {
      failed.push({ to: m.to, error: (err as Error).message });
      // back to a clean state for the next message
      await cmd(conn, "RSET", [250], "RSET").catch(() => {});
    }
  }
  await conn.write("QUIT\r\n").catch(() => {});
  return { sent, failed };
}
