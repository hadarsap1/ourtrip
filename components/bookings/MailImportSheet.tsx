"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { BOOKING_TYPE_ICON } from "@/components/bookings/BookingDayRow";
import { CheckIcon, MailIcon } from "@/components/icons";
import { createBooking } from "@/lib/data/bookings";
import {
  beginMailScan,
  candidateToInsert,
  extractBookings,
  isGmailImportConfigured,
  reviewCandidates,
  type ReviewedCandidate,
} from "@/lib/data/gmailBookings";
import { preloadGis } from "@/lib/googleAuth";
import { formatDate, formatMoney } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { Booking } from "@/lib/types";

const inputClass =
  "w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none";

/** The Edge Function's stable codes, and the two the browser raises before the
 *  request is ever made. Anything unrecognised is the generic message. */
function messageFor(code: string): string {
  const s = strings.mailImport;
  switch (code) {
    case "token_cancelled":
      return s.errCancelled;
    case "gmail_auth":
    case "token_failed":
      return s.errAuth;
    case "gmail_failed":
      return s.errGmail;
    case "no_credit":
      return s.errCredit;
    case "not_configured":
      return s.errNotConfigured;
    default:
      return s.errGeneric;
  }
}

function isoOffsetDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type Phase =
  | { step: "setup" }
  | { step: "searching" }
  | { step: "reading"; done: number; total: number }
  | { step: "results"; reviewed: ReviewedCandidate[]; scanned: number }
  | { step: "saving" };

/**
 * Reads booking confirmations out of the owner's Gmail and offers them for
 * review. Nothing is written until the owner ticks a row and presses save -
 * this is an extraction the model proposes, not an import that just happens.
 */
