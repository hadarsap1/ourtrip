import { FunctionsHttpError } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";
import type { Member } from "@/lib/types";

export type KidDevice = Tables<"kid_devices">;

const DEVICE_TOKEN_KEY = "ourtrip-kid-device-token";
const KID_NAME_KEY = "ourtrip-kid-name";
const UNLOCK_FLAG = "ourtrip-kid-unlocked"; // sessionStorage: cleared on restart

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

async function invokeKidAuth(body: Record<string, string>): Promise<{
  status: number;
  data: Record<string, unknown>;
}> {
  const { data, error } = await requireClient().functions.invoke("kid-auth", {
    body,
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context
        .json()
        .catch(() => ({}))) as Record<string, unknown>;
      return { status: error.context.status, data: payload };
    }
    // Anything else (FunctionsFetchError / FunctionsRelayError) means no
    // readable reply at all: the request never completed, or it completed and
    // the browser refused to hand the response to the page. supabase-js
    // reports both as the same opaque failure, and `error.message` for them is
    // boilerplate, so normalise to a code the UI can actually say something
    // about.
    throw new Error("network");
  }
  return { status: 200, data: data as Record<string, unknown> };
}

// ---------- owner side ----------

export async function listKids(tripId: string): Promise<Member[]> {
  const { data, error } = await requireClient()
    .from("members")
    .select("*")
    .eq("trip_id", tripId)
    .eq("role", "kid")
    .order("display_name");
  if (error) throw new Error(error.message);
  return data;
}

export async function addKid(tripId: string, displayName: string): Promise<void> {
  const { error } = await requireClient().from("members").insert({
    trip_id: tripId,
    display_name: displayName.trim(),
    role: "kid",
  });
  if (error) throw new Error(error.message);
}

export async function listDevices(): Promise<KidDevice[]> {
  const { data, error } = await requireClient()
    .from("kid_devices")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Revokes a device. This goes through kid-auth rather than updating the row
 * directly: setting `revoked_at` now stops RLS resolving the kid at all
 * (migration 00024), and the function additionally rotates the kid's auth
 * password once no active device is left, so the binding cannot mint a new
 * session either. A direct table UPDATE would do only half of that.
 */
export async function revokeDevice(id: string): Promise<void> {
  const { status, data } = await invokeKidAuth({
    action: "revoke",
    device_id: id,
  });
  if (status !== 200 || !data.ok) throw new Error(String(data.error ?? status));
}

/** Owner generates a one-time registration code (PIN set here). */
export async function createRegistration(
  memberId: string,
  pin: string
): Promise<string> {
  const { status, data } = await invokeKidAuth({
    action: "create-registration",
    member_id: memberId,
    pin,
  });
  if (status !== 200 || !data.ok) throw new Error(String(data.error ?? status));
  return data.code as string;
}

// ---------- kid device side ----------

export function isKidDevice(): boolean {
  try {
    return !!localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return false;
  }
}

export function kidDisplayName(): string | null {
  try {
    return localStorage.getItem(KID_NAME_KEY);
  } catch {
    return null;
  }
}

/** PIN required on every cold start: session flag dies with the app. */
export function needsKidUnlock(): boolean {
  try {
    return isKidDevice() && sessionStorage.getItem(UNLOCK_FLAG) !== "1";
  } catch {
    return false;
  }
}

export function forgetKidDevice(): void {
  try {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
    localStorage.removeItem(KID_NAME_KEY);
    sessionStorage.removeItem(UNLOCK_FLAG);
  } catch {
    // ignore
  }
}

export async function registerDevice(code: string): Promise<string> {
  const { status, data } = await invokeKidAuth({ action: "register", code });
  if (status !== 200 || !data.ok) throw new Error("invalid_code");
  const member = data.member as { display_name: string };
  localStorage.setItem(DEVICE_TOKEN_KEY, data.device_token as string);
  localStorage.setItem(KID_NAME_KEY, member.display_name);
  return member.display_name;
}

export type UnlockResult =
  | { status: "ok"; displayName: string }
  | { status: "wrong"; attemptsLeft: number }
  | { status: "locked"; lockedUntil: string }
  /** The project's Email auth provider is off, so no unlock can ever mint a
   *  session. A setting, not a fault - worth its own message. */
  | { status: "disabled" }
  | { status: "error" };

export async function unlockWithPin(pin: string): Promise<UnlockResult> {
  const token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) return { status: "error" };

  const { status, data } = await invokeKidAuth({
    action: "unlock",
    device_token: token,
    pin,
  });

  if (status === 423) {
    return { status: "locked", lockedUntil: String(data.locked_until ?? "") };
  }
  if (status === 401 && data.error === "wrong pin") {
    return { status: "wrong", attemptsLeft: Number(data.attempts_left ?? 0) };
  }
  if (status === 401) {
    // unknown/revoked device — force re-registration
    forgetKidDevice();
    return { status: "error" };
  }
  if (data.error === "email_provider_disabled") return { status: "disabled" };
  if (status !== 200 || !data.ok) return { status: "error" };

  const supabase = requireClient();
  const { error } = await supabase.auth.setSession({
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
  });
  if (error) return { status: "error" };

  const member = data.member as { display_name: string };
  sessionStorage.setItem(UNLOCK_FLAG, "1");
  localStorage.setItem(KID_NAME_KEY, member.display_name);
  return { status: "ok", displayName: member.display_name };
}
