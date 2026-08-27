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
  planned: "bg-paper-deep text-ink-soft",
  done: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-rose-100 text-rose-600",
};

export function DayCard({
  day,
  items,
  bookings,
  onEditDay,
  onDeleteDay,
  onAddItem,
  onItemClick,
  onMoveItem,
  onDeleteItem,
  onCycleStatus,
  onReorder,
}: {
  day: ItineraryDay;
  items: ItineraryItem[];
  bookings: Booking[];
  onEditDay: () => void;
  onDeleteDay: () => void;
  onAddItem: () => void;
  onItemClick: (item: ItineraryItem) => void;
  onMoveItem: (item: ItineraryItem) => void;
  onDeleteItem: (item: ItineraryItem) => void;
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
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex items-center gap-1 bg-sea-tint pe-2">
      <button
        type="button"
        onClick={onEditDay}
        className="flex min-w-0 flex-1 items-baseline justify-between gap-2 px-4 py-3 text-start"
      >
        <span>
          <span className="font-bold text-sea">
            {formatWeekday(day.date)} {formatDate(day.date)}
          </span>
          {day.location_name && (
            <span className="mr-2 text-sm text-sea">
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
          <span className="rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-sea">
            {day.country_code}
          </span>
        )}
      </button>

      {/* Editing a day used to be an unlabelled tap on the whole header, and
          deleting one was buried inside the sheet that tap opened. Both are
          now visible on the card itself. */}
      <button
        type="button"
        onClick={onEditDay}
        aria-label={strings.itinerary.editDay}
        className="shrink-0 rounded-lg p-2 text-sea/70 hover:bg-white hover:text-sea"
      >
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onDeleteDay}
        aria-label={strings.itinerary.deleteDay}
        className="shrink-0 rounded-lg p-2 text-rose-500/80 hover:bg-white hover:text-rose-600"
      >
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.2v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink-soft">
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
            <ul className="divide-y divide-line">
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
                  onDelete={() => onDeleteItem(item)}
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
        className="w-full border-t border-line py-2.5 text-sm font-semibold text-sea hover:bg-sea-tint"
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
  onDelete,
  onMove,
  onCycleStatus,
}: {
  item: ItineraryItem;
  hasBooking: boolean;
  onClick: () => void;
  onDelete: () => void;
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
        className="cursor-grab touch-none p-1.5 text-line active:cursor-grabbing"
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
            <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-soft" dir="ltr">
              {formatTime(item.start_time)}
              {item.end_time ? `–${formatTime(item.end_time)}` : ""}
            </span>
          )}
          <span
            className={`truncate font-medium ${
              item.status === "cancelled"
                ? "text-ink-soft line-through"
                : "text-ink"
            }`}
          >
            {item.title}
          </span>
        </span>
        {(item.location_name || hasBooking || item.is_outdoor) && (
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
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
        className="p-1.5 text-ink-soft hover:text-sea"
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

      {/* Move was on the row while delete was only inside the edit sheet, so
          the row read as "you can shuffle these but not remove them". */}
      <button
        type="button"
        onClick={onDelete}
        aria-label={strings.itinerary.deleteItem}
        className="p-1.5 text-ink-soft hover:text-rose-600"
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.2v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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
