// Stands where a Supabase project's URL would: /rest/v1 goes to the local
// PostgREST (real RLS), /auth/v1 answers from the token it is shown, storage
// signs and serves a placeholder picture, everything else (functions,
// realtime) is 404 - which is also how the "could not load" states get seen.
import http from "node:http";
const PGRST = "http://127.0.0.1:3001";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
const SKIES = [["#f3c98b", "#e79a6a", "#4d7d7b"], ["#a9c7de", "#7fa8c9", "#3f7a5e"], ["#f6d6a8", "#e8b27a", "#8a6a4a"], ["#c9d8b0", "#9fc3a0", "#3d6b5e"]];
const svg = (label) => { const [a, b, c] = SKIES[[...label].reduce((n, ch) => n + ch.charCodeAt(0), 0) % SKIES.length]; return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="610" cy="150" r="64" fill="#fff3d6" opacity=".9"/><path d="M0 600 L0 430 L210 300 L400 450 L560 350 L800 470 L800 600Z" fill="${c}"/></svg>`; };
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
  // The two functions that hand a guest signed photo URLs. As in the real
  // ones, the rows are read with the CALLER's token, so RLS decides which
  // photos exist (rule 3); only those get a (placeholder) URL.
  if (u.pathname === "/functions/v1/guest-media" || u.pathname === "/functions/v1/guest-photos") {
    const auth = { authorization: req.headers.authorization ?? "", apikey: req.headers.apikey ?? "" };
    const self = `http://${req.headers.host}`;
    const url = (id) => `${self}/storage/v1/object/sign/photos/${id}.jpg?token=t`;
    if (u.pathname.endsWith("guest-photos")) {
      const r = await fetch(`${PGRST}/photos?select=id,caption,taken_on&order=taken_on.desc`, { headers: auth });
      const rows = r.ok ? await r.json() : [];
      return json(200, { ok: true, photos: rows.map((p) => ({ ...p, url: url(p.id), place: null, country_code: null, lat: null, lng: null })) });
    }
    let b = {}; try { b = JSON.parse(body.toString()); } catch {}
    const ids = (b.photo_ids ?? []).filter((x) => /^[0-9a-f-]{36}$/.test(x));
    const r = ids.length ? await fetch(`${PGRST}/photos?select=id&id=in.(${ids.join(",")})`, { headers: auth }) : null;
    const seen = r && r.ok ? await r.json() : [];
    return json(200, { ok: true, photos: seen.map((p) => ({ id: p.id, url: url(p.id) })), episodes: [] });
  }
  json(404, { error: "not found", message: "local stand-in" });
}).listen(54321, () => console.log("proxy up"));