export function MailImportSheet({
  tripId,
  existing,
  onClose,
  onDone,
}: {
  tripId: string;
  /** Bookings the trip already has, so a re-scan can say what is not new. */
  existing: Booking[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const s = strings.mailImport;
  const configured = isGmailImportConfigured();

  const [phase, setPhase] = useState<Phase>({ step: "setup" });
  const [error, setError] = useState<string | null>(null);
  const [after, setAfter] = useState(isoOffsetDays(-365));
  const [before, setBefore] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Load Google's script on mount so the scan button stays a clean user gesture:
  // awaiting a network round-trip inside the click handler is what gets the
  // consent popup blocked.
  useEffect(() => {
    if (configured) void preloadGis().catch(() => {});
  }, [configured]);

  async function runScan() {
    setError(null);
    setPhase({ step: "searching" });
    try {
      const { token, messages } = await beginMailScan({
        after: after || null,
        before: before || null,
      });
      if (messages.length === 0) {
        setPhase({ step: "setup" });
        setError(s.noMail);
        return;
      }

      setPhase({ step: "reading", done: 0, total: messages.length });
      const candidates = await extractBookings({
        token,
        ids: messages.map((m) => m.id),
        onProgress: (done, total) => setPhase({ step: "reading", done, total }),
      });

      const reviewed = reviewCandidates(candidates, existing);
      // Pre-tick everything the trip does not already have: the common case is
      // "take them all", and the duplicates are exactly what should not be.
      setPicked(
        new Set(
          reviewed
            .filter((r) => r.duplicateOf === null)
            .map((r) => r.candidate.message_id)
        )
      );
      setPhase({ step: "results", reviewed, scanned: messages.length });
    } catch (e) {
      setPhase({ step: "setup" });
      setError(messageFor(e instanceof Error ? e.message : ""));
    }
  }

  async function save(reviewed: ReviewedCandidate[]) {
    const chosen = reviewed.filter((r) => picked.has(r.candidate.message_id));
    if (chosen.length === 0) {
      setError(s.nothingPicked);
      return;
    }
    setError(null);
    setPhase({ step: "saving" });
    try {
      // Sequential: a handful of rows, and one failure should not leave the
      // rest in an unknown state.
      for (const { candidate } of chosen) {
        await createBooking(candidateToInsert(candidate, tripId));
      }
      onDone(
        chosen.length === 1
          ? s.savedOne
          : s.saved.replace("{n}", String(chosen.length))
      );
    } catch {
      setPhase({ step: "results", reviewed, scanned: reviewed.length });
      setError(s.errGeneric);
    }
  }

  const fresh = useMemo(
    () =>
      phase.step === "results"
        ? phase.reviewed.filter((r) => r.duplicateOf === null)
        : [],
    [phase]
  );

  return (
    <Sheet open onClose={onClose} title={s.title}>
      {!configured ? (
        <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-soft">
          {s.notConfigured}
        </p>
      ) : (
        <div className="space-y-4">
          {error && (
            <p role="alert" className="text-sm font-medium text-alert">
              {error}
            </p>
          )}

          {(phase.step === "setup" || phase.step === "searching") && (
            <>
              <p className="text-sm text-ink-soft">{s.intro}</p>
              <p className="rounded-xl bg-paper-deep p-3 text-[12.5px] leading-relaxed text-ink-soft">
                {s.privacy}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="mi-after" className="mb-1 block text-sm font-medium text-ink-soft">
                    {s.fromDate}
                  </label>
                  <input
                    id="mi-after"
                    type="date"
                    value={after}
                    onChange={(e) => setAfter(e.target.value)}
                    className={inputClass}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label htmlFor="mi-before" className="mb-1 block text-sm font-medium text-ink-soft">
                    {s.toDate}
                  </label>
                  <input
                    id="mi-before"
                    type="date"
                    value={before}
                    onChange={(e) => setBefore(e.target.value)}
                    className={inputClass}
                    dir="ltr"
                  />
                </div>
              </div>
              <p className="text-[12px] text-ink-faint">{s.dateHint}</p>

              <button
                type="button"
                onClick={() => void runScan()}
                disabled={phase.step === "searching"}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep disabled:opacity-60"
              >
                <MailIcon className="h-[17px] w-[17px]" />
                {phase.step === "searching" ? s.searching : s.scan}
              </button>
            </>
          )}

          {phase.step === "reading" && (
            <div className="space-y-2 py-6 text-center">
              <p className="text-sm font-medium text-ink">
                {s.reading
                  .replace("{done}", String(phase.done))
                  .replace("{total}", String(phase.total))}
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-paper-deep">
                <div
                  className="h-full rounded-full bg-sea transition-[width] duration-300"
                  style={{
                    width: `${Math.round((phase.done / Math.max(1, phase.total)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {phase.step === "saving" && (
            <p className="py-6 text-center text-sm text-ink-soft">
              {strings.common.loading}
            </p>
          )}

          {phase.step === "results" && (
            <>
              {phase.reviewed.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-soft">
                  {s.noBookings.replace("{n}", String(phase.scanned))}
                </p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-bold text-ink">
                      {s.foundTitle.replace("{n}", String(phase.reviewed.length))}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setPicked(
                          picked.size === 0
                            ? new Set(fresh.map((r) => r.candidate.message_id))
                            : new Set()
                        )
                      }
                      className="text-xs font-semibold text-sea"
                    >
                      {picked.size === 0 ? s.selectAll : s.clearAll}
                    </button>
                  </div>

                  <ul className="space-y-2">
                    {phase.reviewed.map((reviewed) => (
                      <CandidateRow
                        key={reviewed.candidate.message_id}
                        reviewed={reviewed}
                        checked={picked.has(reviewed.candidate.message_id)}
                        onToggle={() =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (next.has(reviewed.candidate.message_id)) {
                              next.delete(reviewed.candidate.message_id);
                            } else {
                              next.add(reviewed.candidate.message_id);
                            }
                            return next;
                          })
                        }
                      />
                    ))}
                  </ul>
                </>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void save(phase.reviewed)}
                  disabled={picked.size === 0}
                  className="flex-1 rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep disabled:opacity-60"
                >
                  {picked.size === 1
                    ? s.saveOne
                    : s.save.replace("{n}", String(picked.size))}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(new Set());
                    setError(null);
                    setPhase({ step: "setup" });
                  }}
                  className="rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink-soft"
                >
                  {s.rescan}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

function CandidateRow({
  reviewed,
  checked,
  onToggle,
}: {
  reviewed: ReviewedCandidate;
  checked: boolean;
  onToggle: () => void;
}) {
  const { candidate, duplicateOf } = reviewed;
  const Icon = BOOKING_TYPE_ICON[candidate.type];
  const s = strings.mailImport;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        className={`flex w-full items-start gap-2.5 rounded-[16px] border p-3 text-start transition-colors ${
          checked ? "border-sea bg-sea-tint/40" : "border-line bg-white"
        }`}
      >
        <span
          aria-hidden="true"
          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
            checked ? "border-sea bg-sea text-white" : "border-line bg-white"
          }`}
        >
          {checked && <CheckIcon className="h-3 w-3" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 shrink-0 text-sea-deep" strokeWidth={1.7} />
            <span className="truncate text-sm font-semibold text-ink">
              {candidate.title}
            </span>
          </span>

          <span className="mt-0.5 block text-[12px] text-ink-soft">
            {strings.bookings.types[candidate.type]}
            {candidate.start_date ? (
              <>
                {" · "}
                <span dir="ltr">
                  {formatDate(candidate.start_date)}
                  {candidate.end_date ? ` - ${formatDate(candidate.end_date)}` : ""}
                </span>
              </>
            ) : (
              <>
                {" · "}
                {s.noDates}
              </>
            )}
            {candidate.confirmation_code && (
              <>
                {" · "}
                <span dir="ltr">{candidate.confirmation_code}</span>
              </>
            )}
          </span>

          {/* The subject line is the receipt for where this came from: it is how
              the owner tells a real confirmation from something the model
              misread, without leaving the app to open the mailbox. */}
          <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
            {candidate.subject}
          </span>

          {duplicateOf && (
            <span className="mt-1 inline-block rounded-full bg-paper-deep px-2 py-0.5 text-[10.5px] font-semibold text-ink-soft">
              {s.alreadyHave}
            </span>
          )}
        </span>

        {candidate.cost != null && (
          <span className="shrink-0 text-[12px] font-semibold text-ink" dir="ltr">
            {formatMoney(candidate.cost, candidate.currency ?? "ILS")}
          </span>
        )}
      </button>
    </li>
  );
}
