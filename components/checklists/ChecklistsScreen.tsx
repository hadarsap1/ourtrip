"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { getActiveTrip, listMembers } from "@/lib/data/trip";
import {
  addChecklistItem,
  createFromTemplate,
  deleteChecklist,
  listChecklistItems,
  listChecklists,
  setItemChecked,
  subscribeChecklists,
} from "@/lib/data/checklists";
import { saveOrQueue } from "@/lib/offline/queue";
import { strings } from "@/lib/strings";
import type { Checklist, ChecklistItem, Member, Trip } from "@/lib/types";
import { ImportChecklistSheet } from "./ImportChecklistSheet";
import { ItemEditSheet } from "./ItemEditSheet";
import { ListFormSheet } from "./ListFormSheet";

export function ChecklistsScreen() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [lists, setLists] = useState<Checklist[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [openListId, setOpenListId] = useState<string | null>(null);

  const [listForm, setListForm] = useState<{ rename: Checklist | null } | null>(null);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [importing, setImporting] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    const nextLists = await listChecklists(tripId);
    const nextItems = await listChecklistItems(nextLists.map((l) => l.id));
    setLists(nextLists);
    setItems(nextItems);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    let debounce: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      const activeTrip = await getActiveTrip();
      if (cancelled || !activeTrip) {
        setLoading(false);
        return;
      }
      setTrip(activeTrip);
      try {
        const [, tripMembers] = await Promise.all([
          refresh(activeTrip.id),
          listMembers(activeTrip.id),
        ]);
        if (!cancelled) setMembers(tripMembers);
      } catch {
        if (!cancelled) showToast(strings.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Realtime check-off: any change on either device → one refetch.
      unsubscribe = subscribeChecklists(() => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          void refresh(activeTrip.id).catch(() => {});
        }, 250);
      });
    })();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      unsubscribe();
    };
  }, [refresh, showToast]);

  /**
   * Check-off is the one action here that must survive a dead zone — packing
   * happens in hotel rooms with no wifi — so it applies optimistically, queues
   * when offline (audit S-1), and only rolls back on a real rejection.
   * Deliberately not routed through `run`, which refetches from the server and
   * would flip the box straight back while offline.
   */
  const toggleItem = useCallback(
    async (item: ChecklistItem, checked: boolean) => {
      setItems((current) =>
        current.map((i) => (i.id === item.id ? { ...i, checked } : i))
      );
      try {
        const outcome = await saveOrQueue(
          () => setItemChecked(item.id, checked),
          { kind: "checklist-item", payload: { itemId: item.id, checked } }
        );
        if (outcome === "queued") showToast(strings.offline.queued);
        else if (trip) await refresh(trip.id);
      } catch {
        setItems((current) =>
          current.map((i) =>
            i.id === item.id ? { ...i, checked: item.checked } : i
          )
        );
        showToast(strings.common.error);
      }
    },
    [trip, refresh, showToast]
  );

  const run = useCallback(
    async (action: () => Promise<void>, successMessage?: string) => {
      if (!trip) return;
      try {
        await action();
        await refresh(trip.id);
        if (successMessage) showToast(successMessage);
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        showToast(
          message === "template_in_use"
            ? strings.checklists.templateInUse
            : strings.common.error
        );
      }
    },
    [trip, refresh, showToast]
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  const itemsOf = (listId: string) => items.filter((i) => i.checklist_id === listId);
  const memberName = (id: string | null) =>
    id ? (members.find((m) => m.id === id)?.display_name ?? null) : null;

  const openList = openListId ? (lists.find((l) => l.id === openListId) ?? null) : null;

  // ---------- detail view ----------
  if (openList) {
    const listItems = itemsOf(openList.id);
    const checkedCount = listItems.filter((i) => i.checked).length;

    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setOpenListId(null)}
            className="text-sm font-semibold text-sea"
          >
            ← {strings.checklists.back}
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setListForm({ rename: openList })}
              aria-label={strings.checklists.listName}
              className="p-1 text-ink-soft hover:text-ink-soft"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4.5 w-4.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirm(strings.checklists.deleteListConfirm)) return;
                setOpenListId(null);
                void run(() => deleteChecklist(openList.id));
              }}
              className="text-sm font-semibold text-rose-500"
            >
              {strings.common.delete}
            </button>
          </div>
        </div>

        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">
            {openList.title}
            {openList.is_template && (
              <span className="mr-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                {strings.checklists.templates}
              </span>
            )}
          </h1>
          {!openList.is_template && listItems.length > 0 && (
            <span className="text-sm font-semibold text-ink-soft" dir="ltr">
              {checkedCount}/{listItems.length}
            </span>
          )}
        </div>

        <section className="rounded-2xl border border-line bg-white shadow-sm">
          {listItems.length === 0 ? (
            <p className="px-4 py-4 text-sm text-ink-soft">
              {strings.checklists.emptyItems}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {listItems.map((item) => {
                const assignee = memberName(item.assigned_to);
                return (
                  <li key={item.id} className="flex items-center gap-2 px-3 py-1.5">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => void toggleItem(item, e.target.checked)}
                        className="h-5 w-5 shrink-0 accent-teal-600"
                      />
                      <span
                        className={`min-w-0 truncate ${
                          item.checked
                            ? "text-ink-soft line-through"
                            : "text-ink"
                        }`}
                      >
                        {item.label}
                      </span>
                      {assignee && (
                        <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
                          {assignee}
                        </span>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() => setEditingItem(item)}
                      aria-label={strings.checklists.editItem}
                      className="p-1.5 text-line hover:text-ink-soft"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const label = newItemLabel.trim();
              if (!label) return;
              setNewItemLabel("");
              void run(() =>
                addChecklistItem(openList.id, label, listItems.length)
              );
            }}
          >
            <input
              type="text"
              value={newItemLabel}
              onChange={(e) => setNewItemLabel(e.target.value)}
              placeholder={strings.checklists.addItemPlaceholder}
              className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-base focus:border-sea focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-sea px-4 py-2 text-sm font-semibold text-white hover:bg-sea-deep"
            >
              {strings.checklists.add}
            </button>
          </form>
        </section>

        <ItemEditSheet
          item={editingItem}
          members={members}
          onClose={() => setEditingItem(null)}
          onSubmit={(action) => {
            setEditingItem(null);
            void run(action);
          }}
        />

        <ListFormSheet
          open={listForm !== null}
          rename={listForm?.rename ?? null}
          onClose={() => setListForm(null)}
          onSubmit={(action, message) => {
            setListForm(null);
            void run(action, message);
          }}
          tripId={trip?.id ?? ""}
        />

        <Toast message={toast} />
      </div>
    );
  }

  // ---------- lists overview ----------
  const regularLists = lists.filter((l) => !l.is_template);
  const templates = lists.filter((l) => l.is_template);

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-2xl font-bold">{strings.checklists.title}</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink-soft">
          {strings.checklists.lists}
        </h2>
        {regularLists.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-soft">
            {strings.checklists.empty}
          </p>
        ) : (
          <ul className="space-y-2">
            {regularLists.map((list) => {
              const listItems = itemsOf(list.id);
              const checkedCount = listItems.filter((i) => i.checked).length;
              return (
                <li key={list.id}>
                  <button
                    type="button"
                    onClick={() => setOpenListId(list.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-start shadow-sm"
                  >
                    <span className="font-semibold text-ink">{list.title}</span>
                    <span className="text-sm font-semibold text-ink-soft" dir="ltr">
                      {checkedCount}/{listItems.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink-soft">
          {strings.checklists.templates}
        </h2>
        {templates.length === 0 ? (
          <p className="text-sm text-ink-soft">{strings.checklists.emptyTemplates}</p>
        ) : (
          <ul className="space-y-2">
            {templates.map((template) => (
              <li
                key={template.id}
                className="rounded-2xl border border-line bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenListId(template.id)}
                    className="min-w-0 flex-1 text-start font-semibold text-ink"
                  >
                    {template.title}
                    <span className="mr-2 text-xs font-normal text-ink-soft" dir="ltr">
                      ({itemsOf(template.id).length})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void run(
                        () => createFromTemplate(template, itemsOf(template.id)),
                        strings.checklists.listCreated
                      )
                    }
                    className="shrink-0 rounded-lg bg-sea-tint px-2.5 py-1.5 text-xs font-semibold text-sea hover:bg-sea-tint"
                  >
                    {strings.checklists.useTemplate}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setListForm({ rename: null })}
          className="flex-1 rounded-2xl bg-sea py-3 font-semibold text-white shadow hover:bg-sea-deep"
        >
          {strings.checklists.addList}
        </button>
        <button
          type="button"
          onClick={() => setImporting(true)}
          className="rounded-2xl border border-line bg-white px-4 py-3 font-semibold text-ink-soft shadow-sm"
        >
          ⤓ {strings.checklists.importList}
        </button>
      </div>

      <ListFormSheet
        open={listForm !== null}
        rename={listForm?.rename ?? null}
        onClose={() => setListForm(null)}
        onSubmit={(action, message) => {
          setListForm(null);
          void run(action, message);
        }}
        tripId={trip?.id ?? ""}
      />

      {importing && trip && (
        <ImportChecklistSheet
          tripId={trip.id}
          lists={lists}
          onClose={() => setImporting(false)}
          onDone={(message) => {
            setImporting(false);
            void refresh(trip.id).then(() => showToast(message));
          }}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
