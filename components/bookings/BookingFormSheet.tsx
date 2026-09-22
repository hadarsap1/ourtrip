"use client";

import { useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { SegmentedControl } from "@/components/SegmentedControl";
import {
  AttractionIcon,
  BedIcon,
  CarIcon,
  CloseIcon,
  FileIcon,
  type IconProps,
  PinIcon,
  PlaneIcon,
  PlusIcon,
  TrainIcon,
  TrashIcon,
} from "@/components/icons";
import { CURRENCIES } from "@/lib/currencies";
import {
  BOOKING_FILE_MAX_BYTES,
  BOOKING_FILE_MIME_TYPES,
  createBooking,
  deleteBooking,
  deleteBookingFile,
  getBookingFileUrl,
  updateBooking,
  uploadBookingFile,
} from "@/lib/data/bookings";
import { askConfirm } from "@/components/ConfirmSheet";
import { strings } from "@/lib/strings";
import type {
  Booking,
  BookingFile,
  BookingStatus,
  BookingType,
} from "@/lib/types";

const labelClass = "mb-1 block text-[12.5px] font-semibold text-ink-soft";
const inputClass =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-base text-ink focus:border-sea focus:outline-none";

const BOOKING_TYPES: { value: BookingType; Icon: React.FC<IconProps> }[] = [
  { value: "flight", Icon: PlaneIcon },
  { value: "hotel", Icon: BedIcon },
  { value: "train", Icon: TrainIcon },
  { value: "attraction", Icon: AttractionIcon },
  { value: "car_rental", Icon: CarIcon },
  { value: "other", Icon: PinIcon },
];

const BOOKING_STATUSES: BookingStatus[] = ["booked", "paid", "cancelled"];

type Details = Record<string, string>;

/** A file the person picked that has not been uploaded yet. `key` exists so
 *  two files of the same name can both sit in the queue and be removed apart;
 *  the File object itself is not a stable React key. */
type PendingFile = { key: string; file: File };

export function BookingFormSheet({
  open,
  tripId,
  booking,
  files,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  tripId: string;
  booking: Booking | null;
  /** The attachments already on this booking. Empty for a new one. */
  files: BookingFile[];
  onClose: () => void;
  onSaved: (booking: Booking, isNew: boolean) => void;
  onError: (message: string) => void;
}) {
  if (!open) return null;
  // key remounts the form per booking, so state initializes from props cleanly
  return (
    <BookingForm
      key={booking?.id ?? "new"}
      tripId={tripId}
      booking={booking}
      files={files}
      onClose={onClose}
      onSaved={onSaved}
      onError={onError}
    />
  );
}

function BookingForm({
  tripId,
  booking,
  files,
  onClose,
  onSaved,
  onError,
}: {
  tripId: string;
  booking: Booking | null;
  files: BookingFile[];
  onClose: () => void;
  onSaved: (booking: Booking, isNew: boolean) => void;
  onError: (message: string) => void;
}) {
  const [type, setType] = useState<BookingType>(booking?.type ?? "hotel");
  const [title, setTitle] = useState(booking?.title ?? "");
  const [startDate, setStartDate] = useState(booking?.start_date ?? "");
  const [endDate, setEndDate] = useState(booking?.end_date ?? "");
  const [confirmationCode, setConfirmationCode] = useState(
    booking?.confirmation_code ?? ""
  );
  const [cost, setCost] = useState(
    booking?.cost != null ? String(booking.cost) : ""
  );
  const [currency, setCurrency] = useState(booking?.currency ?? "ILS");
  const [status, setStatus] = useState<BookingStatus>(
    booking?.status ?? "booked"
  );
  const [linkUrl, setLinkUrl] = useState(booking?.link_url ?? "");
  const [notes, setNotes] = useState(booking?.notes ?? "");
  const [details, setDetails] = useState<Details>(
    booking && typeof booking.details === "object" && booking.details !== null
      ? (booking.details as Details)
      : {}
  );

  // Attachments split in two: rows that already exist in the database, and
  // files picked in this sitting that upload on save. Removing an existing one
  // takes effect immediately - it is a delete, not a pending edit - so the
  // saved list is local state rather than read straight from props.
  const [saved, setSaved] = useState<BookingFile[]>(files);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  /** Which file is uploading, for the button's "2 מתוך 3". */
  const [progress, setProgress] = useState<{ n: number; total: number } | null>(
    null
  );
  const pickerRef = useRef<HTMLInputElement>(null);

  function setDetail(key: string, value: string) {
    setDetails((prev) => {
      const next = { ...prev };
      if (value.trim()) next[key] = value;
      else delete next[key];
      return next;
    });
  }

  // A stay whose check-out precedes its check-in cannot be placed on the plan,
  // and the trip already holds one such row that was saved before this check
  // existed. Blocking the save stops any more of them.
  const datesContradict =
    startDate !== "" && endDate !== "" && endDate < startDate;

  /** Vets picked files against the bucket's own limits (00003) before any of
   *  them is sent, and drops ones already in the list. Everything rejected is
   *  named, so a silently missing file is not a possible outcome. */
  function addFiles(picked: FileList | File[] | null) {
    if (!picked) return;
    const incoming = [...picked];
    if (incoming.length === 0) return;

    const known = new Set([
      ...saved.map((f) => `${f.file_name}:${f.size_bytes ?? ""}`),
      ...pending.map((p) => `${p.file.name}:${p.file.size}`),
    ]);
    const accepted: PendingFile[] = [];
    const rejected: string[] = [];

    for (const file of incoming) {
      const key = `${file.name}:${file.size}`;
      // An empty type is what Android's picker reports for some PDFs, so it
      // passes here and the bucket has the final say.
      if (file.type && !BOOKING_FILE_MIME_TYPES.includes(file.type)) {
        rejected.push(`${file.name} - ${strings.bookings.fileBadType}`);
      } else if (file.size > BOOKING_FILE_MAX_BYTES) {
        rejected.push(`${file.name} - ${strings.bookings.fileTooBig}`);
      } else if (known.has(key)) {
        rejected.push(`${file.name} - ${strings.bookings.fileDuplicate}`);
      } else {
        known.add(key);
        accepted.push({ key: `${key}:${crypto.randomUUID()}`, file });
      }
    }

    if (accepted.length > 0) setPending((prev) => [...prev, ...accepted]);
    setFileError(rejected.length > 0 ? rejected.join(" · ") : null);
  }

  async function removeSavedFile(file: BookingFile) {
    if (busy) return;
    if (!(await askConfirm(strings.bookings.fileRemoveConfirm))) return;
    setBusy(true);
    try {
      await deleteBookingFile(file);
      setSaved((prev) => prev.filter((f) => f.id !== file.id));
    } catch (e) {
      onError(e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // The inline alert next to the fields already says what is wrong, and it
    // points at the field to fix - a toast would not.
    if (datesContradict) return;
    setBusy(true);
    setFileError(null);
    try {
      const payload = {
        type,
        title: title.trim(),
        start_date: startDate || null,
        end_date: endDate || null,
        confirmation_code: confirmationCode.trim() || null,
        cost: cost.trim() === "" ? null : Number(cost),
        currency: cost.trim() === "" ? null : currency,
        status,
        link_url: linkUrl.trim() || null,
        notes: notes.trim() || null,
        details,
      };

      let result: Booking;
      if (booking) {
        await updateBooking(booking.id, payload);
        result = { ...booking, ...payload };
      } else {
        result = await createBooking({ trip_id: tripId, ...payload });
      }

      // Uploads are sequential on purpose: a phone on hotel wifi uploading
      // four boarding passes at once tends to have all four time out rather
      // than three succeed. One failure does not abandon the rest, and the
      // booking itself is already saved by this point either way.
      let failed = 0;
      for (const [index, item] of pending.entries()) {
        setProgress({ n: index + 1, total: pending.length });
        try {
          await uploadBookingFile(result.id, item.file, saved.length + index);
        } catch {
          failed += 1;
        }
      }
      setProgress(null);
      if (failed > 0) onError("booking_files_partial");

      onSaved(result, booking === null);
    } catch (e) {
      setProgress(null);
      onError(e instanceof Error ? e.message : "");
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!booking || busy) return;
    if (!(await askConfirm(strings.bookings.deleteConfirm))) return;
    setBusy(true);
    deleteBooking(booking.id)
      .then(() => onSaved(booking, false))
      .catch((e) => {
        onError(e instanceof Error ? e.message : "");
        setBusy(false);
      });
  }

  const totalFiles = saved.length + pending.length;

  return (
    <Sheet
      open
      onClose={onClose}
      title={booking ? strings.bookings.edit : strings.bookings.add}
    >
      <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
        <Section title={strings.bookings.sectionWhat}>
          <TypePicker value={type} onChange={setType} />

          <div>
            <label htmlFor="bk-title" className={labelClass}>
              {strings.bookings.title}
              <span className="text-alert"> *</span>
            </label>
            <input
              id="bk-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder={strings.bookings.types[type]}
            />
          </div>

          <div>
            <span className={labelClass}>{strings.bookings.status}</span>
            <SegmentedControl
              options={BOOKING_STATUSES.map((s) => ({
                value: s,
                label: strings.bookings.statuses[s],
              }))}
              value={status}
              onChange={setStatus}
              ariaLabel={strings.bookings.status}
            />
          </div>
        </Section>

        <Section title={strings.bookings.sectionWhen} note={spanLabel(type, startDate, endDate)}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bk-start" className={labelClass}>
                {strings.bookings.startDate}
              </label>
              <input
                id="bk-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
                dir="ltr"
              />
            </div>
            <div>
              <label htmlFor="bk-end" className={labelClass}>
                {strings.bookings.endDate}
              </label>
              <input
                id="bk-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputClass}
                dir="ltr"
              />
            </div>
          </div>

          {/* Both notes are about the same thing: a booking reaches the
              calendar and the day cards through these two dates, so a wrong or
              missing one makes it invisible on the plan rather than merely
              untidy. */}
          {datesContradict && (
            <p
              role="alert"
              className="rounded-lg bg-alert-tint px-2.5 py-1.5 text-[12px] font-semibold text-alert"
            >
              {strings.bookings.endBeforeStart}
            </p>
          )}
          {startDate === "" && (
            <p className="text-[12px] text-ink-soft">
              {strings.bookings.missingStartDate}
            </p>
          )}

          {/* type-specific times → details jsonb */}
          {type === "hotel" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="bk-checkin" className={labelClass}>
                  {strings.bookings.checkIn}
                </label>
                <input
                  id="bk-checkin"
                  type="time"
                  value={details.check_in ?? ""}
                  onChange={(e) => setDetail("check_in", e.target.value)}
                  className={inputClass}
                  dir="ltr"
                />
              </div>
              <div>
                <label htmlFor="bk-checkout" className={labelClass}>
                  {strings.bookings.checkOut}
                </label>
                <input
                  id="bk-checkout"
                  type="time"
                  value={details.check_out ?? ""}
                  onChange={(e) => setDetail("check_out", e.target.value)}
                  className={inputClass}
                  dir="ltr"
                />
              </div>
            </div>
          )}
        </Section>

        <Section title={strings.bookings.sectionDetails}>
          {type === "flight" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="bk-flight-no" className={labelClass}>
                  {strings.bookings.flightNumber}
                </label>
                <input
                  id="bk-flight-no"
                  type="text"
                  value={details.flight_number ?? ""}
                  onChange={(e) => setDetail("flight_number", e.target.value)}
                  className={inputClass}
                  dir="ltr"
                />
              </div>
              <div>
                <label htmlFor="bk-terminal" className={labelClass}>
                  {strings.bookings.terminal}
                </label>
                <input
                  id="bk-terminal"
                  type="text"
                  value={details.terminal ?? ""}
                  onChange={(e) => setDetail("terminal", e.target.value)}
                  className={inputClass}
                  dir="ltr"
                />
              </div>
            </div>
          )}
          {type === "hotel" && (
            <div>
              <label htmlFor="bk-address" className={labelClass}>
                {strings.bookings.address}
              </label>
              <input
                id="bk-address"
                type="text"
                value={details.address ?? ""}
                onChange={(e) => setDetail("address", e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label htmlFor="bk-confirmation" className={labelClass}>
              {strings.bookings.confirmationCode}
            </label>
            <input
              id="bk-confirmation"
              type="text"
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.target.value)}
              className={inputClass}
              dir="ltr"
            />
          </div>

          <div>
            <label htmlFor="bk-notes" className={labelClass}>
              {strings.bookings.notes}
            </label>
            <textarea
              id="bk-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </div>
        </Section>

        <Section title={strings.bookings.sectionMoney}>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label htmlFor="bk-cost" className={labelClass}>
                {strings.bookings.amount}
              </label>
              <input
                id="bk-cost"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className={inputClass}
                dir="ltr"
              />
            </div>
            <div>
              <label htmlFor="bk-currency" className={labelClass}>
                {strings.bookings.currency}
              </label>
              <select
                id="bk-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={`${inputClass} w-24`}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        <Section
          title={strings.bookings.sectionFiles}
          note={
            totalFiles === 0
              ? undefined
              : totalFiles === 1
                ? strings.bookings.filesCountOne
                : strings.bookings.filesCount.replace("{n}", String(totalFiles))
          }
        >
          <FilePicker
            saved={saved}
            pending={pending}
            busy={busy}
            pickerRef={pickerRef}
            onAdd={addFiles}
            onRemoveSaved={(file) => void removeSavedFile(file)}
            onRemovePending={(key) =>
              setPending((prev) => prev.filter((p) => p.key !== key))
            }
            onOpenError={() => onError("")}
          />
          {fileError && (
            <p
              role="alert"
              className="rounded-lg bg-alert-tint px-2.5 py-1.5 text-[12px] font-semibold text-alert"
            >
              {fileError}
            </p>
          )}

          <div>
            <label htmlFor="bk-link" className={labelClass}>
              {strings.bookings.linkUrl}
            </label>
            <input
              id="bk-link"
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://"
              className={inputClass}
              dir="ltr"
            />
          </div>
        </Section>

        {/* Delete lives down here on its own, not shoulder to shoulder with
            save. It used to sit next to it, one thumb-width from the button
            you press every single time. */}
        {booking && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-alert/25 py-2.5 text-[13px] font-bold text-alert hover:bg-alert-tint disabled:opacity-60"
          >
            <TrashIcon className="h-4 w-4" />
            {strings.bookings.deleteBooking}
          </button>
        )}

        {/* Gives back exactly the height the footer's negative bottom margin
            takes off the form. Without it the scroll container stops that far
            short and the last control never clears the footer. */}
        <div
          aria-hidden="true"
          className="h-[calc(1.5rem+env(safe-area-inset-bottom))]"
        />

        {/* The sheet is the scroll container, so a sticky footer parks the
            save button on screen instead of at the far end of twelve fields.
            The negative margins let it span the sheet's padding, and the
            safe-area inset it cancels is added back below the buttons. */}
        <div className="sticky bottom-0 -mx-4 -mb-[calc(1.5rem+env(safe-area-inset-bottom))] flex gap-2 border-t border-line bg-white/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-line px-5 py-3 font-semibold text-ink-soft hover:bg-paper-deep disabled:opacity-60"
          >
            {strings.common.cancel}
          </button>
          <button
            type="submit"
            disabled={busy || datesContradict}
            className="flex-1 rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep disabled:opacity-60"
          >
            {progress
              ? strings.bookings.uploading
                  .replace("{n}", String(progress.n))
                  .replace("{total}", String(progress.total))
              : strings.common.save}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** One group of fields. Four of these read as a form; the same twelve fields
 *  in a single column read as a wall. */
function Section({
  title,
  note,
  children,
}: {
  title: string;
  /** Small right-aligned counter or summary, e.g. "3 לילות". */
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-paper/70 p-3">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-[11.5px] font-extrabold text-ink">{title}</h3>
        {note && (
          <span className="text-[11.5px] font-semibold text-sea-deep">
            {note}
          </span>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** How long the booking runs, in the unit that suits its type. A stay is
 *  counted in nights because that is what a hotel charges for; everything else
 *  is counted in days. Shown next to the dates as a running check that the
 *  range is the one intended - the form's most common mistake is a wrong end
 *  date, and "‏1 לילות" catches it where two ISO strings do not. */
function spanLabel(
  type: BookingType,
  startDate: string,
  endDate: string
): string | undefined {
  if (!startDate || !endDate || endDate < startDate) return undefined;
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  if (Number.isNaN(ms)) return undefined;
  const nights = Math.round(ms / 86_400_000);
  if (type === "hotel") {
    if (nights === 0) return undefined;
    return nights === 1
      ? strings.bookings.nightsOne
      : strings.bookings.nights.replace("{n}", String(nights));
  }
  const days = nights + 1;
  return days === 1
    ? strings.bookings.daysOne
    : strings.bookings.days.replace("{n}", String(days));
}

function FilePicker({
  saved,
  pending,
  busy,
  pickerRef,
  onAdd,
  onRemoveSaved,
  onRemovePending,
  onOpenError,
}: {
  saved: BookingFile[];
  pending: PendingFile[];
  busy: boolean;
  pickerRef: React.RefObject<HTMLInputElement | null>;
  onAdd: (files: FileList | File[] | null) => void;
  onRemoveSaved: (file: BookingFile) => void;
  onRemovePending: (key: string) => void;
  onOpenError: () => void;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div className="space-y-2">
      {saved.length === 0 && pending.length === 0 && (
        <p className="text-[12px] text-ink-soft">{strings.bookings.filesNone}</p>
      )}

      {saved.map((file) => (
        <SavedFileRow
          key={file.id}
          file={file}
          busy={busy}
          onRemove={() => onRemoveSaved(file)}
          onOpenError={onOpenError}
        />
      ))}

      {pending.map(({ key, file }) => (
        <FileRow
          key={key}
          name={file.name}
          meta={`${formatBytes(file.size)} · ${strings.bookings.filePending}`}
          tone="pending"
          onRemove={busy ? undefined : () => onRemovePending(key)}
        />
      ))}

      {/* Tap on a phone, drop on a laptop. The input is hidden rather than
          styled because the browser's own file control cannot be made to match
          anything, and in RTL it lays itself out backwards. */}
      <button
        type="button"
        onClick={() => pickerRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onAdd(e.dataTransfer.files);
        }}
        disabled={busy}
        className={`flex w-full flex-col items-center gap-1 rounded-xl border border-dashed py-3.5 transition-colors disabled:opacity-60 ${
          dragging
            ? "border-sea bg-sea-tint"
            : "border-line bg-white hover:bg-paper-deep"
        }`}
      >
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-sea">
          <PlusIcon className="h-4 w-4" />
          {strings.bookings.attachFiles}
        </span>
        <span className="text-[11px] text-ink-soft" dir="auto">
          {strings.bookings.attachHint}
        </span>
      </button>

      <input
        ref={pickerRef}
        type="file"
        multiple
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          onAdd(e.target.files);
          // Cleared so picking the same file twice in a row still fires
          // onChange - the second pick is a real action, not a no-op.
          e.target.value = "";
        }}
      />
    </div>
  );
}

function SavedFileRow({
  file,
  busy,
  onRemove,
  onOpenError,
}: {
  file: BookingFile;
  busy: boolean;
  onRemove: () => void;
  onOpenError: () => void;
}) {
  const [opening, setOpening] = useState(false);

  async function open() {
    if (opening) return;
    setOpening(true);
    try {
      const url = await getBookingFileUrl(file.file_path);
      window.open(url, "_blank", "noopener");
    } catch {
      onOpenError();
    } finally {
      setOpening(false);
    }
  }

  return (
    <FileRow
      name={file.file_name}
      meta={file.size_bytes != null ? formatBytes(file.size_bytes) : undefined}
      tone="saved"
      onOpen={opening ? undefined : () => void open()}
      onRemove={busy ? undefined : onRemove}
      openLabel={strings.common.open}
    />
  );
}

function FileRow({
  name,
  meta,
  tone,
  onOpen,
  openLabel,
  onRemove,
}: {
  name: string;
  meta?: string;
  tone: "saved" | "pending";
  onOpen?: () => void;
  openLabel?: string;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
        tone === "pending"
          ? "border-dashed border-sea/40 bg-sea-tint/40"
          : "border-line bg-white"
      }`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-paper-deep text-ink-soft">
        <FileIcon className="h-4 w-4" strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[13px] font-semibold text-ink"
          // `חשבונית.pdf` is Hebrew, `voucher.pdf` is Latin, and forcing
          // either direction mangles the other's extension.
          dir="auto"
        >
          {name}
        </span>
        {meta && (
          <span className="block text-[11px] text-ink-soft" dir="auto">
            {meta}
          </span>
        )}
      </span>
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-lg bg-paper-deep px-2.5 py-1.5 text-[12px] font-bold text-ink hover:bg-line"
        >
          {openLabel}
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={strings.bookings.fileRemove}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-alert-tint hover:text-alert"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Six types as labelled icons rather than a dropdown. The type drives the
 *  card's icon and which extra fields appear, so it is the one choice on the
 *  form worth seeing all of at once. */
function TypePicker({
  value,
  onChange,
}: {
  value: BookingType;
  onChange: (type: BookingType) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={strings.bookings.type}
      className="grid grid-cols-3 gap-2"
    >
      {BOOKING_TYPES.map(({ value: option, Icon }) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border text-[12px] transition-colors ${
              active
                ? "border-sea bg-sea-tint font-bold text-sea-deep"
                : "border-line bg-white font-semibold text-ink-soft hover:bg-paper-deep"
            }`}
          >
            <Icon className="h-[19px] w-[19px]" strokeWidth={1.7} />
            {strings.bookings.types[option]}
          </button>
        );
      })}
    </div>
  );
}

/** File sizes stay in Latin digits and units; there is no Hebrew for "MB"
 *  that anyone writes on a phone. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
