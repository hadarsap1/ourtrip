"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { BookingFormSheet } from "@/components/bookings/BookingFormSheet";
import { BookingsList } from "@/components/bookings/BookingsList";
import { ExpensePromptSheet } from "@/components/bookings/ExpensePromptSheet";
import { getActiveTrip } from "@/lib/data/trip";
import {
  createItem,
  listDays,
  listItems,
  moveItemToDay,
  reorderItems,
  subscribeItinerary,
  updateItem,
} from "@/lib/data/itinerary";
import { listBookings, subscribeBookings } from "@/lib/data/bookings";
import { listCategories } from "@/lib/data/expenses";
import { strings } from "@/lib/strings";
import type {
  Booking,
  BudgetCategory,
  ItemStatus,
  ItineraryDay,
  ItineraryItem,
  Trip,
} from "@/lib/types";
import { DayCard } from "./DayCard";
import { DayFormSheet } from "./DayFormSheet";
import { DayPickerSheet } from "./DayPickerSheet";
import { ItemFormSheet } from "./ItemFormSheet";
import { TravelSearch } from "./TravelSearch";

const NEXT_STATUS: Record<ItemStatus, ItemStatus> = {
  planned: "done",
  done: "cancelled",
  cancelled: "planned",
};

export function ItineraryScreen() {
  const [tab, setTab] = useState<"plan" | "bookings" | "search">("plan");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // open sheets
  const [dayForm, setDayForm] = useState<{ day: ItineraryDay | null } | null>(null);
  const [itemForm, setItemForm] = useState<{
    dayId: string;
    item: ItineraryItem | null;
  } | null>(null);
  const [movingItem, setMovingItem] = useState<ItineraryItem | null>(null);
  const [bookingForm, setBookingForm] = useState<{ booking: Booking | null } | null>(null);
  const [expenseFor, setExpenseFor] = useState<Booking | null>(null);
  const [dayPickFor, setDayPickFor] = useState<Booking | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async (tripId: string) => {
    const [nextDays, nextBookings] = await Promise.all([
      listDays(tripId),
      listBookings(tripId),
    ]);
    const nextItems = await listItems(nextDays.map((d) => d.id));
    setDays(nextDays);
    setBookings(nextBookings);
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

  const refreshNow = useCallback(() => {
    if (!trip) return;
    void refresh(trip.id).catch(() => showToast(strings.common.error));
  }, [trip, refresh, showToast]);

  function handleReorder(dayId: string, orderedIds: string[]) {
    // optimistic: reorder locally, then persist
    setItems((prev) => {
      const byId = new Map(prev.map((i) => [i.id, i]));
      const reordered = orderedIds
        .map((id, index) => {
          const item = byId.get(id);
          return item ? { ...item, sort_order: index } : null;
        })
        .filter((i): i is ItineraryItem => i !== null);
      return [
        ...prev.filter((i) => i.day_id !== dayId),
        ...reordered,
      ].sort((a, b) => a.sort_order - b.sort_order);
    });
    void run(() => reorderItems(orderedIds));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <p className="text-center text-ink-soft">{strings.common.loading}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      {/* segmented control: itinerary / bookings / search */}
      <div className="mb-4 grid grid-cols-3 rounded-xl bg-line p-1 text-sm font-semibold">
        {(
          [
            ["plan", strings.itinerary.tabPlan],
            ["bookings", strings.itinerary.tabBookings],
            ["search", strings.itinerary.tabSearch],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg py-2 transition-colors ${
              tab === key ? "bg-white text-sea shadow" : "text-ink-soft"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "plan" ? (
        <div className="space-y-4 pb-8">
          {days.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-soft">
              {strings.itinerary.emptyDays}
            </p>
          )}
          {days.map((day) => (
            <DayCard
              key={day.id}
              day={day}
              items={itemsOf(day.id)}
              bookings={bookings}
              onEditDay={() => setDayForm({ day })}
              onAddItem={() => setItemForm({ dayId: day.id, item: null })}
              onItemClick={(item) => setItemForm({ dayId: day.id, item })}
              onMoveItem={setMovingItem}
              onCycleStatus={(item) =>
                void run(() =>
                  updateItem(item.id, { status: NEXT_STATUS[item.status] })
                )
              }
              onReorder={(orderedIds) => handleReorder(day.id, orderedIds)}
            />
          ))}
          <button
            type="button"
            onClick={() => setDayForm({ day: null })}
            className="w-full rounded-2xl bg-sea py-3 font-semibold text-white shadow hover:bg-sea-deep"
          >
            {strings.itinerary.addDay}
          </button>
        </div>
      ) : tab === "bookings" ? (
        <BookingsList
          bookings={bookings}
          onAdd={() => setBookingForm({ booking: null })}
          onEdit={(booking) => setBookingForm({ booking })}
          onAddToDay={setDayPickFor}
          onError={() => showToast(strings.common.error)}
        />
      ) : (
        trip && (
          <TravelSearch
            tripId={trip.id}
            defaultCurrency={trip.base_currency}
            onSaved={(saved) => {
              refreshNow();
              showToast(strings.travelSearch.saved);
              if (saved.cost != null && saved.cost > 0) {
                setExpenseFor(saved);
              }
            }}
            onError={(message) => showToast(message)}
          />
        )
      )}

      {/* ---------- sheets ---------- */}

      {trip && (
        <DayFormSheet
          open={dayForm !== null}
          tripId={trip.id}
          day={dayForm?.day ?? null}
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
          void run(
            () =>
              createItem({
                day_id: day.id,
                title: booking.title,
                booking_id: booking.id,
                sort_order: itemsOf(day.id).length,
              }),
            strings.bookings.addedToDay
          );
        }}
      />

      <Toast message={toast} />
    </div>
  );
}
