"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Toast } from "@/components/Toast";
import { getActiveTrip } from "@/lib/data/trip";
import { listKids } from "@/lib/data/kids";
import {
  addPocketExpense,
  deletePocketExpense,
  listPocketExpenses,
  listPocketMoney,
  setAllowance,
  type PocketExpense,
  type PocketMoney,
} from "@/lib/data/pocket";
import { formatMoney, formatShortDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { Member, Trip } from "@/lib/types";

export function PocketScreen() {
  const { member, memberLoading } = useMember();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [kids, setKids] = useState<Member[]>([]);
  const [allowances, setAllowances] = useState<PocketMoney[]>([]);
  const [expenses, setExpenses] = useState<PocketExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [addFor, setAddFor] = useState<string | null>(null); // kid_id
  const [allowanceFor, setAllowanceFor] = useState<Member | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string, isOwner: boolean) => {
    const [money, exps] = await Promise.all([
      listPocketMoney(tripId),
      listPocketExpenses(tripId),
    ]);
    setAllowances(money);
    setExpenses(exps);
    if (isOwner) setKids(await listKids(tripId));
  }, []);

  useEffect(() => {
    // Nothing to fetch until a member is resolved. When resolution finishes
    // and produces nobody, `loading` is left as-is on purpose — the render
    // below only treats it as meaningful once a member exists.
    if (memberLoading || !member) return;
    let cancelled = false;
    void (async () => {
      const activeTrip = await getActiveTrip();
      if (cancelled || !activeTrip) {
        setLoading(false);
        return;
      }
      setTrip(activeTrip);
      try {
        await refresh(activeTrip.id, member.role === "owner");
      } catch {
        if (!cancelled) showToast(strings.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [member, memberLoading, refresh, showToast]);

  // `loading` only means "this member's data is on its way", so it is only
  // consulted once there IS a member. Previously the guard was
  // `loading || !member`, which meant a failed member lookup (an expired
  // session returns 401) left the screen on "loading…" forever, with nothing
  // said and nothing to act on — reported from production 2026-08-29.
  if (memberLoading || (member && loading)) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8 text-center">
        <p className="mb-3 text-ink-soft">{strings.common.noMember}</p>
        <Link href="/login" className="font-semibold text-sea underline">
          {strings.common.signInAgain}
        </Link>
      </div>
    );
  }

  const isOwner = member.role === "owner";
  const shownKids = isOwner ? kids : [member];

  const spentBy = (kidId: string) =>
    expenses.filter((e) => e.kid_id === kidId).reduce((s, e) => s + e.amount, 0);
  const allowanceOf = (kidId: string) =>
    allowances.find((a) => a.kid_id === kidId)?.allowance ?? null;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-2xl font-bold">{strings.pocket.title}</h1>
      {isOwner && (
        <p className="text-xs text-ink-soft">{strings.pocket.infoNote}</p>
      )}

      {isOwner && shownKids.length === 0 && (
        <section className="ot-card p-8 text-center">
          <p className="mb-3 text-4xl" aria-hidden="true">🪙</p>
          <h2 className="mb-2 text-lg font-semibold">{strings.pocket.noKids}</h2>
          <p className="mb-4 text-sm text-ink-soft">{strings.pocket.noKidsBody}</p>
          <Link
            href="/kids"
            className="inline-block rounded-xl bg-sea px-5 py-2.5 font-semibold text-white active:bg-sea-deep"
          >
            {strings.pocket.noKidsCta}
          </Link>
        </section>
      )}

      {shownKids.map((kid) => {
        const allowance = allowanceOf(kid.id);
        const spent = spentBy(kid.id);
        const left = allowance !== null ? Math.max(allowance - spent, 0) : null;
        const pct =
          allowance && allowance > 0 ? Math.min((spent / allowance) * 100, 100) : 0;
        const kidExpenses = expenses.filter((e) => e.kid_id === kid.id);

        return (
          <section
            key={kid.id}
            className="rounded-2xl border border-line bg-white p-4 shadow-sm"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold text-ink">
                🪙 {isOwner ? kid.display_name : strings.pocket.allowance}
              </h2>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setAllowanceFor(kid)}
                  className="text-xs font-semibold text-sea"
                >
                  {strings.pocket.setAllowance}
                </button>
              )}
            </div>

            {allowance === null ? (
              <p className="mt-2 text-sm text-ink-soft">
                {strings.pocket.noAllowance}
              </p>
            ) : (
              <>
                <div className="mt-2 flex items-baseline justify-between text-sm">
                  <span className="text-ink-soft">
                    {strings.pocket.spent}{" "}
                    <strong dir="ltr">{formatMoney(spent, "ILS")}</strong>
                  </span>
                  <span className="text-lg font-bold text-sea" dir="ltr">
                    {strings.pocket.left} {formatMoney(left ?? 0, "ILS")}
                  </span>
                </div>
                {/* fun progress visual */}
                <div className="mt-2 h-4 overflow-hidden rounded-full bg-paper-deep">
                  <div
                    className={`flex h-full items-center justify-end rounded-full pe-1 text-[10px] ${
                      pct >= 90 ? "bg-rose-400" : pct >= 60 ? "bg-amber-400" : "bg-sea"
                    }`}
                    style={{ width: `${Math.max(pct, 8)}%` }}
                  >
                    {pct >= 90 ? "😱" : pct >= 60 ? "🙈" : "😎"}
                  </div>
                </div>
              </>
            )}

            {!isOwner && (
              <button
                type="button"
                onClick={() => setAddFor(kid.id)}
                className="mt-3 w-full rounded-xl bg-sea py-3 font-bold text-white hover:bg-sea-deep"
              >
                🛍️ {strings.pocket.addExpense}
              </button>
            )}

            {kidExpenses.length === 0 ? (
              <p className="mt-3 text-center text-xs text-ink-soft">
                {strings.pocket.empty}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {kidExpenses.map((expense) => (
                  <li
                    key={expense.id}
                    className="flex items-baseline justify-between gap-2 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-ink">
                      {formatShortDate(expense.spent_on)} ·{" "}
                      {expense.description || "🛍️"}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <strong dir="ltr">{formatMoney(expense.amount, "ILS")}</strong>
                      {!isOwner && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirm(strings.pocket.deleteConfirm)) return;
                            void deletePocketExpense(expense.id)
                              .then(() => trip && refresh(trip.id, isOwner))
                              .catch(() => showToast(strings.common.error));
                          }}
                          className="text-xs text-rose-400"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {/* kid: log a purchase */}
      {addFor && trip && (
        <AddPocketExpenseSheet
          onClose={() => setAddFor(null)}
          onSave={(amount, description) => {
            const kidId = addFor;
            setAddFor(null);
            void addPocketExpense({ tripId: trip.id, kidId, amount, description })
              .then(() => refresh(trip.id, isOwner))
              .then(() => showToast(strings.pocket.saved))
              .catch(() => showToast(strings.common.error));
          }}
        />
      )}

      {/* owner: set allowance */}
      {allowanceFor && trip && (
        <AllowanceSheet
          kid={allowanceFor}
          current={allowanceOf(allowanceFor.id)}
          onClose={() => setAllowanceFor(null)}
          onSave={(amount) => {
            const kidId = allowanceFor.id;
            setAllowanceFor(null);
            void setAllowance(trip.id, kidId, amount)
              .then(() => refresh(trip.id, isOwner))
              .catch(() => showToast(strings.common.error));
          }}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}

function AddPocketExpenseSheet({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (amount: number, description: string | null) => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const value = Number(amount);

  return (
    <Sheet open onClose={onClose} title={strings.pocket.addExpense}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (Number.isFinite(value) && value > 0) {
            onSave(value, description.trim() || null);
          }
        }}
      >
        <div>
          <label htmlFor="pk-amount" className="mb-1 block text-sm font-medium text-ink-soft">
            {strings.pocket.howMuch}
          </label>
          <input
            id="pk-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            autoFocus
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-2xl font-bold focus:border-sea focus:outline-none"
            dir="ltr"
          />
        </div>
        <div>
          <label htmlFor="pk-desc" className="mb-1 block text-sm font-medium text-ink-soft">
            {strings.pocket.whatBought}
          </label>
          <input
            id="pk-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={!Number.isFinite(value) || value <= 0}
          className="w-full rounded-xl bg-sea py-3 font-bold text-white hover:bg-sea-deep disabled:opacity-50"
        >
          {strings.pocket.save}
        </button>
      </form>
    </Sheet>
  );
}

function AllowanceSheet({
  kid,
  current,
  onClose,
  onSave,
}: {
  kid: Member;
  current: number | null;
  onClose: () => void;
  onSave: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(current !== null ? String(current) : "");
  const value = Number(amount);

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${strings.pocket.setAllowance} — ${kid.display_name}`}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (Number.isFinite(value) && value >= 0) onSave(value);
        }}
      >
        <div>
          <label htmlFor="al-amount" className="mb-1 block text-sm font-medium text-ink-soft">
            {strings.pocket.allowance} (₪)
          </label>
          <input
            id="al-amount"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            autoFocus
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-2xl font-bold focus:border-sea focus:outline-none"
            dir="ltr"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep"
        >
          {strings.common.save}
        </button>
      </form>
    </Sheet>
  );
}
