import { createClient } from "@supabase/supabase-js";

// Credentials for authenticated E2E come entirely from env so no secrets live
// in the repo. All four must be set for the authenticated suite to run; when
// any is missing the suite skips itself (see authenticated.spec.ts).
//
//   E2E_SUPABASE_URL       - a *test* Supabase project URL
//   E2E_SUPABASE_ANON_KEY  - its anon key
//   E2E_TEST_EMAIL         - a seeded OWNER member with a password set
//   E2E_TEST_PASSWORD      - that user's password
//
// The user must be a real owner row (AuthGate calls link_member_to_auth_user and
// rejects sessions with no member role), so point these at a throwaway project.
export const authEnv = {
  url: process.env.E2E_SUPABASE_URL,
  anonKey: process.env.E2E_SUPABASE_ANON_KEY,
  email: process.env.E2E_TEST_EMAIL,
  password: process.env.E2E_TEST_PASSWORD,
};

export const authReady = Boolean(
  authEnv.url && authEnv.anonKey && authEnv.email && authEnv.password,
);

// supabase-js persists the session in localStorage under this key.
export function storageKey(url: string): string {
  const ref = new URL(url).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

// Sign in through the real Supabase auth endpoint (password grant) and return
// the session object to inject into the browser's localStorage.
export async function signInSession() {
  const supabase = createClient(authEnv.url!, authEnv.anonKey!);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: authEnv.email!,
    password: authEnv.password!,
  });
  if (error || !data.session) {
    throw new Error(`E2E sign-in failed: ${error?.message ?? "no session"}`);
  }
  return data.session;
}
