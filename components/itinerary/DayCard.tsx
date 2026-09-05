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
import {
  DragHandleIcon,
  EditIcon,
  MoveIcon,
  SunIcon,
  TicketIcon,
  TrashIcon,
} from "@/components/icons";
import { formatDate, formatTime, formatWeekday, todayISO } from "@/lib/format";
import { strings } from "@/lib/strings";
import type { Booking, ItemStatus, ItineraryDay, ItineraryItem } from "@/lib/types";

const STATUS_LABEL: Record<ItemStatus, string> = {
  planned: strings.itinerary.statusPlanned,
  done: strings.itinerary.statusDone,
  cancelled: strings.itinerary.statusCancelled,
};

const STATUS_CLASS: Record<ItemStatus, string> = {
  planned: "bg-paper-deep text-ink-soft",
  done: "bg-sea-tint text-sea-deep",
  cancelled: "bg-alert-tint text-alert",
};

export function DayCard({
  day,
  items,
  bookings,
  onEditDay,
  onDeleteDay,
  onAddItem,
  onAddFromBank,
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
  onAddFromBank: () => void;
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

  const isToday = day.date === todayISO();

  return (
    <section className="overflow-hidden rounded-[20px] border border-line bg-white">
      {/* Day header on paper-deep rather than sea-tint: the tint now means
          "happening now" and shouldn't mark every day on the screen. */}
      <div className="flex items-center gap-1 bg-paper-deep pe-1.5">
      <button
        type="button"
        onClick={onEditDay}
        className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3.5 py-2.5 text-start"
      >
        <span className="text-[11.5px] font-extrabold text-sea-deep">
          {formatWeekday(day.date)} {formatDate(day.date)}
        </span>
        {day.location_name && (
          <span className="truncate text-[11.5px] font-semibold text-sea-deep/80">
            {day.location_name}
          </span>
        )}
        {isToday && (
          <span className="rounded-full bg-sun-tint px-1.5 py-px text-[9.5px] font-extrabold text-sun-deep">
            {strings.itinerary.todayChip}
          </span>
        )}
        {day.country_code && (
          <span className="rounded bg-white px-1.5 py-px text-[10px] font-bold text-sea">
            {day.country_code}
          </span>
        )}
        {day.lat != null && day.lng != null && (
          <span className="ms-auto">
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
      </button>

      {/* Editing a day used to be an unlabelled tap on the whole header, and
          deleting one was buried inside the sheet that tap opened. Both are
          now visible on the card itself. */}
      <button
        type="button"
        onClick={onEditDay}
        aria-label={strings.itinerary.editDay}
        className="shrink-0 rounded-lg p-1.5 text-sea/70 hover:bg-white hover:text-sea"
      >
        <EditIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onDeleteDay}
        aria-label={strings.itinerary.deleteDay}
        className="shrink-0 rounded-lg p-1.5 text-alert/70 hover:bg-white hover:text-alert"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
      </div>

      {items.length === 0 ? (
        <p className="px-3.5 py-3 text-[13px] text-ink-faint">
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

      {/* Two ways to fill a day: type something new, or take one of the
          places already collected in the bank. Before the second button
          existed, 343 options had no way onto a day at all. */}
      <div className="grid grid-cols-2 border-t border-line">
        <button
          type="button"
          onClick={onAddItem}
          className="py-2.5 text-[13px] font-bold text-sea hover:bg-sea-tint"
        >
          + {strings.itinerary.addItem}
        </button>
        <button
          type="button"
          onClick={onAddFromBank}
          className="border-s border-line py-2.5 text-[13px] font-bold text-sea hover:bg-sea-tint"
        >
          {strings.options.fromBank}
        </button>
      </div>
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

  const done = item.status === "done";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 bg-white px-2.5 py-2.5 ${
        isDragging ? "relative z-10 shadow-lg" : ""
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={strings.itinerary.dragHandle}
        className="cursor-grab touch-none p-1 text-line active:cursor-grabbing"
      >
        <DragHandleIcon className="h-4 w-4" />
      </button>

      {/* Fixed 42px time gutter, so the titles line up down the whole day and
          the eye reads a schedule rather than a ragged list. */}
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-start gap-2.5 text-start"
      >
        <span
          className={`w-[42px] shrink-0 pt-px text-[12.5px] font-bold tabular-nums ${
            done ? "text-ink-faint" : "text-sea"
          }`}
          dir="ltr"
        >
          {item.start_time ? formatTime(item.start_time) : "-"}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[13.5px] ${
              item.status === "cancelled" || done
                ? "text-ink-faint line-through"
                : "font-medium text-ink"
            }`}
          >
            {item.title}
          </span>
          {(item.location_name ||
            hasBooking ||
            item.is_outdoor ||
            item.end_time) && (
            <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-soft">
              {item.end_time && (
                <span className="shrink-0 tabular-nums" dir="ltr">
                  {formatTime(item.start_time ?? "")}-{formatTime(item.end_time)}
                </span>
              )}
              {item.location_name && (
                <span className="truncate">{item.location_name}</span>
              )}
              {item.is_outdoor && (
                <SunIcon
                  className="h-3.5 w-3.5 shrink-0 text-sun"
                  aria-label={strings.itinerary.outdoor}
                />
              )}
              {hasBooking && (
                <TicketIcon className="h-3.5 w-3.5 shrink-0 text-sea" />
              )}
            </span>
          )}
        </span>
      </button>

      <button
        type="button"
        onClick={onMove}
        aria-label={strings.itinerary.moveItem}
        className="p-1.5 text-ink-faint hover:text-sea"
      >
        <MoveIcon className="h-[18px] w-[18px]" />
      </button>

      {/* Move was on the row while delete was only inside the edit sheet, so
          the row read as "you can shuffle these but not remove them". */}
      <button
        type="button"
        onClick={onDelete}
        aria-label={strings.itinerary.deleteItem}
        className="p-1.5 text-ink-faint hover:text-alert"
      >
        <TrashIcon className="h-[18px] w-[18px]" />
      </button>

      <button
        type="button"
        onClick={onCycleStatus}
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASS[item.status]}`}
      >
        {STATUS_LABEL[item.status]}
      </button>
    </li>
  );
}
