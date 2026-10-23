import { strings } from "@/lib/strings";

/** Up to three kids' names (00067): trimmed, at most 40 characters, no
 *  blanks or repeats. The database does the same; this keeps the form honest. */
export function normalizeKidNames(names: readonly (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const name of names) {
    const trimmed = (name ?? "").trim().slice(0, 40);
    if (trimmed) out.add(trimmed);
  }
  return [...out].slice(0, 3);
}

/** "של יואב", "של יואב ונועה", "של יואב, נועה ותמר"; "" with no names. */
export function kidTagText(names: readonly string[] | null | undefined): string {
  if (!names || names.length === 0) return "";
  const joined =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} ${strings.kidTag.and}${names[names.length - 1]}`;
  return strings.kidTag.of.replace("{names}", joined);
}

/** A name with its tag, for plain text (who liked): "דנה (של יואב)". */
export function nameWithKidTag(name: string, names: readonly string[] | null | undefined): string {
  const tag = kidTagText(names);
  return name && tag ? `${name} (${tag})` : name;
}
