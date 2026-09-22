"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Toast } from "@/components/Toast";
import { CloseIcon, FileIcon, PinIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { BookingFormSheet } from "@/components/bookings/BookingFormSheet";
import { BookingsList } from "@/components/bookings/BookingsList";
import { ExpensePromptSheet } from "@/components/bookings/ExpensePromptSheet";
import { MailImportSheet } from "@/components/bookings/MailImportSheet";
import { getActiveTrip } from "@/lib/data/trip";
import {
  createItem,
  deleteDay,
  deleteItem,
  listDays,
  listItems,
  moveItemToDay,
  reorderItems,
  subscribeItinerary,
  updateItem,
} from "@/lib/data/itinerary";
import {
  listBookingFiles,
  listBookings,
  subscribeBookings,
} from "@/lib/data/bookings";
import { buildBookingIndex, buildLinkedIndex } from "@/lib/bookingCalendar";
import { planFromOptions } from "@/lib/data/placeOptions";
import { listCategories } from "@/lib/data/expenses";
import { askConfirm } from "@/components/ConfirmSheet";
import { strings } from "@/lib/strings";
import type {
  Booking,
  BookingFile,
  BudgetCategory,
  ItemStatus,
  ItineraryDay,
  ItineraryItem,
  Trip,
} from "@/lib/types";
import { DayCard } from "./DayCard";
import { DayFormSheet } from "./DayFormSheet";
import { DayPickerSheet } from "./DayPickerSheet";
import { CalendarView } from "./CalendarView";
import { ImportItinerarySheet } from "./ImportItinerarySheet";
import { ItemFormSheet } from "./ItemFormSheet";
import { OptionsPickerSheet } from "./OptionsPickerSheet";
import { SegmentsSheet } from "./SegmentsSheet";
import { TravelSearch } from "./TravelSearch";

const NEXT_STATUS: Record<ItemStatus, ItemStatus> = {
  planned: "done",
  done: "cancelled",
  cancelled: "planned",
};

export function ItineraryScreen() {
  // One layer of tabs, never two: the old plan/bookings/search row above a
  // list/calendar row collapsed into a single three-way control. Search left
  // the row entirely and became a header action.
  const [view, setView] = useState<"list" | "calendar" | "bookings">("list");
  const [searching, setSearching] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  // Attachments for the whole trip in one list; the bookings screen splits
  // them per booking, and the form gets the ones for the row being edited.
  const [bookingFiles, setBookingFiles] = useState<BookingFile[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingScroll = useRef<string | null>(null);

  // open sheets
  const [dayForm, setDayForm] = useState<{ day: ItineraryDay | null; date?: string } | null>(null);
  const [itemForm, setItemForm] = useState<{
    dayId: string;
    item: ItineraryItem | null;
  } | null>(null);
  const [movingItem, setMovingItem] = useState<ItineraryItem | null>(null);
  const [segmenting, setSegmenting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [bookingForm, setBookingForm] = useState<{ booking: Booking | null } | null>(null);
  const [expenseFor, setExpenseFor] = useState<Booking | null>(null);
  const [dayPickFor, setDayPickFor] = useState<Booking | null>(null);
  const [importingMail, setImportingMail] = useState(false);
  // The day that is currently pulling from the options bank.
  const [bankFor, setBankFor] = useState<ItineraryDay | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    const [nextDays, nextBookings, nextFiles] = await Promise.all([
      listDays(tripId),
      listBookings(tripId),
      listBookingFiles(tripId),
    ]);
    const nextItems = await listItems(nextDays.map((d) => d.id));
    setDays(nextDays);
    setBookings(nextBookings);
    setBookingFiles(nextFiles);
    setItems(nextItems);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubItinerary = () => {};
    let unsubBookings = () => {};
    let debounce: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      const activeTrip = await getActiveTrip();
      if (cancelled || !activeTrip) {
        setLoading(false);
        return;
      }
      setTrip(activeTrip);
      try {
        const [, cats] = await Promise.all([
          refresh(activeTrip.id),
          listCategories(activeTrip.id),
        ]);
        if (!cancelled) setCategories(cats);
      } catch {
        if (!cancelled) showToast(strings.common.error);
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Realtime: any change (either device) collapses into one refetch.
      const onRemoteChange = () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          void refresh(activeTrip.id).catch(() => {});
        }, 250);
      };
      unsubItinerary = subscribeItinerary(onRemoteChange);
      unsubBookings = subscribeBookings(onRemoteChange);
    })();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      unsubItinerary();
      unsubBookings();
    };
  }, [refresh, showToast]);

  // Runs a mutation, then refetches; errors surface as a Hebrew toast.
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
          message === "duplicate_date"
            ? strings.itinerary.duplicateDate
            : message === "booking_linked"
              ? strings.bookings.deleteLinked
              : strings.common.error
        );
      }
    },
    [trip, refresh, showToast]
  );

  const itemsOf = useCallback(
    (dayId: string) => items.filter((i) => i.day_id === dayId),
    [items]
  );

  // A booking reaches the plan through its own dates, not through a manual
  // link. Days that already show it as a linked itinerary item are excluded so
  // "add to day" - which still exists - cannot produce the same hotel twice on
  // one card.
  const bookingsByDate = useMemo(() => {
    const dayDateById = new Map(days.map((d) => [d.id, d.date]));
    return buildBookingIndex(bookings, buildLinkedIndex(items, dayDateById));
  }, [bookings, items, days]);

  const editingBookingFiles = useMemo(() => {
    const id = bookingForm?.booking?.id;
    return id ? bookingFiles.filter((f) => f.booking_id === id) : [];
  }, [bookingForm, bookingFiles]);

  const refreshNow = useCallback(() => {
    if (!trip) return;
    void refresh(trip.id).catch(() => showToast(strings.common.error));
  }, [trip, refresh, showToast]);

  // after the calendar jumps to a day, scroll its card into view
  useEffect(() => {
    if (view !== "list") return;
    const id = pendingScroll.current;
    if (!id) return;
    const el = dayRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      pendingScroll.current = null;
    }
  }, [view, days]);

  // tap a date in the calendar: open an existing day, or add that date
  const handleCalendarSelect = useCallback(
    (date: string) => {
      const existing = days.find((d) => d.date === date);
      if (existing) {
        pendingScroll.current = existing.id;
        setView("list");
      } else {
        setDayForm({ day: null, date });
      }
    },
    [days]
  );

  function handleReorder(dayId: string, orderedIds: string[]) {
    const byId = new Map(items.map((i) => [i.id, i]));
    const ordered = orderedIds
      .map((id) => byId.get(id))
      .filter((i): i is ItineraryItem => i !== undefined);

    // optimistic: reorder locally, then persist
    setItems((prev) => {
      const reordered = ordered.map((item, index) => ({
        ...item,
        sort_order: index,
      }));
      return [
        ...prev.filter((i) => i.day_id !== dayId),
        ...reordered,
      ].sort((a, b) => a.sort_order - b.sort_order);
    });

    // No refetch on success: the optimistic state above already matches what
    // was written, so re-reading every day and booking would only add latency.
    void reorderItems(ordered).catch(() => {
      showToast(strings.common.error);
      refreshNow();
    });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8 sm:max-w-2xl">
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 sm:max-w-2xl lg:max-w-4xl">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-[22px] font-extrabold text-ink">
          {strings.nav.itinerary}
        </h1>
        <div className="flex items-center gap-1.5">
          {/* Search used to occupy a third of the tab row for something that is
              an action, not a view. */}
          <button
            type="button"
            onClick={() => setSearching((open) => !open)}
            aria-label={
              searching ? strings.itinerary.closeSearch : strings.itinerary.tabSearch
            }
            aria-pressed={searching}
            className={`grid h-11 w-11 place-items-center rounded-[11px] transition-colors ${
              searching
                ? "bg-sea text-white"
                : "bg-paper-deep text-ink-soft active:bg-line"
            }`}
          >
            {searching ? (
              <CloseIcon className="h-[17px] w-[17px]" />
            ) : (
              <SearchIcon className="h-[17px] w-[17px]" />
            )}
          </button>
          {/* Splitting the trip into towns is a whole-trip action, so it
              belongs with the other two rather than below 227 day cards -
              where it first shipped, reachable only by scrolling the entire
              trip, and only in the list view. */}
          <button
            type="button"
            onClick={() => setSegmenting(true)}
            // The sheet renders under `trip &&`, so without a trip this would
            // be a button that swallows the tap and does nothing. Disabled it
            // says so, and it means an enabled button always has a sheet to
            // open.
            disabled={!trip}
            aria-label={strings.segments.open}
            className="grid h-11 w-11 place-items-center rounded-[11px] bg-paper-deep text-ink-soft active:bg-line disabled:opacity-40"
          >
            <PinIcon className="h-[17px] w-[17px]" />
          </button>
          <button
            type="button"
            onClick={() => setDayForm({ day: null })}
            aria-label={strings.itinerary.addDay}
            className="grid h-11 w-11 place-items-center rounded-[11px] bg-sea text-white active:bg-sea-deep"
          >
            <PlusIcon className="h-[17px] w-[17px]" />
          </button>
        </div>
      </header>

      {searching ? (
        trip && (
          <TravelSearch
            tripId={trip.id}
            defaultCurrency={trip.base_currency}
            onSaved={(saved) => {
              refreshNow();
              // Land on the list that now holds it. Staying inside the search
              // panel was the whole reason a saved flight looked like it had
              // vanished: the bookings tab updated behind a screen nobody was
              // looking at.
              setSearching(false);
              setView("bookings");
              showToast(strings.travelSearch.saved);
              if (saved.cost != null && saved.cost > 0) {
                setExpenseFor(saved);
              }
            }}
            onError={(message) => showToast(message)}
          />
        )
      ) : (
        <>
          <SegmentedControl
            ariaLabel={strings.itinerary.viewsAria}
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: strings.itinerary.viewList },
              { value: "calendar", label: strings.itinerary.viewCalendar },
              { value: "bookings", label: strings.itinerary.tabBookings },
            ]}
          />

          <div className="mt-3.5 pb-8">
            {view === "calendar" ? (
              <CalendarView
                days={days}
                items={items}
                bookings={bookings}
                onSelectDate={handleCalendarSelect}
              />
            ) : view === "bookings" ? (
              <BookingsList
                bookings={bookings}
                days={days}
                files={bookingFiles}
                onAdd={() => setBookingForm({ booking: null })}
                onImportMail={() => setImportingMail(true)}
                onEdit={(booking) => setBookingForm({ booking })}
                onAddToDay={setDayPickFor}
                onError={() => showToast(strings.common.error)}
              />
            ) : (
              <>
                {days.length === 0 && (
                  <p className="rounded-[20px] border border-dashed border-line bg-white p-8 text-center text-sm text-ink-soft">
                    {strings.itinerary.emptyDays}
                  </p>
                )}

                <div className="space-y-3">
                  {days.map((day) => (
                    <div
                      key={day.id}
                      ref={(el) => {
                        dayRefs.current[day.id] = el;
                      }}
                      className="scroll-mt-4"
                    >
                      <DayCard
                        day={day}
                        items={itemsOf(day.id)}
                        bookings={bookings}
                        dayBookings={bookingsByDate.get(day.date) ?? []}
                        onBookingClick={(booking) => setBookingForm({ booking })}
                        onEditDay={() => setDayForm({ day })}
                        onDeleteDay={async () => {
                          // Say what goes with it: deleting a day takes its
                          // activities too, and that is easy to not expect.
                          const count = itemsOf(day.id).length;
                          const question =
                            count > 0
                              ? strings.itinerary.deleteDayWithItemsConfirm.replace(
                                  "{n}",
                                  String(count)
                                )
                              : strings.itinerary.deleteDayConfirm;
                          if (!(await askConfirm(question))) return;
                          void run(
                            () => deleteDay(day.id),
                            strings.itinerary.dayDeleted
                          );
                        }}
                        onAddItem={() =>
                          setItemForm({ dayId: day.id, item: null })
                        }
                        onAddFromBank={() => setBankFor(day)}
                        onItemClick={(item) =>
                          setItemForm({ dayId: day.id, item })
                        }
                        onMoveItem={setMovingItem}
                        onDeleteItem={async (item) => {
                          if (!(await askConfirm(strings.itinerary.deleteItemConfirm))) return;
                          void run(
                            () => deleteItem(item.id),
                            strings.itinerary.itemDeleted
                          );
                        }}
                        onCycleStatus={(item) =>
                          void run(() =>
                            updateItem(item.id, {
                              status: NEXT_STATUS[item.status],
                            })
                          )
                        }
                        onReorder={(orderedIds) =>
                          handleReorder(day.id, orderedIds)
                        }
                      />
                    </div>
                  ))}

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setDayForm({ day: null })}
                      className="rounded-2xl bg-sea py-3 text-sm font-bold text-white active:bg-sea-deep"
                      style={{
                        boxShadow: "0 10px 22px -14px rgba(14,124,107,.7)",
                      }}
                    >
                      {strings.itinerary.addDay}
                    </button>
                    <button
                      type="button"
                      onClick={() => setImporting(true)}
                      className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-white py-3 text-sm font-bold text-ink-soft active:bg-paper-deep"
                    >
                      <FileIcon className="h-[17px] w-[17px]" />
                      {strings.itinerary.importFromFile}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ---------- sheets ---------- */}

      {trip && (
        <DayFormSheet
          open={dayForm !== null}
          tripId={trip.id}
          day={dayForm?.day ?? null}
          initialDate={dayForm?.date}
          onClose={() => setDayForm(null)}
          onSubmit={(action) => {
            setDayForm(null);
            void run(action);
          }}
        />
      )}

      <ItemFormSheet
        open={itemForm !== null}
        dayId={itemForm?.dayId ?? ""}
        item={itemForm?.item ?? null}
        itemCount={itemForm ? itemsOf(itemForm.dayId).length : 0}
        bookings={bookings}
        onClose={() => setItemForm(null)}
        onSubmit={(action) => {
          setItemForm(null);
          void run(action);
        }}
      />

      {trip && (
        <SegmentsSheet
          tripId={trip.id}
          days={days}
          open={segmenting}
          onClose={() => setSegmenting(false)}
          onApplied={(updated) => {
            refreshNow();
            showToast(strings.segments.applied.replace("{n}", String(updated)));
          }}
          onError={(message) => showToast(message)}
        />
      )}

      {/* move item to another day: tap move (1) → tap a day (2) */}
      <DayPickerSheet
        open={movingItem !== null}
        title={strings.itinerary.movePickDay}
        days={days.filter((d) => d.id !== movingItem?.day_id)}
        onClose={() => setMovingItem(null)}
        onPick={(day) => {
          const item = movingItem;
          setMovingItem(null);
          if (!item) return;
          void run(() =>
            moveItemToDay(item.id, day.id, itemsOf(day.id).length)
          );
        }}
      />

      {trip && (
        <BookingFormSheet
          open={bookingForm !== null}
          tripId={trip.id}
          booking={bookingForm?.booking ?? null}
          files={editingBookingFiles}
          onClose={() => setBookingForm(null)}
          onSaved={(saved, isNew) => {
            setBookingForm(null);
            refreshNow();
            if (isNew && saved.cost != null && saved.cost > 0) {
              setExpenseFor(saved);
            }
          }}
          onError={(message) =>
            showToast(
              message === "booking_linked"
                ? strings.bookings.deleteLinked
                : message === "booking_files_partial"
                  ? strings.bookings.filesPartial
                  : strings.common.error
            )
          }
        />
      )}

      <ExpensePromptSheet
        open={expenseFor !== null}
        booking={expenseFor}
        categories={categories}
        onClose={() => setExpenseFor(null)}
        onResult={(message) => {
          setExpenseFor(null);
          showToast(message);
        }}
      />

      {/* link booking → day: creates an itinerary item on the picked day */}
      <DayPickerSheet
        open={dayPickFor !== null}
        title={strings.bookings.addToDayPick}
        days={days}
        onClose={() => setDayPickFor(null)}
        onPick={(day) => {
          const booking = dayPickFor;
          setDayPickFor(null);
          if (!booking) return;
          void run(async () => {
            await createItem({
              day_id: day.id,
              title: booking.title,
              booking_id: booking.id,
              sort_order: itemsOf(day.id).length,
            });
          }, strings.bookings.addedToDay);
        }}
      />

      {bankFor && trip && (
        <OptionsPickerSheet
          tripId={trip.id}
          day={bankFor}
          plannedCount={itemsOf(bankFor.id).length}
          onClose={() => setBankFor(null)}
          onPick={(options) => {
            const day = bankFor;
            setBankFor(null);
            void run(
              async () => {
                await planFromOptions(options, day.id, itemsOf(day.id).length);
              },
              options.length === 1
                ? strings.options.planned
                : strings.options.plannedMany.replace(
                    "{n}",
                    String(options.length)
                  )
            );
          }}
        />
      )}

      {importingMail && trip && (
        <MailImportSheet
          tripId={trip.id}
          existing={bookings}
          onClose={() => setImportingMail(false)}
          onDone={(message) => {
            setImportingMail(false);
            refreshNow();
            showToast(message);
          }}
        />
      )}

      {importing && trip && (
        <ImportItinerarySheet
          tripId={trip.id}
          onClose={() => setImporting(false)}
          onDone={(message) => {
            setImporting(false);
            refreshNow();
            showToast(message);
          }}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
