// Visas and entry permits (SPEC: owner-only trip admin, migration 00036).
//
// WHAT THIS SCREEN IS FOR. A link to an e-visa form can live in a bookmark.
// What cannot live in a bookmark is "your Thailand block is 38 days and the
// permission you hold covers 30" - that answer needs the itinerary and the
// rules in the same place, which is here.
//
// STAY IS COUNTED PER CONSECUTIVE BLOCK, NOT PER COUNTRY. This route enters
// Vietnam twice (21 days, then Thailand and Cambodia, then 35 more). Summing
// them to 56 would compare a number nobody will ever present at a border
// against a per-entry limit. Every block stands on its own, which is also what
// the border officer sees.

import { getSupabase } from "@/lib/supabase";
import type { VisaRequirement, VisaRequirementType, VisaStatus } from "@/lib/types";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

/** A rule older than this has to be re-checked before it can be trusted. */
export const STALE_AFTER_DAYS = 90;

/** How close to max_days still deserves a quiet warning. Cambodia is planned
 *  at 28 of 30 - legal, and two days from not being. */
export const NEAR_LIMIT_DAYS = 3;

export type Trust = "unverified" | "stale" | "ok";

/** One uninterrupted run of days in the same country. */
export type StayBlock = {
  countryCode: string;
  /** ISO dates, inclusive. */
  start: string;
  end: string;
  days: number;
};

export type StayWarning = {
  kind: "over" | "near";
  block: StayBlock;
  maxDays: number;
  /** title_he of the row that sets the limit, so the warning can name it. */
  limitTitle: string;
};

export type VisaCountryGroup = {
  countryCode: string;
  countryHe: string;
  rows: VisaRequirement[];
  blocks: StayBlock[];
  warnings: StayWarning[];
};

export type VisaScreenData = {
  groups: VisaCountryGroup[];
  /** Rows nobody has verified yet - the count the header leads with. */
  unverified: number;
};

const DAY_MS = 86_400_000;

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / DAY_MS
  );
}

/**
 * How much a row's `verified_at` can be trusted. Null is deliberately not
 * "unknown, show nothing": an unverified rule is the one thing on this screen
 * that gets to shout.
 */
export function trustOf(verifiedAt: string | null, todayISODate: string): Trust {
  if (!verifiedAt) return "unverified";
  return daysBetween(verifiedAt, todayISODate) > STALE_AFTER_DAYS ? "stale" : "ok";
}

/**
 * Consecutive runs of itinerary days per country. A gap in the dates breaks a
 * block just like a change of country does, so a hole in the itinerary can
 * never quietly merge two separate entries into one long stay.
 */
export function stayBlocks(
  days: { date: string; country_code: string | null }[]
): StayBlock[] {
  const sorted = [...days]
    .filter((d): d is { date: string; country_code: string } => Boolean(d.country_code))
    .sort((a, b) => a.date.localeCompare(b.date));

  const blocks: StayBlock[] = [];
  for (const day of sorted) {
    const open = blocks[blocks.length - 1];
    if (
      open &&
      open.countryCode === day.country_code &&
      daysBetween(open.end, day.date) === 1
    ) {
      open.end = day.date;
      open.days += 1;
      continue;
    }
    // A duplicate date for the same country is a data glitch, not a new block.
    if (open && open.countryCode === day.country_code && open.end === day.date) continue;
    blocks.push({
      countryCode: day.country_code,
      start: day.date,
      end: day.date,
      days: 1,
    });
  }
  return blocks;
}

/**
 * The row that decides how long you may stay: the visa, or where a country
 * needs none, the row that says so. Arrival cards and extensions deliberately
 * do not set the limit - an extension is the fix for a long block, so letting
 * it define the limit would hide the very problem it solves.
 */
export function limitRowOf(rows: VisaRequirement[]): VisaRequirement | null {
  const byType = (type: VisaRequirementType) =>
    rows.find((r) => r.requirement_type === type && r.max_days != null) ?? null;
  return byType("visa") ?? byType("none");
}

/** Blocks that exceed the permitted stay, or come within NEAR_LIMIT_DAYS of it. */
export function stayWarnings(
  rows: VisaRequirement[],
  blocks: StayBlock[]
): StayWarning[] {
  const limitRow = limitRowOf(rows);
  const maxDays = limitRow?.max_days;
  if (!limitRow || maxDays == null) return [];
  const warnings: StayWarning[] = [];
  for (const block of blocks) {
    if (block.days > maxDays) {
      warnings.push({ kind: "over", block, maxDays, limitTitle: limitRow.title_he });
    } else if (maxDays - block.days <= NEAR_LIMIT_DAYS) {
      warnings.push({ kind: "near", block, maxDays, limitTitle: limitRow.title_he });
    }
  }
  return warnings;
}

/**
 * Groups the rows by country in route order (sort_order already carries it)
 * and attaches each country's stay blocks and warnings.
 */
export function buildVisaGroups(
  rows: VisaRequirement[],
  blocks: StayBlock[]
): VisaCountryGroup[] {
  const groups = new Map<string, VisaCountryGroup>();
  for (const row of rows) {
    let group = groups.get(row.country_code);
    if (!group) {
      group = {
        countryCode: row.country_code,
        countryHe: row.country_he,
        rows: [],
        blocks: blocks.filter((b) => b.countryCode === row.country_code),
        warnings: [],
      };
      groups.set(row.country_code, group);
    }
    group.rows.push(row);
  }
  for (const group of groups.values()) {
    group.warnings = stayWarnings(group.rows, group.blocks);
  }
  return [...groups.values()];
}

/** Every requirement of the trip, in route order. Owner-only by RLS. */
export async function listVisaRequirements(tripId: string): Promise<VisaRequirement[]> {
  const { data, error } = await requireClient()
    .from("visa_requirements")
    .select("*")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

/** The itinerary's consecutive stays, which is what max_days is measured against. */
export async function listStayBlocks(tripId: string): Promise<StayBlock[]> {
  const { data, error } = await requireClient()
    .from("itinerary_days")
    .select("date, country_code")
    .eq("trip_id", tripId)
    .order("date", { ascending: true });
  if (error) throw new Error(error.message);
  return stayBlocks(data);
}

export async function loadVisaScreen(tripId: string): Promise<VisaScreenData> {
  const [rows, blocks] = await Promise.all([
    listVisaRequirements(tripId),
    listStayBlocks(tripId),
  ]);
  return {
    groups: buildVisaGroups(rows, blocks),
    unverified: rows.filter((r) => r.verified_at == null).length,
  };
}

/** The screen's only write. `updated_at` is set by a trigger - never sent. */
export async function updateVisaStatus(id: string, status: VisaStatus): Promise<void> {
  const { error } = await requireClient()
    .from("visa_requirements")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
