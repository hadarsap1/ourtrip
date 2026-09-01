"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { getActiveTrip } from "@/lib/data/trip";
import {
  autofillEmergency,
  countryName,
  getTodayCountryCode,
  listCountryOptions,
  listEmergencyPages,
  type EmergencyContent,
  type EmergencyPage,
} from "@/lib/data/emergency";
import { useMember } from "@/lib/useMember";
import { EditIcon, SparkleIcon } from "@/components/icons";
import { strings } from "@/lib/strings";
import type { Trip } from "@/lib/types";
import { EmergencyEditSheet } from "./EmergencyEditSheet";

function TelRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <a
      href={`tel:${value.replace(/[^\d+*#]/g, "")}`}
      className="flex items-center justify-between rounded-xl bg-white px-3 py-3 shadow-sm"
    >
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="text-lg font-bold text-rose-600" dir="ltr">
        {value}
      </span>
    </a>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <span className="shrink-0 text-sm text-ink-soft">{label}</span>
      <span className="text-end text-sm font-medium text-ink">{value}</span>
    </div>
  );
}

export function EmergencyScreen() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [pages, setPages] = useState<EmergencyPage[]>([]);
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ countryCode: string | null } | null>(null);
  const [autofilling, setAutofilling] = useState(false);
  const { member } = useMember();
  const isOwner = !member || member.role === "owner";

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    const [{ pages: nextPages, fromCache: cached }, options] = await Promise.all([
      listEmergencyPages(tripId),
      listCountryOptions(tripId),
    ]);
    setPages(nextPages);
    setFromCache(cached);
    setCountryOptions(options);
    return nextPages;
  }, []);

  const runAutofill = useCallback(
    async (code: string) => {
      if (!trip || autofilling) return;
      setAutofilling(true);
      try {
        await autofillEmergency(code);
        await refresh(trip.id);
        showToast(strings.emergency.autofilled);
      } catch {
        showToast(strings.common.error);
      } finally {
        setAutofilling(false);
      }
    },
    [trip, autofilling, refresh, showToast]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const activeTrip = await getActiveTrip();
      // offline-critical: even without a trip row (offline start), cached
      // pages must render — listEmergencyPages falls back to IndexedDB.
      if (!cancelled) setTrip(activeTrip);
      const tripId = activeTrip?.id ?? "";
      try {
        const nextPages = await refresh(tripId);
        if (cancelled) return;
        const todayCountry = await getTodayCountryCode(tripId);
        if (cancelled) return;
        setSelected((current) => {
          if (current) return current;
          if (todayCountry && nextPages.some((p) => p.countryCode === todayCountry)) {
            return todayCountry;
          }
          return todayCountry ?? nextPages[0]?.countryCode ?? null;
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  const allCountries = [
    ...new Set([...pages.map((p) => p.countryCode), ...countryOptions]),
  ].sort();
  const page = selected
    ? (pages.find((p) => p.countryCode === selected) ?? null)
    : null;
  const content: EmergencyContent = page?.content ?? {};

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-rose-700">
          <span className="rounded-md border-[1.4px] border-current/40 px-[5px] py-0.5 text-[10px] font-extrabold tracking-[0.06em]">
            {strings.emergency.sos}
          </span>{" "}
          {strings.emergency.title}
        </h1>
        {trip && (
          <button
            type="button"
            onClick={() => setEditing({ countryCode: selected })}
            className="rounded-xl border border-line px-3 py-1.5 text-sm font-semibold text-ink-soft"
          >
            <EditIcon className="inline-block h-4 w-4 align-text-bottom" /> {strings.emergency.editTitle}
          </button>
        )}
      </div>

      {fromCache && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-700">
          {strings.offline.fromCache}
        </p>
      )}

      {allCountries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-soft">
          {strings.emergency.noCountries}
        </p>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {allCountries.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setSelected(code)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
                selected === code
                  ? "bg-rose-600 text-white"
                  : "bg-white text-ink-soft shadow-sm"
              }`}
            >
              {countryName(code)}
            </button>
          ))}
          {trip && (
            <button
              type="button"
              onClick={() => setEditing({ countryCode: null })}
              className="shrink-0 rounded-full border border-dashed border-line px-3 py-1.5 text-sm font-semibold text-ink-soft"
            >
              + {strings.emergency.addCountry}
            </button>
          )}
        </div>
      )}

      {selected && (
        <>
          {!page || Object.keys(content).length === 0 ? (
            <div className="space-y-3 rounded-2xl border border-dashed border-rose-200 bg-white p-6 text-center">
              <p className="text-sm text-ink-soft">{strings.emergency.emptyPage}</p>
              {isOwner && trip && (
                <>
                  <button
                    type="button"
                    onClick={() => void runAutofill(selected)}
                    disabled={autofilling}
                    className="w-full rounded-2xl bg-sea py-3 font-semibold text-white shadow-sm disabled:opacity-50"
                  >
                    <SparkleIcon className="inline-block h-4 w-4 align-text-bottom" />{" "}
                    {autofilling ? strings.emergency.autofilling : strings.emergency.autofill}
                  </button>
                  <p className="text-xs text-ink-soft">{strings.emergency.autofillHint}</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {(content.police || content.ambulance || content.fire) && (
                <section className="rounded-2xl bg-rose-50 p-3">
                  <h2 className="mb-2 px-1 text-sm font-bold text-rose-700">
                    {strings.emergency.numbers}
                  </h2>
                  <div className="space-y-2">
                    <TelRow label={strings.emergency.police} value={content.police} />
                    <TelRow label={strings.emergency.ambulance} value={content.ambulance} />
                    <TelRow label={strings.emergency.fire} value={content.fire} />
                  </div>
                </section>
              )}

              {(content.embassy_phone || content.embassy_address) && (
                <section className="rounded-2xl border border-line bg-white shadow-sm">
                  <h2 className="border-b border-line px-3 py-2 text-sm font-bold text-ink">
                    {strings.emergency.embassy}
                  </h2>
                  {content.embassy_phone && (
                    <div className="p-2">
                      <TelRow label={strings.emergency.phone} value={content.embassy_phone} />
                    </div>
                  )}
                  <InfoRow label={strings.emergency.address} value={content.embassy_address} />
                </section>
              )}

              {(content.insurance_company || content.insurance_policy || content.insurance_phone) && (
                <section className="rounded-2xl border border-line bg-white shadow-sm">
                  <h2 className="border-b border-line px-3 py-2 text-sm font-bold text-ink">
                    {strings.emergency.insurance}
                  </h2>
                  {content.insurance_phone && (
                    <div className="p-2">
                      <TelRow label={strings.emergency.insurancePhone} value={content.insurance_phone} />
                    </div>
                  )}
                  <InfoRow label={strings.emergency.insuranceCompany} value={content.insurance_company} />
                  <InfoRow label={strings.emergency.insurancePolicy} value={content.insurance_policy} />
                </section>
              )}

              {(content.hotel_name || content.hotel_address || content.hotel_phone) && (
                <section className="rounded-2xl border border-line bg-white shadow-sm">
                  <h2 className="border-b border-line px-3 py-2 text-sm font-bold text-ink">
                    {strings.emergency.hotel}
                  </h2>
                  {content.hotel_phone && (
                    <div className="p-2">
                      <TelRow label={strings.emergency.phone} value={content.hotel_phone} />
                    </div>
                  )}
                  <InfoRow label={strings.emergency.hotelName} value={content.hotel_name} />
                  <InfoRow label={strings.emergency.address} value={content.hotel_address} />
                </section>
              )}

              {content.medical_notes && (
                <section className="rounded-2xl border border-line bg-white p-3 shadow-sm">
                  <h2 className="mb-1 text-sm font-bold text-ink">
                    {strings.emergency.medical}
                  </h2>
                  <p className="whitespace-pre-wrap text-sm text-ink">
                    {content.medical_notes}
                  </p>
                </section>
              )}

              {/* auto-filled data can be imperfect — nudge to verify the embassy
                  and numbers against the official source */}
              {(content.police ||
                content.ambulance ||
                content.fire ||
                content.embassy_phone ||
                content.embassy_address) && (
                <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <span className="font-semibold">{strings.emergency.verifyTitle}: </span>
                  {strings.emergency.verifyBody}{" "}
                  <a
                    href="https://embassies.gov.il"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline"
                  >
                    {strings.emergency.verifyLink}
                  </a>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {trip && (
        <EmergencyEditSheet
          open={editing !== null}
          tripId={trip.id}
          countryCode={editing?.countryCode ?? null}
          existing={
            editing?.countryCode
              ? (pages.find((p) => p.countryCode === editing.countryCode)?.content ?? {})
              : {}
          }
          onClose={() => setEditing(null)}
          onSaved={(code) => {
            setEditing(null);
            setSelected(code);
            void refresh(trip.id)
              .then(() => showToast(strings.emergency.saved))
              .catch(() => showToast(strings.common.error));
          }}
          onDeleted={(code) => {
            setEditing(null);
            setSelected((cur) => (cur === code ? null : cur));
            void refresh(trip.id)
              .then((next) => {
                setSelected((cur) => cur ?? next[0]?.countryCode ?? null);
                showToast(strings.emergency.deleted);
              })
              .catch(() => showToast(strings.common.error));
          }}
          onError={() => showToast(strings.common.error)}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
