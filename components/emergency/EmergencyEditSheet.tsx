"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import {
  upsertEmergencyPage,
  type EmergencyContent,
} from "@/lib/data/emergency";
import { strings } from "@/lib/strings";

const labelClass = "mb-1 block text-sm font-medium text-slate-600";
const inputClass =
  "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base focus:border-teal-500 focus:outline-none";

// Structured editor fields, grouped like the read view.
const FIELD_GROUPS: {
  title: string;
  fields: { key: keyof EmergencyContent; label: string; tel?: boolean }[];
}[] = [
  {
    title: strings.emergency.numbers,
    fields: [
      { key: "police", label: strings.emergency.police, tel: true },
      { key: "ambulance", label: strings.emergency.ambulance, tel: true },
      { key: "fire", label: strings.emergency.fire, tel: true },
    ],
  },
  {
    title: strings.emergency.embassy,
    fields: [
      { key: "embassy_phone", label: strings.emergency.phone, tel: true },
      { key: "embassy_address", label: strings.emergency.address },
    ],
  },
  {
    title: strings.emergency.insurance,
    fields: [
      { key: "insurance_company", label: strings.emergency.insuranceCompany },
      { key: "insurance_policy", label: strings.emergency.insurancePolicy },
      { key: "insurance_phone", label: strings.emergency.insurancePhone, tel: true },
    ],
  },
  {
    title: strings.emergency.hotel,
    fields: [
      { key: "hotel_name", label: strings.emergency.hotelName },
      { key: "hotel_address", label: strings.emergency.address },
      { key: "hotel_phone", label: strings.emergency.phone, tel: true },
    ],
  },
];

export function EmergencyEditSheet({
  open,
  tripId,
  countryCode,
  existing,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  tripId: string;
  countryCode: string | null; // null = new country
  existing: EmergencyContent;
  onClose: () => void;
  onSaved: (countryCode: string) => void;
  onError: () => void;
}) {
  if (!open) return null;
  return (
    <EmergencyEditForm
      key={countryCode ?? "new"}
      tripId={tripId}
      countryCode={countryCode}
      existing={existing}
      onClose={onClose}
      onSaved={onSaved}
      onError={onError}
    />
  );
}

function EmergencyEditForm({
  tripId,
  countryCode,
  existing,
  onClose,
  onSaved,
  onError,
}: {
  tripId: string;
  countryCode: string | null;
  existing: EmergencyContent;
  onClose: () => void;
  onSaved: (countryCode: string) => void;
  onError: () => void;
}) {
  const [code, setCode] = useState(countryCode ?? "");
  const [content, setContent] = useState<EmergencyContent>(existing);
  const [saving, setSaving] = useState(false);

  function setField(key: keyof EmergencyContent, value: string) {
    setContent((prev) => {
      const next = { ...prev };
      if (value.trim()) next[key] = value;
      else delete next[key];
      return next;
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const finalCode = code.trim().toUpperCase();
    if (finalCode.length !== 2 || saving) return;
    setSaving(true);
    upsertEmergencyPage(tripId, finalCode, content)
      .then(() => onSaved(finalCode))
      .catch(() => {
        onError();
        setSaving(false);
      });
  }

  return (
    <Sheet open onClose={onClose} title={strings.emergency.editTitle}>
      <form onSubmit={handleSave} className="space-y-5">
        {countryCode === null && (
          <div>
            <label htmlFor="em-country" className={labelClass}>
              {strings.emergency.countryCode}
            </label>
            <input
              id="em-country"
              type="text"
              required
              maxLength={2}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className={inputClass}
              dir="ltr"
            />
          </div>
        )}

        {FIELD_GROUPS.map((group) => (
          <fieldset key={group.title} className="space-y-3">
            <legend className="mb-1 text-sm font-bold text-slate-700">
              {group.title}
            </legend>
            {group.fields.map((field) => (
              <div key={field.key}>
                <label htmlFor={`em-${field.key}`} className={labelClass}>
                  {field.label}
                </label>
                <input
                  id={`em-${field.key}`}
                  type={field.tel ? "tel" : "text"}
                  value={content[field.key] ?? ""}
                  onChange={(e) => setField(field.key, e.target.value)}
                  className={inputClass}
                  dir={field.tel ? "ltr" : undefined}
                />
              </div>
            ))}
          </fieldset>
        ))}

        <div>
          <label htmlFor="em-medical" className={labelClass}>
            {strings.emergency.medical}
          </label>
          <textarea
            id="em-medical"
            rows={3}
            value={content.medical_notes ?? ""}
            onChange={(e) => setField("medical_notes", e.target.value)}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {strings.common.save}
        </button>
      </form>
    </Sheet>
  );
}
