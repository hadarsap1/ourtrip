"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  buildLegOverviews,
  initialOpenLeg,
  type LegOverview,
} from "@/lib/itineraryOverview";
import type { OptionForAreas } from "@/lib/data/segments";
import { todayISO } from "@/lib/format";
import { listOptionAreas, planFromOptions } from "@/lib/data/placeOptions";
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
import { LegSection } from "./LegSection";
import { TripSummary } from "./TripSummary";
import { TripMap } from "./TripMap";
import { LegLocationSheet } from "./LegLocationSheet";
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
  const [view, setView] = useState<"list" | "calendar" | "map" | "bookings">("list");
  const [searching, setSearching] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  // Attachments for the whole trip in one list; the bookings screen splits
  // them per booking, and the form gets the ones for the row being edited.
  const [bookingFiles, setBookingFiles] = useState<BookingFile[]>([]);
  // Five columns of the options bank, for the per-leg "ideas waiting" count.
  const [optionAreas, setOptionAreas] = useState<OptionForAreas[]>([]);
  // Which legs are expanded. Seeded once the legs are known, to the leg the
  // trip is in - see `initialOpenLeg`.
  const [openLegs, setOpenLegs] = useState<Set<string> | null>(null);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const router = useRouter();
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const legRefs = useRef<Record<string, HTMLDivElement | null>>({});
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
  // The leg whose location is being pinned from the map.
  const [locatingLeg, setLocatingLeg] = useState<LegOverview | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    const [nextDays, nextBookings, nextFiles, nextAreas] = await Promise.all([
      listDays(tripId),
      listBookings(tripId),
      listBookingFiles(tripId),
      // A failure here costs the idea counts and nothing else, so it must not
      // take the whole plan down with it.
      listOptionAreas(tripId).catch(() => [] as OptionForAreas[]),
    ]);
    const nextItems = await listItems(nextDays.map((d) => d.id));
    setDays(nextDays);
    setBookings(nextBookings);
    setBookingFiles(nextFiles);
    setOptionAreas(nextAreas);
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

  // The trip as its legs. `today` is read once per render rather than inside
  // the pure builder, which keeps that testable.
  // One read per render, shared by the leg builder and the day rows, so a
  // card cannot disagree with its leg about which day is today.
  const today = todayISO();
  const legs = useMemo(
    () => buildLegOverviews(days, items, bookings, optionAreas, today),
    [days, items, bookings, optionAreas, today]
  );

  // `openLegs` is null until the family touches a leg; until then the open set
  // is derived, which is why this is not seeded from an effect. Seeding would
  // also have to not re-run on every refetch, or a realtime update from the
  // other phone would slam shut whatever was just opened.
  const shownOpenLegs = useMemo(() => {
    if (openLegs) return openLegs;
    const first = initialOpenLeg(legs);
    return new Set(first ? [first] : []);
  }, [openLegs, legs]);

  const toggleLeg = useCallback(
    (key: string) => {
      const next = new Set(shownOpenLegs);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setOpenLegs(next);
    },
    [shownOpenLegs]
  );

  const openLeg = useCallback(
    (key: string) => setOpenLegs(new Set(shownOpenLegs).add(key)),
    [shownOpenLegs]
  );

  // A day is empty when it has no live activity and no booking - the same test
  // buildLegOverviews counts with, so a leg's "3 of 38" and the rows beneath it
  // can never disagree.
  const busyDayIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (item.status !== "cancelled") ids.add(item.day_id);
    }
    return ids;
  }, [items]);

  const isDayEmpty = useCallback(
    (day: ItineraryDay) =>
      !busyDayIds.has(day.id) && (bookingsByDate.get(day.date) ?? []).length === 0,
    [busyDayIds, bookingsByDate]
  );

  /** Opens the leg you are in (or the next one) and scrolls to it. */
  const jumpToCurrentLeg = useCallback(() => {
    const key = initialOpenLeg(legs);
    if (!key) return;
    openLeg(key);
    // After the open, so the leg has its full height before we scroll to it.
    requestAnimationFrame(() => {
      legRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [legs, openLeg]);

  /** Opens the options bank already cut to this leg. The cut travels in the
   *  URL so the bank can be reached the same way from anywhere, and so going
   *  back does not lose it. Country code, never the Hebrew name: the bank
   *  spells Vietnam "ויטנאם" and Intl spells it "וייטנאם", and matching on
   *  text would quietly find nothing. */
  const openIdeasFor = useCallback(
    (leg: LegOverview) => {
      const params = new URLSearchParams();
      if (leg.stretch.countryCode) params.set("cc", leg.stretch.countryCode);
      // Only when the label actually named a place the bank knows; a region
      // or country match has no single area to filter by.
      if (leg.ideaScope === "area" && leg.stretch.locationName) {
        params.set("leg", leg.stretch.locationName);
      }
      router.push(`/options?${params.toString()}`);
    },
    [router]
  );

  const refreshNow = useCallback(() => {
    if (!trip) return;
    void refresh(trip.id).catch(() => showToast(strings.common.error));
  }, [trip, refresh, showToast]);

  const handleReorder = useCallback(
    (dayId: string, orderedIds: string[]) => {
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
    },
    [items, showToast, refreshNow]
  );

  /** One day, as the full card. Passed to each open leg rather than mapped
   *  here, so a collapsed leg never builds one. */
  const renderDayCard = useCallback(
    (day: ItineraryDay) => (
      <DayCard
        day={day}
        items={itemsOf(day.id)}
        bookings={bookings}
        dayBookings={bookingsByDate.get(day.date) ?? []}
        onBookingClick={(booking) => setBookingForm({ booking })}
        onEditDay={() => setDayForm({ day })}
        onDeleteDay={async () => {
          // Say what goes with it: deleting a day takes its activities too,
          // and that is easy to not expect.
          const count = itemsOf(day.id).length;
          const question =
            count > 0
              ? strings.itinerary.deleteDayWithItemsConfirm.replace(
                  "{n}",
                  String(count)
                )
              : strings.itinerary.deleteDayConfirm;
          if (!(await askConfirm(question))) return;
          void run(() => deleteDay(day.id), strings.itinerary.dayDeleted);
        }}
        onAddItem={() => setItemForm({ dayId: day.id, item: null })}
        onAddFromBank={() => setBankFor(day)}
        onItemClick={(item) => setItemForm({ dayId: day.id, item })}
        onMoveItem={setMovingItem}
        onDeleteItem={async (item) => {
          if (!(await askConfirm(strings.itinerary.deleteItemConfirm))) return;
          void run(() => deleteItem(item.id), strings.itinerary.itemDeleted);
        }}
        onCycleStatus={(item) =>
          void run(() =>
            updateItem(item.id, { status: NEXT_STATUS[item.status] })
          )
        }
        onReorder={(orderedIds) => handleReorder(day.id, orderedIds)}
      />
    ),
    [itemsOf, bookings, bookingsByDate, run, handleReorder]
  );

  const editingBookingFiles = useMemo(() => {
    const id = bookingForm?.booking?.id;
    return id ? bookingFiles.filter((f) => f.booking_id === id) : [];
  }, [bookingForm, bookingFiles]);

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
    // The open set is a dependency because the target row does not exist until
    // its leg is expanded; without it the jump silently does nothing.
  }, [view, days, shownOpenLegs]);

  // tap a date in the calendar: open an existing day, or add that date
  const handleCalendarSelect = useCallback(
    (date: string) => {
      const existing = days.find((d) => d.date === date);
      if (existing) {
        pendingScroll.current = existing.id;
        // The list is legs now, and the day is inside one of them. Scrolling
        // to a row that is not rendered does nothing, so the leg opens first.
        const leg = legs.find((l) => date >= l.stretch.from && date <= l.stretch.to);
        if (leg) openLeg(leg.key);
        setView("list");
      } else {
        setDayForm({ day: null, date });
      }
    },
    [days, legs, openLeg]
  );

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
              { value: "map", label: strings.itinerary.viewMap },
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
            ) : view === "map" ? (
              <TripMap
                legs={legs}
                options={optionAreas}
                onOpenLeg={(key) => {
                  openLeg(key);
                  setView("list");
                  // The leg's row has to exist before it can be scrolled to,
                  // so this waits for the list to render.
                  requestAnimationFrame(() => {
                    legRefs.current[key]?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  });
                }}
                onSetLocation={setLocatingLeg}
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
                  {legs.length > 0 && (
                    <TripSummary legs={legs} onJump={jumpToCurrentLeg} />
                  )}

                  {legs.map((leg) => (
                    <div
                      key={leg.key}
                      ref={(el) => {
                        legRefs.current[leg.key] = el;
                      }}
                      className="scroll-mt-4"
                    >
                      <LegSection
                        leg={leg}
                        open={shownOpenLegs.has(leg.key)}
                        onToggle={() => toggleLeg(leg.key)}
                        onOpenIdeas={() => openIdeasFor(leg)}
                        onAddToDay={(day) =>
                          setItemForm({ dayId: day.id, item: null })
                        }
                        isDayEmpty={isDayEmpty}
                        registerDayRef={(dayId, el) => {
                          dayRefs.current[dayId] = el;
                        }}
                        todayISO={today}
                        renderDay={renderDayCard}
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

      <LegLocationSheet
        leg={locatingLeg}
        onClose={() => setLocatingLeg(null)}
        onSaved={() => {
          setLocatingLeg(null);
          refreshNow();
          showToast(strings.itinerary.mapSaved);
        }}
        onError={() => showToast(strings.common.error)}
      />

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
