"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalIcon, WarningIcon } from "@/components/icons";
import { Toast } from "@/components/Toast";
import { getActiveTrip } from "@/lib/data/trip";
import {
  buildVisaGroups,
  loadVisaScreen,
  trustOf,
  updateVisaStatus,
  type StayBlock,
  type StayWarning,
  type Trust,
  type VisaCountryGroup,
} from "@/lib/data/visas";
import { formatDate, formatShortDate, todayISO } from "@/lib/format";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type {
  VisaRequirement,
  VisaRequirementType,
  VisaStatus,
} from "@/lib/types";
import { VisaStatusSheet } from "./VisaStatusSheet";

// Owner-only screen (RLS: visa_requirements_owner_all). Two things happen here
// and nothing else: the rules are read, and one status is changed. The links
// are not editable on purpose - an official URL changed by accident is exactly
// the bug that misses a flight.

const s = strings.visas;

function fill(template: string, values: Record<string, number | string>): string {
  return Object.entries(values).reduce(
    (out, [k, v]) => out.replaceAll(`{${k}}`, String(v)),
    template
  );
}

const TRUST_BADGE: Record<Trust, { label: string; className: string } | null> = {
  // The loudest thing on the screen, and the only loud thing. An unverified
  // rule is not a gap in the data, it is a rule you must not act on yet.
  unverified: { label: s.unverifiedBadge, className: "bg-alert text-white" },
  stale: { label: s.staleBadge, className: "bg-sun-tint text-sun-deep" },
  ok: null,
};

function StayLine({ blocks }: { blocks: StayBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-sm text-white/80">
      {blocks.map((block, i) => (
        <li key={block.start}>
          {fill(blocks.length > 1 ? s.blockLineNumbered : s.blockLine, {
            n: i + 1,
            days: block.days,
            start: formatShortDate(block.start),
            end: formatShortDate(block.end),
          })}
        </li>
      ))}
    </ul>
  );
}

function WarningCard({ warning }: { warning: StayWarning }) {
  const over = warning.kind === "over";
  const body = over
    ? fill(s.overstay, { days: warning.block.days, max: warning.maxDays })
    : fill(s.nearLimit, {
        days: warning.block.days,
        max: warning.maxDays,
        left: warning.maxDays - warning.block.days,
      });
  return (
    <div
      className={`flex gap-2.5 rounded-[17px] border p-3 ${
        over
          ? "border-alert/30 bg-alert-tint text-alert"
          : "border-line bg-sun-tint text-sun-deep"
      }`}
    >
      <WarningIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-bold">{body}</p>
        <p className="text-xs font-medium opacity-80">
          {warning.limitTitle} ·{" "}
          {fill(s.warnDates, {
            start: formatShortDate(warning.block.start),
            end: formatShortDate(warning.block.end),
          })}
        </p>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="inline text-ink-soft">{label}: </dt>
      <dd className="inline font-medium text-ink">{value}</dd>
    </div>
  );
}

