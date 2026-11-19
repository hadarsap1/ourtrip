// Sends email from the family's Gmail (DECISIONS #72, #73): SMTPS on port 465
// (Supabase blocks 25 and 587), app password in GMAIL_USER and
// GMAIL_APP_PASSWORD. One connection for a batch. Deno only - the protocol
// and the message format live in mail.ts, which is tested under vitest.

import { buildMessage, ReplyReader, smtpSend, type LineConn, type Mail } from "./mail.ts";

export const FROM_NAME = "סו-בב עולם!";

/** The Gmail account and password, or null when the secrets are not set. */
export function gmailAuth(): { user: string; pass: string } | null {
  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  return user && pass ? { user, pass } : null;
}

/** Gmail's SMTPS socket as a line connection for mail.ts. */
export async function gmailConn(): Promise<LineConn & { close(): void }> {
  const sock = await Deno.connectTls({ hostname: "smtp.gmail.com", port: 465 });
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const buf = new Uint8Array(8192);
  const reader = new ReplyReader(async () => {
    const n = await sock.read(buf);
    return n === null ? null : dec.decode(buf.subarray(0, n), { stream: true });
  });
  return {
    write: async (d: string) => {
      const bytes = enc.encode(d);
      let off = 0;
      while (off < bytes.length) off += await sock.write(bytes.subarray(off));
    },
    reply: () => reader.reply(),
    close: () => {
      try {
        sock.close();
      } catch {
        // already closed
      }
    },
  };
}

/** Builds and sends each mail over one connection. Throws when the
 *  connection or the login fails; a refused address is in `failed`. */
export async function sendGmail(
  auth: { user: string; pass: string },
  mails: (Mail & { unsubscribeUrl?: string })[]
): Promise<{ sent: number; failed: { to: string; error: string }[] }> {
  const now = new Date();
  const messages = mails.map((m) => ({
    to: m.to,
    data: buildMessage({ name: FROM_NAME, address: auth.user }, m, {
      boundary: `ot-${crypto.randomUUID()}`,
      date: now,
      messageId: `${crypto.randomUUID()}@ourtrip`,
      unsubscribeUrl: m.unsubscribeUrl,
    }),
  }));
  const conn = await gmailConn();
  try {
    return await smtpSend(conn, auth, messages);
  } finally {
    conn.close();
  }
}
