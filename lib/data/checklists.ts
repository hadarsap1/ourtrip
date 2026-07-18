import { getSupabase } from "@/lib/supabase";
import type { Checklist, ChecklistItem } from "@/lib/types";

function requireClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase not configured");
  return supabase;
}

// ---------- lists ----------

export async function listChecklists(tripId: string): Promise<Checklist[]> {
  const { data, error } = await requireClient()
    .from("checklists")
    .select("*")
    .eq("trip_id", tripId)
    .order("title");
  if (error) throw new Error(error.message);
  return data;
}

export async function createChecklist(
  tripId: string,
  title: string,
  isTemplate: boolean
): Promise<void> {
  const { error } = await requireClient()
    .from("checklists")
    .insert({ trip_id: tripId, title: title.trim(), is_template: isTemplate });
  if (error) throw new Error(error.message);
}

/** Instantiates a template: new list + copies of its items, unchecked. */
export async function createFromTemplate(
  template: Checklist,
  templateItems: ChecklistItem[]
): Promise<void> {
  const supabase = requireClient();
  const { data: list, error } = await supabase
    .from("checklists")
    .insert({
      trip_id: template.trip_id,
      title: template.title,
      is_template: false,
      source_template_id: template.id,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (templateItems.length > 0) {
    const { error: itemsError } = await supabase.from("checklist_items").insert(
      templateItems.map((item, index) => ({
        checklist_id: list.id,
        label: item.label,
        assigned_to: item.assigned_to,
        checked: false,
        sort_order: index,
      }))
    );
    if (itemsError) throw new Error(itemsError.message);
  }
}

export async function renameChecklist(id: string, title: string): Promise<void> {
  const { error } = await requireClient()
    .from("checklists")
    .update({ title: title.trim() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Deletes a list together with its items (FK restricts otherwise). */
export async function deleteChecklist(id: string): Promise<void> {
  const supabase = requireClient();
  const { error: itemsError } = await supabase
    .from("checklist_items")
    .delete()
    .eq("checklist_id", id);
  if (itemsError) throw new Error(itemsError.message);
  const { error } = await supabase.from("checklists").delete().eq("id", id);
  // FK from instantiated lists (source_template_id) restricts deleting a
  // template that has been used — the UI maps 23503 to a Hebrew message.
  if (error) throw new Error(error.code === "23503" ? "template_in_use" : error.message);
}

// ---------- items ----------

export async function listChecklistItems(
  checklistIds: string[]
): Promise<ChecklistItem[]> {
  if (checklistIds.length === 0) return [];
  const { data, error } = await requireClient()
    .from("checklist_items")
    .select("*")
    .in("checklist_id", checklistIds)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Bulk import: appends labels as items, either to an existing list or into a
 * freshly created one. Returns the target list id and how many were added.
 */
export async function importIntoChecklist(opts: {
  tripId: string;
  targetListId: string | null; // null → create a new list
  newTitle: string | null;
  fallbackTitle: string;
  labels: string[];
}): Promise<{ listId: string; count: number }> {
  const supabase = requireClient();
  let listId = opts.targetListId;
  let startOrder = 0;

  if (!listId) {
    const { data, error } = await supabase
      .from("checklists")
      .insert({
        trip_id: opts.tripId,
        title: (opts.newTitle ?? "").trim() || opts.fallbackTitle,
        is_template: false,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    listId = data.id;
  } else {
    const { count } = await supabase
      .from("checklist_items")
      .select("*", { count: "exact", head: true })
      .eq("checklist_id", listId);
    startOrder = count ?? 0;
  }

  const rows = opts.labels
    .map((label, i) => ({
      checklist_id: listId as string,
      label: label.trim(),
      sort_order: startOrder + i,
    }))
    .filter((r) => r.label !== "");
  if (rows.length > 0) {
    const { error } = await supabase.from("checklist_items").insert(rows);
    if (error) throw new Error(error.message);
  }
  return { listId: listId as string, count: rows.length };
}

export async function addChecklistItem(
  checklistId: string,
  label: string,
  sortOrder: number
): Promise<void> {
  const { error } = await requireClient()
    .from("checklist_items")
    .insert({ checklist_id: checklistId, label: label.trim(), sort_order: sortOrder });
  if (error) throw new Error(error.message);
}

export async function setItemChecked(id: string, checked: boolean): Promise<void> {
  const { error } = await requireClient()
    .from("checklist_items")
    .update({ checked })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateChecklistItem(
  id: string,
  patch: { label?: string; assigned_to?: string | null }
): Promise<void> {
  const { error } = await requireClient()
    .from("checklist_items")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const { error } = await requireClient()
    .from("checklist_items")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- realtime ----------

/** Refires onChange for any change to lists or items. Returns unsubscribe. */
export function subscribeChecklists(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const channel = supabase
    .channel("checklists-sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "checklists" },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "checklist_items" },
      onChange
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
