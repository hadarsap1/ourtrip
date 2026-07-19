"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import {
  deleteChecklistItem,
  updateChecklistItem,
} from "@/lib/data/checklists";
import { strings } from "@/lib/strings";
import type { ChecklistItem, Member } from "@/lib/types";

export function ItemEditSheet({
  item,
  members,
  onClose,
  onSubmit,
}: {
  item: ChecklistItem | null;
  members: Member[];
  onClose: () => void;
  onSubmit: (action: () => Promise<void>) => void;
}) {
  if (!item) return null;
  return (
    <ItemEdit
      key={item.id}
      item={item}
      members={members}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function ItemEdit({
  item,
  members,
  onClose,
  onSubmit,
}: {
  item: ChecklistItem;
  members: Member[];
  onClose: () => void;
  onSubmit: (action: () => Promise<void>) => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [assignedTo, setAssignedTo] = useState(item.assigned_to ?? "");

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    onSubmit(() =>
      updateChecklistItem(item.id, {
        label: trimmed,
        assigned_to: assignedTo || null,
      })
    );
  }

  function handleDelete() {
    if (!confirm(strings.checklists.deleteItemConfirm)) return;
    onSubmit(() => deleteChecklistItem(item.id));
  }

  return (
    <Sheet open onClose={onClose} title={strings.checklists.editItem}>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label
            htmlFor="item-label"
            className="mb-1 block text-sm font-medium text-ink-soft"
          >
            {strings.checklists.itemLabel}
          </label>
          <input
            id="item-label"
            type="text"
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="item-assignee"
            className="mb-1 block text-sm font-medium text-ink-soft"
          >
            {strings.checklists.assignee}
          </label>
          <select
            id="item-assignee"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none"
          >
            <option value="">{strings.common.none}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="flex-1 rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep"
          >
            {strings.common.save}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-xl border border-rose-200 px-4 py-3 font-semibold text-rose-600 hover:bg-rose-50"
          >
            {strings.common.delete}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
