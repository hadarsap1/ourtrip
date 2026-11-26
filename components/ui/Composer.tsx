"use client";

import Link from "next/link";
import { useId, type FormEvent, type ReactNode, type Ref } from "react";
import { SendIcon } from "@/components/icons";
import { strings } from "@/lib/strings";

/**
 * The pill composer (קרם חם): a 52px field on surface with a line border and
 * a 52px coral send circle. The arrow mirrors in RTL (SendIcon).
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
  disabled = false,
  inputRef,
  maxLength,
  above,
  multiline = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  placeholder: string;
  /** the field's accessible name */
  label: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLTextAreaElement>;
  maxLength?: number;
  /** a reply-to line or similar, inside the form above the row */
  above?: ReactNode;
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      {above}
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
        <textarea
          id={id}
          ref={inputRef}
          rows={1}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends on one line; Shift+Enter (or multiline) breaks
            if (!multiline && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={placeholder}
          className="max-h-32 min-h-[52px] min-w-0 flex-1 resize-none rounded-[26px] border border-line bg-surface px-[18px] py-[13px] leading-6 text-ink shadow-card placeholder:text-muted focus:border-green focus:outline-none"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label={strings.composer.send}
          className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-coral text-on-coral shadow-card disabled:opacity-50"
        >
          <SendIcon className="h-[22px] w-[22px]" strokeWidth={2.4} />
        </button>
      </div>
    </form>
  );
}

/** The home shortcut: looks like the composer, is a link to the chat. */
export function ComposerLink({ href, label, cta }: { href: string; label: string; cta: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-[52px] items-center justify-between gap-3 rounded-full border border-line bg-surface py-1.5 pe-1.5 ps-[18px] shadow-card"
    >
      <span className="min-w-0 truncate text-base text-muted">{label}</span>
      <span className="flex min-h-10 shrink-0 items-center rounded-full bg-coral px-5 font-bold text-on-coral">{cta}</span>
    </Link>
  );
}
