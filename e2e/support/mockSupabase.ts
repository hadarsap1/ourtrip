import type { Page, Route } from "@playwright/test";
import { FIXTURES, OWNER_AUTH_ID } from "./fixtures";

// A minimal in-browser stand-in for Supabase, so the populated suite can drive
// every screen with data and no credentials. The app is started with
// NEXT_PUBLIC_SUPABASE_URL pointing at MOCK_URL (see playwright.populated.config.ts);
// nothing ever leaves the test process.
//
// It covers what the app actually uses: a stored session, the member-link RPC,
// and PostgREST reads with the filters the data layer calls (eq/neq/in/is/
// gte/lte/gt/lt, order, limit, single/maybeSingle, head counts). Writes are
// accepted and echoed but not persisted - these tests look, they do not edit.
// Realtime, Storage and Edge Functions answer with empty or error responses,
// which is exactly the degraded path the app has to handle anyway.

export const MOCK_URL = "http://mock-supabase.localhost:54321";
export const MOCK_ANON_KEY = "mock-anon-key";

type Row = Record<string, unknown>;

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

const EXP = Math.floor(Date.UTC(2030, 0, 1) / 1000);
const USER = {
  id: OWNER_AUTH_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-07-16T10:54:20Z",
};
const ACCESS_TOKEN = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
  sub: OWNER_AUTH_ID, aud: "authenticated", role: "authenticated", exp: EXP, email: USER.email,
})}.sig`;
export const MOCK_SESSION = {
  access_token: ACCESS_TOKEN,
  refresh_token: "mock-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: EXP,
  user: USER,
};

export function mockStorageKey(): string {
  return `sb-${new URL(MOCK_URL).hostname.split(".")[0]}-auth-token`;
}

function parseValue(raw: string): unknown {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw.replace(/^"(.*)"$/, "$1");
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const na = Number(a), nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== "" && String(b).trim() !== "") return na - nb;
  return String(a) < String(b) ? -1 : 1;
}

function matches(row: Row, col: string, expr: string): boolean {
  const neg = expr.startsWith("not.");
  const e = neg ? expr.slice(4) : expr;
  const dot = e.indexOf(".");
  const op = e.slice(0, dot);
  const raw = e.slice(dot + 1);
  const v = row[col];
  let ok: boolean;
  switch (op) {
    case "eq": ok = String(v) === String(parseValue(raw)); break;
    case "neq": ok = String(v) !== String(parseValue(raw)); break;
    case "is": ok = raw === "null" ? v === null || v === undefined : v === parseValue(raw); break;
    case "in": {
      const list = raw.replace(/^\(|\)$/g, "").split(",").map((s) => String(parseValue(s)));
      ok = list.includes(String(v));
      break;
    }
    case "gte": ok = cmp(v, parseValue(raw)) >= 0; break;
    case "gt": ok = cmp(v, parseValue(raw)) > 0; break;
    case "lte": ok = cmp(v, parseValue(raw)) <= 0; break;
    case "lt": ok = cmp(v, parseValue(raw)) < 0; break;
    case "ilike":
    case "like": {
      const pat = String(parseValue(raw)).replace(/[*%]/g, "").toLowerCase();
      ok = String(v ?? "").toLowerCase().includes(pat);
      break;
    }
    default: ok = true;
  }
  return neg ? !ok : ok;
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function query(table: string, params: URLSearchParams): Row[] {
  let rows = [...(FIXTURES[table] ?? [])];
  for (const [key, value] of params) {
    if (RESERVED.has(key)) continue;
    if (key === "or") continue; // not modelled: keep everything
    rows = rows.filter((r) => matches(r, key, value));
  }
  // Embedded "bookings!inner(trip_id)" on booking_files.
  const select = params.get("select") ?? "*";
  if (table === "booking_files" && select.includes("bookings")) {
    rows = rows.map((r) => ({
      ...r,
      bookings: { trip_id: FIXTURES.bookings.find((b) => b.id === r.booking_id)?.trip_id },
    }));
  }
  const order = params.get("order");
  if (order) {
    const keys = order.split(",").map((part) => {
      const [col, dir, nulls] = part.split(".");
      return { col, desc: dir === "desc", nullsFirst: nulls === "nullsfirst" };
    });
    rows.sort((a, b) => {
      for (const k of keys) {
        const c = cmp(a[k.col], b[k.col]);
        if (c !== 0) return k.desc ? -c : c;
      }
      return 0;
    });
  }
  const offset = Number(params.get("offset") ?? 0);
  const limit = params.get("limit");
  rows = rows.slice(offset, limit ? offset + Number(limit) : undefined);
  return rows;
}

async function handleRest(route: Route, table: string, url: URL) {
  const req = route.request();
  const method = req.method();
  const headers = req.headers();
  const single = (headers["accept"] ?? "").includes("vnd.pgrst.object");
  const cors = { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" };

  if (method === "GET" || method === "HEAD") {
    const rows = query(table, url.searchParams);
    const range = `0-${Math.max(rows.length - 1, 0)}/${rows.length}`;
    if (method === "HEAD") {
      return route.fulfill({ status: 200, headers: { ...cors, "content-range": range }, body: "" });
    }
    if (single) {
      if (rows.length !== 1) {
        return route.fulfill({
          status: 406, headers: cors, contentType: "application/json",
          body: JSON.stringify({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `${rows.length} rows` }),
        });
      }
      return route.fulfill({ status: 200, headers: { ...cors, "content-range": range }, contentType: "application/json", body: JSON.stringify(rows[0]) });
    }
    return route.fulfill({ status: 200, headers: { ...cors, "content-range": range }, contentType: "application/json", body: JSON.stringify(rows) });
  }

  // Writes: echo the payload so optimistic UIs have something to hold.
  let body: unknown = null;
  try { body = req.postDataJSON(); } catch { body = null; }
  const arr = Array.isArray(body) ? body : body ? [body] : [];
  const echoed = arr.map((r) => ({ id: crypto.randomUUID(), ...(r as Row) }));
  const payload = single ? echoed[0] ?? {} : echoed;
  return route.fulfill({ status: method === "POST" ? 201 : 200, headers: cors, contentType: "application/json", body: JSON.stringify(payload) });
}

/** Wire every Supabase call of `page` to the fixtures, and sign the owner in. */
export async function installMockSupabase(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, session]) => {
      try { window.localStorage.setItem(key as string, JSON.stringify(session)); } catch { /* ignore */ }
    },
    [mockStorageKey(), MOCK_SESSION] as const,
  );

  // Third-party APIs are out of scope for these tests and blocked in CI
  // sandboxes; fail them fast so the app's fallbacks render.
  await page.route(/open-meteo\.com|er-api\.com|exchangerate\.host|frankfurter|maps\.googleapis\.com|fonts\.g/, (r) => r.abort());

  await page.route(`${MOCK_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });

    if (route.request().method() === "OPTIONS") {
      return route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
        },
        body: "",
      });
    }
    if (path.startsWith("/auth/v1/user")) return json(200, USER);
    if (path.startsWith("/auth/v1/token")) return json(200, MOCK_SESSION);
    if (path.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, body: "" });
    if (path.startsWith("/auth/v1/")) return json(200, {});
    if (path === "/rest/v1/rpc/link_member_to_auth_user") return json(200, "owner");
    if (path.startsWith("/rest/v1/rpc/")) return json(200, null);
    if (path.startsWith("/rest/v1/")) return handleRest(route, path.slice("/rest/v1/".length), url);
    if (path.startsWith("/storage/v1/")) return json(400, { error: "not_found", message: "mock storage" });
    if (path.startsWith("/functions/v1/")) return json(503, { error: "mock: edge functions are not served in e2e" });
    return json(404, {});
  });

  // Realtime: accept the socket and say nothing.
  await page.routeWebSocket(/mock-supabase/, () => {});
}
