"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Toast } from "@/components/Toast";
import {
  createLink,
  deleteLink,
  listLinks,
  updateLink,
  type LinkInput,
} from "@/lib/data/links";
import { getActiveTrip } from "@/lib/data/trip";
import { strings } from "@/lib/strings";
import { useMember } from "@/lib/useMember";
import type { SavedLink, Trip } from "@/lib/types";

type Grouped = { country: string; areas: { area: string; links: SavedLink[] }[] }[];

function group(links: SavedLink[], ungrouped: string): Grouped {
  const byCountry = new Map<string, Map<string, SavedLink[]>>();
  for (const l of links) {
    const c = l.country?.trim() || ungrouped;
    const a = l.area?.trim() || "";
    if (!byCountry.has(c)) byCountry.set(c, new Map());
    const areas = byCountry.get(c)!;
    if (!areas.has(a)) areas.set(a, []);
    areas.get(a)!.push(l);
  }
  return [...byCountry.entries()].map(([country, areas]) => ({
    country,
    areas: [...areas.entries()].map(([area, ls]) => ({ area, links: ls })),
  }));
}

export function LinksScreen() {
  const s = strings.links;
  const { member, memberLoading } = useMember();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<SavedLink | "new" | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((m: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(m);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    setLinks(await listLinks(tripId));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const t = await getActiveTrip();
      if (cancelled || !t) {
        setLoading(false);
        return;
      }
      setTrip(t);
      try {
        await refresh(t.id);
      } catch {
        showToast(strings.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, showToast]);

  const countries = useMemo(
    () => [...new Set(links.map((l) => l.country?.trim()).filter(Boolean))] as string[],
    [links]
  );
  const areas = useMemo(
    () => [...new Set(links.map((l) => l.area?.trim()).filter(Boolean))] as string[],
    [links]
  );

  const save = useCallback(
    async (input: LinkInput) => {
      if (!trip) return;
      if (!input.title.trim() || !input.url.trim()) {
        showToast(s.invalid);
        return;
      }
      try {
        if (editing && editing !== "new") await updateLink(editing.id, input);
        else await createLink(trip.id, input);
        setEditing(null);
        await refresh(trip.id);
      } catch {
        showToast(strings.common.error);
      }
    },
    [editing, refresh, s.invalid, showToast, trip]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!trip || !confirm(s.deleteConfirm)) return;
      try {
        await deleteLink(id);
        setLinks((prev) => prev.filter((l) => l.id !== id));
      } catch {
        showToast(strings.common.error);
      }
    },
    [s.deleteConfirm, showToast, trip]
  );

  if (memberLoading || loading) return null;
  if (member && member.role !== "owner") {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center text-ink-soft">
        {s.ownersOnly}
      </div>
    );
  }

  const grouped = group(links, s.ungrouped);

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 pt-8 pb-8">
      <header>
        <h1 className="text-2xl font-bold">{s.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{s.subtitle}</p>
      </header>

      <button
        type="button"
        onClick={() => setEditing("new")}
        className="w-full rounded-2xl bg-sea py-3 font-semibold text-white shadow-sm"
      >
        + {s.add}
      </button>

      {links.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-soft">
          {s.empty}
        </p>
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => (
            <section key={g.country}>
              <h2 className="mb-2 text-sm font-bold text-sea">🌍 {g.country}</h2>
              <div className="space-y-3">
                {g.areas.map((a) => (
                  <div key={a.area || "_"}>
                    {a.area && (
                      <h3 className="mb-1 pr-1 text-xs font-semibold text-ink-soft">
                        {a.area}
                      </h3>
                    )}
                    <ul className="space-y-2">
                      {a.links.map((l) => (
                        <li
                          key={l.id}
                          className="rounded-2xl border border-line bg-white p-3 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <a
                              href={l.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-0 flex-1 font-semibold text-ink"
                            >
                              🔗 {l.title}
                            </a>
                            <div className="flex shrink-0 gap-2 text-xs">
                              <button
                                type="button"
                                onClick={() => setEditing(l)}
                                className="text-ink-soft"
                              >
                                {strings.common.edit}
                              </button>
                              <button
                                type="button"
                                onClick={() => void remove(l.id)}
                                className="text-rose-500"
                              >
                                {strings.common.delete}
                              </button>
                            </div>
                          </div>
                          {l.note && (
                            <p className="mt-1 text-sm text-ink-soft">{l.note}</p>
                          )}
                          <p className="mt-1 truncate text-xs text-line" dir="ltr">
                            {l.url}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <LinkFormSheet
          link={editing === "new" ? null : editing}
          countries={countries}
          areas={areas}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}

function LinkFormSheet({
  link,
  countries,
  areas,
  onClose,
  onSave,
}: {
  link: SavedLink | null;
  countries: string[];
  areas: string[];
  onClose: () => void;
  onSave: (input: LinkInput) => void;
}) {
  const s = strings.links;
  const [title, setTitle] = useState(link?.title ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [country, setCountry] = useState(link?.country ?? "");
  const [area, setArea] = useState(link?.area ?? "");
  const [note, setNote] = useState(link?.note ?? "");

  const field =
    "w-full rounded-xl border border-line px-3 py-2 text-base focus:border-sea focus:outline-none";

  return (
    <Sheet open onClose={onClose} title={link ? s.edit : s.add}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            title,
            url,
            country: country || null,
            area: area || null,
            note: note || null,
          });
        }}
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-soft">{s.linkTitle}</span>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-soft">{s.url}</span>
          <input className={field} value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" inputMode="url" placeholder="https://…" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">{s.country}</span>
            <input className={field} value={country} onChange={(e) => setCountry(e.target.value)} list="link-countries" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">{s.area}</span>
            <input className={field} value={area} onChange={(e) => setArea(e.target.value)} list="link-areas" />
          </label>
        </div>
        <datalist id="link-countries">
          {countries.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="link-areas">
          {areas.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-soft">{s.note}</span>
          <textarea className={field} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </label>
        <button type="submit" className="w-full rounded-xl bg-sea py-3 font-semibold text-white">
          {s.save}
        </button>
      </form>
    </Sheet>
  );
}
