"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { createChecklist, renameChecklist } from "@/lib/data/checklists";
import { strings } from "@/lib/strings";
import type { Checklist } from "@/lib/types";

export function ListFormSheet({
  open,
  tripId,
  rename,
  onClose,
  onSubmit,
}: {
  open: boolean;
  tripId: string;
  rename: Checklist | null;
  onClose: () => void;
  onSubmit: (action: () => Promise<void>, message?: string) => void;
}) {
  if (!open) return null;
  return (
    <ListForm
      key={rename?.id ?? "new"}
      tripId={tripId}
      rename={rename}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function ListForm({
  tripId,
  rename,
  onClose,
  onSubmit,
}: {
  tripId: string;
  rename: Checklist | null;
  onClose: () => void;
  onSubmit: (action: () => Promise<void>, message?: string) => void;
}) {
  const [title, setTitle] = useState(rename?.title ?? "");
  const [isTemplate, setIsTemplate] = useState(rename?.is_template ?? false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit(
      rename
        ? () => renameChecklist(rename.id, trimmed)
        : () => createChecklist(tripId, trimmed, isTemplate),
      rename ? undefined : strings.checklists.listCreated
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={rename ? strings.checklists.listName : strings.checklists.addList}
    >
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label
            htmlFor="list-title"
            className="mb-1 block text-sm font-medium text-ink-soft"
          >
            {strings.checklists.listName}
          </label>
          <input
            id="list-title"
            type="text"
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
          />
        </div>

        {!rename && (
          <label className="flex items-center gap-2 text-sm font-medium text-ink-soft">
            <input
              type="checkbox"
              checked={isTemplate}
              onChange={(e) => setIsTemplate(e.target.checked)}
              className="h-4 w-4 accent-teal-600"
            />
            {strings.checklists.saveAsTemplate}
          </label>
        )}

        <button
          type="submit"
          className="w-full rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep"
        >
          {strings.common.save}
        </button>
      </form>
    </Sheet>
  );
}