function RequirementCard({
  row,
  today,
  busy,
  onEditStatus,
}: {
  row: VisaRequirement;
  today: string;
  busy: boolean;
  onEditStatus: () => void;
}) {
  const trust = TRUST_BADGE[trustOf(row.verified_at, today)];
  const type = s.types[row.requirement_type as VisaRequirementType];
  const status = s.statuses[row.status as VisaStatus];

  return (
    <li className="rounded-[17px] border border-line bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="rounded-md bg-paper-deep px-1.5 py-0.5 text-[11px] font-bold text-ink-soft">
          {type}
        </span>
        <span className="font-bold text-ink">{row.title_he}</span>
        {trust && (
          <span
            className={`rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${trust.className}`}
          >
            {trust.label}
          </span>
        )}
      </div>

      <dl className="mt-2 space-y-1 text-sm">
        <DetailRow
          label={s.maxDays}
          value={row.max_days == null ? null : fill(s.maxDaysValue, { n: row.max_days })}
        />
        <DetailRow label={s.fee} value={row.fee_note} />
        <DetailRow label={s.deadline} value={row.deadline_note} />
      </dl>

      {row.notes && <p className="mt-2 text-sm text-ink-soft">{row.notes}</p>}

      {row.official_url && (
        <a
          href={row.official_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-medium text-sea-deep active:bg-paper-deep"
        >
          <ExternalIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{s.openOfficial}</span>
          {/* The URL is LTR text in an RTL line: isolated, or the slashes
              land on the wrong side of the host. */}
          <span
            dir="ltr"
            style={{ unicodeBidi: "isolate" }}
            className="truncate text-xs text-ink-faint"
          >
            {hostOf(row.official_url)}
          </span>
        </a>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onEditStatus}
          disabled={busy}
          className="min-h-11 rounded-xl border border-line px-3 py-2 text-sm font-bold text-ink active:bg-paper-deep disabled:opacity-50"
        >
          {s.statusLabel}: {status}
        </button>
        {row.verified_at && (
          <span className="text-[11px] text-ink-faint">
            {fill(s.verifiedOn, { date: formatDate(row.verified_at) })}
          </span>
        )}
      </div>
    </li>
  );
}

/** Host only: the full URL is unreadable on a phone and the label already
 *  says what the link does. */
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function VisasScreen() {
  const { member, memberLoading } = useMember();
  const [groups, setGroups] = useState<VisaCountryGroup[] | null>(null);
  const [unverified, setUnverified] = useState(0);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<VisaRequirement | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const today = todayISO();

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const trip = await getActiveTrip();
        if (cancelled) return;
        if (!trip) {
          setGroups([]);
          return;
        }
        const data = await loadVisaScreen(trip.id);
        if (cancelled) return;
        setGroups(data.groups);
        setUnverified(data.unverified);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic: the status is a checkbox in spirit, and waiting on a round trip
  // to redraw it feels broken. A failure puts the old value back and says so.
  const pickStatus = useCallback(
    async (row: VisaRequirement, status: VisaStatus) => {
      setEditing(null);
      if (row.status === status) return;
      const previous = row.status;
      const apply = (next: string) =>
        setGroups((current) => {
          if (!current) return current;
          const rows = current
            .flatMap((g) => g.rows)
            .map((r) => (r.id === row.id ? { ...r, status: next } : r));
          const blocks = current.flatMap((g) => g.blocks);
          return buildVisaGroups(rows, blocks);
        });

      apply(status);
      setSaving(row.id);
      try {
        await updateVisaStatus(row.id, status);
      } catch {
        apply(previous);
        showToast(s.saveError);
      } finally {
        setSaving(null);
      }
    },
    [showToast]
  );

  if (memberLoading) return null;
  if (member && member.role !== "owner") {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center text-ink-soft">
        {s.ownersOnly}
      </div>
    );
  }
  if (failed) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center text-ink-soft">
        {s.loadError}
      </div>
    );
  }
  if (!groups) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center text-ink-soft">
        {s.loading}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 pt-6 pb-8 sm:max-w-2xl">
      <header className="ot-postcard px-4 py-5">
        <h1 className="text-xs font-bold uppercase tracking-[0.08em] text-white/70">
          {s.title}
        </h1>
        <p className="mt-1 text-[26px] font-extrabold leading-tight">
          {unverified > 0 ? fill(s.unverified, { n: unverified }) : s.allVerified}
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="px-1 text-sm text-ink-soft">{s.empty}</p>
      ) : (
        groups.map((group) => (
          <section key={group.countryCode} className="space-y-3">
            <div className="rounded-[17px] bg-sea px-4 py-3 text-white">
              <h2 className="text-lg font-extrabold">{group.countryHe}</h2>
              <StayLine blocks={group.blocks} />
            </div>

            {group.warnings.map((warning) => (
              <WarningCard key={`${warning.kind}-${warning.block.start}`} warning={warning} />
            ))}

            <ul className="space-y-3">
              {group.rows.map((row) => (
                <RequirementCard
                  key={row.id}
                  row={row}
                  today={today}
                  busy={saving === row.id}
                  onEditStatus={() => setEditing(row)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <VisaStatusSheet
        row={editing}
        onClose={() => setEditing(null)}
        onPick={(status) => {
          if (editing) void pickStatus(editing, status);
        }}
      />
      <Toast message={toast} />
    </div>
  );
}
