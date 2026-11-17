import crypto from "node:crypto";
export const SECRET = "local-ui-audit-secret-at-least-32-chars-long!!";
export function sign(payload) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const data = enc({ alg: "HS256", typ: "JWT" }) + "." + enc({ iat: Math.floor(Date.now() / 1000) - 60, exp: Math.floor(Date.now() / 1000) + 86400 * 7, ...payload });
  return data + "." + crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}
if (process.argv[2] === "anon") console.log(sign({ role: "anon" }));
