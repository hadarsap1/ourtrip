"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import {
  DOCUMENT_TAGS,
  deleteDocument,
  updateDocument,
  uploadDocument,
} from "@/lib/data/documents";
import { strings } from "@/lib/strings";
import type { Document } from "@/lib/types";

const labelClass = "mb-1 block text-sm font-medium text-ink-soft";
const inputClass =
  "w-full rounded-xl border border-line px-3 py-2.5 text-base focus:border-sea focus:outline-none";

export function DocumentFormSheet({
  open,
  tripId,
  doc,
  onClose,
  onDone,
  onError,
}: {
  open: boolean;
  tripId: string;
  doc: Document | null;
  onClose: () => void;
  onDone: () => void;
  onError: () => void;
}) {
  if (!open) return null;
  return (
    <DocumentForm
      key={doc?.id ?? "new"}
      tripId={tripId}
      doc={doc}
      onClose={onClose}
      onDone={onDone}
      onError={onError}
    />
  );
}

function DocumentForm({
  tripId,
  doc,
  onClose,
  onDone,
  onError,
}: {
  tripId: string;
  doc: Document | null;
  onClose: () => void;
  onDone: () => void;
  onError: () => void;
}) {
  const [title, setTitle] = useState(doc?.title ?? "");
  const [tag, setTag] = useState(doc?.tag ?? "passport");
  const [notes, setNotes] = useState(doc?.notes ?? "");
  const [expiresAt, setExpiresAt] = useState(doc?.expires_at ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  function handleFilePick(picked: File | null) {
    setFile(picked);
    // default the title from the file name on a fresh upload
    if (picked && !doc && !title.trim()) {
      setTitle(picked.name.replace(/\.[^.]+$/, ""));
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!doc && !file) return;
    setSaving(true);
    try {
      if (doc) {
        await updateDocument(doc.id, {
          title: title.trim(),
          tag,
          notes: notes.trim() || null,
          expires_at: expiresAt || null,
        });
      } else {
        await uploadDocument({
          tripId,
          title: title.trim(),
          tag,
          notes: notes.trim() || null,
          expiresAt: expiresAt || null,
          file: file!,
        });
      }
      onDone();
    } catch {
      onError();
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!doc || saving) return;
    if (!confirm(strings.documents.deleteConfirm)) return;
    setSaving(true);
    deleteDocument(doc)
      .then(onDone)
      .catch(() => {
        onError();
        setSaving(false);
      });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={doc ? strings.documents.edit : strings.documents.upload}
    >
      <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
        {!doc && (
          <div>
            <span className={labelClass}>{strings.documents.file}</span>
            <input
              type="file"
              required
              accept="application/pdf,image/*"
              onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink-soft file:ml-3 file:rounded-lg file:border-0 file:bg-sea-tint file:px-3 file:py-2 file:text-sm file:font-semibold file:text-sea"
            />
          </div>
        )}

        <div>
          <label htmlFor="doc-title" className={labelClass}>
            {strings.documents.docTitle}
          </label>
          <input
            id="doc-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <span className={labelClass}>{strings.documents.tag}</span>
          <div className="flex flex-wrap gap-1.5">
            {DOCUMENT_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(t)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  tag === t ? "bg-sea text-white" : "bg-paper-deep text-ink-soft"
                }`}
              >
                {strings.documents.tags[t]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="doc-expires" className={labelClass}>
            {strings.documents.expiresAt}
          </label>
          <input
            id="doc-expires"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={inputClass}
            dir="ltr"
          />
          <p className="mt-1 text-xs text-ink-soft">
            {strings.documents.expiresAtHint}
          </p>
        </div>

        <div>
          <label htmlFor="doc-notes" className={labelClass}>
            {strings.documents.notes}
          </label>
          <textarea
            id="doc-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-sea py-3 font-semibold text-white hover:bg-sea-deep disabled:opacity-60"
          >
            {saving && !doc ? strings.documents.uploading : strings.common.save}
          </button>
          {doc && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="rounded-xl border border-alert/25 px-4 py-3 font-semibold text-alert hover:bg-alert-tint disabled:opacity-60"
            >
              {strings.common.delete}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}
