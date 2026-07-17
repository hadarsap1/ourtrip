// IndexedDB layout for the offline-critical set (DECISIONS #9, SPEC §offline):
// documents_offline, today_itinerary, emergency_pages, phrasebook (reserved
// for Sprint 5, created now to avoid a version bump), pending_writes.

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Booking, ItineraryDay, ItineraryItem } from "@/lib/types";

export type OfflineDocument = {
  id: string;
  title: string;
  tag: string;
  mime: string;
  blob: Blob;
  savedAt: string;
};

export type TodaySnapshot = {
  date: string;
  day: ItineraryDay | null;
  items: ItineraryItem[];
  bookings: Booking[];
  savedAt: string;
};

export type EmergencySnapshot = {
  countryCode: string;
  content: Record<string, string>;
  updatedAt: string;
};

export type PendingWrite = {
  id?: number;
  kind: "expense";
  payload: {
    categoryId: string;
    amount: number;
    currency: string;
    description: string | null;
    spentOn: string;
  };
  createdAt: string;
};

export type PhrasebookSnapshot = {
  language: string;
  entries: {
    id: string;
    category: string;
    phrase_he: string;
    phrase_local: string;
    phonetic_he: string | null;
  }[];
  savedAt: string;
};

export type MapSnapshot = {
  key: string; // constant "today"
  blob: Blob;
  date: string;
  savedAt: string;
};

interface OurTripDB extends DBSchema {
  documents_offline: { key: string; value: OfflineDocument };
  today_itinerary: { key: string; value: TodaySnapshot };
  emergency_pages: { key: string; value: EmergencySnapshot };
  phrasebook: { key: string; value: PhrasebookSnapshot };
  pending_writes: { key: number; value: PendingWrite };
  map_snapshot: { key: string; value: MapSnapshot };
}

let dbPromise: Promise<IDBPDatabase<OurTripDB>> | null = null;

export function getOfflineDB(): Promise<IDBPDatabase<OurTripDB>> | null {
  if (typeof window === "undefined" || !("indexedDB" in window)) return null;
  dbPromise ??= openDB<OurTripDB>("ourtrip-offline", 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore("documents_offline", { keyPath: "id" });
        db.createObjectStore("today_itinerary");
        db.createObjectStore("emergency_pages", { keyPath: "countryCode" });
        db.createObjectStore("phrasebook", { keyPath: "language" });
        db.createObjectStore("pending_writes", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
      if (oldVersion < 2) {
        db.createObjectStore("map_snapshot", { keyPath: "key" });
      }
    },
  });
  return dbPromise;
}
