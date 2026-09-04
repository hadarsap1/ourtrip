// Add-to-home-screen plumbing.
//
// Chrome fires `beforeinstallprompt` once, seconds after the app shell loads,
// and if nobody calls preventDefault() the browser shows its own mini-infobar
// and the event is gone. A component mounted on /more would almost always miss
// it, so capture starts from the app shell (RegisterSW, rendered in the root
// layout) and the event is parked here until a screen asks for it.
//
// iOS has no such event at all: Safari only offers "Add to Home Screen" from
// the share sheet, which is why the UI falls back to written steps there.

import { isIos, isStandalone } from "@/lib/push";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState = {
  /** A native install dialog is available right now. */
  canPrompt: boolean;
  /** Already running from the home screen, so there is nothing to offer. */
  installed: boolean;
  /** iOS/iPadOS, where installing is a manual share-sheet flow. */
  ios: boolean;
};

const SERVER_STATE: InstallState = {
  canPrompt: false,
  installed: false,
  ios: false,
};

let deferred: BeforeInstallPromptEvent | null = null;
let started = false;
let state: InstallState = SERVER_STATE;
const listeners = new Set<() => void>();

function publish(next: InstallState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** Idempotent: safe to call from every mount of the app shell. */
export function startInstallCapture(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  publish({ canPrompt: false, installed: isStandalone(), ios: isIos() });

  window.addEventListener("beforeinstallprompt", (event) => {
    // Without this the browser shows its own banner and never hands us the
    // event, so the in-app button could never work.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    publish({ ...state, canPrompt: true });
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    publish({ ...state, canPrompt: false, installed: true });
  });
}

export function subscribeInstall(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function installSnapshot(): InstallState {
  return state;
}

export function serverInstallSnapshot(): InstallState {
  return SERVER_STATE;
}

/** Opens the browser's install dialog. The event is single-use: once it has
 *  been prompted the browser will not accept it again, so it is dropped either
 *  way and a declined install simply hides the button until the next visit. */
export async function promptInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = null;
  publish({ ...state, canPrompt: false });
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}
