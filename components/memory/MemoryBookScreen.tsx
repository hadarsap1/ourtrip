"use client";

import { useEffect, useState } from "react";
import {
  loadMemoryBook,
  type MemoryAlbumDay,
  type MemoryBook,
  type MemoryEntry,
} from "@/lib/data/memoryBook";
import type { PhotoWithUrl } from "@/lib/data/photos";
import { getActiveTrip } from "@/lib/data/trip";
import { formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";

export function MemoryBookScreen() {
  const s = strings.memoryBook;
  const { member, memberLoading } = useMember();
  const [book, setBook] = useState<MemoryBook | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const trip = await getActiveTrip();
      if (cancelled || !trip) {
        setLoading(false);
        return;
      }
      try {
        const b = await loadMemoryBook(trip);
        if (!cancelled) setBook(b);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (memberLoading) return null;
  if (member && member.role !== "owner") {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center text-slate-500">
        {s.ownersOnly}
      </div>
    );
  }
  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center text-slate-500">
        {s.loading}
      </div>
    );
  }

  const isEmpty = !book || (book.entries.length === 0 && book.album.length === 0);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-10">
      {/* controls — hidden when printing */}
      <div className="no-print mb-6">
        <h1 className="text-2xl font-bold">{s.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{s.subtitle}</p>
        {!isEmpty && (
          <>
            <button
              type="button"
              onClick={() => window.print()}
              className="mt-4 w-full rounded-2xl bg-teal-600 py-3 font-semibold text-white shadow-sm"
            >
              🖨️ {s.print}
            </button>
            <p className="mt-2 text-center text-xs text-slate-400">{s.hint}</p>
          </>
        )}
      </div>

      {isEmpty ? (
        <p className="no-print rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {s.empty}
        </p>
      ) : (
        <article className="space-y-8 rounded-2xl bg-white p-6 shadow-sm print:p-0 print:shadow-none">
          {/* cover */}
          <header className="border-b border-slate-200 pb-6 text-center">
            <p className="text-sm text-slate-400">{s.coverPrefix}</p>
            <h2 className="mt-1 text-3xl font-bold text-slate-800">{book!.tripName}</h2>
            <p className="mt-2 text-sm text-slate-400">
              {book!.entries.length + book!.album.length} · {s.stats} · {book!.photoCount}
            </p>
          </header>

          {/* journal */}
          {book!.entries.length > 0 && (
            <section className="space-y-6">
              <h3 className="text-lg font-bold text-teal-700">📖 {s.journalTitle}</h3>
              {book!.entries.map((e: MemoryEntry) => (
                <div key={e.id} className="print-page-break space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-700">
                      {e.mood ? `${e.mood} ` : ""}
                      {formatDate(e.entry_date)}
                    </span>
                    {e.location_name && (
                      <span className="text-xs text-slate-400">📍 {e.location_name}</span>
                    )}
                  </div>
                  {e.body && (
                    <p className="whitespace-pre-wrap text-slate-700">{e.body}</p>
                  )}
                  {e.photos.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {e.photos.map((p: PhotoWithUrl) => (
                        // eslint-disable-next-line @next/next/no-img-element -- signed URL
                        <img
                          key={p.id}
                          src={p.url ?? ""}
                          alt={p.caption ?? ""}
                          className="h-40 w-full rounded-lg object-cover"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* album */}
          {book!.album.length > 0 && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-teal-700">📷 {s.albumTitle}</h3>
              {book!.album.map((day: MemoryAlbumDay) => (
                <div key={day.date} className="print-page-break space-y-2">
                  <p className="text-sm font-semibold text-slate-500">
                    {formatDate(day.date)}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {day.photos.map((p: PhotoWithUrl) => (
                      // eslint-disable-next-line @next/next/no-img-element -- signed URL
                      <img
                        key={p.id}
                        src={p.url ?? ""}
                        alt={p.caption ?? ""}
                        className="h-28 w-full rounded-lg object-cover"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </article>
      )}
    </div>
  );
}
