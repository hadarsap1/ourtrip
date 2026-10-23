"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Toast } from "@/components/Toast";
import { getActiveTrip, listMembers } from "@/lib/data/trip";
import {
  declineJoinRequest,
  getJoinToken,
  inviteGuest,
  inviteMany,
  listAllowlist,
  listJoinRequests,
  revokeGuest,
  setGuestLabels,
  setMemberKidNames,
  type BulkInviteResult,
  type GuestAllowlistRow,
  type JoinRequestRow,
} from "@/lib/data/guests";
import { approvedShareText, joinShareText, joinUrl, type ApprovedGuest } from "@/lib/guestJoin";
import { useMember } from "@/lib/useMember";
import { normalizeLabels, parseGuestList } from "@/lib/guestBulk";
import { shareToWhatsApp } from "@/lib/share";
import { formatDate } from "@/lib/format";
import { ClipboardIcon, MailIcon, ShareIcon, UsersIcon } from "@/components/icons";
import { askConfirm } from "@/components/ConfirmSheet";
import { KidTag } from "@/components/KidTag";
import { KidNamesField } from "@/components/guests/KidNamesField";
import { normalizeKidNames } from "@/lib/kidTag";
import { strings } from "@/lib/strings";
import type { Member, Trip } from "@/lib/types";

type Group = { label: string | null; rows: GuestAllowlistRow[] };

/** Labelled groups first (alphabetical), the unlabelled ones last. A guest
 *  in several groups is listed under each of them. */
function groupByLabel(rows: GuestAllowlistRow[]): Group[] {
  const map = new Map<string | null, GuestAllowlistRow[]>();
  for (const row of rows) {
    for (const key of row.labels.length > 0 ? row.labels : [null]) {
      map.set(key, [...(map.get(key) ?? []), row]);
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b, "he")))
    .map(([label, groupRows]) => ({ label, rows: groupRows }));
}

