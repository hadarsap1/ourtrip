import { describe, expect, it } from "vitest";
import { buildDigest, digestSubject } from "./guestDigest";
import { buildMessage, encodeWord, ReplyReader, smtpSend, type LineConn, type Reply } from "./mail";

/** A scripted server: replies in order, records what the client wrote. */
function fakeConn(replies: string[]): LineConn & { written: string[] } {
  const reader = new ReplyReader(async () => replies.shift() ?? null);
  const written: string[] = [];
  return {
    written,
    write: async (d: string) => {
      written.push(d);
    },
    reply: (): Promise<Reply> => reader.reply(),
  };
}

const decode = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));

describe("smtpSend", () => {
  it("logs in, sends each message, quits", async () => {
    const conn = fakeConn([
      "220 smtp.gmail.com ESMTP\r\n",
      "250-smtp.gmail.com at your service\r\n250-AUTH LOGIN PLAIN\r\n250 SMTPUTF8\r\n",
      "235 2.7.0 Accepted\r\n",
      "250 OK\r\n", "250 OK\r\n", "354 Go ahead\r\n", "250 OK queued\r\n",
    ]);
    const r = await smtpSend(conn, { user: "fam@gmail.com", pass: "app pass" }, [{ to: "g@x.test", data: "Subject: x\r\n\r\nhi" }]);
    expect(r).toEqual({ sent: 1, failed: [] });
    expect(conn.written[0]).toBe("EHLO ourtrip\r\n");
    expect(decode(conn.written[1].slice("AUTH PLAIN ".length).trim())).toBe("\u0000fam@gmail.com\u0000app pass");
    expect(conn.written.slice(2, 5)).toEqual(["MAIL FROM:<fam@gmail.com>\r\n", "RCPT TO:<g@x.test>\r\n", "DATA\r\n"]);
    expect(conn.written[5]).toBe("Subject: x\r\n\r\nhi\r\n.\r\n");
    expect(conn.written.at(-1)).toBe("QUIT\r\n");
  });

  it("a refused address does not stop the others", async () => {
    const conn = fakeConn([
      "220 hi\r\n", "250 hi\r\n", "235 ok\r\n",
      "250 OK\r\n", "550 no such user\r\n", "250 reset\r\n",
      "250 OK\r\n", "250 OK\r\n", "354 go\r\n", "250 OK\r\n",
    ]);
    const r = await smtpSend(conn, { user: "f@g.test", pass: "p" }, [
      { to: "bad@x.test", data: "a" },
      { to: "good@x.test", data: "b" },
    ]);
    expect(r.sent).toBe(1);
    expect(r.failed).toEqual([{ to: "bad@x.test", error: "smtp RCPT TO: 550 no such user" }]);
  });

  it("a wrong password throws", async () => {
    const conn = fakeConn(["220 hi\r\n", "250 hi\r\n", "535 5.7.8 Username and Password not accepted\r\n"]);
    await expect(smtpSend(conn, { user: "f", pass: "x" }, [])).rejects.toThrow("smtp AUTH: 535");
  });

  it("reads a reply split across packets", async () => {
    const reader = new ReplyReader(async () => parts.shift() ?? null);
    const parts = ["25", "0-a\r\n250 b", "\r\n"];
    expect(await reader.reply()).toEqual({ code: 250, text: "b" });
  });
});

describe("buildMessage", () => {
  it("encodes a Hebrew subject and both parts as base64, CRLF", () => {
    const msg = buildMessage(
      { name: "סו-בב עולם!", address: "fam@gmail.com" },
      { to: "g@x.test", subject: "עדכון חדש", text: "שלום", html: "<p>שלום</p>" },
      { boundary: "BOUNDARY", date: new Date("2026-11-19T06:00:00Z"), messageId: "1@ourtrip", unsubscribeUrl: "https://a.test/email-off/t" }
    );
    expect(msg).toContain("Subject: =?UTF-8?B?");
    expect(msg).toContain("List-Unsubscribe: <https://a.test/email-off/t>");
    expect(msg).toContain('Content-Type: multipart/alternative; boundary="BOUNDARY"');
    expect(msg).not.toMatch(/[^\r]\n/);
    const text = msg.split("Content-Transfer-Encoding: base64\r\n\r\n")[1].split("\r\n--")[0];
    expect(decode(text.replace(/\r\n/g, ""))).toBe("שלום");
  });

  it("splits a long subject into several encoded words", () => {
    const enc = encodeWord("א".repeat(60));
    expect(enc.split("\r\n ").length).toBeGreaterThan(1);
    for (const w of enc.split("\r\n ")) expect(w.length).toBeLessThanOrEqual(75);
  });
});

describe("buildDigest", () => {
  const items = [
    { kind: "story" as const, id: "s1", title: "יום בים <3" },
    { kind: "episode" as const, id: "e1", title: null },
  ];

  it("links each item into the app and escapes titles", () => {
    const d = buildDigest("סבתא", items, "https://app.test/", "https://app.test/email-off/tok");
    expect(d.html).toContain('href="https://app.test/stories#story-s1"');
    expect(d.html).toContain('href="https://app.test/podcast#episode-e1"');
    expect(d.html).toContain("יום בים &lt;3");
    expect(d.html).toContain('dir="rtl"');
    expect(d.text).toContain("https://app.test/email-off/tok");
  });

  it("names what is new in the subject", () => {
    expect(digestSubject(items)).toBe("סו-בב עולם!: עדכון חדש ופרק חדש בפודקאסט");
    expect(digestSubject([items[0], { ...items[0], id: "s2" }])).toBe("סו-בב עולם!: 2 עדכונים חדשים");
  });
});
