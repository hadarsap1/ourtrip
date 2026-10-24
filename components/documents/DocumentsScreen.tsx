"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { askConfirm } from "@/components/ConfirmSheet";
import {
  CheckIcon,
  ChevronDownIcon,
  DocumentIcon,
  DownloadIcon,
  ExternalIcon,
  type IconProps,
  LockIcon,
  MoreIcon,
  PassportIcon,
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
  listDocuments,
  listOfflineDocumentIds,
  makeAvailableOffline,
  getPlainDocument,
  documentDetailsText,
  protectDocument,
  removeOfflineDocument,
  unprotectDocument,
} from "@/lib/data/documents";
import {
  enrollPasskey,
  getVaultKey,
  hasDocPin,
  hasLocalDocPin,
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
import { documentFileName } from "@/lib/docMime";
import { ScreenSkeleton } from "@/components/ui/Skeleton";
import { isEnabled } from "@/lib/flags";
import { useOfflineStatus } from "@/components/OfflineBanner";
import {
  isStoragePersisted,
  planDocSync,
  requestPersistentStorage,
  type DocSyncStatus,
} from "@/lib/offline/docSync";
import { useMember } from "@/lib/useMember";
import { vaultStatus, type VaultStatus } from "@/lib/data/vaultStatus";
import type { ComponentType } from "react";
import type { Document, Trip } from "@/lib/types";
import { offlineNow, withTimeout } from "@/lib/offline/network";
import { queryKeys, readQuery, writeQuery } from "@/lib/offline/queryCache";
import { storedAuthUserId } from "@/lib/supabase";
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

const NETWORK_MS = 8000;

export function DocumentsScreen() {
  const { member } = useMember();
  const isKid = member?.role === "kid";
  const [trip, setTrip] = useState<Trip | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [openingId, setOpeningId] = useState<string | null>(null);
  // F1: per-file download status and whether storage is persistent.
  const [syncStatus, setSyncStatus] = useState<Record<string, DocSyncStatus>>({});
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const syncingRef = useRef(false);
  const { online } = useOfflineStatus();
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState<{ doc: Document | null; tag?: string; camera?: boolean } | null>(null);

  // Documents PIN / vault state
  const [pinExists, setPinExists] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pinSheet, setPinSheet] = useState<{ mode: "set" | "enter"; reason?: string } | null>(null);
  const [lockingIds, setLockingIds] = useState<Set<string>>(new Set());
  const [lockProgress, setLockProgress] = useState<{ done: number; total: number } | null>(null);
  const [viewer, setViewer] = useState<{ url: string; mime: string; file: File } | null>(null);
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

  // Offline (F1): the list itself is kept on the device per signed-in user
  // (titles, tags, expiry; never notes or file contents), so the
  // screen opens with no network and the offline copies stay reachable.
  const cacheKeyRef = useRef<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const refresh = useCallback(async (tripId: string) => {
    if (offlineNow()) throw new Error("offline");
    const [nextDocs, ids] = await Promise.all([
      withTimeout(listDocuments(tripId), NETWORK_MS),
      listOfflineDocumentIds(),
    ]);
    setDocs(nextDocs);
    setOfflineIds(new Set(ids));
    setFromCache(false);
    // Notes can hold a passport or policy number: they never go into the
    // device copy, which is not encrypted. Offline the list shows without them.
    if (cacheKeyRef.current) void writeQuery(cacheKeyRef.current, nextDocs.map((d) => ({ ...d, notes: null })));
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
      // From the login saved on this phone: works offline, also after the
      // access token expired (getSession() then reports no session).
      const uid = storedAuthUserId();
      cacheKeyRef.current = uid ? `${queryKeys.documents(activeTrip.id)}:${uid}` : null;
      // Known locally first, so an offline open still knows a PIN exists.
      setPinExists(hasLocalDocPin(activeTrip.id));
      setUnlocked(isVaultUnlocked(activeTrip.id));
      setThisDeviceEnrolled(isThisDeviceEnrolled(activeTrip.id));
      try {
        await refresh(activeTrip.id);
      } catch {
        const cached = cacheKeyRef.current ? await readQuery<Document[]>(cacheKeyRef.current) : null;
        if (cancelled) return;
        if (cached) {
          setDocs(cached.data);
          setOfflineIds(new Set(await listOfflineDocumentIds()));
          setFromCache(true);
        } else if (!offlineNow()) {
          showToast(strings.common.error);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
      // Online extras - never block the list.
      void withTimeout(hasDocPin(activeTrip.id), NETWORK_MS)
        .then((v) => !cancelled && setPinExists(v))
        .catch(() => {});
      void withTimeout(listPasskeys(activeTrip.id), NETWORK_MS)
        .then((v) => !cancelled && setPasskeys(v))
        .catch(() => {});
      void isPasskeySupported()
        .then((v) => !cancelled && setBioSupported(v))
        .catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, showToast]);

  const refreshNow = useCallback(() => {
    if (!trip) return;
    void refresh(trip.id).catch(() => showToast(strings.common.error));
  }, [trip, refresh, showToast]);

  // F1: download every document that can be stored right now (PIN files need
  // no key; the rest need the vault open), one at a time, then ask for
  // persistent storage after the first success.
  const syncAll = useCallback(
    async (key: CryptoKey | null) => {
      if (syncingRef.current || !navigator.onLine) return;
      syncingRef.current = true;
      try {
        const { fetch, locked } = planDocSync(docs, offlineIds, Boolean(key));
        setSyncStatus((prev) => {
          const next = { ...prev };
          for (const d of locked) next[d.id] = { state: "locked" };
          for (const d of fetch) next[d.id] = { state: "queued" };
          return next;
        });
        let landed = 0;
        for (const doc of fetch) {
          setSyncStatus((prev) => ({ ...prev, [doc.id]: { state: "downloading", pct: 0 } }));
          try {
            await makeAvailableOffline(doc, key, (pct) =>
              setSyncStatus((prev) => ({ ...prev, [doc.id]: { state: "downloading", pct } }))
            );
            landed++;
            setOfflineIds((prev) => new Set(prev).add(doc.id));
            setSyncStatus((prev) => ({ ...prev, [doc.id]: { state: "ready" } }));
          } catch {
            setSyncStatus((prev) => ({ ...prev, [doc.id]: { state: "failed" } }));
          }
        }
        if (landed > 0 || offlineIds.size > 0) setPersisted((await requestPersistentStorage()) === "persisted");
      } finally {
        syncingRef.current = false;
      }
    },
    [docs, offlineIds]
  );

  // FAB "סריקה" lands here with ?scan=1: open the upload with the camera.
  useEffect(() => {
    if (!trip || isKid) return;
    if (new URLSearchParams(window.location.search).get("scan") !== "1") return;
    window.history.replaceState(null, "", window.location.pathname);
    const t = setTimeout(() => setForm({ doc: null, camera: true }), 0);
    return () => clearTimeout(t);
  }, [trip, isKid]);

  // Runs on open, when the vault unlocks and when the connection returns.
  // Back online after an offline open: swap the device copy for the live list.
  useEffect(() => {
    if (!trip || !online || !fromCache) return;
    const t = setTimeout(() => void refresh(trip.id).catch(() => {}), 0);
    return () => clearTimeout(t);
  }, [trip, online, fromCache, refresh]);

  // Owners only: kid devices never auto-download (they see few documents and
  // the tablet is shared).
  useEffect(() => {
    if (!trip || isKid || !online || docs.length === 0 || !isEnabled("documentsAutoDownload")) return;
    const key = getVaultKey(trip.id);
    const t = setTimeout(() => void syncAll(key), 0);
    return () => clearTimeout(t);
    // syncAll changes with offlineIds as files land; the ref guard keeps one run.
  }, [trip, isKid, online, docs.length, unlocked, syncAll]);

  useEffect(() => {
    let alive = true;
    void isStoragePersisted().then((p) => alive && setPersisted(p));
    return () => {
      alive = false;
    };
  }, []);

  // Removing a copy needs no key; adding one does. Split here so the vault
  // prompt only appears when it is actually required.
  function toggleOffline(doc: Document) {
    if (busyIds.has(doc.id)) return;
    if (offlineIds.has(doc.id)) {
      void runOffline(doc, null);
      return;
    }
    withKey((key) => void runOffline(doc, key), "download");
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
  // Every document opens in the in-app viewer as a blob labelled with its real
  // type; handing the phone a raw Storage link or an unlabelled blob is what
  // made files arrive as "unknown".
  // Downloading and decrypting a passport takes a few seconds on a phone, so
  // the row says so; and a failure says why instead of doing nothing.
  async function handleOpen(doc: Document, key: CryptoKey | null = null) {
    setOpeningId(doc.id);
    try {
      const result = await getPlainDocument(doc, key ?? (trip ? getVaultKey(trip.id) : null));
      if (result === "needs-key") {
        withKey((k) => void handleOpen(doc, k), "open");
        return;
      }
      if (!result) {
        showToast(strings.documents.openFailed);
        return;
      }
      const file = new File([result], documentFileName(doc.title, result.type), {
        type: result.type,
      });
      setViewer({ url: URL.createObjectURL(file), mime: file.type, file });
    } catch (err) {
      const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      showToast(strings.documents.openError.replace("{reason}", reason));
    } finally {
      setOpeningId((id) => (id === doc.id ? null : id));
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
  // `purpose` picks the one line that tells you why the passphrase is asked.
  function withKey(action: (key: CryptoKey) => void, purpose?: string) {
    if (!trip) return;
    const key = getVaultKey(trip.id);
    if (key) {
      action(key);
      return;
    }
    pendingRef.current = action;
    setPinSheet({
      mode: pinExists ? "enter" : "set",
      reason: purpose ? strings.documents.pinReason[purpose] : undefined,
    });
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

  // 1.4: share through the phone's own share sheet (works offline from the
  // device copy). The app itself never uploads the file anywhere.
  async function shareDoc(doc: Document, key: CryptoKey | null = null) {
    const result = await getPlainDocument(doc, key ?? (trip ? getVaultKey(trip.id) : null));
    if (result === "needs-key") {
      withKey((k) => void shareDoc(doc, k), "share");
      return;
    }
    if (!result) {
      showToast(strings.documents.openFailed);
      return;
    }
    await shareFile(
      new File([result], documentFileName(doc.title, result.type), { type: result.type })
    );
  }

  async function copyDoc(doc: Document) {
    const text = documentDetailsText(doc, strings.documents.tags[doc.tag] ?? doc.tag, (d) =>
      strings.documents.expiresOn.replace("{date}", formatDate(d))
    );
    try {
      await navigator.clipboard.writeText(text);
      showToast(strings.documents.copied);
    } catch {
      showToast(strings.common.error);
    }
  }

  // Locking and unlocking both rewrite the stored file and drop the old device
  // copy. Put a fresh copy straight back, so "on the device" does not quietly
  // flip off the moment you lock something.
  async function setLocked(doc: Document, lock: boolean, key: CryptoKey) {
    setLockingIds((prev) => new Set(prev).add(doc.id));
    try {
      if (lock) await protectDocument(doc, key);
      else await unprotectDocument(doc, key);
      setOfflineIds((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
      try {
        await makeAvailableOffline({ ...doc, pin_protected: lock }, key);
        setOfflineIds((prev) => new Set(prev).add(doc.id));
      } catch {
        // The automatic download retries it on the next open.
      }
    } finally {
      setLockingIds((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
    }
  }

  async function toggleLock(doc: Document) {
    if (lockingIds.has(doc.id) || lockProgress) return;
    const unlocking = doc.pin_protected;
    if (unlocking && !(await askConfirm(strings.documents.unlockConfirm))) return;
    withKey(
      (key) =>
        void runDoc(
          () => setLocked(doc, !unlocking, key),
          unlocking ? strings.documents.unlocked : strings.documents.locked
        ),
      unlocking ? "unlock" : "lock"
    );
  }

  // One at a time, like the downloads: a weak connection should not choke on
  // several uploads at once, and the card can count them off.
  function lockAll() {
    const todo = docs.filter((d) => !d.pin_protected);
    if (todo.length === 0 || lockProgress) return;
    withKey(
      (key) =>
        void (async () => {
          let failed = false;
          setLockProgress({ done: 0, total: todo.length });
          for (const [i, doc] of todo.entries()) {
            try {
              await setLocked(doc, true, key);
            } catch {
              failed = true;
            }
            setLockProgress({ done: i + 1, total: todo.length });
          }
          setLockProgress(null);
          if (trip) await refresh(trip.id).catch(() => {});
          showToast(failed ? strings.common.error : strings.documents.lockedAll);
        })(),
      "lockAll"
    );
  }

  function downloadAll() {
    if (!trip) return;
    // Locked files are stored as their own ciphertext and need no passphrase;
    // only ask when an unlocked one is still missing.
    const { locked } = planDocSync(docs, offlineIds, false);
    if (locked.length === 0) void syncAll(getVaultKey(trip.id));
    else withKey((key) => void syncAll(key), "download");
  }

  function openDoc(doc: Document) {
    if (openingId === doc.id) return;
    if (!doc.pin_protected) {
      void handleOpen(doc);
      return;
    }
    withKey((key) => void handleOpen(doc, key), "open");
  }

  if (loading) {
    return <ScreenSkeleton variant="list" />;
  }

  const s = strings.documents;
  const query = search.trim().toLowerCase();
  const visible = docs.filter((doc) => {
    if (tagFilter && doc.tag !== tagFilter) return false;
    if (!query) return true;
    return (
      doc.title.toLowerCase().includes(query) ||
      (doc.notes ?? "").toLowerCase().includes(query) ||
      (s.tags[doc.tag] ?? doc.tag).toLowerCase().includes(query)
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
  const status = vaultStatus(docs, offlineIds);
  const syncing = Object.values(syncStatus).some((x) => x.state === "downloading" || x.state === "queued");
  const waitingCount = Object.values(syncStatus).filter((x) => x.state === "locked").length;
  // The sheet follows the live row, so a lock done from inside it shows at once.
  const formDoc = form?.doc ? (docs.find((d) => d.id === form.doc!.id) ?? form.doc) : null;

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col gap-3 px-4 pt-4 pb-8 sm:max-w-2xl lg:max-w-4xl">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-[22px] font-extrabold text-ink">
          {isKid ? s.kidTitle : strings.nav.documents}
        </h1>
        {!isKid && status.locked > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-bold text-success">
            <LockIcon className="h-3 w-3" />
            {s.lockedCountBadge.replace("{n}", String(status.locked))}
          </span>
        )}
      </header>

      {fromCache && (
        <p className="rounded-[12px] bg-paper-deep px-3 py-2 text-[12px] font-semibold text-ink-soft">
          {strings.offline.fromCache}
        </p>
      )}

      {!isKid && docs.length > 0 && (
        <VaultStatusCard
          status={status}
          syncing={syncing}
          waitingCount={waitingCount}
          persisted={persisted}
          online={online}
          lockProgress={lockProgress}
          vaultOpen={unlocked}
          autoDownload={isEnabled("documentsAutoDownload")}
          onLockAll={lockAll}
          onDownloadAll={downloadAll}
          onCloseVault={() => {
            lockVault();
            setUnlocked(false);
          }}
        />
      )}

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[17px] w-[17px] text-ink-faint" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={s.searchFull}
          className="w-full rounded-[14px] border border-line bg-surface py-[11px] pe-3.5 ps-10 text-base placeholder:text-ink-faint focus:border-sea focus:outline-none"
        />
      </div>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <button
          type="button"
          onClick={() => setTagFilter(null)}
          className={`min-h-[44px] shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold ${
            tagFilter === null
              ? "bg-sea-deep text-on-sea"
              : "bg-paper-deep text-ink-soft"
          }`}
        >
          {s.allTags} {docs.length}
        </button>
        {DOCUMENT_TAGS.map((tag) => {
          const count = countByTag.get(tag) ?? 0;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className={`min-h-[44px] shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold ${
                tagFilter === tag
                  ? "bg-sea-deep text-on-sea"
                  : "bg-paper-deep text-ink-soft"
              }`}
            >
              {s.tags[tag]}
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
              {s.expiryWarnTitle.replace("{title}", soonest.title)}
            </p>
            <p className="mt-0.5 text-[12px] text-sun-deep/85">
              {s.expiryWarnBody
                .replace("{expiry}", formatDate(soonest.expires_at!))
                .replace("{end}", formatDate(trip.end_date))}
              {expiring.length > 1 &&
                ` · ${s.expiryWarnMore.replace("{n}", String(expiring.length - 1))}`}
            </p>
          </div>
        </div>
      )}

      {!isKid && !docs.some((d) => d.tag === "insurance") && (
        <section aria-labelledby="ins-missing" className="flex items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-alert/40 bg-alert-tint p-4">
          <WarningIcon className="h-6 w-6 shrink-0 text-alert" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span id="ins-missing" className="text-sm font-bold text-ink">{s.insuranceMissing}</span>
            <span className="text-xs text-ink-soft">{s.insuranceMissingHint}</span>
          </span>
          <button type="button" onClick={() => setForm({ doc: null, tag: "insurance" })} className="min-h-[44px] shrink-0 rounded-xl border-[1.5px] border-sea bg-surface px-3 text-sm font-bold text-sea">
            {s.insuranceUpload}
          </button>
        </section>
      )}
      {visible.length === 0 ? (
        <p className="rounded-[20px] border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-faint">
          {docs.length === 0 ? (isKid ? s.kidEmpty : s.empty) : s.noResults}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-[18px] border border-line bg-surface">
          {visible.map((doc, i) => {
            const expires = Boolean(doc.expires_at && trip?.end_date && doc.expires_at <= trip.end_date);
            const TagIcon = TAG_ICON[doc.tag] ?? DocumentIcon;
            return (
              <li key={doc.id} className={`flex items-center gap-1 ps-3.5 pe-1 ${i > 0 ? "border-t border-line" : ""}`}>
                {/* The whole row opens the document; everything else about it
                    lives one tap away, in its sheet. */}
                <button
                  type="button"
                  onClick={() => openDoc(doc)}
                  aria-label={`${s.open}: ${doc.title}`}
                  className="flex min-h-[64px] min-w-0 flex-1 items-center gap-2.5 py-2.5 text-start"
                >
                  <span
                    className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] ${
                      expires ? "bg-sun-tint text-sun-deep" : "bg-paper-deep text-ink-soft"
                    }`}
                  >
                    <TagIcon className="h-[17px] w-[17px]" strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{doc.title}</span>
                    {openingId === doc.id && (
                      <span className="block text-[12px] font-semibold text-sea" role="status">
                        {s.opening}
                      </span>
                    )}
                    <span className={`block truncate text-[12px] ${expires ? "font-semibold text-sun-deep" : "text-ink-soft"}`}>
                      {s.tags[doc.tag] ?? doc.tag}
                      {doc.expires_at && (
                        <span
                          className={`ms-1.5 inline-flex rounded-full px-1.5 text-[12px] font-bold ${
                            expires ? "bg-warning-soft text-warning" : "bg-paper-deep text-ink-soft"
                          }`}
                        >
                          {(expires ? s.expiryChipSoon : s.expiryChip).replace(
                            "{mmyyyy}",
                            `${doc.expires_at.slice(5, 7)}/${doc.expires_at.slice(0, 4)}`
                          )}
                        </span>
                      )}
                    </span>
                    {!isKid && (
                      <RowStatus
                        locked={doc.pin_protected}
                        locking={lockingIds.has(doc.id)}
                        onDevice={offlineIds.has(doc.id)}
                        sync={syncStatus[doc.id]}
                      />
                    )}
                  </span>
                </button>
                {!isKid && (
                  <button
                    type="button"
                    onClick={() => setForm({ doc })}
                    aria-label={`${s.details}: ${doc.title}`}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-soft hover:bg-paper-deep"
                  >
                    <MoreIcon className="h-5 w-5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!isKid && (
        <button
          type="button"
          onClick={() => setForm({ doc: null })}
          className="w-full rounded-2xl bg-sea py-3 text-sm font-bold text-on-sea active:bg-sea-deep"
          style={{ boxShadow: "0 10px 22px -14px rgba(78,107,69,.7)" }}
        >
          {s.upload}
        </button>
      )}

      {/* Enrolling needs the key in memory, so it lives behind the unlock. */}
      {!isKid && pinExists && unlocked && bioSupported && !thisDeviceEnrolled && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <h3 className="mb-1 font-semibold text-ink">{s.bioEnrollTitle}</h3>
          <p className="mb-3 text-sm text-ink-soft">{s.bioEnrollBody}</p>
          <button
            type="button"
            disabled={enrolling}
            onClick={() => void enrollThisDevice()}
            className="w-full rounded-xl bg-sea py-2.5 font-semibold text-on-sea disabled:opacity-50"
          >
            {s.bioEnroll}
          </button>
        </div>
      )}

      {!isKid && pinExists && unlocked && passkeys.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <h3 className="mb-2 font-semibold text-ink">{s.bioDevicesTitle}</h3>
          <ul className="space-y-2">
            {passkeys.map((pk) => (
              <li key={pk.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{pk.label}</span>
                  <span className="block text-xs text-ink-soft">
                    {pk.lastUsedAt
                      ? `${s.bioLastUsed} ${formatDate(pk.lastUsedAt.slice(0, 10))}`
                      : s.bioNeverUsed}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void removeDevice(pk.id)}
                  className="min-h-[44px] shrink-0 rounded-lg border border-line px-3 text-xs font-medium text-alert"
                >
                  {s.bioRemove}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {trip && !isKid && (
        <DocumentFormSheet
          open={form !== null}
          tripId={trip.id}
          doc={formDoc}
          initialTag={form?.tag}
          camera={form?.camera}
          onShare={(d) => void shareDoc(d)}
          onCopy={(d) => void copyDoc(d)}
          onClose={() => setForm(null)}
          onDone={() => {
            setForm(null);
            refreshNow();
          }}
          onError={() => showToast(strings.common.error)}
          status={
            formDoc && (
              <DocStatusPanel
                locked={formDoc.pin_protected}
                locking={lockingIds.has(formDoc.id) || lockProgress !== null}
                onDevice={offlineIds.has(formDoc.id)}
                deviceBusy={busyIds.has(formDoc.id)}
                online={online}
                onOpen={() => openDoc(formDoc)}
                onToggleLock={() => void toggleLock(formDoc)}
                onToggleDevice={() => toggleOffline(formDoc)}
              />
            )
          }
        />
      )}

      {trip && pinSheet && (
        <DocPinSheet
          mode={pinSheet.mode}
          tripId={trip.id}
          hasPasskeys={passkeys.length > 0}
          reason={pinSheet.reason}
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
          <div className="flex justify-between gap-2 p-3">
            <button
              type="button"
              onClick={() => void shareFile(viewer.file)}
              className="min-h-[44px] rounded-full bg-sea px-4 py-2 text-sm font-semibold text-on-sea"
            >
              {s.viewerShare}
            </button>
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(viewer.url);
                setViewer(null);
              }}
              className="min-h-[44px] rounded-full bg-surface/90 px-4 py-2 text-sm font-semibold text-ink"
            >
              {s.viewerClose}
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {viewer.mime.startsWith("image/") && viewer.mime !== "image/heic" && viewer.mime !== "image/heif" ? (
              // eslint-disable-next-line @next/next/no-img-element -- decrypted blob URL
              <img
                src={viewer.url}
                alt=""
                className="mx-auto max-h-full max-w-full object-contain"
              />
            ) : viewer.mime === "application/pdf" && canShowPdfInline() ? (
              <iframe src={viewer.url} title="document" className="h-full w-full rounded-lg bg-surface" />
            ) : (
              // Android Chrome has no built-in PDF viewer: an iframe there
              // silently downloads the blob with no name or extension. Save it
              // under its real name instead, so the phone's own viewer opens it.
              <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-4 rounded-2xl bg-surface p-6 text-center">
                <p className="text-sm text-ink">{s.viewerNoPreview}</p>
                <a
                  href={viewer.url}
                  download={viewer.file.name}
                  className="min-h-[44px] rounded-full bg-sea px-5 py-2.5 text-sm font-semibold text-on-sea"
                >
                  {s.viewerSave}
                </a>
                <p className="break-all text-xs text-ink-muted" dir="auto">{viewer.file.name}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}

/**
 * The answer to "can we relax about the documents": ready once every file is
 * locked and on this device, otherwise the two checks with what is missing
 * and the button that fixes it.
 */
function VaultStatusCard({
  status,
  syncing,
  waitingCount,
  persisted,
  online,
  lockProgress,
  vaultOpen,
  autoDownload,
  onLockAll,
  onDownloadAll,
  onCloseVault,
}: {
  status: VaultStatus;
  syncing: boolean;
  waitingCount: number;
  persisted: boolean | null;
  online: boolean;
  lockProgress: { done: number; total: number } | null;
  vaultOpen: boolean;
  autoDownload: boolean;
  onLockAll: () => void;
  onDownloadAll: () => void;
  onCloseVault: () => void;
}) {
  const s = strings.documents;
  const lockLine = s.statusLocked.replace("{n}", String(status.locked)).replace("{total}", String(status.total));
  const deviceLine = s.statusOnDevice.replace("{n}", String(status.onDevice)).replace("{total}", String(status.total));
  const action = "min-h-[44px] shrink-0 rounded-xl bg-sea px-3.5 text-sm font-bold text-on-sea disabled:bg-paper-deep disabled:text-ink-soft";
  const deviceHint = syncing
    ? s.syncingNow
    : waitingCount > 0
      ? s.lockedHint.replace("{n}", String(waitingCount))
      : status.onDevice > 0 && persisted === false
        ? s.notPersisted
        : null;

  return (
    <section
      role="status"
      aria-live="polite"
      className={`rounded-2xl border p-4 ${status.ready ? "border-success/30 bg-success-soft" : "border-line bg-surface"}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
            status.ready ? "bg-success text-on-sea" : "bg-sun-tint text-sun-deep"
          }`}
        >
          {status.ready ? <CheckIcon className="h-5 w-5" /> : <WarningIcon className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-ink">
            {status.ready ? s.statusReadyTitle : s.statusTodoTitle}
          </h2>
          <p className="text-[13px] text-ink-soft">{status.ready ? s.statusReadyBody : s.statusTodoBody}</p>
        </div>
      </div>

      {!status.ready && (
        <ul className="mt-3 space-y-2">
          <li className="flex items-center gap-2.5">
            <CheckMark done={status.allLocked} />
            <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
              {lockProgress
                ? s.lockingProgress
                    .replace("{n}", String(Math.min(lockProgress.done + 1, lockProgress.total)))
                    .replace("{total}", String(lockProgress.total))
                : lockLine}
              {!status.allLocked && !online && (
                <span className="block text-xs font-normal text-ink-soft">{s.lockAllNeedsNet}</span>
              )}
            </span>
            {!status.allLocked && (
              <button type="button" onClick={onLockAll} disabled={!online || lockProgress !== null} className={action}>
                {s.lockAll}
              </button>
            )}
          </li>
          <li className="flex items-center gap-2.5">
            <CheckMark done={status.allOnDevice} />
            <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
              {deviceLine}
              {deviceHint && <span className="block text-xs font-normal text-ink-soft">{deviceHint}</span>}
            </span>
            {!status.allOnDevice && autoDownload && (
              <button type="button" onClick={onDownloadAll} disabled={!online || syncing} className={action}>
                {online ? s.downloadAll : s.downloadAllOffline}
              </button>
            )}
          </li>
        </ul>
      )}

      {vaultOpen && (
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          <UnlockIcon className="h-4 w-4 shrink-0 text-ink-soft" />
          <p className="min-w-0 flex-1 text-xs text-ink-soft">{s.vaultOpen}</p>
          <button
            type="button"
            onClick={onCloseVault}
            className="min-h-[44px] shrink-0 rounded-xl border border-line bg-surface px-3 text-xs font-bold text-ink"
          >
            {s.vaultClose}
          </button>
        </div>
      )}

      <details className="group mt-2">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1 text-sm font-bold text-sea-deep [&::-webkit-details-marker]:hidden">
          {s.explainTitle}
          <ChevronDownIcon className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <dl className="space-y-2.5 pb-1 text-[13px]">
          {(
            [
              [ShieldCheckIcon, s.explainPrivateTitle, s.explainPrivate],
              [LockIcon, s.explainLockedTitle, s.explainLocked],
              [CheckIcon, s.explainDeviceTitle, s.explainDevice],
            ] as const
          ).map(([Icon, title, body]) => (
            <div key={title} className="flex gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sea-deep" />
              <div>
                <dt className="font-bold text-ink">{title}</dt>
                <dd className="text-ink-soft">{body}</dd>
              </div>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}

function CheckMark({ done }: { done: boolean }) {
  return done ? (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success text-on-sea">
      <CheckIcon className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span className="h-6 w-6 shrink-0 rounded-full border-2 border-line" aria-hidden="true" />
  );
}

/** The two facts per row, in words: locked or not, on this device or not. */
function RowStatus({
  locked,
  locking,
  onDevice,
  sync,
}: {
  locked: boolean;
  locking: boolean;
  onDevice: boolean;
  sync: DocSyncStatus | undefined;
}) {
  const s = strings.documents;
  const good = "bg-success-soft text-success";
  const pending = "bg-paper-deep text-ink-soft";
  const pill = "inline-flex items-center gap-1 rounded-full px-2 py-px text-[12px] font-bold";

  let device: { text: string; tone: string; Icon: ComponentType<IconProps> };
  if (onDevice) device = { text: s.syncReady, tone: good, Icon: CheckIcon };
  else if (sync?.state === "downloading")
    device = { text: s.syncDownloading.replace("{pct}", String(sync.pct ?? 0)), tone: pending, Icon: DownloadIcon };
  else if (sync?.state === "failed") device = { text: s.syncFailed, tone: "bg-alert-tint text-alert", Icon: WarningIcon };
  else if (sync?.state === "locked") device = { text: s.syncLocked, tone: pending, Icon: DownloadIcon };
  else device = { text: s.syncMissing, tone: pending, Icon: DownloadIcon };

  return (
    <span className="mt-1 flex flex-wrap gap-1">
      <span className={`${pill} ${locked ? good : pending}`}>
        {locked ? <LockIcon className="h-3 w-3" /> : <UnlockIcon className="h-3 w-3" />}
        {locking ? s.pillLocking : locked ? s.pillLocked : s.pillNotLocked}
      </span>
      <span className={`${pill} ${device.tone}`}>
        <device.Icon className="h-3 w-3" />
        {device.text}
      </span>
    </span>
  );
}

/** Top of the document sheet: what state it is in, and the switch for each. */
function DocStatusPanel({
  locked,
  locking,
  onDevice,
  deviceBusy,
  online,
  onOpen,
  onToggleLock,
  onToggleDevice,
}: {
  locked: boolean;
  locking: boolean;
  onDevice: boolean;
  deviceBusy: boolean;
  online: boolean;
  onOpen: () => void;
  onToggleLock: () => void;
  onToggleDevice: () => void;
}) {
  const s = strings.documents;
  const rows = [
    {
      key: "lock",
      done: locked,
      Icon: locked ? LockIcon : UnlockIcon,
      title: locked ? s.detailLockedTitle : s.detailNotLockedTitle,
      body: locked ? s.detailLockedBody : s.detailNotLockedBody,
      action: locking ? s.pillLocking : locked ? s.unlock : s.lock,
      onClick: onToggleLock,
      disabled: locking || !online,
    },
    {
      key: "device",
      done: onDevice,
      Icon: onDevice ? CheckIcon : DownloadIcon,
      title: onDevice ? s.detailOnDeviceTitle : s.detailNotOnDeviceTitle,
      body: onDevice ? s.detailOnDeviceBody : s.detailNotOnDeviceBody,
      action: onDevice ? s.removeFromDevice : s.saveToDevice,
      onClick: onToggleDevice,
      disabled: deviceBusy || (!onDevice && !online),
    },
  ];
  return (
    <div className="mb-4 space-y-2">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-sea py-3 text-sm font-bold text-on-sea"
      >
        <ExternalIcon className="h-4 w-4" />
        {s.open}
      </button>
      {rows.map((r) => (
        <div
          key={r.key}
          className={`flex items-center gap-3 rounded-xl p-3 ${r.done ? "bg-success-soft" : "bg-paper-deep"}`}
        >
          <r.Icon className={`h-5 w-5 shrink-0 ${r.done ? "text-success" : "text-ink-soft"}`} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">{r.title}</span>
            <span className="block text-xs text-ink-soft">{r.body}</span>
          </span>
          <button
            type="button"
            onClick={r.onClick}
            disabled={r.disabled}
            className={`min-h-[44px] shrink-0 rounded-xl px-3 text-xs font-bold disabled:opacity-50 ${
              r.done ? "border border-line bg-surface text-ink" : "bg-sea text-on-sea"
            }`}
          >
            {r.action}
          </button>
        </div>
      ))}
    </div>
  );
}

// Desktop browsers and iOS Safari render a PDF inside an iframe; Android
// Chrome reports pdfViewerEnabled = false and would download it instead.
function canShowPdfInline(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { pdfViewerEnabled?: boolean };
  return nav.pdfViewerEnabled !== false;
}

// The phone's own share sheet, or a plain save where files can't be shared.
// The viewer's button calls this on a fresh tap, so the sheet is allowed even
// where the async open lost the original gesture. On iPhone it is the way to a
// full-screen preview, "Save to Files" or Books, which an inline PDF frame
// (first page only, no zoom in the home-screen app) does not give.
async function shareFile(file: File): Promise<void> {
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: file.name });
      return;
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return; // user closed the sheet
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