export function GuestsAdminScreen() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [allowlist, setAllowlist] = useState<GuestAllowlistRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<JoinRequestRow[]>([]);
  // approving join requests: which groups they go into (one request, or all)
  const [approveFor, setApproveFor] = useState<JoinRequestRow | "all" | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  // sign-in links guest-invite could not email (no RESEND_API_KEY, or Resend
  // failed): the parent sends them, or the approved guest never hears a thing
  const [unsent, setUnsent] = useState<ApprovedGuest[] | null>(null);
  const { member } = useMember();
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<"invite" | "bulk" | null>(null);
  const [labelFor, setLabelFor] = useState<GuestAllowlistRow | null>(null);
  const [kidsFor, setKidsFor] = useState<Member | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    const [rows, tripMembers, pending] = await Promise.all([
      listAllowlist(tripId),
      listMembers(tripId),
      listJoinRequests(tripId),
    ]);
    setAllowlist(rows);
    setMembers(tripMembers);
    setRequests(pending);
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
        const [joinToken] = await Promise.all([getJoinToken(activeTrip.id), refresh(activeTrip.id)]);
        if (!cancelled) setToken(joinToken);
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

  const groups = useMemo(() => groupByLabel(allowlist), [allowlist]);
  const knownLabels = useMemo(
    () => [...new Set(allowlist.flatMap((r) => r.labels))],
    [allowlist]
  );
  const memberOf = (email: string) => members.find((m) => m.email?.toLowerCase() === email.toLowerCase()) ?? null;

  const link = token ? joinUrl(window.location.origin, token) : null;

  async function approve(request: JoinRequestRow, labels: string[]) {
    if (approving || !trip) return;
    setApproving(request.id);
    try {
      // the same call as a manual invite; the allowlist trigger closes the request
      const { link, emailed } = await inviteGuest(request.email, request.display_name, labels);
      if (emailed) showToast(strings.guests.approved.replace("{name}", request.display_name));
      else setUnsent([{ name: request.display_name, email: request.email, link, viaGoogle: request.auth_user_id !== null }]);
      await refresh(trip.id);
    } catch {
      showToast(strings.common.error);
    } finally {
      setApproving(null);
    }
  }

  async function approveAll(labels: string[]) {
    if (approving || !trip) return;
    setApproving("all");
    try {
      const results = await inviteMany(
        requests.map((r) => ({ name: r.display_name, email: r.email })),
        labels,
        () => {}
      );
      showToast(
        strings.guests.approvedAll
          .replace("{ok}", String(results.filter((r) => r.ok).length))
          .replace("{total}", String(results.length))
      );
      // inviteMany keeps the order it was given, so each result pairs with its request
      const notEmailed = results.flatMap((r, i) =>
        r.ok && !r.emailed && r.link
          ? [{ name: r.name, email: r.email, link: r.link, viaGoogle: requests[i]?.auth_user_id != null }]
          : []
      );
      if (notEmailed.length > 0) setUnsent(notEmailed);
      await refresh(trip.id);
    } catch {
      showToast(strings.common.error);
    } finally {
      setApproving(null);
    }
  }

  async function decline(request: JoinRequestRow) {
    if (!trip || !member || !(await askConfirm(strings.guests.declineConfirm))) return;
    try {
      await declineJoinRequest(request.id, member.id);
      showToast(strings.guests.declined);
      await refresh(trip.id);
    } catch {
      showToast(strings.common.error);
    }
  }

  const closeAndRefresh = () => {
    setSheet(null);
    if (trip) void refresh(trip.id).catch(() => {});
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-2xl font-bold">{strings.guests.title}</h1>

      {link && (
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <h2 className="font-bold text-ink">{strings.guests.joinTitle}</h2>
          <p className="text-sm text-ink-soft">{strings.guests.joinHint}</p>
          <p className="truncate rounded-xl bg-paper-deep px-3 py-2 text-xs text-ink-soft" dir="ltr">
            {link}
          </p>
          {/* share gets its own row: three buttons in one row clipped its label at 390px.
              No "new link" button: the link is printed on stickers (Hadar 20/10/2026)
              and must not change by a tap. If it ever leaks, reset it in the SQL
              editor: update guest_join_links set token = guest_join_new_token(). */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void shareToWhatsApp(joinShareText(link))}
              className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-sea py-3 font-semibold text-on-sea hover:bg-sea-deep"
            >
              <ShareIcon className="h-4 w-4" />
              {strings.guests.joinShare}
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(link)
                  .then(() => showToast(strings.guests.copied))
                  .catch(() => {});
              }}
              className="col-span-2 rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink-soft"
            >
              <ClipboardIcon className="inline-block h-4 w-4 align-text-bottom" /> {strings.guests.joinCopy}
            </button>
          </div>
        </section>
      )}

      {requests.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-baseline justify-between px-0.5">
            <span className="ot-kicker">
              {strings.guests.requestsTitle.replace("{n}", String(requests.length))}
            </span>
            {requests.length > 1 && (
              <button
                type="button"
                disabled={approving !== null}
                onClick={() => setApproveFor("all")}
                className="text-sm font-semibold text-sea disabled:opacity-60"
              >
                {strings.guests.approveAll.replace("{n}", String(requests.length))}
              </button>
            )}
          </h2>
          <ul className="space-y-2">
            {requests.map((request) => (
              <li
                key={request.id}
                className="flex items-center justify-between gap-2 rounded-2xl border border-sea/40 bg-sea-tint px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">
                    {request.display_name}
                    <KidTag names={request.kid_names} />
                  </span>
                  <span className="block truncate text-sm text-ink-soft" dir="ltr">
                    {request.email}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {request.auth_user_id ? strings.guests.viaGoogle : strings.guests.viaEmail}
                    {" · "}
                    <span dir="ltr">{formatDate(request.requested_at.slice(0, 10))}</span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-stretch gap-1">
                  <button
                    type="button"
                    disabled={approving !== null}
                    onClick={() => setApproveFor(request)}
                    className="rounded-lg bg-sea px-3 py-1.5 text-sm font-semibold text-on-sea disabled:opacity-60"
                  >
                    {strings.guests.approve}
                  </button>
                  <button
                    type="button"
                    disabled={approving !== null}
                    onClick={() => void decline(request)}
                    className="rounded-lg bg-paper-deep px-3 py-1 text-xs font-semibold text-ink-soft disabled:opacity-60"
                  >
                    {strings.guests.decline}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="ot-kicker px-0.5">{strings.guests.manualTitle}</h2>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSheet("invite")}
          className="rounded-2xl bg-sea py-3 font-semibold text-on-sea shadow hover:bg-sea-deep"
        >
          <MailIcon className="inline-block h-4 w-4 align-text-bottom" /> {strings.guests.invite}
        </button>
        <button
          type="button"
          onClick={() => setSheet("bulk")}
          className="rounded-2xl border border-sea bg-surface py-3 font-semibold text-sea"
        >
          <UsersIcon className="inline-block h-4 w-4 align-text-bottom" /> {strings.guests.bulkInvite}
        </button>
      </div>

      {allowlist.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-soft">
          {strings.guests.empty}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.label ?? "-"} className="space-y-2">
            <h2 className="flex items-baseline justify-between px-0.5">
              <span className="ot-kicker">{group.label ?? strings.guests.noLabel}</span>
              <span className="text-xs text-ink-soft">
                {strings.guests.groupCount.replace("{n}", String(group.rows.length))}
              </span>
            </h2>
            <ul className="space-y-2">
              {group.rows.map((row) => {
                const revoked = row.revoked_at !== null;
                const guest = memberOf(row.email);
                return (
                  <li
                    key={row.email}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm"
                  >
                    <span className="min-w-0">
                      {guest && (
                        <span className="block truncate font-semibold text-ink">
                          {guest.display_name}
                          <KidTag names={guest.kid_names} />
                        </span>
                      )}
                      <span className="block truncate text-sm text-ink-soft" dir="ltr">
                        {row.email}
                      </span>
                      <span
                        className={`text-xs font-semibold ${revoked ? "text-alert" : "text-success"}`}
                      >
                        {revoked ? strings.guests.revoked : strings.guests.active}
                        <span className="ms-1 font-normal text-ink-soft">
                          · <span dir="ltr">{formatDate(row.created_at.slice(0, 10))}</span>
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => setLabelFor(row)}
                        className="rounded-lg bg-paper-deep px-2.5 py-1 text-xs font-semibold text-ink-soft"
                      >
                        {strings.guests.setLabel}
                      </button>
                      {guest && (
                        <button
                          type="button"
                          onClick={() => setKidsFor(guest)}
                          className="rounded-lg bg-paper-deep px-2.5 py-1 text-xs font-semibold text-ink-soft"
                        >
                          {strings.kidTag.edit}
                        </button>
                      )}
                      {!revoked && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!(await askConfirm(strings.guests.revokeConfirm))) return;
                            void revokeGuest(row.trip_id, row.email)
                              .then(() => trip && refresh(trip.id))
                              .catch(() => showToast(strings.common.error));
                          }}
                          className="rounded-lg bg-alert-tint px-2.5 py-1 text-xs font-semibold text-alert"
                        >
                          {strings.guests.revoke}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {sheet === "invite" && (
        <InviteSheet knownLabels={knownLabels} onClose={closeAndRefresh} onToast={showToast} />
      )}
      {sheet === "bulk" && (
        <BulkInviteSheet knownLabels={knownLabels} onClose={closeAndRefresh} onToast={showToast} />
      )}
      {approveFor && (
        <ApproveSheet
          title={
            approveFor === "all"
              ? strings.guests.approveAll.replace("{n}", String(requests.length))
              : approveFor.display_name
          }
          knownLabels={knownLabels}
          onClose={() => setApproveFor(null)}
          onApprove={(labels) => {
            const target = approveFor;
            setApproveFor(null);
            void (target === "all" ? approveAll(labels) : approve(target, labels));
          }}
        />
      )}
      {unsent && <UnsentLinksSheet links={unsent} onClose={() => setUnsent(null)} onToast={showToast} />}
      {labelFor && trip && (
        <LabelSheet
          row={labelFor}
          knownLabels={knownLabels}
          onClose={() => setLabelFor(null)}
          onSave={async (labels) => {
            try {
              await setGuestLabels(trip.id, labelFor.email, labels);
              setLabelFor(null);
              showToast(strings.guests.labelSaved);
              await refresh(trip.id);
            } catch {
              showToast(strings.common.error);
            }
          }}
        />
      )}

      {kidsFor && trip && (
        <KidNamesSheet
          guest={kidsFor}
          onClose={() => setKidsFor(null)}
          onSave={async (kidNames) => {
            try {
              await setMemberKidNames(kidsFor.id, kidNames);
              setKidsFor(null);
              showToast(strings.kidTag.saved);
              await refresh(trip.id);
            } catch {
              showToast(strings.common.error);
            }
          }}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}

/** A parent sets the kids a guest is the parent of (00067). */
function KidNamesSheet({
  guest,
  onClose,
  onSave,
}: {
  guest: Member;
  onClose: () => void;
  onSave: (kidNames: string[]) => Promise<void>;
}) {
  const [names, setNames] = useState<string[]>(guest.kid_names ?? []);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open onClose={onClose} title={strings.kidTag.sheetTitle}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          void onSave(normalizeKidNames(names)).finally(() => setBusy(false));
        }}
        className="space-y-4"
      >
        <p className="truncate text-sm font-semibold text-ink">{guest.display_name}</p>
        <KidNamesField id="guest-kids" value={names} onChange={setNames} showHint={false} />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-sea py-3 font-semibold text-on-sea disabled:opacity-60"
        >
          {strings.guests.save}
        </button>
      </form>
    </Sheet>
  );
}

/** Any number of groups: one tap on a suggestion or a known group, or type a
 *  new one (a class has its own name). */
function LabelField({
  id,
  value,
  onChange,
  knownLabels,
}: {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  knownLabels: string[];
}) {
  const [draft, setDraft] = useState("");
  const suggestions = [...new Set([...strings.guests.labelSuggestions, ...knownLabels, ...value])];
  const toggle = (label: string) =>
    onChange(value.includes(label) ? value.filter((l) => l !== label) : [...value, label]);
  const addDraft = () => {
    const [label] = normalizeLabels([draft]);
    if (label && !value.includes(label)) onChange([...value, label]);
    setDraft("");
  };
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-ink-soft">{strings.guests.label}</p>
      <p className="mb-2 text-xs text-ink-soft">{strings.guests.labelHint}</p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            aria-pressed={value.includes(s)}
            className={`rounded-full border px-3 py-1 text-sm ${
              value.includes(s) ? "border-sea bg-sea-tint text-sea-deep" : "border-line bg-surface text-ink-soft"
            }`}
          >
            {value.includes(s) && "✓ "}
            {s}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          id={id}
          type="text"
          maxLength={40}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
          }}
          // a typed group counts even if the parent goes straight to send
          onBlur={addDraft}
          aria-label={strings.guests.newLabel}
          placeholder={strings.guests.newLabel}
          className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
        />
        <button
          type="button"
          onClick={addDraft}
          disabled={!draft.trim()}
          className="shrink-0 rounded-xl border border-sea px-4 text-sm font-semibold text-sea disabled:opacity-50"
        >
          {strings.guests.addLabel}
        </button>
      </div>
    </div>
  );
}

