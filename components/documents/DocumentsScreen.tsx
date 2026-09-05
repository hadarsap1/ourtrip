"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import {
  CheckIcon,
  DocumentIcon,
  DownloadIcon,
  ExternalIcon,
  type IconProps,
  LockIcon,
  PassportIcon,
  PersonIcon,
  SearchIcon,
  ShieldCheckIcon,
  UnlockIcon,
  VaccineIcon,
  VisaIcon,
  WarningIcon,
} from "@/components/icons";
import { getActiveTrip } from "@/lib/data/trip";
import {
  DOCUMENT_TAGS,
  decryptDocument,
  listDocuments,
  listOfflineDocumentIds,
  makeAvailableOffline,
  openDocument,
  protectDocument,
  removeOfflineDocument,
  setDocumentSharedWithKids,
  unprotectDocument,
} from "@/lib/data/documents";
import {
  enrollPasskey,
  getVaultKey,
  hasDocPin,
  isThisDeviceEnrolled,
  isVaultUnlocked,
  listPasskeys,
  lockVault,
  removePasskey,
  type VaultPasskey,
} from "@/lib/data/docPin";
import { isPasskeySupported } from "@/lib/webauthn";
import { formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { ComponentType } from "react";
import type { Document, Trip } from "@/lib/types";
import { DocPinSheet } from "./DocPinSheet";
import { DocumentFormSheet } from "./DocumentFormSheet";

// A document's kind, drawn. A row of identical file icons told you nothing;
// the shape is the fastest thing on the row to read.
const TAG_ICON: Record<string, ComponentType<IconProps>> = {
  passport: PassportIcon,
  insurance: ShieldCheckIcon,
  vaccine: VaccineIcon,
  visa: VisaIcon,
  other: DocumentIcon,
};

export function DocumentsScreen() {
  const { member } = useMember();
  const isKid = member?.role === "kid";
  const [trip, setTrip] = useState<Trip | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState<{ doc: Document | null } | null>(null);

  // Documents PIN / vault state
  const [pinExists, setPinExists] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pinSheet, setPinSheet] = useState<{ mode: "set" | "enter" } | null>(null);
  const [viewer, setViewer] = useState<{ url: string; mime: string } | null>(null);
  const pendingRef = useRef<((key: CryptoKey) => void) | null>(null);

  // Biometric unlock (WebAuthn): which devices are enrolled, and whether this
  // one could enrol at all.
  const [passkeys, setPasskeys] = useState<VaultPasskey[]>([]);
  const [bioSupported, setBioSupported] = useState(false);
  const [thisDeviceEnrolled, setThisDeviceEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    const [nextDocs, ids] = await Promise.all([
      listDocuments(tripId),
      listOfflineDocumentIds(),
    ]);
    setDocs(nextDocs);
    setOfflineIds(new Set(ids));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const activeTrip = await getActiveTrip();
      if (cancelled || !activeTrip) {
        setLoading(false);
        return;
      }
      setTrip(activeTrip);
      try {
        await refresh(activeTrip.id);
        if (!cancelled) {
          setPinExists(await hasDocPin(activeTrip.id));
          setUnlocked(isVaultUnlocked(activeTrip.id));
          setThisDeviceEnrolled(isThisDeviceEnrolled(activeTrip.id));
          setPasskeys(await listPasskeys(activeTrip.id));
          setBioSupported(await isPasskeySupported());
        }
      } catch {
        if (!cancelled) showToast(strings.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, showToast]);

  const refreshNow = useCallback(() => {
    if (!trip) return;
    void refresh(trip.id).catch(() => showToast(strings.common.error));
  }, [trip, refresh, showToast]);

  // Removing a copy needs no key; adding one does. Split here so the vault
  // prompt only appears when it is actually required.
  function toggleOffline(doc: Document) {
    if (busyIds.has(doc.id)) return;
    if (offlineIds.has(doc.id)) {
      void runOffline(doc, null);
      return;
    }
    withKey((key) => void runOffline(doc, key));
  }

  async function runOffline(doc: Document, offlineKey: CryptoKey | null) {
    if (busyIds.has(doc.id)) return;
    setBusyIds((prev) => new Set(prev).add(doc.id));
    try {
      if (offlineIds.has(doc.id)) {
        await removeOfflineDocument(doc.id);
        setOfflineIds((prev) => {
          const next = new Set(prev);
          next.delete(doc.id);
          return next;
        });
        showToast(strings.documents.offlineRemoved);
      } else if (offlineKey) {
        // Every offline copy is now encrypted at rest under the vault key
        // (M2), so saving one needs the vault open. toggleOffline resolves the
        // key before calling; if it somehow did not, do nothing rather than
        // fall back to writing plaintext.
        await makeAvailableOffline(doc, offlineKey);
        setOfflineIds((prev) => new Set(prev).add(doc.id));
        showToast(strings.documents.offlineSaved);
      }
    } catch {
      showToast(strings.common.error);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
    }
  }

  // Online needs no vault key, so try that first and only prompt when the
  // encrypted offline copy turns out to be the only copy available (M2).
  async function handleOpen(doc: Document, key: CryptoKey | null = null) {
    const result = await openDocument(doc, key);
    if (result === "opened") return;
    if (result === "needs-key") {
      withKey((k) => void handleOpen(doc, k));
      return;
    }
    showToast(strings.documents.openFailed);
  }

  async function toggleShareWithKids(doc: Document) {
    try {
      await setDocumentSharedWithKids(doc.id, !doc.shared_with_kids);
      setDocs((prev) =>
        prev.map((d) =>
          d.id === doc.id ? { ...d, shared_with_kids: !doc.shared_with_kids } : d
        )
      );
      showToast(
        doc.shared_with_kids
          ? strings.documents.unsharedWithKids
          : strings.documents.sharedWithKids
      );
    } catch {
      showToast(strings.common.error);
    }
  }

  // Binds this device's authenticator to the vault. Only reachable while the
  // vault is open - the key has to be in memory to be wrapped.
  async function enrollThisDevice() {
    if (!trip || !member || enrolling) return;
    setEnrolling(true);
    try {
      await enrollPasskey(trip.id, member.id);
      setThisDeviceEnrolled(true);
      setPasskeys(await listPasskeys(trip.id));
      showToast(strings.documents.bioEnrollDone);
    } catch (err) {
      const reason = (err as Error).message;
      showToast(
        reason === "prf_unsupported"
          ? strings.documents.bioUnsupported
          : reason === "passkey_cancelled"
            ? strings.documents.bioCancelled
            : strings.common.error
      );
    } finally {
      setEnrolling(false);
    }
  }

  async function removeDevice(id: string) {
    if (!trip) return;
    try {
      await removePasskey(trip.id, id);
      setPasskeys(await listPasskeys(trip.id));
      setThisDeviceEnrolled(isThisDeviceEnrolled(trip.id));
      showToast(strings.documents.bioRemoved);
    } catch {
      showToast(strings.common.error);
    }
  }

  // Runs an action with the vault key, prompting for the passphrase (or a
  // biometric) first if locked.
  function withKey(action: (key: CryptoKey) => void) {
    if (!trip) return;
    const key = getVaultKey(trip.id);
    if (key) {
      action(key);
      return;
    }
    pendingRef.current = action;
    setPinSheet({ mode: pinExists ? "enter" : "set" });
  }

  async function runDoc(fn: () => Promise<void>, message: string) {
    if (!trip) return;
    try {
      await fn();
      await refresh(trip.id);
      showToast(message);
    } catch {
      showToast(strings.common.error);
    }
  }

  function toggleLock(doc: Document) {
    withKey((key) =>
      void runDoc(
        () =>
          doc.pin_protected
            ? unprotectDocument(doc, key)
            : protectDocument(doc, key),
        doc.pin_protected ? strings.documents.unlocked : strings.documents.locked
      )
    );
  }

  function openDoc(doc: Document) {
    if (!doc.pin_protected) {
      void handleOpen(doc);
      return;
    }
    showToast(strings.documents.unlocking);
    withKey((key) =>
      void (async () => {
        const blob = await decryptDocument(doc, key);
        if (!blob) {
          showToast(strings.documents.openFailed);
          return;
        }
        setViewer({ url: URL.createObjectURL(blob), mime: blob.type });
      })()
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const visible = docs.filter((doc) => {
    if (tagFilter && doc.tag !== tagFilter) return false;
    if (!query) return true;
    return (
      doc.title.toLowerCase().includes(query) ||
      (doc.notes ?? "").toLowerCase().includes(query) ||
      (strings.documents.tags[doc.tag] ?? doc.tag).toLowerCase().includes(query)
    );
  });

  // Counts on the chips, so you know whether there is anything under a filter
  // before tapping it.
  const countByTag = new Map<string, number>();
  for (const doc of docs) {
    countByTag.set(doc.tag, (countByTag.get(doc.tag) ?? 0) + 1);
  }

  // The screen's most valuable block: documents that lapse before the trip
  // ends. Compared against the trip's own end date, so it means "this will
  // expire while we are away" rather than "this expired".
  const expiring = trip?.end_date
    ? docs
        .filter((d) => d.expires_at && d.expires_at <= trip.end_date!)
        .sort((a, b) => (a.expires_at ?? "").localeCompare(b.expires_at ?? ""))
    : [];
  const soonest = expiring[0] ?? null;
  const offlineCount = docs.filter((d) => offlineIds.has(d.id)).length;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-lg flex-col gap-3 px-4 pt-4 pb-8 sm:max-w-2xl lg:max-w-4xl">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-[22px] font-extrabold text-ink">
          {isKid ? strings.documents.kidTitle : strings.nav.documents}
        </h1>
        {/* The PIN is reassurance, not only a challenge - say the vault is
            protected on the way in, not just when it blocks you. */}
        {!isKid && pinExists && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-sea-tint px-2.5 py-1 text-[11px] font-bold text-sea-deep">
            <LockIcon className="h-3 w-3" />
            {strings.documents.pinBadge}
          </span>
        )}
      </header>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[17px] w-[17px] text-ink-faint" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={strings.documents.searchFull}
          className="w-full rounded-[14px] border border-line bg-white py-[11px] pe-3.5 ps-10 text-base placeholder:text-ink-faint focus:border-sea focus:outline-none"
        />
      </div>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <button
          type="button"
          onClick={() => setTagFilter(null)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold ${
            tagFilter === null
              ? "bg-sea-deep text-white"
              : "bg-paper-deep text-ink-soft"
          }`}
        >
          {strings.documents.allTags} {docs.length}
        </button>
        {DOCUMENT_TAGS.map((tag) => {
          const count = countByTag.get(tag) ?? 0;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold ${
                tagFilter === tag
                  ? "bg-sea-deep text-white"
                  : "bg-paper-deep text-ink-soft"
              }`}
            >
              {strings.documents.tags[tag]}
              {count > 0 && ` ${count}`}
            </button>
          );
        })}
      </div>

      {soonest && trip?.end_date && (
        <div className="flex items-start gap-2.5 rounded-[16px] bg-sun-tint px-3.5 py-3">
          <WarningIcon className="mt-px h-[18px] w-[18px] shrink-0 text-sun-deep" />
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold text-sun-deep">
              {strings.documents.expiryWarnTitle.replace(
                "{title}",
                soonest.title
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-sun-deep/85">
              {strings.documents.expiryWarnBody
                .replace("{expiry}", formatDate(soonest.expires_at!))
                .replace("{end}", formatDate(trip.end_date))}
              {expiring.length > 1 &&
                ` · ${strings.documents.expiryWarnMore.replace(
                  "{n}",
                  String(expiring.length - 1)
                )}`}
            </p>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-[20px] border border-dashed border-line bg-white p-8 text-center text-sm text-ink-faint">
          {docs.length === 0
            ? isKid
              ? strings.documents.kidEmpty
              : strings.documents.empty
            : strings.documents.noResults}
        </p>
      ) : (
        <section className="overflow-hidden rounded-[18px] border border-line bg-white">
          <header className="flex items-center justify-between bg-paper-deep px-3.5 py-2.5">
            <h2 className="text-xs font-bold text-ink">
              {strings.documents.offlineHeader}
            </h2>
            <span className="text-[10.5px] text-ink-soft">
              {strings.documents.offlineCount
                .replace("{n}", String(offlineCount))
                .replace("{total}", String(docs.length))}
            </span>
          </header>
          <ul>
            {visible.map((doc) => {
              const isOffline = offlineIds.has(doc.id);
              const busy = busyIds.has(doc.id);
              const expires = Boolean(
                doc.expires_at && trip?.end_date && doc.expires_at <= trip.end_date
              );
              const TagIcon = TAG_ICON[doc.tag] ?? DocumentIcon;
              return (
                <li
                  key={doc.id}
                  className="flex items-center gap-2.5 border-t border-line px-3.5 py-2.5"
                >
                  <span
                    className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] ${
                      expires
                        ? "bg-sun-tint text-sun-deep"
                        : "bg-sea-tint text-sea-deep"
                    }`}
                  >
                    <TagIcon className="h-[17px] w-[17px]" strokeWidth={1.7} />
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      isKid ? void handleOpen(doc) : setForm({ doc })
                    }
                    className="min-w-0 flex-1 text-start"
                  >
                    <span className="flex items-center gap-1">
                      {doc.pin_protected && (
                        <LockIcon
                          className="h-3 w-3 shrink-0 text-ink-soft"
                          aria-label={strings.documents.lockedBadge}
                        />
                      )}
                      {doc.shared_with_kids && (
                        <PersonIcon
                          className="h-3 w-3 shrink-0 text-sea"
                          aria-label={strings.documents.sharedBadge}
                        />
                      )}
                      <span className="truncate text-[13.5px] font-semibold text-ink">
                        {doc.title}
                      </span>
                    </span>
                    <span
                      className={`block truncate text-[10.5px] ${
                        expires ? "font-semibold text-sun-deep" : "text-ink-soft"
                      }`}
                    >
                      {strings.documents.tags[doc.tag] ?? doc.tag}
                      {doc.expires_at
                        ? ` · ${strings.documents.expiresOn.replace(
                            "{date}",
                            formatDate(doc.expires_at)
                          )}`
                        : doc.notes
                          ? ` · ${doc.notes}`
                          : ""}
                    </span>
                  </button>

                  {!isKid && (
                    <button
                      type="button"
                      onClick={() => toggleLock(doc)}
                      aria-label={strings.documents.lock}
                      aria-pressed={doc.pin_protected}
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                        doc.pin_protected
                          ? "bg-alert-tint text-alert"
                          : "bg-paper-deep text-ink-faint"
                      }`}
                    >
                      {doc.pin_protected ? (
                        <LockIcon className="h-[15px] w-[15px]" />
                      ) : (
                        <UnlockIcon className="h-[15px] w-[15px]" />
                      )}
                    </button>
                  )}
                  {!isKid && !doc.pin_protected && (
                    <button
                      type="button"
                      onClick={() => void toggleShareWithKids(doc)}
                      aria-label={strings.documents.shareWithKids}
                      aria-pressed={doc.shared_with_kids}
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                        doc.shared_with_kids
                          ? "bg-sun-tint text-sun-deep"
                          : "bg-paper-deep text-ink-faint"
                      }`}
                    >
                      <PersonIcon className="h-[15px] w-[15px]" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void toggleOffline(doc)}
                    disabled={busy}
                    aria-label={strings.documents.offlineToggle}
                    aria-pressed={isOffline}
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg disabled:opacity-40 ${
                      isOffline
                        ? "bg-sea-tint text-sea"
                        : "bg-paper-deep text-ink-faint"
                    }`}
                  >
                    {isOffline ? (
                      <CheckIcon className="h-[15px] w-[15px]" />
                    ) : (
                      <DownloadIcon className="h-[15px] w-[15px]" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => openDoc(doc)}
                    aria-label={strings.documents.open}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-paper-deep text-ink-faint hover:bg-line"
                  >
                    <ExternalIcon className="h-[15px] w-[15px]" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!isKid && (
        <button
          type="button"
          onClick={() => setForm({ doc: null })}
          className="w-full rounded-2xl bg-sea py-3 text-sm font-bold text-white active:bg-sea-deep"
          style={{ boxShadow: "0 10px 22px -14px rgba(14,124,107,.7)" }}
        >
          {strings.documents.upload}
        </button>
      )}

      {!isKid && pinExists && unlocked && (
        <>
          {/* Enrolling needs the key in memory, so it lives behind the unlock. */}
          {bioSupported && !thisDeviceEnrolled && (
            <div className="rounded-2xl border border-line bg-white p-4">
              <h3 className="mb-1 font-semibold text-ink">
                {strings.documents.bioEnrollTitle}
              </h3>
              <p className="mb-3 text-sm text-ink-soft">
                {strings.documents.bioEnrollBody}
              </p>
              <button
                type="button"
                disabled={enrolling}
                onClick={() => void enrollThisDevice()}
                className="w-full rounded-xl bg-sea py-2.5 font-semibold text-white disabled:opacity-50"
              >
                {strings.documents.bioEnroll}
              </button>
            </div>
          )}

          {passkeys.length > 0 && (
            <div className="rounded-2xl border border-line bg-white p-4">
              <h3 className="mb-2 font-semibold text-ink">
                {strings.documents.bioDevicesTitle}
              </h3>
              <ul className="space-y-2">
                {passkeys.map((pk) => (
                  <li
                    key={pk.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">
                        {pk.label}
                      </span>
                      <span className="block text-xs text-ink-soft">
                        {pk.lastUsedAt
                          ? `${strings.documents.bioLastUsed} ${formatDate(
                              pk.lastUsedAt.slice(0, 10)
                            )}`
                          : strings.documents.bioNeverUsed}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeDevice(pk.id)}
                      className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-alert"
                    >
                      {strings.documents.bioRemove}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              lockVault();
              setUnlocked(false);
            }}
            className="flex w-full items-center justify-center gap-1.5 text-sm font-bold text-ink-soft"
          >
            <LockIcon className="h-4 w-4" />
            {strings.documents.lockNow}
          </button>
        </>
      )}

      {trip && !isKid && (
        <DocumentFormSheet
          open={form !== null}
          tripId={trip.id}
          doc={form?.doc ?? null}
          onClose={() => setForm(null)}
          onDone={() => {
            setForm(null);
            refreshNow();
          }}
          onError={() => showToast(strings.common.error)}
        />
      )}

      {trip && pinSheet && (
        <DocPinSheet
          mode={pinSheet.mode}
          tripId={trip.id}
          hasPasskeys={passkeys.length > 0}
          onClose={() => {
            pendingRef.current = null;
            setPinSheet(null);
          }}
          onUnlocked={() => {
            setPinSheet(null);
            setPinExists(true);
            setUnlocked(true);
            void listPasskeys(trip.id).then(setPasskeys);
            const key = trip ? getVaultKey(trip.id) : null;
            const action = pendingRef.current;
            pendingRef.current = null;
            if (key && action) action(key);
          }}
        />
      )}

      {viewer && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black/90">
          <div className="flex justify-end p-3">
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(viewer.url);
                setViewer(null);
              }}
              className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-ink"
            >
              {strings.documents.viewerClose}
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {viewer.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- decrypted blob URL
              <img
                src={viewer.url}
                alt=""
                className="mx-auto max-h-full max-w-full object-contain"
              />
            ) : (
              <iframe src={viewer.url} title="document" className="h-full w-full rounded-lg bg-white" />
            )}
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
