"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WeatherLine } from "@/components/WeatherLine";
import { formatDate, formatTime, formatWeekday } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { Booking, ItemStatus, ItineraryDay, ItineraryItem } from "@/lib/types";

const STATUS_LABEL: Record<ItemStatus, string> = {
  planned: strings.itinerary.statusPlanned,
  done: strings.itinerary.statusDone,
  cancelled: strings.itinerary.statusCancelled,
};

const STATUS_CLASS: Record<ItemStatus, string> = {
  planned: "bg-slate-100 text-slate-600",
  done: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-rose-100 text-rose-600",
};

export function DayCard({
  day,
  items,
  bookings,
  onEditDay,
  onAddItem,
  onItemClick,
  onMoveItem,
  onCycleStatus,
  onReorder,
}: {
  day: ItineraryDay;
  items: ItineraryItem[];
  bookings: Booking[];
  onEditDay: () => void;
  onAddItem: () => void;
  onItemClick: (item: ItineraryItem) => void;
  onMoveItem: (item: ItineraryItem) => void;
  onCycleStatus: (item: ItineraryItem) => void;
  onReorder: (orderedIds: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onEditDay}
        className="flex w-full items-baseline justify-between gap-2 bg-teal-50 px-4 py-3 text-start"
      >
        <span>
          <span className="font-bold text-teal-800">
            {formatWeekday(day.date)} {formatDate(day.date)}
          </span>
          {day.location_name && (
            <span className="mr-2 text-sm text-teal-700">
              {day.location_name}
            </span>
          )}
          {day.lat != null && day.lng != null && (
            <span className="mr-2">
              <WeatherLine
                date={day.date}
                lat={day.lat}
                lng={day.lng}
                hasOutdoor={items.some(
                  (i) => i.is_outdoor && i.status !== "cancelled"
                )}
              />
            </span>
          )}
        </span>
        {day.country_code && (
          <span className="rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-teal-700">
            {day.country_code}
          </span>
        )}
      </button>

      {items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-400">
          {strings.itinerary.emptyDayItems}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <SortableItem
                  key={item.id}
                  item={item}
                  hasBooking={
                    item.booking_id != null &&
                    bookings.some((b) => b.id === item.booking_id)
                  }
                  onClick={() => onItemClick(item)}
                  onMove={() => onMoveItem(item)}
                  onCycleStatus={() => onCycleStatus(item)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <button
        type="button"
        onClick={onAddItem}
        className="w-full border-t border-slate-100 py-2.5 text-sm font-semibold text-teal-600 hover:bg-teal-50"
      >
        + {strings.itinerary.addItem}
      </button>
    </section>
  );
}

function SortableItem({
  item,
  hasBooking,
  onClick,
  onMove,
  onCycleStatus,
}: {
  item: ItineraryItem;
  hasBooking: boolean;
  onClick: () => void;
  onMove: () => void;
  onCycleStatus: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 bg-white px-2 py-2.5 ${
        isDragging ? "relative z-10 shadow-lg" : ""
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={strings.itinerary.dragHandle}
        className="cursor-grab touch-none p-1.5 text-slate-300 active:cursor-grabbing"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <circle cx="7" cy="4" r="1.5" />
          <circle cx="13" cy="4" r="1.5" />
          <circle cx="7" cy="10" r="1.5" />
          <circle cx="13" cy="10" r="1.5" />
          <circle cx="7" cy="16" r="1.5" />
          <circle cx="13" cy="16" r="1.5" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onClick}
        className="min-w-0 flex-1 text-start"
      >
        <span className="flex items-baseline gap-2">
          {item.start_time && (
            <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500" dir="ltr">
              {formatTime(item.start_time)}
              {item.end_time ? `–${formatTime(item.end_time)}` : ""}
            </span>
          )}
          <span
            className={`truncate font-medium ${
              item.status === "cancelled"
                ? "text-slate-400 line-through"
                : "text-slate-800"
            }`}
          >
            {item.title}
          </span>
        </span>
        {(item.location_name || hasBooking || item.is_outdoor) && (
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
            {item.location_name && (
              <span className="truncate">{item.location_name}</span>
            )}
            {item.is_outdoor && <span aria-hidden="true">🌤️</span>}
            {hasBooking && <span aria-hidden="true">🎫</span>}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={onMove}
        aria-label={strings.itinerary.moveItem}
        className="p-1.5 text-slate-400 hover:text-teal-600"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
          stroke="currentColor"
          className="h-4.5 w-4.5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
          />
        </svg>
      </button>

      <button
        type="button"
        onClick={onCycleStatus}
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[item.status]}`}
      >
        {STATUS_LABEL[item.status]}
      </button>
    </li>
  );
}