function InviteSheet({
  knownLabels,
  onClose,
  onToast,
}: {
  knownLabels: string[];
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ link: string; emailed: boolean } | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      setResult(await inviteGuest(email.trim(), name.trim(), normalizeLabels(labels)));
    } catch {
      onToast(strings.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={strings.guests.invite}>
      {result ? (
        <div className="space-y-4">
          <p className="text-center text-sm font-medium text-ink-soft">
            {result.emailed ? strings.guests.emailed : strings.guests.linkReady}
          </p>
          <p className="break-all rounded-xl bg-paper-deep p-3 text-xs text-ink-soft" dir="ltr">
            {result.link}
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                .writeText(result.link)
                .then(() => onToast(strings.guests.copied))
                .catch(() => {});
            }}
            className="w-full rounded-xl bg-sea py-3 font-semibold text-on-sea"
          >
            <ClipboardIcon className="inline-block h-4 w-4 align-text-bottom" />{" "}
            {strings.guests.copyLink}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-line py-3 font-semibold text-ink-soft"
          >
            {strings.common.close}
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void handleInvite(e)} className="space-y-4">
          <div>
            <label htmlFor="guest-name" className="mb-1 block text-sm font-medium text-ink-soft">
              {strings.guests.name}
            </label>
            <input
              id="guest-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="guest-email" className="mb-1 block text-sm font-medium text-ink-soft">
              {strings.guests.email}
            </label>
            <input
              id="guest-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
              dir="ltr"
            />
          </div>
          <LabelField id="guest-label" value={labels} onChange={setLabels} knownLabels={knownLabels} />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-sea py-3 font-semibold text-on-sea hover:bg-sea-deep disabled:opacity-60"
          >
            {strings.guests.send}
          </button>
        </form>
      )}
    </Sheet>
  );
}

