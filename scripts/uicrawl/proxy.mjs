// Stands where a Supabase project's URL would: /rest/v1 goes to the local
// PostgREST (real RLS), /auth/v1 answers from the token it is shown, storage
// signs and serves a placeholder picture, everything else (functions,
// realtime) is 404 - which is also how the "could not load" states get seen.
import http from "node:http";
const PGRST = "http://127.0.0.1:3001";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
const svg = (label) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#8fb9c9"/><circle cx="620" cy="140" r="70" fill="#f4d58d"/><path d="M0 600 L250 300 L420 480 L560 360 L800 600Z" fill="#3d6b5e"/><text x="40" y="80" font-size="40" fill="#fff">${label}</text></svg>`;
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(200, CORS); return res.end(); }
  const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
  const json = (code, obj) => { res.writeHead(code, { ...CORS, "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (u.pathname.startsWith("/rest/v1")) {
    const headers = { ...req.headers }; delete headers.host; delete headers["content-length"]; delete headers.connection;
    const r = await fetch(PGRST + u.pathname.slice(8) + u.search, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
    const h = { ...CORS }; r.headers.forEach((v, k) => { if (!["transfer-encoding", "content-encoding", "content-length", "connection"].includes(k)) h[k] = v; });
    res.writeHead(r.status, h); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  if (u.pathname === "/auth/v1/health") return json(200, {});
  if (u.pathname === "/auth/v1/user") { try { const p = JSON.parse(Buffer.from((req.headers.authorization || "").split(".")[1], "base64url").toString()); return json(200, { id: p.sub, email: p.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} }); } catch { return json(401, {}); } }
  if (u.pathname.startsWith("/auth/v1")) return json(400, { error: "not available" });
  if (u.pathname.startsWith("/storage/v1/object/sign/") && req.method === "POST") {
    const bucket = u.pathname.split("/")[5]; let b = {}; try { b = JSON.parse(body.toString()); } catch {}
    if (Array.isArray(b.paths)) return json(200, b.paths.map((p) => ({ path: p, error: null, signedURL: `/object/sign/${bucket}/${p}?token=t` })));
    return json(200, { signedURL: `/object/sign/${u.pathname.split("/").slice(5).join("/")}?token=t` });
  }
  if (u.pathname.startsWith("/storage/v1/object/") && req.method === "GET") { res.writeHead(200, { ...CORS, "content-type": "image/svg+xml" }); return res.end(svg(u.pathname.split("/").pop())); }
  json(404, { error: "not found", message: "local stand-in" });
}).listen(54321, () => console.log("proxy up"));