function BulkInviteSheet({
  knownLabels,
  onClose,
  onToast,
}: {
  knownLabels: string[];
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [results, setResults] = useState<BulkInviteResult[] | null>(null);
  const parsed = useMemo(() => parseGuestList(text), [text]);

  async function handleSend() {
    if (parsed.guests.length === 0 || progress !== null) return;
    setProgress(0);
    const out = await inviteMany(parsed.guests, normalizeLabels(labels), setProgress);
    setResults(out);
    setProgress(null);
  }

  if (results) {
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    const unsent = ok.filter((r) => !r.emailed && r.link);
    return (
      <Sheet open onClose={onClose} title={strings.guests.bulkInvite}>
        <div className="space-y-4">
          <p className="text-center font-semibold text-ink">
            {strings.guests.bulkDone
              .replace("{ok}", String(ok.length))
              .replace("{total}", String(results.length))}
          </p>
          {failed.length > 0 && (
            <div className="rounded-xl bg-alert-tint p-3 text-sm text-alert">
              <p className="font-semibold">{strings.guests.bulkFailed}</p>
              <ul className="mt-1" dir="ltr">
                {failed.map((r) => (
                  <li key={r.email}>{r.email}</li>
                ))}
              </ul>
            </div>
          )}
          {unsent.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-ink-soft">{strings.guests.bulkLinksTitle}</p>
              <button
                type="button"
                onClick={() => {
                  const lines = unsent.map((r) => `${r.name}: ${r.link}`).join("\n");
                  void navigator.clipboard
                    .writeText(lines)
                    .then(() => onToast(strings.guests.copied))
                    .catch(() => {});
                }}
                className="w-full rounded-xl bg-sea py-3 font-semibold text-on-sea"
              >
                <ClipboardIcon className="inline-block h-4 w-4 align-text-bottom" />{" "}
                {strings.guests.copyAllLinks}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-line py-3 font-semibold text-ink-soft"
          >
            {strings.common.close}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={progress === null ? onClose : () => {}} title={strings.guests.bulkInvite}>
      <div className="space-y-4">
        <div>
          <label htmlFor="bulk-list" className="mb-1 block text-sm font-medium text-ink-soft">
            {strings.guests.bulkHint}
          </label>
          <textarea
            id="bulk-list"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={strings.guests.bulkPlaceholder}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
          />
        </div>
        <LabelField id="bulk-label" value={labels} onChange={setLabels} knownLabels={knownLabels} />

        <div className="space-y-1 text-sm" aria-live="polite">
          {parsed.guests.length > 0 && (
            <p className="font-semibold text-success">
              {strings.guests.bulkReady.replace("{n}", String(parsed.guests.length))}
            </p>
          )}
          {parsed.duplicates > 0 && (
            <p className="text-ink-soft">
              {strings.guests.bulkDuplicates.replace("{n}", String(parsed.duplicates))}
            </p>
          )}
          {parsed.invalid.length > 0 && (
            <div className="text-warning">
              <p>{strings.guests.bulkInvalid.replace("{n}", String(parsed.invalid.length))}</p>
              <ul className="list-inside list-disc text-ink-soft">
                {parsed.invalid.slice(0, 5).map((line) => (
                  <li key={line} className="truncate">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {progress !== null && (
            <p className="font-semibold text-ink">
              {strings.guests.bulkProgress
                .replace("{done}", String(progress))
                .replace("{total}", String(parsed.guests.length))}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={parsed.guests.length === 0 || progress !== null}
          className="w-full rounded-xl bg-sea py-3 font-semibold text-on-sea hover:bg-sea-deep disabled:opacity-60"
        >
          {strings.guests.bulkSend.replace("{n}", String(parsed.guests.length))}
        </button>
      </div>
    </Sheet>
  );
}

/** Approved, but the sign-in email did not go out: one WhatsApp per person. */
function UnsentLinksSheet({
  links,
  onClose,
  onToast,
}: {
  links: ApprovedGuest[];
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  return (
    <Sheet open onClose={onClose} title={strings.guests.unsentTitle}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">{strings.guests.unsentBody}</p>
        <ul className="space-y-2">
          {links.map((guest) => (
            <li
              key={guest.link}
              className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{guest.name}</span>
                {guest.viaGoogle && <span className="text-xs text-ink-soft">{strings.guests.viaGoogleShort}</span>}
              </span>
              <button
                type="button"
                onClick={() => void shareToWhatsApp(approvedShareText(guest, window.location.origin))}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-sea px-3 py-2 text-sm font-semibold text-on-sea"
              >
                <ShareIcon className="h-4 w-4" /> {strings.guests.joinShare}
              </button>
            </li>
          ))}
        </ul>
        {links.length > 1 && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                .writeText(links.map((l) => `${l.name}: ${l.link}`).join("\n"))
                .then(() => onToast(strings.guests.copied))
                .catch(() => {});
            }}
            className="w-full rounded-xl border border-line py-3 font-semibold text-ink-soft"
          >
            <ClipboardIcon className="inline-block h-4 w-4 align-text-bottom" /> {strings.guests.copyAllLinks}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl border border-line py-3 font-semibold text-ink-soft"
        >
          {strings.common.close}
        </button>
      </div>
    </Sheet>
  );
}

function LabelSheet({
  row,
  knownLabels,
  onClose,
  onSave,
}: {
  row: GuestAllowlistRow;
  knownLabels: string[];
  onClose: () => void;
  onSave: (labels: string[]) => Promise<void>;
}) {
  const [labels, setLabels] = useState<string[]>(row.labels);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open onClose={onClose} title={strings.guests.setLabel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          void onSave(normalizeLabels(labels)).finally(() => setBusy(false));
        }}
        className="space-y-4"
      >
        <p className="truncate text-sm text-ink-soft" dir="ltr">
          {row.email}
        </p>
        <LabelField id="row-label" value={labels} onChange={setLabels} knownLabels={knownLabels} />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-sea py-3 font-semibold text-on-sea disabled:opacity-60"
        >
          {strings.guests.save}
        </button>
      </form>
    </Sheet>
  );
}

/** Approving a join request: which groups the guest goes into (00064), then
 *  the same invite as always. No group = everyone-only content. */
function ApproveSheet({
  title,
  knownLabels,
  onClose,
  onApprove,
}: {
  title: string;
  knownLabels: string[];
  onClose: () => void;
  onApprove: (labels: string[]) => void;
}) {
  const [labels, setLabels] = useState<string[]>([]);
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="space-y-4">
        <LabelField id="approve-label" value={labels} onChange={setLabels} knownLabels={knownLabels} />
        <button
          type="button"
          onClick={() => onApprove(normalizeLabels(labels))}
          className="w-full rounded-xl bg-sea py-3 font-semibold text-on-sea"
        >
          {strings.guests.approve}
        </button>
      </div>
    </Sheet>
  );
}
